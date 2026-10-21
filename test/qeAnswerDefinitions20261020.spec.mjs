import './pricebookTestEnv.mjs';
import test, {before} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {build} from 'esbuild';
import * as bridge from '../server/src/quoteDoneBridge.js';
import {voiceQuestionContract} from '../server/src/voice/voiceQuoteContract.js';
import {fixture} from '../verification/engine-independent/fixtures.mjs';
import {migrate,db} from '../server/src/db.js';
import {loadPricebook} from '../server/priceBookService.js';

// Expected values, written before execution. Every choice of each listed
// question carries this exact starting description in the widget contract and
// in the voice question contract.
const START={
  access:{easy:['Easy','Clear, level path for workers and equipment right up to the work area.'],moderate:['Moderate','Some obstacles on the way, such as a narrow gate, steps or a longer carry.'],difficult:['Difficult','Hard to reach: tight or blocked paths, many steps, or materials carried a long way by hand.']},
  slope:{flat:['Flat','Level ground you can walk and push a wheelbarrow across without effort.'],moderate:['Moderate','A noticeable slope you can walk comfortably, but a wheelbarrow takes some effort.'],steep:['Steep','A slope that is hard to walk up or stand on comfortably.']},
  debris:{light:['Light','Scattered leaves, twigs and small litter.'],moderate:['Moderate','Leaf piles, fallen branches or several bags of yard waste.'],heavy:['Heavy','Deep leaf cover, large branches, brush piles or overgrowth throughout.']},
  grass:{maintained:['Maintained','Mowed regularly; the grass is at a normal mowing height.'],overgrown:['Overgrown','A few mowings missed; the grass is clearly long and may be clumping.'],severe:['Severe','Not mowed in a long time; tall, thick grass or weeds hide the ground.']},
  surface:{good:['Good','Clean and sound, with no peeling, cracks or patching needed.'],fair:['Fair','Some small cracks, nail holes, scuffs or light peeling that need touch-up.'],poor:['Poor','Widespread peeling, cracking, stains or damage that needs repair before painting.']},
  wall:{standard:['Standard','A typical room height you can paint from a short step ladder.'],high:['High','Taller than a typical room; a tall ladder is needed to reach the top.'],vaulted:['Vaulted','A sloped or cathedral ceiling, or a two-storey space such as a foyer.']},
  pitch:{low:['Low','Nearly flat or gently sloped; easy to walk on.'],medium:['Medium','A typical house roof slope you can walk on with care.'],steep:['Steep','Too steep to walk on comfortably; roofers need safety gear.'],very_steep:['Very steep','Very steep, close to a wall in places, such as a mansard or A-frame roof.']},
  complexity:{simple:['Simple','A gable roof.'],moderate:['Moderate','A hip roof or several valleys.'],complex:['Complex','Dormers or turrets.']},
  plant:{small:['Small','Perennials, groundcover or small shrubs in small nursery pots.'],medium:['Medium','Shrubs or small evergreens in larger nursery pots.'],large:['Large','Trees or large shrubs, sold balled or in very large containers.']}
};
const QUESTIONS=[
  ['LANDSCAPING_CLEANUP','debrisLevel','debris'],['LANDSCAPING_CLEANUP','slope','slope'],
  ['LANDSCAPING_MOWING','grassCondition','grass'],
  ['INTERIOR_PAINTING','surfaceCondition','surface'],['INTERIOR_PAINTING','ceilingSurfaceCondition','surface'],['INTERIOR_PAINTING','trimSurfaceCondition','surface'],['INTERIOR_PAINTING','wallHeight','wall'],
  ['EXTERIOR_PAINTING','surfaceCondition','surface'],
  ['FLAT_ROOF_REPLACEMENT','accessDifficulty','access'],['FLAT_ROOF_REPAIR','accessDifficulty','access'],
  ['CONCRETE_DRIVEWAY','accessDifficulty','access'],['CONCRETE_DRIVEWAY','demolitionAccessDifficulty','access'],
  ['CONCRETE_PATIO_SLAB','accessDifficulty','access'],['CONCRETE_PATIO_SLAB','demolitionAccessDifficulty','access'],
  ['LANDSCAPING_MULCH','accessDifficulty','access'],['LANDSCAPING_PLANTING','accessDifficulty','access'],['LANDSCAPING_SOD','accessDifficulty','access'],
  ['LANDSCAPING_SOD','slope','slope'],['FENCING_INSTALL','terrainSlope','slope'],['FENCING_REPLACEMENT','terrainSlope','slope'],
  ['ROOFING_REPLACEMENT','pitch','pitch'],['ROOFING_REPAIR','pitch','pitch'],['ROOFING_REPLACEMENT','roofComplexity','complexity'],
  ['LANDSCAPING_PLANTING','plantsBySize','plant']
];
const expected=set=>Object.entries(START[set]).map(([value,[label,definition]])=>({value,label,definition}));
let render;
before(async()=>{
  const result=await build({bundle:true,write:false,platform:'node',format:'cjs',external:['react','react-dom/server'],stdin:{loader:'jsx',resolveDir:process.cwd(),contents:`
    import React from 'react';
    import {renderToStaticMarkup} from 'react-dom/server';
    import {CustomerMeasurements} from './client/src/quoteDoneControls.jsx';
    export function render(fields){return renderToStaticMarkup(<CustomerMeasurements fields={fields} value={{}} onChange={()=>{}}/>);}
  `}});
  const module={exports:{}};
  new Function('require','module','exports',result.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
  ({render}=module.exports);
});
function surfaces(service){
  const definition=bridge.applicationServiceDefinition(service);
  return {definition,phone:voiceQuestionContract(service,definition)};
}
const widgetRows=field=>Object.entries(field.optionDefinitions||{}).map(([value,item])=>({value,label:item.label,definition:item.definition}));
const escape=text=>text.replaceAll('&','&amp;').replaceAll("'",'&#x27;').replaceAll('"','&quot;');

for(const [type,name,set] of QUESTIONS)test(`${type}.${name}: widget and voice carry identical definitions for every choice`,()=>{
  const service=fixture(type,{},{}).ownerPricing,{definition,phone}=surfaces(service);
  const field=definition.customerFields.find(item=>item.name===name);
  assert.ok(field,`${type} asks ${name}`);
  assert.deepEqual(widgetRows(field),expected(set));
  const question=phone.fields.find(item=>item.field===name);
  assert.ok(question,`${type} voice asks ${name}`);
  assert.deepEqual(question.choiceDefinitions,expected(set));
  // Render the question as shown once its own visibility condition is met.
  if(!field.visibleWhen||field.visibleWhen.length){
    const html=render([{...field,visibleWhen:undefined}]);
    for(const row of expected(set))assert.ok(html.includes(`<strong>${escape(row.label)}:</strong> ${escape(row.definition)}`),`${type}.${name} widget shows ${row.value}`);
  }
});

test('already-defined choices are not redone: new roof shape, rise-per-12 bands and owner plant sizes',()=>{
  const roof=fixture('ROOFING_REPLACEMENT',{},{}).ownerPricing;roof.startingValueAdoptions={roofing_replacement_20261016:{mode:'new'}};
  const fields=bridge.applicationServiceDefinition(roof).customerFields;
  assert.equal(fields.find(f=>f.name==='roofComplexity').optionDefinitions,undefined);
  assert.equal(fields.find(f=>f.name==='roofComplexity').optionLabels.simple,'Simple — a gable roof');
  assert.equal(fields.find(f=>f.name==='pitchBand').optionDefinitions,undefined);
  assert.equal(fields.find(f=>f.name==='pitch'),undefined);
  const plants=fixture('LANDSCAPING_PLANTING',{plantSizes:{shrub:{name:'[SYNTHETIC] Shrub'},tree:{name:'[SYNTHETIC] Tree'}}},{}).ownerPricing;
  const plantField=bridge.applicationServiceDefinition(plants).customerFields.find(f=>f.name==='plantsBySize');
  assert.equal(plantField.optionDefinitions,undefined);assert.deepEqual(plantField.options,{shrub:'[SYNTHETIC] Shrub',tree:'[SYNTHETIC] Tree'});
});

test('wall height with owner bands 8 / 10 / 20 ft is defined by the bands in both channels',()=>{
  const service=fixture('INTERIOR_PAINTING',{paintingSettings:{heightBands:{standardMaxFeet:8,highMaxFeet:10,vaultedMaxFeet:20}}},{}).ownerPricing;
  const field=bridge.applicationServiceDefinition(service).customerFields.find(f=>f.name==='wallHeight');
  const rows=[{value:'standard',label:'Standard',definition:'up to 8 ft'},{value:'high',label:'High',definition:'over 8 ft up to 10 ft'},{value:'vaulted',label:'Vaulted',definition:'over 10 ft up to 20 ft'}];
  assert.deepEqual(widgetRows(field),rows);
  assert.deepEqual(rows.map(r=>r.label+': '+r.definition),['Standard: up to 8 ft','High: over 8 ft up to 10 ft','Vaulted: over 10 ft up to 20 ft']);
  // Feet-based wall height is not owner-editable text.
  assert.ok(!bridge.applicationStatus(service,{ownerId:'synthetic',defaults:{currency:'CAD'},services:[service]}).answerDefinitionFields.some(f=>f.name==='wallHeight'));
});

function savedOwner(){
  migrate();const owner='synthetic-answers-'+randomUUID(),at='2026-10-20T12:00:00.000Z';
  db.prepare("INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt) VALUES(?,?,'SYNTHETIC','Synthetic','Synthetic Answers','QuoteDone','active','UTC','owner',?)").run(owner,owner+'@example.invalid',at);
  db.prepare("INSERT INTO businessProfiles(ownerId,knowledgeBaseJson,updatedAt) VALUES(?,'{}',?)").run(owner,at);
  const service=structuredClone(fixture('LANDSCAPING_CLEANUP',{},{}).ownerPricing);delete service.origin;
  const draft=bridge.convertApplicationBook({services:[service],defaults:{currency:'CAD',quoteTimeZone:'UTC'}},'toDollars');
  bridge.saveApplicationBook(owner,{...draft,revision:bridge.readApplicationBook(owner).revision});
  return owner;
}
function saveDefinitions(owner,answerDefinitions){
  const book=bridge.readApplicationBook(owner),service={...book.services[0]};
  if(answerDefinitions===undefined)delete service.answerDefinitions;else service.answerDefinitions=answerDefinitions;
  return bridge.saveApplicationBook(owner,{...book,services:[service]});
}
function heavy(owner){
  const raw=loadPricebook(owner).services[0],{definition,phone}=surfaces(raw);
  const widget=definition.customerFields.find(f=>f.name==='debrisLevel').optionDefinitions.heavy.definition;
  const voice=phone.fields.find(f=>f.field==='debrisLevel').choiceDefinitions.find(c=>c.value==='heavy').definition;
  assert.equal(widget,voice);
  return {widget,html:render([definition.customerFields.find(f=>f.name==='debrisLevel')])};
}

test('owner edits the debris-level Heavy description: widget and voice show it; clearing restores the starting text',()=>{
  const owner=savedOwner(),edited='Fallen trees, brush piles and leaves covering the whole yard.';
  assert.equal(heavy(owner).widget,START.debris.heavy[1]);
  const editor=bridge.applicationStatus(loadPricebook(owner).services[0],loadPricebook(owner)).answerDefinitionFields.find(f=>f.name==='debrisLevel');
  assert.deepEqual(editor.choices.find(c=>c.value==='heavy'),{value:'heavy',label:'Heavy',startingDefinition:START.debris.heavy[1]});
  saveDefinitions(owner,{debrisLevel:{heavy:edited}});
  assert.deepEqual(bridge.readApplicationBook(owner).services[0].answerDefinitions,{debrisLevel:{heavy:edited}});
  let shown=heavy(owner);assert.equal(shown.widget,edited);assert.ok(shown.html.includes('<strong>Heavy:</strong> '+edited));
  saveDefinitions(owner,{debrisLevel:{heavy:'   '}});
  assert.equal(heavy(owner).widget,START.debris.heavy[1]);
  saveDefinitions(owner,undefined);
  shown=heavy(owner);assert.equal(shown.widget,START.debris.heavy[1]);assert.ok(shown.html.includes('<strong>Heavy:</strong> '+START.debris.heavy[1]));
});

test('owner descriptions cannot carry prices, percentages, multipliers, numbers or codes',()=>{
  const owner=savedOwner();
  for(const text of ['$50 extra for heavy debris','Adds 25% to the price','Charged at 1.5x','heavy_debris','Two\nlines','A'.repeat(161)])
    assert.throws(()=>saveDefinitions(owner,{debrisLevel:{heavy:text}}),error=>error.statusCode===422&&error.details?.code==='INVALID_QUOTE_PRESENTATION',JSON.stringify(text));
  assert.throws(()=>saveDefinitions(owner,{grassCondition:{severe:'Tall grass'}}),error=>error.statusCode===422);
  assert.throws(()=>saveDefinitions(owner,{debrisLevel:{extreme:'Everything'}}),error=>error.statusCode===422);
  assert.equal(heavy(owner).widget,START.debris.heavy[1]);
});

test('no definition contains a price, a multiplier value or an internal key',()=>{
  const keys=new Set();
  for(const [type,name] of QUESTIONS){const service=fixture(type,{},{}).ownerPricing;keys.add(name);for(const value of Object.keys(service.pricing||{}))keys.add(value);}
  for(const set of Object.values(START))for(const value of Object.keys(set))if(value.includes('_'))keys.add(value);
  const banded=fixture('INTERIOR_PAINTING',{paintingSettings:{heightBands:{standardMaxFeet:8,highMaxFeet:10,vaultedMaxFeet:20}}},{}).ownerPricing;
  for(const service of [...QUESTIONS.map(([type])=>fixture(type,{},{}).ownerPricing),banded]){
    const {definition,phone}=surfaces(service);
    const texts=[...definition.customerFields.flatMap(f=>Object.values(f.optionDefinitions||{}).flatMap(d=>[d.label,d.definition])),...phone.fields.flatMap(q=>(q.choiceDefinitions||[]).flatMap(d=>[d.label,d.definition]))];
    for(const text of texts){
      assert.doesNotMatch(text,/[$€£¢¥%×_]|\bx\s*\d|\d\s*x\b|\bmultipliers?\b|\bfactors?\b|\bper cent\b|\bprices?\b|\bcosts?\b|\brates?\b/i,text);
      assert.doesNotMatch(text.replace(/\b\d+(?:\.\d+)? ft\b/g,''),/\d/,text);
      for(const key of [...keys].filter(key=>/[A-Z_]/.test(key)))assert.ok(!new RegExp('\\b'+key+'\\b').test(text),`${text} contains ${key}`);
    }
  }
});

test('a published service reaches the receptionist through matchService with the same definitions as the widget',async t=>{
  const {quoteEmailFixture,phone}=await import('./quoteDeliveryBatch20261015Fixture.mjs');
  const {cleanupFixture}=await import('./landscapeLaneB20261016Fixture.mjs');
  const f=cleanupFixture(),h=quoteEmailFixture(t),p=await phone(h,f);
  const question=p.match.questionContract.fields.find(q=>q.field==='debrisLevel');
  assert.deepEqual(question.choiceDefinitions,expected('debris'));
  assert.deepEqual(widgetRows(p.definition.customerFields.find(f=>f.name==='debrisLevel')),expected('debris'));
  assert.equal(p.result.status,'quoted');
});

test('the receptionist reads definitions only when the caller is unsure and keeps the caller\'s own answer',async()=>{
  const {readFileSync}=await import('node:fs');
  const {compileVoiceSystemInstruction}=await import('../server/src/voice/voicePromptCompiler.js');
  const guideText=readFileSync(new URL('../server/src/voice/receptionistGuide.md',import.meta.url),'utf8');
  const rule="Answer definitions: when a question has choiceDefinitions and the caller is unsure which choice fits, read each choice's label and definition exactly as given, then ask which one fits. Accept the caller's own choice; never pick it for them or overrule it.";
  const business={businessName:'Synthetic Business',agentName:'Alex'};
  assert.ok(compileVoiceSystemInstruction({guideText,business,services:[],knowledge:{}}).includes(rule));
  assert.ok(!compileVoiceSystemInstruction({guideText,business,services:[],knowledge:{},capabilities:{booking:true,transfer:true,phoneQuoting:false}}).includes(rule));
});

test('saved owner descriptions never change a quote: phone and widget cents match the service without them',async t=>{
  // Written before execution: the cleanup fixture quotes the same amounts with
  // or without owner descriptions, and both quotes are instant estimates.
  const {quoteEmailFixture,phone,webQuote}=await import('./quoteDeliveryBatch20261015Fixture.mjs');
  const {cleanupFixture}=await import('./landscapeLaneB20261016Fixture.mjs');
  const plain=cleanupFixture(),described=cleanupFixture();
  described.ownerPricing.answerDefinitions={debrisLevel:{heavy:'Fallen trees and brush covering the yard.'},slope:{steep:'Hard to stand on.'}};
  const cents=r=>JSON.stringify((r.options||r.pricedEstimate?.options||[]).map(o=>[o.tierName,o.lowEstimate,o.midEstimate,o.highEstimate]));
  const a=await phone(quoteEmailFixture(t),plain),b=await phone(quoteEmailFixture(t),described);
  assert.equal(a.result.status,'quoted');assert.equal(b.result.status,'quoted');assert.equal(cents(b.result),cents(a.result));
  assert.equal(b.match.questionContract.fields.find(q=>q.field==='debrisLevel').choiceDefinitions.find(c=>c.value==='heavy').definition,'Fallen trees and brush covering the yard.');
  const wa=webQuote(plain),wb=webQuote(described);
  assert.equal(wa.result.resultType,'INSTANT_ESTIMATE_READY');assert.equal(wb.result.resultType,'INSTANT_ESTIMATE_READY');assert.equal(cents(wb.result),cents(wa.result));
});
