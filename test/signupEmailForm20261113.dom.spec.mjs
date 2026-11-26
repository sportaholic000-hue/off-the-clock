import test,{before} from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM,VirtualConsole} from 'jsdom';

// Owner ruling 2026-11-13: the sign-up form shows "Enter a valid email address,
// like name@example.com." for an address the app cannot send to, and sends
// nothing; a valid address is sent to the server as before; the server's own
// refusal is shown too. The whole owner app (client/src/main.jsx); only
// window.fetch answers. Expected values written before running.
const root=fileURLToPath(new URL('..',import.meta.url));
let bundle;
before(async()=>{
  const result=await build({absWorkingDir:root,entryPoints:['client/src/main.jsx'],bundle:true,write:false,platform:'browser',format:'iife',
    loader:{'.css':'empty','.js':'jsx'},define:{'process.env.NODE_ENV':'"development"','import.meta.env':'{}'},logLevel:'silent'});
  bundle=result.outputFiles[0].text;
});
const SENTENCE='Enter a valid email address, like name@example.com.';
const pause=(ms=10)=>new Promise(r=>setTimeout(r,ms));
async function waitFor(check,label,limit=600){for(let n=0;n<limit;n++){const value=check();if(value)return value;await pause();}assert.fail('Timed out: '+label);}
function setValue(window,input,value){Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new window.Event('input',{bubbles:true}));}
function backend(registerReply){
  const calls=[];
  const reply=(code,body)=>({ok:code<400,status:code,json:async()=>body});
  return {calls,async fetch(url,{method='GET',body}={}){
    const path=String(url).replace(/^https?:\/\/[^/]+/,'').split('?')[0];calls.push({path,method,body:body?JSON.parse(body):undefined});
    if(path==='/api/auth/register')return reply(...registerReply);
    return reply(200,{});
  }};
}
async function mount(t,server){
  const errors=[],dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://app.synthetic.invalid/signup',runScripts:'dangerously',pretendToBeVisual:true,
    virtualConsole:new VirtualConsole().on('jsdomError',e=>{if(!/Not implemented: navigation/.test(String(e)))errors.push(String(e));})});
  const {window}=dom;
  window.structuredClone=structuredClone;window.scrollTo=()=>{};window.TextEncoder=TextEncoder;
  Object.defineProperty(window.crypto,'subtle',{value:webcrypto.subtle});
  if(!window.crypto.randomUUID)window.crypto.randomUUID=()=>webcrypto.randomUUID();
  window.fetch=server.fetch;
  t.after(()=>{window.close();assert.deepEqual(errors,[]);});
  window.eval(bundle);
  return {window,document:window.document};
}
async function submit(app,email){
  const password=await waitFor(()=>app.document.querySelector('form.auth-form input[type="password"]'),'sign-up form');
  const inputs=[...app.document.querySelectorAll('form.auth-form input')];
  setValue(app.window,inputs[0],'[PLACEHOLDER] Pat');setValue(app.window,inputs[1],'[PLACEHOLDER] Cedar Co');
  setValue(app.window,app.document.querySelector('input[type="email"]'),email);setValue(app.window,password,'synthetic-password');
  await pause();
  app.document.querySelector('form.auth-form').dispatchEvent(new app.window.Event('submit',{bubbles:true,cancelable:true}));
}

for(const email of ['owner@nodot','owner@@example.invalid','owner@example','owner@.com','a b@example.invalid','<owner>@example.invalid'])
  test(`sign-up form: "${email}" shows the sentence and sends nothing`,async t=>{
    const server=backend([202,{ok:true}]),app=await mount(t,server);
    await submit(app,email);
    await waitFor(()=>app.document.body.textContent.includes(SENTENCE),'sentence');
    await pause(50);
    assert.equal(server.calls.filter(call=>call.path==='/api/auth/register').length,0);
  });

test('sign-up form: a valid address is sent to the server as before',async t=>{
  const server=backend([202,{ok:true}]),app=await mount(t,server);
  await submit(app,'owner@example.invalid');
  const call=await waitFor(()=>server.calls.find(call=>call.path==='/api/auth/register'),'register request');
  assert.equal(call.body.email,'owner@example.invalid');
  await pause(50);
  assert.equal(app.document.body.textContent.includes(SENTENCE),false);
});

test('sign-up form: the server\'s refusal sentence is shown',async t=>{
  const server=backend([400,{error:SENTENCE}]),app=await mount(t,server);
  await submit(app,'owner@example.invalid');
  await waitFor(()=>app.document.body.textContent.includes(SENTENCE),'server sentence');
});
