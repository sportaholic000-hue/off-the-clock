import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {calculateSavedListedPrice} from '../server/src/voice/listedPriceCalculation.js';
import {compileVoiceSystemInstruction} from '../server/src/voice/voicePromptCompiler.js';
import {rewriteKnowledgeText} from '../server/src/voice/knowledgeText.js';
import {fixture} from './leadCaptureRepair20261006Fixture.mjs';
import {allSpecFiles,quotePricebookSpecFiles} from '../scripts/testSelection.mjs';
import {fileURLToPath} from 'node:url';

// Synthetic listings only. All outcomes and decimal products are written by
// hand, before running against c1817621. Confirmation is of listing/quantity,
// never proof of eligibility for a conditional price.
const fallback='The saved listing or quantity cannot be multiplied safely. Repeat only the saved listing word for word with its conditions, or ask the business to review it. No multiplied amount is available.';
const args=(listedItem,quantity='3')=>({listedItem,quantity,customerConfirmed:true});
const calculate=(listing,quantity='3')=>calculateSavedListedPrice({prices:listing},args(listing,quantity));
const review=result=>assert.deepEqual(result,{status:'needs_review',message:fallback});
const save=(f,ownerId,knowledge)=>f.ownerQuery('UPDATE businessProfiles SET knowledgeBaseJson=? WHERE ownerId=?').run(JSON.stringify(knowledge),ownerId);
const reported=[
  'If prepaid $10 per item',
  'Unless delivered $10 per item',
  'When booked online $10 per item',
  'After inspection $10 per item',
  'Subject to approval $10 per item'
];
for(const listing of reported){
  test('listed conditions direct: '+listing,()=>review(calculate(listing)));
  test('listed conditions dispatcher: '+listing,async t=>{
    const f=fixture(t),c=f.context();save(f,c.ownerId,{prices:listing});
    const before=f.db.prepare('SELECT total_changes() n').get().n;
    const voice=f.voice(c);
    review(await voice.tool('calculateListedPrice',args(listing)));
    review(await voice.tool('calculateListedPrice',args(listing)));
    assert.equal(f.db.prepare('SELECT total_changes() n').get().n,before);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM quotes').get().n,0);
  });
}

// Clause markers in any position, not merely five case-sensitive prefixes.
// Parentheses, product-number exemptions and a colon must not hide a condition.
const qualified=[
  'IF PREPAID: $10 per item', 'Widgets unless delivered: $10 per item',
  'Widgets (when booked online): $10 per item', 'Widgets after inspection $10 each',
  'Widgets subject to approval $10 each', 'Provided payment clears $10 each',
  'Providing access is available $10 each', 'Assuming pickup $10 each',
  'Pending inspection $10 each', 'Conditional upon approval $10 each',
  'Before delivery $10 each', 'Until supplies run out $10 each',
  'While stock lasts $10 each', 'Once approved $10 each',
  'Whenever collected $10 each', 'Depending on access $10 each',
  'Based on availability $10 each', 'With owner consent $10 each',
  'Without delivery $10 each', 'For members $10 each',
  'Upon payment $10 each', 'On collection $10 each',
  'At pickup $10 each', 'By appointment $10 each',
  'Prepaid widgets $10 each', 'Cash price $10 each',
  'Members price $10 each', 'Weekday service $10 each',
  'Monday service $10 each', 'Advance booking $10 each',
  'Approved orders $10 each', 'Eligible orders $10 each',
  'Deposit required $10 each', 'Delivery excluded $10 each',
  'Materials billed separately $10 each', 'Prices may vary $10 each',
  'Payment terms apply $10 each', 'Price negotiable $10 each',
  'Approximate price $10 each', 'Estimated price $10 each',
  'Grade 2 lumber if prepaid $10 each', '2x4 stud when collected $10 each',
  '3/4 inch plywood subject to inspection $10 each', '#2 lumber after approval $10 each',
  'Widgets IF\tprepaid $10 each', 'Widgets when\u00a0booked online $10 each',
  'Widgets if-prepaid $10 each', 'Widgets (subject-to-approval) $10 each',
  'Widgets $10 each if prepaid', 'Widgets $10 each. Unclassified access restriction.',
  'If prepaid $10 per item. Taxes extra.',
  'Widgets $10 each. If prepaid.', 'Widgets $10 each; subject to approval'
];
for(const listing of qualified)test('listed conditions qualifier: '+listing,async t=>{
  review(calculate(listing));
  const f=fixture(t),c=f.context();save(f,c.ownerId,{prices:listing});
  review(await f.voice(c).tool('calculateListedPrice',args(listing)));
});

// Exact decimal arithmetic, half-up rounding, currency, product spelling and
// ordinary product-name words remain unchanged through the real dispatcher.
const controls=[
  ['Bricks $2 each','500','1000.00','$',false],
  ['Gutter cleaning: $2.50 per linear foot\nAll prices plus HST.','120','300.00','$',false],
  ['Pressure-treated 2x4 $3.50 each.','10','35.00','$',false],
  ['2×4 stud $3.50 each','10','35.00','$',false],
  ['Grade 2 lumber $5 each','10','50.00','$',false],
  ['3/4 inch plywood $5 each','10','50.00','$',false],
  ['#2 lumber $5 each','10','50.00','$',false],
  ['Custom text engraving: $25 each','2','50.00','$',false],
  ['Furnace tune-up: $129 each.','2','258.00','$',false],
  ['Synthetic offshore periwinkle service: $10 each','2','20.00','$',false],
  ['Gift wrapping: $1.25 each','2.5','3.13','$',true],
  ['Window washing $0.035 each','1000','35.00','$',false],
  ['Widget $0.005 each','3','0.02','$',true],
  ['Widget $0.10 each','0.2','0.02','$',false],
  ['Widget CAD 19.99 each. Taxes extra.','3','59.97','CAD',false],
  ['Widget US$1,234.50 each','2','2469.00','US$',false],
  ['Widget €2.50 each','3.333','8.33','€',true],
  ['Widget £10 each','3','30.00','£',false],
  ['Widget (blue): $10 each','3','30.00','$',false],
  ['Inspection $10 each','3','30.00','$',false],
  ['Delivery $10 each','3','30.00','$',false]
];
controls.push(
  ['Board-on-board panel $10 each','3','30.00','$',false],
  ['Nail-in anchor $10 each','3','30.00','$',false],
  ['Plug-in adapter $10 each','3','30.00','$',false]
);
for(const [listing,quantity,amount,currency,rounded] of controls)test('listed conditions control: '+listing,async t=>{
  const direct=calculate(listing,quantity);
  assert.equal(direct.status,'calculated');assert.equal(direct.extendedAmount,amount);
  assert.equal(direct.currency,currency);assert.equal(direct.listedItem,listing);
  assert.ok(direct.voiceSummary.startsWith(listing));
  assert.equal(direct.voiceSummary.includes('rounded to the nearest cent'),rounded);
  assert.match(direct.voiceSummary,/No tax, fees, discounts or other items have been added\.$/);
  const f=fixture(t),c=f.context();save(f,c.ownerId,{prices:listing});
  assert.deepEqual(await f.voice(c).tool('calculateListedPrice',args(listing,quantity)),direct);
});

test('listed conditions saved identity: edits, draft, foreign owner, duplicate and partial listings refuse',async t=>{
  const f=fixture(t),c=f.context(),v=f.voice(c),plain='[SYNTHETIC] Widget $10 each';
  save(f,'synthetic-b',{prices:plain});review(await v.tool('calculateListedPrice',args(plain)));
  save(f,c.ownerId,{prices:plain,draft:true});review(await v.tool('calculateListedPrice',args(plain)));
  save(f,c.ownerId,{prices:plain});assert.equal((await v.tool('calculateListedPrice',args(plain))).extendedAmount,'30.00');
  const changed='[SYNTHETIC] Widget if prepaid $10 each';
  save(f,c.ownerId,{prices:changed});review(await v.tool('calculateListedPrice',args(plain)));
  review(await v.tool('calculateListedPrice',args(changed)));
  review(await v.tool('calculateListedPrice',args('$10 each')));
  save(f,c.ownerId,{prices:plain+'\n\n'+plain});review(await v.tool('calculateListedPrice',args(plain)));
  save(f,c.ownerId,{prices:plain});
  assert.equal((await v.tool('calculateListedPrice',args(plain))).extendedAmount,'30.00');
});

test('listed conditions confirmation and numeric domain are not relaxed',async t=>{
  const f=fixture(t),c=f.context(),v=f.voice(c),listing='[SYNTHETIC] Widget $10 each';
  save(f,c.ownerId,{prices:listing});
  review(calculateSavedListedPrice({prices:listing},{...args(listing),customerConfirmed:false}));
  await assert.rejects(()=>v.tool('calculateListedPrice',{...args(listing),customerConfirmed:false}));
  for(const quantity of ['0','-1','1e3','1/2','1.0000001','1000000000000']){
    review(calculate(listing,quantity));
    await assert.rejects(()=>v.tool('calculateListedPrice',args(listing,quantity)));
  }
  await assert.rejects(()=>v.tool('calculateListedPrice',{...args(listing),unitPrice:1}));
  review(calculate('Widget $999999999999 each','2'));
});

test('listed conditions compiled fallback retains verbatim condition and ordinary contact rewrite',async t=>{
  const f=fixture(t),c=f.context(),v=f.voice(c);
  const guideText=readFileSync(new URL('../server/src/voice/receptionistGuide.md',import.meta.url),'utf8');
  for(const listing of reported){
    const prompt=compileVoiceSystemInstruction({guideText,business:{businessName:'[SYNTHETIC] Shop',agentName:'Synthetic'},services:[],knowledge:{prices:listing}});
    const prices=JSON.parse(prompt.match(/<OWNER_FACTS_JSON>\s*([\s\S]*?)\s*<\/OWNER_FACTS_JSON>/)[1]).knowledge.prices;
    assert.equal(prices,listing);
    assert.match(prompt,/If the tool cannot calculate, repeat only the original listing and arrange review\./);
    save(f,c.ownerId,{prices});review(await v.tool('calculateListedPrice',args(prices)));
  }
  const original='Window washing: $6 each. Call us for a free estimate.';
  const rewritten=rewriteKnowledgeText(original);assert.equal(rewritten,'Window washing: $6 each.');
  save(f,c.ownerId,{prices:original});
  const result=await v.tool('calculateListedPrice',args(rewritten,'10'));
  assert.equal(result.extendedAmount,'60.00');assert.equal(result.listedItem,rewritten);
});

test('listed conditions selectors include this file only in the full suite',()=>{
  const root=fileURLToPath(new URL('../',import.meta.url));
  const file='test/voiceListedPriceConditions20261018.spec.mjs';
  assert.equal(allSpecFiles(root).filter(value=>value===file).length,1);
  assert.equal(quotePricebookSpecFiles(root).includes(file),false);
});
