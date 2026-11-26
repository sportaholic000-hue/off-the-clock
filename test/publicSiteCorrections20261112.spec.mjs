import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readdirSync,readFileSync,statSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {extname,join,relative,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=fileURLToPath(new URL('..',import.meta.url));
const WWW=join(ROOT,'site/www');
const PRIVACY=readFileSync(join(WWW,'privacy/index.html'),'utf8');

// ---------- Homepage plan cards, in a real browser ----------
let browser,server,origin;
const TYPES={'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png'};
before(async()=>{
  server=createServer((req,res)=>{
    let file=resolve(WWW,'.'+decodeURIComponent(new URL(req.url,'http://x').pathname));
    if(!file.startsWith(WWW))return res.writeHead(403).end();
    if(existsSync(file)&&statSync(file).isDirectory())file=join(file,'index.html');
    if(!existsSync(file))return res.writeHead(404).end();
    res.writeHead(200,{'content-type':TYPES[extname(file)]||'application/octet-stream'}).end(readFileSync(file));
  });
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  origin='http://127.0.0.1:'+server.address().port;
  const {chromium}=createRequire(import.meta.url)(process.env.PRICEBOOK_BROWSER_MODULE||'playwright');
  browser=await chromium.launch({headless:true,...(process.env.PRICEBOOK_BROWSER_EXECUTABLE?{executablePath:process.env.PRICEBOOK_BROWSER_EXECUTABLE}:{})});
});
after(async()=>{await browser?.close();await new Promise(done=>server?.close(done)??done());});

async function planCards(page){
  return page.evaluate(()=>[...document.querySelectorAll('#pricing div')]
    .filter(node=>node.style.padding==='28px'&&node.style.borderRadius==='4px')
    .map(node=>({name:node.querySelector('span').textContent.trim(),
      price:node.children[1].children[0].textContent.replace(/\s+/g,' ').trim(),
      features:[...node.querySelectorAll('span')].filter(span=>span.previousElementSibling?.textContent==='✓').map(span=>span.textContent.trim())})));
}

test('homepage plan cards: annual shows the yearly amount billed, monthly the monthly price',async()=>{
  const context=await browser.newContext({viewport:{width:1280,height:900}});
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/,routed=>routed.abort());
  try{
    const page=await context.newPage();
    await page.goto(origin+'/',{waitUntil:'load'});
    await page.locator('#pricing button',{hasText:'Monthly'}).waitFor({state:'visible',timeout:10000});
    const monthly=await planCards(page);
    assert.deepEqual(monthly.map(card=>[card.name,card.price]),[['STARTER','$69 USD/mo'],['OPERATOR','$119 USD/mo'],['QUOTEDONE','$279 USD/mo']]);
    await page.locator('#pricing button',{hasText:'Annual'}).click();
    // Wait for the switch to re-render (the Starter card no longer shows "$69 USD/mo"), then read what is shown.
    await page.waitForFunction(()=>!/\$69\s+USD\/mo/.test(document.querySelector('#pricing').textContent),null,{timeout:10000});
    const annual=await planCards(page);
    assert.deepEqual(annual.map(card=>[card.name,card.price]),[['STARTER','$690 USD/year'],['OPERATOR','$1,190 USD/year'],['QUOTEDONE','$2,790 USD/year']]);
    const text=await page.locator('#pricing').textContent();
    assert.doesNotMatch(text,/billed annually|USD\/mo/);
    // Same yearly amounts as the generated pricing page.
    const pricing=readFileSync(join(WWW,'pricing/index.html'),'utf8');
    for(const amount of ['$690/YEAR','$1,190/YEAR','$2,790/YEAR'])assert.ok(pricing.includes(amount),amount);
  }finally{await context.close();}
});

test('homepage plan cards: Operator lists webhooks and quoted-vs-invoiced reports; QuoteDone no longer lists the reports',async()=>{
  const context=await browser.newContext({viewport:{width:1280,height:900}});
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/,routed=>routed.abort());
  try{
    const page=await context.newPage();
    await page.goto(origin+'/',{waitUntil:'load'});
    await page.locator('#pricing button',{hasText:'Monthly'}).waitFor({state:'visible',timeout:10000});
    const cards=Object.fromEntries((await planCards(page)).map(card=>[card.name,card.features]));
    assert.ok(cards.OPERATOR.includes('Webhooks for leads, quote requests and bookings'));
    assert.ok(cards.OPERATOR.includes('Quoted-vs-invoiced reports'));
    assert.ok(!cards.QUOTEDONE.includes('Quoted-vs-invoiced reports'));
    for(const features of Object.values(cards))assert.ok(!features.includes('Customer records, webhooks & CSV'));
  }finally{await context.close();}
});

// ---------- Privacy: browser storage ----------
// Every browser storage write in the owner app and the website widget
// (client/src; the widget is built from the same files), and the purpose the
// privacy section must name for it. A new write fails this test until the
// privacy page names it.
const STORAGE_PURPOSES=[
  ['client/src/api.js',"localStorage.setItem('otc_token'",'sign-in token in your browser\'s local storage'],
  ['client/src/billing.jsx','sessionStorage.setItem(key','Checkout progress:'],
  ['client/src/trialStart.js','sessionStorage.setItem(TRIAL_CHECKOUT_KEY','Free trial checkout:'],
  ['client/src/pricebookDrafts.js','sessionStorage).setItem(transferKey(kind)','Price-book draft:'],
  ['client/src/calendar.jsx',"sessionStorage.setItem('otc_calendar_return'",'Calendar connection:'],
  ['client/src/quotedone.jsx','sessionStorage.setItem(cacheKey,','Quote request:'],
  ['client/src/quotedone.jsx',"sessionStorage.setItem(cacheKey+'-followup'",'Follow-up draft:'],
  ['client/src/widgetBooking.jsx','sessionStorage.setItem(cacheKey,','Booking:'],
  ['client/src/widgetBooking.jsx','sessionStorage.setItem(cacheKey,','Booking from a saved quote:']
];
function sourceFiles(dir){
  return readdirSync(dir).flatMap(name=>{const path=join(dir,name);return statSync(path).isDirectory()?sourceFiles(path):/\.(m?js|jsx)$/.test(name)?[path]:[];});
}
function storageSection(){
  const match=PRIVACY.match(/<h3>Cookies and browser storage<\/h3>([\s\S]*?)<h2>/);
  assert.ok(match,'privacy has the Cookies and browser storage section');
  return match[1];
}

test('every browser storage write in client/src is one the privacy page accounts for',()=>{
  const found=[];
  for(const file of [...sourceFiles(join(ROOT,'client/src')),join(ROOT,'client/public/widget.js')]){
    const rel=relative(ROOT,file).split('\\').join('/');
    readFileSync(file,'utf8').split('\n').forEach((line,index)=>{
      if(/\.setItem\(|document\.cookie\s*=|indexedDB|\bcaches\./.test(line))found.push(rel+':'+(index+1)+' '+line.trim().slice(0,120));
    });
  }
  const known=new Set(STORAGE_PURPOSES.map(([file,code])=>file+'|'+code));
  const unknown=found.filter(row=>{const [where]=row.split(' ');const file=where.replace(/:\d+$/,'');return ![...known].some(key=>{const [f,code]=key.split('|');return f===file&&row.includes(code);});});
  assert.deepEqual(unknown,[],'storage writes the privacy page does not name');
  assert.equal(found.length,8,'eight storage writes: '+found.join('\n'));
});

test('the privacy section names each storage write, where it is kept and until when',()=>{
  const section=storageSection();
  for(const [file,,purpose] of STORAGE_PURPOSES)assert.ok(section.includes(purpose),`${file}: "${purpose}"`);
  assert.ok(section.includes('Signing in to the business app sets one cookie that keeps you signed in.'));
  assert.ok(section.includes('until you sign out, or until 30 days pass without you using the app'));
  assert.ok(section.includes('session storage. Session storage belongs to one browser tab and is cleared when that tab is closed.'));
  assert.ok(section.includes('including an unfinished booking'));
  assert.ok(section.includes('We do not use advertising or analytics trackers.'));
  assert.ok(!section.includes('stores a sign-in token in your browser. The website quote widget keeps an unfinished booking'),'old paragraph replaced');
});

test('the one sign-in cookie the privacy page names is the only cookie the server sets',()=>{
  const files=sourceFiles(join(ROOT,'server/src'));
  const setters=files.flatMap(file=>readFileSync(file,'utf8').split('\n').map((line,index)=>[relative(ROOT,file).split('\\').join('/'),index+1,line]))
    .filter(([,,line])=>/Set-Cookie|res\.cookie\(/i.test(line)).map(([file,line])=>file+':'+line);
  assert.deepEqual(setters.map(row=>row.replace(/:\d+$/,'')),['server/src/authSessionHttp.js']);
});
