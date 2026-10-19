import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,html,p,link,page,NOTE,PRICE,MEMBER,DRAFT,SAVE,readFacts,review,money} from './handoff-fixture.mjs';

// Deliberately outside normal selectors: these assert the stronger safety
// outcomes needing a policy/other-owner decision, not false passing coverage.
for(const kind of ['pages','requests','bytes'])test('H1 unread global condition beyond '+kind+' budget',async t=>{
  const first=html(p(PRICE)+link('/terms'));
  const limits=kind==='bytes'?{totalBytes:Buffer.byteLength(first)+1}:{[kind]:1};
  const f=await fixture(t,{'/':page(first),'/terms':page(html(p(NOTE)))},limits);
  const {knowledgeBase:draft}=await f.post(DRAFT);await f.post(SAVE,{...f.current(),prices:draft.prices});
  const result=await f.calculate(PRICE);
  t.diagnostic(JSON.stringify({finding:'H1',kind,input:{first,terms:NOTE,limits},draft,providerFacts:f.facts(),result}));
  assert.equal(draft.websiteImport.limited,true);review(result);
});
for(const change of ['amount','condition'])test('H2 running provider snapshot after owner '+change+' update',async t=>{
  const f=await fixture(t,{'/':page(PRICE,true)},{},true);
  const {knowledgeBase:draft}=await f.post(DRAFT);await f.post(SAVE,{...f.current(),prices:draft.prices});await f.connect();
  const initialInstruction=f.connections[0].config.systemInstruction;
  const extract=x=>readFacts(typeof x==='string'?x:x.parts.map(p=>p.text).join('')).knowledge.prices;
  const discovered=extract(initialInstruction);money(await f.calculate(discovered,'same-event'));
  const updated=change==='amount'?'Widget $12 each':PRICE+'\n'+MEMBER;
  await f.post(SAVE,{...f.current(),prices:updated});
  const stale=await f.calculate(discovered,'same-event'),fresh=await f.calculate(updated,'fresh-event');
  const deliveredPrices=f.connections.map(c=>extract(c.config.systemInstruction));
  t.diagnostic(JSON.stringify({finding:'H2',change,discovered,updated,deliveredPrices,providerMessages:f.sent,stale,fresh,currentFacts:f.facts()}));
  review(stale);if(change==='amount')money(fresh,'36.00');else review(fresh);
  assert.ok(deliveredPrices.includes(updated),'Existing provider session still has the prior saved price/condition snapshot');
});
