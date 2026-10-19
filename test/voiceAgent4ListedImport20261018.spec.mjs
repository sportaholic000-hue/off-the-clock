import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {calculateSavedListedPrice} from '../server/src/voice/listedPriceCalculation.js';
import {compileVoiceSystemInstruction} from '../server/src/voice/voicePromptCompiler.js';
import {fixture} from './leadCaptureRepair20261006Fixture.mjs';
import {allSpecFiles,quotePricebookSpecFiles} from '../scripts/testSelection.mjs';

// Synthetic cases; expectations predate production edits in Agent 4 EXPECTED.md.
const review={status:'needs_review',message:'The saved listing or quantity cannot be multiplied safely. Repeat only the saved listing word for word with its conditions, or ask the business to review it. No multiplied amount is available.'};
const args=(listedItem,quantity='3')=>({listedItem,quantity,customerConfirmed:true});
const direct=(listing,quantity='3')=>calculateSavedListedPrice({prices:listing},args(listing,quantity));
const reported=['Widgets/on collection $10 each','Widgets.by arrangement $10 each','Widgets-on collection $10 each','Weather permitting $10 each','Online orders $10 each'];
const boundaries=[
  'Widgets/on collection $10 each','Widgets.by arrangement $10 each',
  'Widgets-on collection $10 each','Widgets:by arrangement $10 each',
  'Widgets[on collection] $10 each','Widgets(on collection) $10 each',
  "Widgets'on collection $10 each",'Widgets’by arrangement $10 each',
  'Widgets/on\u00a0collection $10 each','Widgets.ＩＮ store $10 each',
  'Widgets—on collection $10 each','Widgets／on collection $10 each',
  'Widgets-on-collection $10 each','Widgets-by-arrangement $10 each',
  'Weather-permitting $10 each','Widgets/weather permitting $10 each',
  'Online-orders $10 each','Widgets.online orders $10 each',
  'Board-on-board panel/on collection $10 each','Nail-in anchor.by arrangement $10 each',
  'Plug-in adapter-online orders $10 each'
];
for(const listing of [...new Set([...reported,...boundaries])]){
  test('Agent4 F7 direct refuses: '+listing,()=>assert.deepEqual(direct(listing),review));
  test('Agent4 F7 real dispatcher refuses: '+listing,async t=>{
    const f=fixture(t),c=f.context();
    const knowledge={prices:listing,about:'[SYNTHETIC] Shop',privateRate:'SYNTHETIC_PRIVATE_RATE_7391',privateCustomer:'SYNTHETIC_PRIVATE_CUSTOMER'};
    f.ownerQuery('UPDATE businessProfiles SET knowledgeBaseJson=? WHERE ownerId=?').run(JSON.stringify(knowledge),c.ownerId);
    const before=f.db.prepare('SELECT total_changes() n').get().n;
    assert.deepEqual(await f.voice(c).tool('calculateListedPrice',args(listing)),review);
    assert.equal(f.db.prepare('SELECT total_changes() n').get().n,before);
    assert.deepEqual(JSON.parse(f.ownerQuery('SELECT knowledgeBaseJson FROM businessProfiles WHERE ownerId=?').get(c.ownerId).knowledgeBaseJson),knowledge);
  });
}
const controls=[
  ...['Board-on-board panel','Nail-in anchor','Plug-in adapter','Weather station','Online training manual','Onyx tile','Inline filter','Standby lamp','Porcelain basin','Weatherproof plug-in adapter'].map(name=>[name+' $10 each','3','30.00','$',false]),
  ['Trim CAD 0.035 per linear foot','3','0.11','CAD',true],
  ['Widget US$1,234.50 each','2','2469.00','US$',false],
  ['Widget EUR 2.50 each','3.333','8.33','EUR',true]
];
for(const [listing,quantity,amount,currency,rounded] of controls)test('Agent4 F7 genuine name/arithmetic control: '+listing,async t=>{
  const result=direct(listing,quantity);
  assert.equal(result.status,'calculated');assert.equal(result.extendedAmount,amount);assert.equal(result.currency,currency);
  assert.equal(result.listedItem,listing);assert.ok(result.voiceSummary.startsWith(listing));
  assert.equal(result.voiceSummary.includes('rounded to the nearest cent'),rounded);
  const f=fixture(t),c=f.context();
  f.ownerQuery('UPDATE businessProfiles SET knowledgeBaseJson=? WHERE ownerId=?').run(JSON.stringify({prices:listing}),c.ownerId);
  assert.deepEqual(await f.voice(c).tool('calculateListedPrice',args(listing,quantity)),result);
});
test('Agent4 F7 fallback keeps all five exact saved listings in compiled facts',()=>{
  const guideText=readFileSync(new URL('../server/src/voice/receptionistGuide.md',import.meta.url),'utf8');
  for(const listing of reported){
    const prompt=compileVoiceSystemInstruction({guideText,business:{businessName:'[SYNTHETIC] Shop',agentName:'Synthetic'},services:[],knowledge:{prices:listing}});
    assert.equal(JSON.parse(prompt.match(/<OWNER_FACTS_JSON>\s*([\s\S]*?)\s*<\/OWNER_FACTS_JSON>/)[1]).knowledge.prices,listing);
    assert.match(prompt,/If the tool cannot calculate, repeat only the original listing and arrange review\./);
    assert.deepEqual(direct(listing),review);
  }
});
test('Agent4 new voice files execute in full and stay outside strict through unchanged conventions',()=>{
  const root=fileURLToPath(new URL('../',import.meta.url));
  for(const file of ['test/voiceAgent4ListedImport20261018.spec.mjs','test/voiceAgent4WebsiteQualifications20261018.spec.mjs']){
    assert.equal(allSpecFiles(root).filter(value=>value===file).length,1);
    assert.equal(quotePricebookSpecFiles(root).includes(file),false);
  }
});
