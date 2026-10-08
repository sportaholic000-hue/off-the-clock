import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {compileVoiceSystemInstruction,VOICE_GUIDE_SERVICE_TYPES} from '../server/src/voice/voicePromptCompiler.js';
import {rewriteKnowledgeText} from '../server/src/voice/knowledgeText.js';
import {calculateSavedListedPrice} from '../server/src/voice/listedPriceCalculation.js';
const guidePath=new URL('../server/src/voice/receptionistGuide.md',import.meta.url);
const guide=()=>readFileSync(guidePath,'utf8');
const compile=(extra={})=>compileVoiceSystemInstruction({guideText:guide(),business:{businessName:'Synthetic business',agentName:'Synthetic receptionist'},services:VOICE_GUIDE_SERVICE_TYPES.map(serviceType=>({serviceType,serviceLabel:serviceType.replaceAll('_',' '),active:true,status:'QUOTING LIVE',offerings:[]})),...extra});
const facts=prompt=>JSON.parse(prompt.match(/<OWNER_FACTS_JSON>\n([\s\S]*?)\n<\/OWNER_FACTS_JSON>/)[1]);
const calculate=(listing,quantity,listedItem=listing)=>calculateSavedListedPrice({prices:listing},{listedItem,quantity,customerConfirmed:true});
test('receptionist 1 runtime guide ships inside server without specs',()=>{
 assert.ok(existsSync(guidePath));
 assert.match(readFileSync(new URL('../server/src/voice/productionVoiceRuntime.js',import.meta.url),'utf8'),/new URL\('\.\/receptionistGuide\.md'/);
});
test('receptionist 2 all twenty live flows use measured inputs and open fence height',()=>{
 const prompt=compile().replace(/\s+/g,' ');
 assert.equal((prompt.match(/## ACTIVE SERVICE FLOW: /g)||[]).length,20);
 for(const serviceType of VOICE_GUIDE_SERVICE_TYPES)assert.ok(prompt.includes(`## ACTIVE SERVICE FLOW: ${serviceType}`),serviceType);
 for(const stale of [
  'convert silently','go look or pace it off','MEASUREMENT COACHING BANK',
  'big walking step','Pace it off','No tape measure needed',"A rough number's fine",
  "I'll quote a range",'slightly wider range','small/medium/large',
  'assumption quotes','assumption gate applies','assume-with-disclosure',
  "Most folks go [owner's default]",'walk you through samples',
  'owner is being notified now','text confirmation',
  'small house, average','small yard, average','small patio, average',
  'engine estimates from bed size','walking step',"I'll use average pricing",
  "I'll figure one layer","I'll figure one",'Ballpark\'s fine',
  'towel/bedsheet/bigger scale','engine maps size',
  'standard width','four foot, six, or eight',"what's the floor space",
  'Small city lot','home_floor_area','homesize','Knows floor sqft','Rooms path',
  'room sizes','floorAreaSqft','roomCount/floorAreaSqft',
  'assumption path',"I can work it out from that",
  'Going over a dark color usually wants an extra coat',
  'Two coats covers that',"I'll quote two", "I'll quote three",
  '$X a sheet'
 ])assert.ok(!prompt.toLowerCase().includes(stale.toLowerCase()),stale);
 assert.match(prompt,/NEVER use the same acknowledgment twice in a row/);
 assert.match(prompt,/CAPTURE ALL OF THEM/);
 assert.match(prompt,/Which works\?/);
 assert.match(prompt,/NATURAL SPEECH:.*Now and then use a natural filler like 'um', 'hmm', 'uh' or 'let's see'.*sparingly, never in every turn.*Never put a filler inside a price, a measurement, a number read-back or the quote narration\./i);
 assert.match(prompt,/measured wall area/i);assert.match(prompt,/How many coats do you want\?/i);
 assert.match(prompt,/How tall do you want it, in feet and inches\?/);
 assert.match(prompt,/What's the measured roof area, in square feet\?/);
 assert.match(prompt,/Your booking is confirmed\./);
 assert.doesNotMatch(prompt,/being notified as we speak/i);
 assert.doesNotMatch(prompt,/\b(?:sms|texting|texts|text confirmation)\b/i);
});
const mixed='Gutter cleaning: $2.50 per linear foot\nAll prices plus HST. Call or text for a free estimate.\n\nService call: $89 each. Call or text to book.\n\nCustom text engraving: $25 each\n\nWindow washing: $6 each\nText us for a quote.';
test('receptionist 3 shared communication rewrite preserves prices tax and ordinary text',()=>{
 const knowledge=facts(compile({knowledge:{prices:mixed,hours:'Call or text for hours.',policies:'Text me for access.'}})).knowledge;
 assert.match(knowledge.prices,/plus HST/);assert.match(knowledge.prices,/Service call: \$89 each/);assert.match(knowledge.prices,/Custom text engraving/);assert.equal(knowledge.hours,'Call for hours.');assert.equal(knowledge.policies,'Call me for access.');
 const entry=knowledge.prices.split('\n\n').at(-1);assert.equal(calculate(mixed,'10',entry).extendedAmount,'60.00');
});
for(const [listing,quantity,amount] of [['Bricks $2 each','500','1000.00'],['$90 each','4','360.00'],['$6 per window','10','60.00'],['$75 per stump','3','225.00'],['$350 per square','2','700.00'],['$5 per bag','12','60.00'],['$150 per load','2','300.00'],['$400 per room','3','1200.00'],['SYNTHETIC: $20 per hour','1.25','25.00'],[mixed.split('\n\n')[0],'120','300.00'],['$2.50 per linear foot','3.333','8.33'],['$1.25 each','2.5','3.13']])test('receptionist 4 flat listed price '+listing+' x '+quantity,()=>{
 const rewritten=facts(compile({knowledge:{prices:listing}})).knowledge.prices;
 const result=calculate(listing,quantity,rewritten);assert.equal(result.status,'calculated');assert.equal(result.extendedAmount,amount);
 assert.ok(result.voiceSummary.startsWith(rewritten));assert.doesNotMatch(result.voiceSummary,/\.\./);
 assert.equal(result.voiceSummary.includes('rounded to the nearest cent'),quantity==='3.333'||listing==='$1.25 each');
 if(amount==='1000.00')assert.match(result.voiceSummary,/\$1,000\.00/);
});
for(const listing of ['$20 per hour or part thereof.','$20 per hour. Billed in 60 minute blocks.','$20 per hour. Round to the next hour.','$20 per hour. Round up to whole hours.','$20 each; second item half price','$20 each; every other item half price','$20 each; quantity of two gets a rebate','Buy two, get one free. $20 each.','$2 per sqft per coat.','$10 per item per day.','$90 per hour per technician','$20-$30 each','From $20 each','$20 each. $10 delivery.'])test('receptionist 4 unclassified listing requires review '+listing,()=>{const result=calculate(listing,'1.25');assert.equal(result.status,'needs_review');assert.ok(!Object.hasOwn(result,'extendedAmount'));});
test('receptionist 4 zero quantity refused and speech joins with one period',()=>{assert.equal(calculate('$20 each','0').status,'needs_review');assert.match(calculate('Service call: $95 each.','3').voiceSummary,/each\. At that listed price/);});
for(const name of ['$99 Synthetic Plumbing','Low Cost Roofing 24/7','5 Dollar Fence Co','Best Rate Painting 2'])test('receptionist 5 identity accepts '+name,()=>{assert.equal(facts(compile({business:{businessName:name,agentName:name}})).business.businessName,name);});

test('receptionist 3 sentence rewriting removes only communication offers and preserves financial qualifications',()=>{
 assert.equal(rewriteKnowledgeText('We send custom text to the printer.'),'We send custom text to the printer.');
 assert.equal(rewriteKnowledgeText('We send text engraving samples.'),'We send text engraving samples.');
 const financial=['We send texts about a 10 percent fee.','We send texts with a $20 minimum.','We send texts about prices plus HST.','Custom text engraving: $25 each.'];
 for(const sentence of financial)assert.equal(rewriteKnowledgeText(sentence),sentence);
 assert.equal(rewriteKnowledgeText("We send texts. Hours: 9 to 5. Automatic SMS reminders available. We'll text you a reminder."),'Hours: 9 to 5.');
 assert.equal(rewriteKnowledgeText('Text or call for access. Text us for a quote. Text me to book.'),'Call for access. Call us for a quote. Call me to book.');
 assert.equal(calculate('$20 each. Pickup only.','3').status,'needs_review');
});
