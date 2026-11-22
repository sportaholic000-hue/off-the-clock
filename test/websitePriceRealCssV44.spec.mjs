import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createWebsitePriceImporter} from '../server/src/websitePriceImport.js';
import {publicWebsiteAddress} from '../server/src/websitePriceTransport.js';
import {extractWebsitePrices} from '../server/src/websitePriceExtraction.js';
import {draftKnowledgeBase} from '../server/src/platformIntegrations.js';

// v44: website prices are an unsaved draft the owner reviews. Ordinary site
// styling no longer discards the page; modeled hiding still removes prices.
// Every expected draft below was written by hand from the fixture text.
const warning='Some of the website styling could not be checked, so a price the website hides may be included. Remove any price your customers cannot see on the website.';
async function site(t,routes){
  const seen=[],server=http.createServer((req,res)=>{
    const route=routes[req.url];
    if(!route){res.statusCode=404;res.end();return;}
    res.setHeader('Content-Type',route.type||'text/html; charset=utf-8');res.end(route.body);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
  const port=server.address().port;
  const request=(url,options,callback)=>{
    seen.push(url.href);
    options.lookup(url.hostname,{all:true},(error,records)=>{assert.ifError(error);assert.ok(records.every(r=>publicWebsiteAddress(r.address)));});
    return http.request(new URL(url.pathname+url.search,'http://127.0.0.1:'+port),{...options,lookup:undefined,headers:{...options.headers,Host:url.host}},callback);
  };
  return {seen,importPrices:createWebsitePriceImporter({lookup:async()=>[{address:'8.8.8.8',family:4}],request})};
}
// A realistic theme stylesheet over 64 KB: resets, typography, layout,
// viewport queries, web fonts, animations, hover states, CSS variables,
// Tailwind-style escaped classes and the usual hiding utilities.
function themeCss(){
  let css=`:root{--brand:#0a7;--gap:16px}
*,*::before,*::after{box-sizing:border-box}
body { color: #333; margin: 16px; font-family: "Inter", system-ui, sans-serif; line-height:1.5 }
@font-face{font-family:Inter;src:url(/fonts/inter.woff2) format("woff2");font-display:swap}
@keyframes fade{from{opacity:0}to{opacity:1}}
.card{padding:var(--gap);border-radius:8px;overflow:hidden;position:relative;background:#fff;color:var(--text,#222)}
.card:hover{transform:translateY(-2px);opacity:.9}
a:hover,a:focus-visible{color:var(--brand)}
.btn::after{content:"";position:absolute;inset:0}
.text-gray-700{--tw-text-opacity:1;color:rgb(55 65 81 / var(--tw-text-opacity))}
.md\\:grid{display:grid}
.hidden{display:none}
.d-none{display:none!important}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border-width:0}
@media (min-width:768px){.md\\:block{display:block}.md\\:hidden{display:none}.card{padding:24px}}
@media print{.price{color:#000}}
@supports (display:grid){.grid{display:grid}}
`;
  for(let i=0;css.length<70000;i++)css+=`.u-m${i}{margin:${i%32}px}.u-p${i}{padding:${i%16}px}.u-c${i}:hover{color:#${(i*2654435).toString(16).slice(-6).padStart(6,'0')}}\n`;
  return css;
}
const page=`<!doctype html><html><head>
<link rel="preconnect" href="https://fonts.gstatic.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap">
<link rel="stylesheet" href="/css/theme.css">
<link rel="stylesheet" href="/css/print.css" media="print">
<style>.was{text-decoration:line-through}</style>
</head><body>
<div class="grid md:grid">
<div class="card text-gray-700 u-m3"><h3>[SYNTHETIC] Gutter cleaning</h3><p>$180 per visit</p><span class="sr-only">Was $240</span></div>
<div class="card"><h3>[SYNTHETIC] Window washing</h3><p>$12 per window</p></div>
<div class="card d-none"><h3>[SYNTHETIC] Retired package</h3><p>$999 per visit</p></div>
<div class="card hidden md:block"><h3>[SYNTHETIC] Roof wash</h3><p>$450 per roof</p></div>
<div class="card" hidden><h3>[SYNTHETIC] Hidden attribute</h3><p>$777 per visit</p></div>
<div class="card" style="display:none"><h3>[SYNTHETIC] Inline hidden</h3><p>$666 per visit</p></div>
<div class="card"><h3>[SYNTHETIC] Driveway sealing</h3><p class="was">$400 per driveway</p><p>$350 per driveway</p></div>
</div></body></html>`;
const expected=['[SYNTHETIC] Gutter cleaning\n$180 per visit','[SYNTHETIC] Window washing\n$12 per window','[SYNTHETIC] Roof wash\n$450 per roof','[SYNTHETIC] Driveway sealing\n$350 per driveway'];

test('v44 website: a real-world theme imports the visible prices and still removes every hidden one',async t=>{
  const s=await site(t,{'/':{body:page},'/css/theme.css':{type:'text/css',body:themeCss()},'/css/print.css':{type:'text/css',body:'.card{display:none}'}});
  const result=await s.importPrices('http://business.example/');
  assert.deepEqual(result.websiteImport.entries.map(e=>e.excerpt),expected);
  assert.equal(result.prices,expected.join('\n\n'));
  assert.equal(result.draft,true);assert.equal(result.websiteImport.visibilityUnverified,false);assert.equal(result.websiteImport.limited,false);
  // Same-host theme read once; the font service and the print stylesheet are never requested.
  assert.deepEqual(s.seen,['http://business.example/','http://business.example/css/theme.css']);
  assert.ok(themeCss().length>65536);
  assert.doesNotMatch(result.websiteImport.message,/styling/);
});
test('v44 website: the onboarding draft carries the imported prices without saving them',async t=>{
  const s=await site(t,{'/':{body:page},'/css/theme.css':{type:'text/css',body:themeCss()}});
  const draft=await draftKnowledgeBase({businessName:'Synthetic',businessTypes:[],websiteUrl:'http://business.example/'},{importPrices:s.importPrices});
  assert.equal(draft.draft,true);assert.equal(draft.prices,expected.join('\n\n'));
});
test('v44 website: a stylesheet over the per-response size limit is skipped, not partly applied, and the owner is warned',async t=>{
  const big='.d-none{display:none!important}\n'+'.x{margin:0}\n'.repeat(30000);
  assert.ok(Buffer.byteLength(big)>262144);
  const s=await site(t,{'/':{body:page},'/css/theme.css':{type:'text/css',body:big}});
  const result=await s.importPrices('http://business.example/');
  // Without the theme, .d-none, .hidden and .sr-only are not known. The retired
  // package and the desktop roof wash stay in the draft for the owner to review.
  // With its "Was $240" visible, the gutter card holds two amounts, and the
  // extraction has never imported a card whose name cannot be tied to one
  // amount, so it is left out. Attribute, inline and page-stylesheet hiding apply.
  assert.deepEqual(result.websiteImport.entries.map(e=>e.excerpt),[
    '[SYNTHETIC] Window washing\n$12 per window','[SYNTHETIC] Retired package\n$999 per visit',
    '[SYNTHETIC] Roof wash\n$450 per roof','[SYNTHETIC] Driveway sealing\n$350 per driveway']);
  assert.equal(result.websiteImport.visibilityUnverified,true);assert.ok(result.websiteImport.message.endsWith(warning));
});
test('v44 website: stylesheet requests never use up the requests kept for price pages',async t=>{
  const routes={'/':{body:'<html><head>'+Array.from({length:10},(_,i)=>`<link rel="stylesheet" href="/css/${i}.css">`).join('')+'</head><body><p>[SYNTHETIC] Home visit $50</p><nav><a href="/prices">Prices</a></nav></body></html>'},
    '/prices':{body:'<html><body><p>[SYNTHETIC] Deep clean $300</p></body></html>'}};
  for(let i=0;i<10;i++)routes[`/css/${i}.css`]={type:'text/css',body:'.x{margin:0}'};
  const s=await site(t,routes);
  const result=await s.importPrices('http://business.example/');
  assert.deepEqual(result.websiteImport.entries.map(e=>e.excerpt),['[SYNTHETIC] Home visit $50','[SYNTHETIC] Deep clean $300']);
  assert.ok(s.seen.includes('http://business.example/prices'));
  assert.ok(s.seen.length<=12);
});
test('v44 website: a viewport-only hiding rule does not remove a price shown in other layouts',()=>{
  const out=extractWebsitePrices('<style>@media (max-width:600px){.desk{display:none}}</style><p class="desk">[SYNTHETIC] Patio $90</p>');
  assert.deepEqual(out.entries.map(e=>e.excerpt),['[SYNTHETIC] Patio $90']);assert.equal(out.visibilityUnverified,false);
});
test('v44 website: a zero font-size wrapper does not hide children that set their own size',()=>{
  const out=extractWebsitePrices('<style>.row{font-size:0}.row .col{font-size:16px}</style><div class="row"><div class="col">[SYNTHETIC] Lawn cut $45</div><span>[SYNTHETIC] Old $10</span></div>');
  assert.deepEqual(out.entries.map(e=>e.excerpt),['[SYNTHETIC] Lawn cut $45']);
});
test('v44 website: gradient headline text is visible; same-colour text is hidden',()=>{
  const out=extractWebsitePrices('<style>.g{background:linear-gradient(red,blue);-webkit-background-clip:text;-webkit-text-fill-color:transparent}.ghost{color:#fff;background-color:white}</style><p class="g">[SYNTHETIC] Spring special $99</p><p class="ghost">[SYNTHETIC] Secret $1</p>');
  assert.deepEqual(out.entries.map(e=>e.excerpt),['[SYNTHETIC] Spring special $99']);
});
test('v44 website: hover, focus and pseudo-element rules never hide the page price',()=>{
  const out=extractWebsitePrices('<style>.p:hover{display:none}.p:focus{visibility:hidden}.p::before{content:"";opacity:0}</style><p class="p">[SYNTHETIC] Tune-up $70</p>');
  assert.deepEqual(out.entries.map(e=>e.excerpt),['[SYNTHETIC] Tune-up $70']);assert.equal(out.visibilityUnverified,false);
});
test('v44 website: a later or more specific visible rule overrides an earlier hiding rule',()=>{
  const out=extractWebsitePrices('<style>.p{display:none}.p.on{display:block}#keep{display:none!important}#keep.p{display:block}</style><p class="p on">[SYNTHETIC] Shown $5</p><p id="keep" class="p">[SYNTHETIC] Important hide $6</p>');
  assert.deepEqual(out.entries.map(e=>e.excerpt),['[SYNTHETIC] Shown $5']);
});
test('v44 website: a hiding rule that cannot be evaluated keeps the price and warns',()=>{
  for(const css of ['h2 + p{display:none}','p:nth-child(1){display:none}','@supports (display:grid){.p{display:none}}','.p{display:var(--d)}']){
    const out=extractWebsitePrices('<style>'+css+'</style><p class="p">[SYNTHETIC] Furnace check $120</p>');
    assert.deepEqual(out.entries.map(e=>e.excerpt),['[SYNTHETIC] Furnace check $120'],css);assert.equal(out.visibilityUnverified,true,css);
  }
});
test('v44 website: a bare menu or section label is not attached to prices as a condition',()=>{
  for(const label of ['Prices','Pricing','Our prices','Rates','Price list']){
    const out=extractWebsitePrices(`<body><nav><a href="/p">${label}</a></nav><p>[SYNTHETIC] Lawn cut $45</p><footer><ul><li><a href="/p">${label}</a></li></ul></footer></body>`);
    assert.deepEqual(out.entries,[{excerpt:'[SYNTHETIC] Lawn cut $45',amounts:['$45']}],label);assert.deepEqual(out.conditions,[],label);
  }
  // A real qualification is still attached.
  const kept=extractWebsitePrices('<body><p>All prices exclude tax.</p><p>[SYNTHETIC] Lawn cut $45</p></body>');
  assert.deepEqual(kept.entries,[{excerpt:'[SYNTHETIC] Lawn cut $45',amounts:['$45'],conditions:['All prices exclude tax.']}]);
});
