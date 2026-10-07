import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import {ownerCallFixture} from './helpers/ownerCallFixture.mjs';

test('existing owner components render stored call and linked record views',async t=>{
  const {db,service}=ownerCallFixture(),vite=await createServer({root:new URL('../client',import.meta.url).pathname,server:{middlewareMode:true},appType:'custom'});
  try{
    const {CallDetail,CallFeed}=await vite.ssrLoadModule('/src/calls.jsx');
    const {QuoteRecordsList}=await vite.ssrLoadModule('/src/quotedone.jsx');
    const call=service.detail({ownerId:'synthetic-a',id:'synthetic-a-call'});
    const render=(component,props)=>renderToStaticMarkup(React.createElement(component,props));
    await t.test('dashboard/Calls feed shows stored summary and outcome',()=>{const html=render(CallFeed,{calls:service.dashboard('synthetic-a').calls});assert.match(html,/synthetic-a gate repair/);assert.match(html,/CALL_ENDED/);assert.doesNotMatch(html,/SIMULATED|synthetic-b/);});
    await t.test('call detail shows transcript, exact saved price and why, lead and calendar records',()=>{const html=render(CallDetail,{call});for(const stored of ['repair my gate.','221.23','measured gate labor','4 ft','synthetic-a Alex','2026-10-08, 09:00 UTC','PENDING_CONFIRMATION','Morning request'])assert.ok(html.includes(stored),stored);assert.doesNotMatch(html,/synthetic-b|No calls yet/);});
    await t.test('review view shows the saved reason without inventing a quote',()=>{const html=render(CallDetail,{call:service.detail({ownerId:'synthetic-a',id:'synthetic-a-review-call'})});assert.match(html,/Height needs confirmation/);assert.match(html,/Height uncertain/);assert.match(html,/No saved quote for this call/);assert.doesNotMatch(html,/\$undefined/);});
    await t.test('Quotes and Leads views render normalized voice records and call links',()=>{const quote=render(QuoteRecordsList,{rows:call.quotes,kind:'quotes'});assert.match(quote,/221.23/);assert.match(quote,/measured gate labor/);assert.match(quote,/>Calls</);const lead=render(QuoteRecordsList,{rows:call.leads,kind:'leads'});assert.match(lead,/synthetic-a@example.invalid/);assert.match(lead,/Synthetic City/);assert.match(lead,/>Calls</);});
    await t.test('fallback view reports stored failure and empty records',()=>{const html=render(CallDetail,{call:service.detail({ownerId:'synthetic-a',id:'synthetic-a-fallback'})});assert.match(html,/VOICE_DISABLED/);assert.match(html,/No transcript recorded/);assert.match(html,/No saved booking for this call/);});
  }finally{await vite.close();db.close();}
});
