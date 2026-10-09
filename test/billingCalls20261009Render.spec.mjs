import test,{before} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const wording=JSON.parse(readFileSync(new URL('../verification/billing-calls-20261009/failure-wording.json',import.meta.url),'utf8'));
let render;
before(async()=>{
 const root=fileURLToPath(new URL('..',import.meta.url));
 const result=await build({absWorkingDir:root,bundle:true,write:false,platform:'node',format:'cjs',define:{'process.env.NODE_ENV':'"production"'},stdin:{resolveDir:root,loader:'jsx',contents:"import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {CallDetail} from './client/src/calls.jsx';import MinuteUsage from './client/src/minuteUsage.jsx';module.exports=call=>renderToStaticMarkup(call.usage?<MinuteUsage usage={call.usage}/>:<CallDetail call={call}/>);"}});
 const module={exports:{}};new Function('module','exports','require',result.outputFiles[0].text)(module,module.exports,(await import('node:module')).createRequire(import.meta.url));render=module.exports;
});
function view(code){const html=render({id:'SYNTHETIC',callerNumber:'[SYNTHETIC]',status:'FAILED',outcome:'AI_FALLBACK',failureCode:code,transcript:[],quotes:[],leads:[],quoteRequests:[],bookings:[],bookingRequests:[]});const dom=new JSDOM(html);const fields=Object.fromEntries([...dom.window.document.querySelectorAll('dt')].map(dt=>[dt.textContent,dt.nextElementSibling.textContent]));dom.window.close();return fields;}
for(const [code,sentence] of Object.entries(wording.codes))test('calls audit 2 render: '+code,()=>{
 const fields=view(code);assert.equal(fields.Failure,sentence);assert.equal(fields['Technical detail'],code);
});
test('calls audit 2 render: unknown and absent codes do not invent a cause',()=>{
 assert.equal(view('SYNTHETIC_UNKNOWN').Failure,wording.unknown);assert.equal(view('SYNTHETIC_UNKNOWN')['Technical detail'],'SYNTHETIC_UNKNOWN');assert.equal(view(null).Failure,undefined);assert.equal(view(null)['Technical detail'],undefined);
});
test('calls audit 2 inventory: every bridge and codec code has reviewed wording',()=>{
 for(const file of ['geminiMediaBridge.js','audioCodec.js'])for(const match of readFileSync(new URL('../server/src/voice/'+file,import.meta.url),'utf8').matchAll(/['"]([A-Z][A-Z0-9_]{3,})['"]/g))if(match[1]!=='TWILIO_STOP')assert.ok(wording.codes[match[1]],match[1]);
});
test('calls audit 1 render: pending calls remain visible without a current allowance period',()=>{
 const html=render({usage:{status:'UNAVAILABLE',unconfirmedCalls:1,pendingCharges:[]}});assert.match(html,/Calls still being confirmed: 1/);assert.doesNotMatch(html,/\$0\.35|\$3\.50/);
});
