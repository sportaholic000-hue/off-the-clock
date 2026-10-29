import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import {CARRIERS,carrierForwarding,tenDigits} from '../client/src/carrierForwarding.js';

// Expected codes were copied by hand from each carrier's help page (checked
// October 29, 2026) or, where the carrier publishes none, the standard GSM codes.
const N='+15065550101';

test('carrier forwarding: country lists and number handling',()=>{
  assert.deepEqual(CARRIERS.US.map(c=>c.id),['verizon','att','tmobile','other']);
  assert.deepEqual(CARRIERS.CA.map(c=>c.id),['bell','rogers','telus','other']);
  assert.equal(tenDigits(N),'5065550101');assert.equal(tenDigits('(506) 555-0101'),'5065550101');
  assert.equal(tenDigits('+445065550101'),null);assert.equal(carrierForwarding('verizon','12345'),null);
  assert.equal(carrierForwarding('unknown',N),null);
});

test('carrier forwarding: Verizon, T-Mobile and AT&T codes carry the receptionist number',()=>{
  assert.deepEqual(carrierForwarding('verizon',N).steps.map(s=>s.dial),['*715065550101','*725065550101','*73']);
  assert.deepEqual(carrierForwarding('tmobile',N).steps.map(s=>s.dial),['**61*15065550101#','**67*15065550101#','**62*15065550101#','**21*15065550101#','##004#']);
  assert.match(carrierForwarding('tmobile',N).notes[0],/\*\*61\*15065550101\*\*SECONDS# using 5 to 30 seconds/);
  const att=carrierForwarding('att',N);
  assert.deepEqual(att.steps.map(s=>s.dial),['*004*5065550101#','**21*5065550101#','##004#']);
  assert.ok(att.notes.some(n=>/overrides your voicemail/.test(n)));
  assert.ok(att.notes.some(n=>/lists no dial codes/.test(n)),'standard codes are labelled as such');
});

test('carrier forwarding: Canadian carriers state their own conditions',()=>{
  const rogers=carrierForwarding('rogers',N);
  assert.deepEqual(rogers.steps.map(s=>s.dial),['*61*5065550101#','**67*5065550101#','*62*5065550101#','**21*5065550101#','##61#, ##67#, ##62#, ##21#']);
  assert.ok(rogers.notes.some(n=>/will not work while voicemail is on/.test(n)));
  const bell=carrierForwarding('bell',N);
  assert.ok(bell.steps.every(s=>!s.dial),'Bell publishes menu steps, not codes');
  assert.ok(bell.steps[0].text.includes('5065550101'));
  assert.ok(bell.notes.some(n=>/\$0\.25 a minute/.test(n)));
  assert.deepEqual(carrierForwarding('telus',N).steps.map(s=>s.dial),['*61*5065550101#','*67*5065550101#','*62*5065550101#','*21*5065550101#','##004#']);
  for(const id of ['verizon','att','tmobile','bell','rogers','telus'])assert.match(carrierForwarding(id,N).help.url,/^https:\/\/(www\.|support\.)?(verizon|att|t-mobile|bell|rogers|telus)\./,id);
});

test('carrier forwarding: rendered step shows the chosen carrier with real codes and its help link',async t=>{
  const vite=await createServer({root:new URL('../client',import.meta.url).pathname,server:{middlewareMode:true},appType:'custom',logLevel:'silent'});t.after(()=>vite.close());
  const {CarrierForwarding}=await vite.ssrLoadModule('/src/carrierForwardingSteps.jsx');
  const empty=renderToStaticMarkup(React.createElement(CarrierForwarding,{country:'CA',number:N}));
  assert.match(empty,/Choose your carrier/);assert.match(empty,/Rogers/);assert.doesNotMatch(empty,/Verizon/);
  const rogers=renderToStaticMarkup(React.createElement(CarrierForwarding,{country:'CA',number:N,initialCarrier:'rogers'}));
  assert.match(rogers,/<code>\*61\*5065550101#<\/code>/);assert.match(rogers,/voicemail/);
  assert.match(rogers,/href="https:\/\/www\.rogers\.com\/customer\/support\/article\/what-are-the-codes-for-call-forwarding-for-my-wireless-device"/);
  const verizon=renderToStaticMarkup(React.createElement(CarrierForwarding,{country:'US',number:N,initialCarrier:'verizon'}));
  assert.match(verizon,/<code>\*715065550101<\/code>/);
});
