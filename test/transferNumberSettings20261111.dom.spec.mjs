import './pricebookTestEnv.mjs';
import test,{before} from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {webcrypto} from 'node:crypto';
import {build} from 'esbuild';
import {JSDOM,VirtualConsole} from 'jsdom';

// Settings > Receptionist asks for a direct transfer number, says why it must be
// a different line, never prefills the business line, and shows the server's
// refusal. The real app router with a synthetic transport; no server is contacted.
// Expected wording written before execution.
const root=fileURLToPath(new URL('..',import.meta.url));
const HELP="Enter a direct number that rings you, like your cell phone, with the country code. It can't be your business line or your receptionist's number: your business line forwards to your receptionist, so a transfer to it would ring the receptionist again. With no transfer number, the caller's request is saved for a callback.";
const REFUSAL='Enter a different number for transfers. Your business line forwards to your receptionist, so a transfer to it would ring the receptionist again.';
const BUSINESS='+19025550199',RECEPTIONIST='+19025550101',DIRECT='+19025550188';
let bundle;
const fakeApi='export const api=(...args)=>window.__transport(...args);'+
  'export function go(path){window.__went.push(path);window.history.pushState({},"",path);window.dispatchEvent(new PopStateEvent("popstate"));}'+
  'export const logout=async()=>{};export const getToken=()=>window.localStorage.getItem("otc_token");export const setToken=()=>{};'+
  'export const getSessionKey=()=>"[PLACEHOLDER]";export const refreshSession=async()=>{};';
before(async()=>{
  bundle=(await build({absWorkingDir:root,bundle:true,write:false,platform:'browser',format:'iife',loader:{'.css':'empty'},
    define:{'process.env.NODE_ENV':'"development"','import.meta.env':'{}'},
    plugins:[{name:'synthetic-owner-transport',setup(b){b.onLoad({filter:/[\\/]client[\\/]src[\\/]api\.js$/},()=>({loader:'js',contents:fakeApi}));}}],
    stdin:{resolveDir:root,loader:'jsx',contents:"import './client/src/main.jsx';"}})).outputFiles[0].text;
});
const pause=()=>new Promise(r=>setTimeout(r,10));
const b64=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
const token=b64({alg:'HS256'})+'.'+b64({sub:'synthetic-owner',role:'owner',sid:'A'.repeat(43)})+'.[PLACEHOLDER]';
async function waitFor(check,label){for(let n=0;n<400;n++){const value=check();if(value)return value;await pause();}assert.fail('Timed out: '+label);}
const fieldLabel=(document,label)=>[...document.querySelectorAll('label.field')].find(l=>l.querySelector('.field-label')?.textContent===label);
const buttonNamed=(document,label)=>[...document.querySelectorAll('button')].find(node=>node.textContent.trim()===label);
async function mount(t,{plan='Operator',knowledgeBase={},refuse=false}={}){
  const errors=[],dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://synthetic.invalid/settings',runScripts:'dangerously',pretendToBeVisual:true,
    virtualConsole:new VirtualConsole().on('jsdomError',e=>errors.push(String(e)))});
  const {window}=dom,calls=[];
  window.structuredClone=structuredClone;window.scrollTo=()=>{};window.__errors=[];window.__went=[];
  Object.defineProperty(window,'crypto',{value:webcrypto,configurable:true});window.TextEncoder=TextEncoder;
  window.speechSynthesis={speak(){},cancel(){},getVoices:()=>[]};
  window.localStorage.setItem('otc_token',token);
  const state={account:{firstName:'[PLACEHOLDER] Pat',businessName:'[SYNTHETIC] Cedar Co',plan,planStatus:'active',timezone:'America/Moncton'},priceBookAccess:plan!=='Starter',operator:{},preview:{},
    profile:{onboardingStep:10,existingPhoneNumber:BUSINESS,twilioNumber:RECEPTIONIST,knowledgeBase:{about:'[SYNTHETIC] About',hours:'[SYNTHETIC] Hours',...knowledgeBase},calendar:{},businessTypes:['CUSTOM'],country:'CA',region:'NB'}};
  window.__transport=async(path,options={})=>{
    calls.push({path,method:options.method||'GET',body:options.body&&JSON.parse(JSON.stringify(options.body))});
    if(path==='/api/onboarding/state')return state;
    if(path==='/api/pricebook/meta')return {services:[]};
    if(path==='/api/auth/account')return {emailVerified:true};
    if(path==='/api/onboarding/voice'){if(refuse)throw Object.assign(new Error(REFUSAL),{status:400,code:'INVALID_VOICE_SETTINGS'});return {profile:{...state.profile,...options.body}};}
    if(path==='/api/billing/status')return {billingEnabled:false,providerAvailable:false,canCheckout:false,canManageBilling:false,cancelAtPeriodEnd:false,plan,planStatus:'active',checkoutState:'NONE',billingInterval:null};
    if(path==='/api/billing/lifecycle')return {notices:[]};
    throw Error('[PLACEHOLDER] auxiliary request unavailable: '+path);
  };
  t.after(()=>{window.close();assert.deepEqual(errors,[]);assert.deepEqual(Array.from(window.__errors),[]);});
  window.eval(bundle);
  return {window,document:window.document,calls};
}

test('transfer number: not prefilled with the business line, and the help says why it must be a different line',async t=>{
  const {document,calls}=await mount(t);
  const label=await waitFor(()=>fieldLabel(document,'Transfer number'),'transfer number field');
  assert.equal(label.querySelector('input').value,'','never prefilled with the business line');
  assert.equal(label.querySelector('.field-help')?.textContent,HELP);
  buttonNamed(document,'Save').click();
  const post=await waitFor(()=>calls.find(c=>c.path==='/api/onboarding/voice'),'voice save');
  assert.equal(post.body.transferNumber,'','a blank transfer number is saved, not the business line');
});
test('transfer number: a saved direct number is shown',async t=>{
  const {document}=await mount(t,{knowledgeBase:{transferNumber:DIRECT}});
  const label=await waitFor(()=>fieldLabel(document,'Transfer number'),'transfer number field');
  assert.equal(label.querySelector('input').value,DIRECT);
});
test('transfer number: the server refusal is shown to the owner',async t=>{
  const {document}=await mount(t,{knowledgeBase:{transferNumber:BUSINESS},refuse:true});
  await waitFor(()=>fieldLabel(document,'Transfer number'),'transfer number field');
  buttonNamed(document,'Save').click();
  const notice=await waitFor(()=>document.querySelector('.notice-error'),'error notice');
  assert.equal(notice.textContent,REFUSAL);
});
test('transfer number: Starter still has no transfer settings',async t=>{
  const {document}=await mount(t,{plan:'Starter'});
  await waitFor(()=>buttonNamed(document,'Save'),'save');
  assert.equal(fieldLabel(document,'Transfer number'),undefined);
});
