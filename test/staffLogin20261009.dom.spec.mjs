import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM,VirtualConsole} from 'jsdom';
import {fileURLToPath} from 'node:url';

// Handwritten UI expectations precede execution in verification/staff-login-20261009/EXPECTED.md.
const root=fileURLToPath(new URL('..',import.meta.url));
const fakeApi=`export const api=(...args)=>window.__transport(...args);
  export const go=()=>{};export const logout=async()=>{};
  export const getToken=()=>window.localStorage.getItem('otc_token');`;
const output=await build({absWorkingDir:root,bundle:true,write:false,platform:'browser',format:'iife',
  define:{'process.env.NODE_ENV':JSON.stringify('development')},
  plugins:[{name:'synthetic-api',setup(builder){builder.onLoad({filter:/[\\/]client[\\/]src[\\/]api\.js$/},
    ()=>({contents:fakeApi,loader:'js'}));}}],
  stdin:{resolveDir:root,loader:'jsx',contents:`import React from 'react';
    import {createRoot} from 'react-dom/client';import Team from './client/src/team.jsx';
    import {AppShell} from './client/src/ui.jsx';
    window.__root=createRoot(document.getElementById('root'),{onUncaughtError:e=>window.__errors.push(String(e))});
    window.__renderTeam=key=>window.__root.render(<Team key={key}/>);
    window.__renderShell=key=>window.__root.render(<AppShell key={key} activePath='/calls'><main>Staff</main></AppShell>);
    window.__renderTeam(0);`}});
const bundle=output.outputFiles[0].text;
const button=(document,label)=>[...document.querySelectorAll('button')].find(node=>node.textContent.trim()===label);
async function waitFor(check){const until=Date.now()+3000;while(Date.now()<until){if(check())return;await new Promise(r=>setTimeout(r,15));}assert.fail('Synthetic staff UI did not update');}

test('owner Team screen exposes pending actions, suspension reason and the invite form',async t=>{
  const errors=[],dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://app.example.invalid/team',
    runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:new VirtualConsole().on('jsdomError',e=>errors.push(String(e)))});
  const {window}=dom,document=window.document,calls=[];
  window.__errors=[];
  let state={plan:'Operator',limit:1,staff:[{id:'staff-one',name:'Sally',email:'sally@example.invalid',status:'pending',inviteStatus:'pending'}]};
  window.__transport=async(path,{method='GET',body}={})=>{
    calls.push({path,method,body});
    if(path==='/api/team/staff'&&method==='GET')return state;
    if(path==='/api/team/staff/staff-one/resend')return state;
    if(path==='/api/team/staff/staff-one/invite'&&method==='DELETE')return state={...state,staff:[]};
    if(path==='/api/team/staff/invite'&&method==='POST')return state={...state,staff:[{
      id:'staff-two',name:body.name,email:body.email,status:'pending',inviteStatus:'pending'}]};
    throw Error('Unexpected synthetic request '+method+' '+path);
  };
  t.after(()=>{window.__root.unmount();window.close();assert.deepEqual(errors,[]);assert.deepEqual(Array.from(window.__errors),[]);});
  window.eval(bundle);
  await waitFor(()=>button(document,'Resend invitation'));
  assert.match(document.body.textContent,/Sally.*sally@example.invalid · pending/s);
  assert.equal(button(document,'Send invitation'),undefined,'one pending seat fills the plan');
  button(document,'Resend invitation').click();await waitFor(()=>calls.some(call=>call.path.endsWith('/resend')));
  await waitFor(()=>document.body.textContent.includes('Invitation resent.'));
  button(document,'Cancel invitation').click();await waitFor(()=>button(document,'Send invitation'));
  assert.equal(calls.at(-1).method,'DELETE');assert.match(document.body.textContent,/Invite office staff/);
  const inputs=[...document.querySelectorAll('form input')];
  const edit=(input,value)=>{const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
    setter.call(input,value);input.dispatchEvent(new window.Event('input',{bubbles:true}));};
  edit(inputs[0],'Pat');edit(inputs[1],'pat@example.invalid');
  document.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
  await waitFor(()=>calls.some(call=>call.path==='/api/team/staff/invite'&&call.method==='POST'));
  assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1).body)),{name:'Pat',email:'pat@example.invalid'});
  await waitFor(()=>document.body.textContent.includes('pat@example.invalid · pending'));
  state={plan:'Starter',limit:0,staff:[{id:'staff-two',name:'Pat',email:'pat@example.invalid',
    status:'suspended',inviteStatus:'active',reason:'This plan does not include this staff seat.'}]};
  window.__renderTeam(1);
  await waitFor(()=>document.body.textContent.includes('This plan does not include this staff seat.'));
  assert.match(document.body.textContent,/Starter includes the owner login only/);
  assert.equal(button(document,'Send invitation'),undefined);
  assert.ok(button(document,'Remove login'));
});

test('staff navigation contains only the five permitted work areas',async t=>{
  const errors=[],dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://app.example.invalid/calls',
    runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:new VirtualConsole().on('jsdomError',e=>errors.push(String(e)))});
  const {window}=dom;
  window.__errors=[];
  window.localStorage.setItem('otc_token','header.'+window.btoa(JSON.stringify({role:'staff'}))+'.signature');
  window.__transport=async()=>({plan:'Operator',limit:1,staff:[]});
  t.after(()=>{window.__root.unmount();window.close();assert.deepEqual(errors,[]);assert.deepEqual(Array.from(window.__errors),[]);});
  window.eval(bundle);window.__renderShell(1);
  await waitFor(()=>window.document.querySelector('.side-nav'));
  assert.deepEqual([...window.document.querySelectorAll('.side-nav button')].map(node=>node.textContent.trim()),
    ['Calls','Leads','Quotes','Customers','Calendar']);
  assert.equal(window.document.body.textContent.includes('Price Book'),false);
  assert.equal(window.document.body.textContent.includes('Billing'),false);
  assert.equal(window.document.body.textContent.includes('Team'),false);
});

test('failed fake email delivery refreshes the pending seat so the owner can resend it',async t=>{
  const errors=[],dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://app.example.invalid/team',
    runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:new VirtualConsole().on('jsdomError',e=>errors.push(String(e)))});
  const {window}=dom,document=window.document,calls=[];window.__errors=[];
  let state={plan:'Operator',limit:1,staff:[]};
  window.__transport=async(path,{method='GET'}={})=>{
    calls.push({path,method});
    if(path==='/api/team/staff'&&method==='GET')return state;
    if(path==='/api/team/staff/invite'&&method==='POST'){
      state={...state,staff:[{id:'failed-invite',name:'Pat',email:'pat@example.invalid',status:'pending',inviteStatus:'pending'}]};
      throw Error('The invitation email could not be sent. Resend the invitation.');
    }
    throw Error('Unexpected synthetic request '+method+' '+path);
  };
  t.after(()=>{window.__root.unmount();window.close();assert.deepEqual(errors,[]);assert.deepEqual(Array.from(window.__errors),[]);});
  window.eval(bundle);await waitFor(()=>button(document,'Send invitation'));
  const inputs=[...document.querySelectorAll('form input')],setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
  for(const [input,value] of [[inputs[0],'Pat'],[inputs[1],'pat@example.invalid']]){
    setter.call(input,value);input.dispatchEvent(new window.Event('input',{bubbles:true}));
  }
  document.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
  await waitFor(()=>button(document,'Resend invitation'));
  assert.equal(calls.filter(call=>call.path==='/api/team/staff'&&call.method==='GET').length,2);
  assert.match(document.body.textContent,/The invitation email could not be sent/);
  assert.match(document.body.textContent,/pat@example.invalid · pending/);
});
