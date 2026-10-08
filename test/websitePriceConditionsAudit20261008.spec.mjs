import './pricebookTestEnv.mjs';
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import {extractWebsitePrices} from '../server/src/websitePriceExtraction.js';
import {createWebsitePriceImporter} from '../server/src/websitePriceImport.js';
import {installKnowledgeDraftRoutes} from '../server/src/knowledgeDraftRoutes.js';
import {draftKnowledgeBase} from '../server/src/platformIntegrations.js';
import {calculateSavedListedPrice} from '../server/src/voice/listedPriceCalculation.js';
import {CREATE_TABLE_STATEMENTS,CREATE_INDEX_STATEMENTS} from '../server/src/schema.js';

// All pages, accounts, connections and database rows below are synthetic.
// Expected outcome written before execution: every qualified listing returns
// needs_review and exposes no amount, including after the actual owner save.
const lawn='Lawn mowing $10 per acre';
const cleaning='Cleaning $50 per hour.',gardening='Gardening $40 per hour.';
const minimum='A minimum charge applies to every visit.';
const booking='Minimum booking: two hours.';
const listing=entry=>[entry.excerpt,...(entry.conditions||[]).filter(note=>!entry.excerpt.includes(note))].join('\n');
const assertReview=prices=>{
  for(const listedItem of prices.split(/\n\s*\n/)){
    const result=calculateSavedListedPrice({prices,draft:false},{listedItem,quantity:'2',customerConfirmed:true});
    assert.equal(result.status,'needs_review',listedItem);
    assert.equal(Object.hasOwn(result,'extendedAmount'),false);
    assert.equal(Object.hasOwn(result,'amount'),false);
  }
};
const qualifications=[minimum,booking,'Tax is not included.','Travel surcharges apply.','A booking fee applies.',
  'A deposit is required.','Materials are billed separately.','All prices are estimates.',
  'Rates are estimates.','Prices valid Monday to Friday.','Half price on Tuesdays.',
  'Weekend pricing applies.','Costs vary.','Minimums apply.','Maximums apply.',
  'Special promotion applies.','A surcharge of $20 applies to every visit.',
  'For every visit, a minimum charge of $50 applies.','A charge of $20 applies to every visit.','We charge $20 per visit.',
  'For every visit, a $50 minimum applies.','We add a $20 surcharge to every visit.'];
for(const plain of [false,true])for(const note of qualifications)test(`website audit preserves ${plain?'plain':'HTML'} qualification: ${note}`,()=>{
  const text=plain?note+'\n'+lawn:`<body><p>${note}</p><p>${lawn}</p></body>`;
  const out=extractWebsitePrices(text,{plain});
  assert.equal(out.entries.length,1);
  assert.deepEqual(out.conditions,[note]);
  assert.deepEqual(out.entries[0].conditions,[note]);
  assert.equal(listing(out.entries[0]),lawn+'\n'+note);
  assertReview(listing(out.entries[0]));
});
for(const plain of [false,true])test(`website audit attaches minimum booking to both sibling ${plain?'plain':'HTML'} prices`,()=>{
  const text=plain?booking+'\n'+cleaning+'\n'+gardening:`<body><p>${booking}</p><div>${cleaning}</div><div>${gardening}</div></body>`;
  const out=extractWebsitePrices(text,{plain});
  assert.equal(out.entries.length,2);
  for(const entry of out.entries)assert.deepEqual(entry.conditions,[booking]);
  assertReview(out.entries.map(listing).join('\n\n'));
});
test('website audit binds section conditions to all sibling prices without leaking to another section',()=>{
  const out=extractWebsitePrices(`<body><section><h2>Indoor work</h2><p>${booking}</p><div>${cleaning}</div><div>${gardening}</div></section><section><p>Service call: $95 each.</p></section></body>`);
  assert.equal(out.entries.length,3);
  assert.deepEqual(out.entries.slice(0,2).map(entry=>entry.conditions),[[booking],[booking]]);
  assert.equal(out.entries[2].conditions,undefined);
  assertReview(out.entries.slice(0,2).map(listing).join('\n\n'));
});
for(const tag of ['div','section'])test(`website audit binds direct ${tag} condition text to its own sibling prices`,()=>{
  const out=extractWebsitePrices(`<body><${tag}>${booking}<p>${cleaning}</p><p>${gardening}</p></${tag}><p>${lawn}</p></body>`);
  assert.equal(out.entries.length,3);
  assert.deepEqual(out.entries.slice(0,2).map(entry=>entry.conditions),[[booking],[booking]]);
  assert.equal(out.entries[2].conditions,undefined);
  assertReview(out.entries.slice(0,2).map(listing).join('\n\n'));
});
for(const tag of ['list','table'])test(`website audit attaches conditions to nested ${tag} prices even when a wrapping entry already contains them`,()=>{
  const children=tag==='list'?`<ul><li>${cleaning}</li><li>${gardening}</li></ul>`:`<table><tr><td>${cleaning}</td></tr><tr><td>${gardening}</td></tr></table>`;
  const out=extractWebsitePrices(`<body><section><p>${booking}</p>${children}</section></body>`);
  assert.ok(out.entries.length>=2);
  for(const entry of out.entries)assert.ok(listing(entry).includes(booking),entry.excerpt);
  assertReview(out.entries.map(listing).join('\n\n'));
});
test('website audit finds qualifications in a complete HTML document',()=>{
  const out=extractWebsitePrices(`<!doctype html><html><head><title>Synthetic business</title></head><body><p>${minimum}</p><p>${lawn}</p></body></html>`);
  assert.equal(out.entries.length,1);
  assert.deepEqual(out.entries[0].conditions,[minimum]);
  assertReview(listing(out.entries[0]));
});
test('website audit binds heading sections and retains page-wide footer conditions',()=>{
  const tax='All prices exclude tax.';
  const out=extractWebsitePrices(`<body><h2>Indoor work</h2><p>${booking}</p><p>${cleaning}</p><h2>Outdoor work</h2><p>${gardening}</p><footer>${tax}</footer></body>`);
  assert.equal(out.entries.length,2);
  assert.deepEqual(out.entries[0].conditions,[booking,tax]);
  assert.deepEqual(out.entries[1].conditions,[tax]);
});
test('website audit preserves the condition on a numeric table price under its currency heading',()=>{
  const out=extractWebsitePrices(`<body><p>${minimum}</p><table><tr><th>Service</th><th>Price (CAD)</th></tr><tr><td>Cleaning</td><td>50.00</td></tr></table></body>`);
  assert.equal(out.entries.length,1);
  assert.deepEqual(out.entries[0].amounts,['50.00']);
  assert.deepEqual(out.entries[0].conditions,[minimum]);
  assert.match(listing(out.entries[0]),/Price \(CAD\)/);
  assertReview(listing(out.entries[0]));
});
test('website audit retains equal prices with different section conditions',()=>{
  const out=extractWebsitePrices(`<section><p>${booking}</p><p>${cleaning}</p></section><section><p>Minimum booking: three hours.</p><p>${cleaning}</p></section>`);
  assert.equal(out.entries.length,2);
  assert.notEqual(listing(out.entries[0]),listing(out.entries[1]));
});
for(const noteFirst of [true,false])test(`website audit withholds ambiguous ${noteFirst?'interleaved':'trailing'} plain-text conditions`,()=>{
  const text=[cleaning,...(noteFirst?[booking,gardening]:[gardening,booking])].join('\n');
  const out=extractWebsitePrices(text,{plain:true});
  assert.deepEqual(out.entries,[]);
  assert.equal(out.conditionsUnverified,true);
});
for(const noteFirst of [true,false])test(`website audit attaches explicit page-wide ${noteFirst?'interleaved':'trailing'} plain-text conditions to every price`,()=>{
  const text=[cleaning,...(noteFirst?[minimum,gardening]:[gardening,minimum])].join('\n');
  const out=extractWebsitePrices(text,{plain:true});
  assert.equal(out.entries.length,2);
  for(const entry of out.entries)assert.ok(listing(entry).includes(minimum));
  assertReview(out.entries.map(listing).join('\n\n'));
});
test('website audit withholds prices when a qualification sits outside a clear containing section',()=>{
  const out=extractWebsitePrices(`<body><section><p>${cleaning}</p><p>${gardening}</p></section><aside><h2>Other terms</h2><p>${booking}</p></aside></body>`);
  assert.deepEqual(out.entries,[]);
  assert.equal(out.conditionsUnverified,true);
});
test('website audit withholds the affected section when a note refers to unidentified selected services',()=>{
  const out=extractWebsitePrices(`<body><section><p>Selected services require a minimum booking.</p><p>${cleaning}</p><p>${gardening}</p></section><section><p>Service call: $95 each.</p></section></body>`);
  assert.deepEqual(out.entries.map(entry=>entry.excerpt),['Service call: $95 each.']);
  assert.equal(out.conditionsUnverified,true);
});

const {db}=await import('../server/src/db.js');
for(const sql of [...CREATE_TABLE_STATEMENTS,...CREATE_INDEX_STATEMENTS])db.exec(sql);
const {getBusinessProfile,saveKnowledgeBase}=await import('../server/src/onboardingService.js');
after(()=>db.close());
let sequence=0;
async function fixture(t,page,plain=false){
  const owner='synthetic-website-condition-'+(++sequence);
  db.prepare("INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt) VALUES(?,?,'synthetic','Synthetic','Synthetic Qualification Co','QuoteDone','active','UTC','owner','2026-10-08T00:00:00Z')").run(owner,owner+'@example.invalid');
  saveKnowledgeBase(owner,{prices:'Service call: $95 each.',websiteUrl:'https://synthetic.example/',draft:false});
  const site=http.createServer((_req,res)=>{res.setHeader('Content-Type',plain?'text/plain':'text/html');res.end(page);});
  await new Promise(resolve=>site.listen(0,'127.0.0.1',resolve));
  const importPrices=createWebsitePriceImporter({lookup:async()=>[{address:'8.8.8.8',family:4}],request:(url,options,callback)=>http.request(new URL(url.pathname,'http://127.0.0.1:'+site.address().port),{...options,lookup:undefined},callback)});
  const app=express();app.use(express.json());
  installKnowledgeDraftRoutes(app,{
    requireAuth:roles=>{assert.deepEqual(roles,['owner']);return(req,_res,next)=>{req.tenantOwnerId=owner;next();};},
    requireProviderWrites:(_req,_res,next)=>next(),
    asyncHandler:fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next),
    onboardingState:id=>({account:{businessName:'Synthetic Qualification Co'},profile:getBusinessProfile(id)}),
    draftKnowledgeBase:input=>draftKnowledgeBase(input,{importPrices}),saveKnowledgeBase
  });
  app.use((error,_req,res,_next)=>res.status(error.statusCode||500).json({error:error.message}));
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  t.after(async()=>{for(const service of [server,site]){service.closeAllConnections();await new Promise(resolve=>service.close(resolve));}});
  return {owner,post:async(endpoint,body={})=>{
    const response=await fetch('http://127.0.0.1:'+server.address().port+endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    assert.equal(response.status,200);return response.json();
  }};
}
for(const plain of [false,true])for(const multiple of [false,true])test(`website audit full ${plain?'plain':'HTML'} import -> owner save -> no-price review (${multiple?'sibling prices':'single price'})`,async t=>{
  const note=multiple?booking:minimum,prices=multiple?[cleaning,gardening]:[lawn];
  const page=plain?[note,...prices].join('\n'):'<body><p>'+note+'</p>'+prices.map(price=>'<div>'+price+'</div>').join('')+'</body>';
  const app=await fixture(t,page,plain),before=getBusinessProfile(app.owner).knowledgeBase;
  const {knowledgeBase:draft}=await app.post('/api/onboarding/knowledge-base/draft');
  assert.equal(draft.websiteImport.entries.length,prices.length);
  assert.equal(getBusinessProfile(app.owner).knowledgeBase.prices,before.prices);
  for(const entry of draft.websiteImport.entries)assert.ok(entry.excerpt.includes(note));
  await app.post('/api/onboarding/knowledge-base',{...before,prices:draft.prices,draft:true});
  const saved=getBusinessProfile(app.owner).knowledgeBase;
  assert.equal(saved.draft,false);
  assert.equal(saved.prices,draft.prices);
  assertReview(saved.prices);
});
test('website audit import gives the owner a manual-review warning for withheld conditions',async t=>{
  const app=await fixture(t,`<body><section><p>${cleaning}</p><p>${gardening}</p></section><aside><p>${booking}</p></aside></body>`);
  const {knowledgeBase:draft}=await app.post('/api/onboarding/knowledge-base/draft');
  assert.equal(draft.prices,'');
  assert.equal(draft.websiteImport.conditionsUnverified,true);
  assert.match(draft.websiteImport.message,/Manual review required/);
  assert.equal(getBusinessProfile(app.owner).knowledgeBase.prices,'Service call: $95 each.');
});
