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

// Original local candidate: all 91 regressions retained.
{

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
}

// Original competing candidate: all 206 regressions retained.
{

// Synthetic saved knowledge only. Expected amounts were calculated by hand in
// verification/qe-listed-price-conditions-20261018/EXPECTED.md before execution.
const review={status:'needs_review',message:'The saved listing or quantity cannot be multiplied safely. Repeat only the saved listing word for word with its conditions, or ask the business to review it. No multiplied amount is available.'};
const args=(listedItem,quantity='3')=>({listedItem,quantity,customerConfirmed:true});
const direct=(listing,quantity='3')=>calculateSavedListedPrice({prices:listing,draft:false},args(listing,quantity));
function savedDispatcher(t,prices,{draft=false}={}){
 const h=fixture(t),context=h.context();
 h.db.prepare('UPDATE businessProfiles SET knowledgeBaseJson=? WHERE ownerId=?').run(JSON.stringify({prices,draft}),context.ownerId);
 const voice=h.voice(context),before=h.db.prepare('SELECT total_changes() n').get().n;
 return {h,context,async calculate(input){
  const result=await voice.tool('calculateListedPrice',input);
  assert.equal(h.db.prepare('SELECT total_changes() n').get().n,before,'listed-price calls must not write business data');
  return result;
 }};
}

const conditional=[
 'If prepaid $10 per item',
 'Unless delivered $10 per item',
 'When booked online $10 per item',
 'After inspection $10 per item',
 'Subject to approval $10 per item',
 '[PLACEHOLDER] Item IF PREPAID: $10 each',
 '[PLACEHOLDER] Item (unless delivered): $10 each',
 'WhEn\u00a0booked online $10 per item',
 '[PLACEHOLDER] Item subject-to-approval: $10 each',
 'Before payment clears $10 each',
 'Until stock runs out $10 each',
 'While supplies last $10 each',
 'Whenever booked online $10 each',
 'Once approved $10 each',
 'Upon inspection $10 each',
 'During business hours $10 each',
 'Provided payment clears $10 each',
 'Providing access is clear $10 each',
 'Pending assessment $10 each',
 'Conditional service $10 each',
 'Contingent service $10 each',
 'Depending on access $10 each',
 'Payment required $10 each',
 'Approval must be obtained $10 each',
 'Price may change $10 each',
 'Price might change $10 each',
 'Price can change $10 each',
 'Eligible accounts $10 each',
 'Qualifying orders $10 each',
 'Terms apply $10 each',
 'Restrictions apply $10 each',
 'Estimated service $10 each',
 'Provisional service $10 each',
 'Negotiable service $10 each',
 'For members $10 each',
 'With a coupon $10 each',
 'Without delivery $10 each',
 'Under contract $10 each',
 'On request $10 each',
 'At owner discretion $10 each',
 'By arrangement $10 each',
 'As agreed $10 each',
 'ＩＦ prepaid $10 each',
 'Approximately $10 each',
 'Approximate service $10 each',
 'Roughly $10 each',
 'Ballpark service $10 each',
 'Suggested service $10 each',
 'Variable service $10 each',
 'Usually $10 each',
 'Prepaid service $10 each',
 'Member service $10 each',
 'Daily rental $10 per item',
 'Monthly rental $10 per item',
 'Weekday service $10 each',
 'Plus delivery $10 each',
 '[PLACEHOLDER] Item [for members] $10 each',
 '[PLACEHOLDER] Item (with delivery) $10 each',
 'In store $10 each',
 'In-store $10 each',
 '[PLACEHOLDER] Item (in store): $10 each',
 'To account holders $10 each',
 '[PLACEHOLDER] Item $10 each if prepaid',
 '[PLACEHOLDER] Item $10 each. Subject to approval.',
 '[PLACEHOLDER] Item $10 each\nUnless delivered',
 '[PLACEHOLDER] Item $10 each minimum',
 '[PLACEHOLDER] Item $10 per hour or part thereof',
 '[PLACEHOLDER] Item $10 per sqft per coat',
 '[PLACEHOLDER] Item $10 per item daily',
 '[PLACEHOLDER] Item $10 each. Second item half price.',
 '[PLACEHOLDER] Item $10 each or $8 each for bulk orders',
 '[PLACEHOLDER] Item 3 $10 each',
 'First [PLACEHOLDER] item $10 each'
];
for(const listing of conditional){
 test('listed conditions direct refuses: '+listing,()=>assert.deepEqual(direct(listing),review));
 test('listed conditions dispatcher refuses: '+listing,async t=>{
  const d=savedDispatcher(t,listing);
  assert.deepEqual(await d.calculate(args(listing)),review);
  assert.equal(JSON.parse(d.h.db.prepare('SELECT knowledgeBaseJson FROM businessProfiles WHERE ownerId=?').get(d.context.ownerId).knowledgeBaseJson).prices,listing,'saved conditions stay word for word');
 });
}

const flat=[
 ['[PLACEHOLDER] Item $10 each','3','30.00','$',false],
 ['Gutter cleaning: $2.50 per linear foot','120','300.00','$',false],
 ['Trim CAD 0.035 per linear foot','3','0.11','CAD',true],
 ['[PLACEHOLDER] Item $0.025 each','1','0.03','$',true],
 ['[PLACEHOLDER] Item $0.004 each','1','0.00','$',true],
 ['[PLACEHOLDER] Item $1.25 each','2.5','3.13','$',true],
 ['[PLACEHOLDER] Item $1.000000 each','3','3.00','$',false],
 ['[PLACEHOLDER] Item $1,234.50 each','2','2469.00','$',false],
 ['[PLACEHOLDER] Item EUR 2.50 each','4','10.00','EUR',false],
 ['Sod $1.20 per square foot','500','600.00','$',false],
 ['2x4 Lumber $10 each','3','30.00','$',false],
 ['2×4 Lumber $10 each','3','30.00','$',false],
 ['Grade 2 Lumber $10 each','3','30.00','$',false],
 ['3/4 inch Plywood $10 each','3','30.00','$',false],
 ['#2 Lumber $10 each','3','30.00','$',false],
 ['2x4 Grade 2 #2 Lumber $10 each','3','30.00','$',false],
 ['Offshore periwinkle service $10 each','3','30.00','$',false],
 ['Aftercare kit $10 each','3','30.00','$',false],
 ['Tin can $10 each','3','30.00','$',false],
 ['Can of paint $10 each','3','30.00','$',false],
 ['Board-on-board panel $10 each','3','30.00','$',false],
 ['Nail-in anchor $10 each','3','30.00','$',false],
 ['Plug-in adapter $10 each','3','30.00','$',false],
 ['Custom text engraving $10 each','3','30.00','$',false],
 ['[PLACEHOLDER] Item CA$10 each. Plus HST.','3','30.00','CA$',false],
 ['[PLACEHOLDER] Item US$10 each\nTaxes extra.','3','30.00','US$',false],
 ['[PLACEHOLDER] Item £10 each','3','30.00','£',false],
 ['[PLACEHOLDER] Item €10 each','3','30.00','€',false]
];
function assertFlat(result,[listing,quantity,amount,currency,rounded]){
 assert.equal(result.status,'calculated');assert.equal(result.extendedAmount,amount);assert.equal(result.currency,currency);
 assert.equal(result.listedItem,listing);assert.equal(result.quantity,quantity);assert.ok(result.voiceSummary.startsWith(listing));
 assert.equal(result.voiceSummary.includes('rounded to the nearest cent'),rounded);
 assert.ok(result.voiceSummary.endsWith('The stated conditions still apply. No tax, fees, discounts or other items have been added.'));
}
for(const row of flat){
 test('listed conditions direct preserves flat: '+row[0],()=>assertFlat(direct(row[0],row[1]),row));
 test('listed conditions dispatcher preserves flat: '+row[0],async t=>{
  const d=savedDispatcher(t,row[0]);assertFlat(await d.calculate(args(row[0],row[1])),row);
 });
}

test('listed conditions direct preserves draft, identity, duplicate, confirmation and decimal controls',()=>{
 const listing='[PLACEHOLDER] Item $10 each';
 for(const knowledge of [{prices:listing,draft:true},{prices:'[PLACEHOLDER] Other $10 each'},{prices:listing+'\n\n'+listing}])assert.deepEqual(calculateSavedListedPrice(knowledge,args(listing)),review);
 assert.deepEqual(calculateSavedListedPrice({prices:listing},{...args(listing),customerConfirmed:false}),review);
 for(const quantity of ['0','-1','NaN','Infinity','1e3','1,000','01','1.0000001',3])assert.deepEqual(direct(listing,quantity),review);
});
test('listed conditions dispatcher uses saved tenant knowledge, never caller-supplied listing identity',async t=>{
 const listing='[PLACEHOLDER] Item $10 each',foreign='[PLACEHOLDER] Foreign $1 each',d=savedDispatcher(t,listing);
 d.h.db.prepare('UPDATE businessProfiles SET knowledgeBaseJson=? WHERE ownerId=?').run(JSON.stringify({prices:foreign}),'synthetic-b');
 const voice=d.h.voice(d.context);
 for(const listedItem of [foreign,'[PLACEHOLDER] Item $1 each'])assert.deepEqual(await voice.tool('calculateListedPrice',args(listedItem)),review);
 for(const input of [{...args(listing),customerConfirmed:false},...['0','-1','NaN','Infinity','1e3','1,000','01','1.0000001',3].map(quantity=>args(listing,quantity))])await assert.rejects(voice.tool('calculateListedPrice',input));
});
test('listed conditions dispatcher refuses draft and duplicate saved listings',async t=>{
 const listing='[PLACEHOLDER] Item $10 each';
 assert.deepEqual(await savedDispatcher(t,listing,{draft:true}).calculate(args(listing)),review);
 assert.deepEqual(await savedDispatcher(t,listing+'\n\n'+listing).calculate(args(listing)),review);
});
test('listed conditions conditional financial text remains unchanged by knowledge rewriting',()=>{
 for(const listing of conditional.slice(0,5))assert.equal(rewriteKnowledgeText(listing),listing);
});
}

// Reconciliation-only separator variants; expectations precede the colon fix.
{
 const review={status:'needs_review',message:'The saved listing or quantity cannot be multiplied safely. Repeat only the saved listing word for word with its conditions, or ask the business to review it. No multiplied amount is available.'};
 for(const listing of ['Widgets:on collection $10 each','Widgets:in store $10 each','Widgets:by arrangement $10 each','Widgets:ＩＮ store $10 each']){
  test('listed conditions reconciliation direct: '+listing,()=>{
   assert.deepEqual(calculateSavedListedPrice({prices:listing},{listedItem:listing,quantity:'3',customerConfirmed:true}),review);
  });
  test('listed conditions reconciliation dispatcher: '+listing,async t=>{
   const f=fixture(t),c=f.context();
   f.ownerQuery('UPDATE businessProfiles SET knowledgeBaseJson=? WHERE ownerId=?').run(JSON.stringify({prices:listing}),c.ownerId);
   const before=f.db.prepare('SELECT total_changes() n').get().n;
   assert.deepEqual(await f.voice(c).tool('calculateListedPrice',{listedItem:listing,quantity:'3',customerConfirmed:true}),review);
   assert.equal(f.db.prepare('SELECT total_changes() n').get().n,before);
  });
 }
}
