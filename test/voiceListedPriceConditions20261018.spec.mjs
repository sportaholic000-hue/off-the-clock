import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateSavedListedPrice} from '../server/src/voice/listedPriceCalculation.js';
import {rewriteKnowledgeText} from '../server/src/voice/knowledgeText.js';
import {fixture} from './leadCaptureRepair20261006Fixture.mjs';

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
