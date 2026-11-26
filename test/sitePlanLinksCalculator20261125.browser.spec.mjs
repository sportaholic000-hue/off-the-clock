import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {readFileSync,existsSync,statSync} from 'node:fs';
import {join,extname,resolve} from 'node:path';
import {build} from 'esbuild';

// Real Chromium. Site pages served from site/www with every outside request blocked;
// the owner app bundled from client/src with a network that answers {}.
// HANDWRITTEN EXPECTATIONS, before execution:
// - homepage and /missed-call-calculator/: at the lowest inputs (1 call a week, $100,
//   5%) the plan line reads "0.1× plan cost" (1*4.33*0.05*100/279 = 0.078); at the
//   defaults (12, $1,800, 30%) "101× plan cost" as before;
// - each plan card's trial button on the homepage (with and without JavaScript) and on
//   /pricing/ links to /signup?plan=Starter, Operator and QuoteDone, in that order;
// - sign-up opened with ?plan=Starter or ?plan=Operator has that plan selected; with no
//   plan or an unknown one, QuoteDone, as before.
const root=fileURLToPath(new URL('..',import.meta.url)),WWW=join(root,'site/www');
const require=createRequire(import.meta.url);
const TYPES={'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png'};
let browser,server,origin;
test.before(async()=>{
  server=createServer((req,res)=>{let f=resolve(WWW,'.'+decodeURIComponent(new URL(req.url,'http://x').pathname));if(!f.startsWith(WWW))return res.writeHead(403).end();
    if(existsSync(f)&&statSync(f).isDirectory())f=join(f,'index.html');if(!existsSync(f))return res.writeHead(404).end();res.writeHead(200,{'content-type':TYPES[extname(f)]||'application/octet-stream'}).end(readFileSync(f));});
  await new Promise(d=>server.listen(0,'127.0.0.1',d));origin='http://127.0.0.1:'+server.address().port;
  const {chromium}=require(process.env.PRICEBOOK_BROWSER_MODULE||'playwright');
  browser=await chromium.launch({headless:true,...(process.env.PRICEBOOK_BROWSER_EXECUTABLE?{executablePath:process.env.PRICEBOOK_BROWSER_EXECUTABLE}:{})});
});
test.after(async()=>{await browser?.close();await new Promise(d=>server?.close(d)??d());});
async function sitePage(path,javaScriptEnabled=true){
  const context=await browser.newContext({viewport:{width:1280,height:900},javaScriptEnabled}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>{const u=r.request().url();if(u.startsWith(origin))return r.continue();if(u.includes('/demo/otc-live-demo.js'))return r.fulfill({status:200,contentType:'text/javascript',body:''});return r.abort();});
  await page.goto(origin+path);return {context,page,errors};
}
const setRange=(page,selector,value)=>page.$eval(selector,(el,v)=>{const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(el,String(v));el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));},value);

test('calculators: one decimal below 10× instead of "0× plan cost"',async()=>{
  {const {context,page,errors}=await sitePage('/missed-call-calculator/');
    assert.equal(await page.textContent('#r-x'),'101× plan cost');
    await setRange(page,'#missed',1);await setRange(page,'#job',100);await setRange(page,'#close',5);
    assert.equal(await page.textContent('#r-x'),'0.1× plan cost');
    assert.deepEqual(errors,[]);await context.close();}
  {const {context,page,errors}=await sitePage('/');
    await page.waitForSelector('#dc-root #roi');
    const line=()=>page.$eval('#roi',el=>(el.innerText.match(/[0-9.,]+× plan cost/)||[''])[0]);
    assert.equal(await line(),'101× plan cost');
    const ranges=await page.$$('#roi input[type=range]');assert.ok(ranges.length>=3);
    for(const [index,value] of [[0,1],[1,100],[2,5]])await ranges[index].evaluate((el,v)=>{const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(el,String(v));el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));},value);
    await page.waitForFunction(()=>/0\.1× plan cost/.test(document.getElementById('roi').innerText));
    assert.deepEqual(errors,[]);await context.close();}
});

test('plan card trial buttons carry their plan',async()=>{
  const expected=['Starter','Operator','QuoteDone'].map(p=>'https://app.offtheclockai.com/signup?plan='+p);
  for(const [path,js] of [['/',true],['/',false],['/pricing/',true]]){
    const {context,page}=await sitePage(path,js);
    if(path==='/'&&js)await page.waitForSelector('#dc-root #pricing');
    const links=await page.$$eval('a[href*="/signup?plan="]',as=>as.filter(a=>a.offsetParent).map(a=>a.getAttribute('href')));
    assert.deepEqual(links,expected,path+' js='+js);
    await context.close();
  }
});

test('sign-up preselects the linked plan',async()=>{
  const out=await build({absWorkingDir:root,entryPoints:['client/src/main.jsx'],bundle:true,write:false,platform:'browser',format:'iife',outdir:'out',
    loader:{'.js':'jsx'},define:{'process.env.NODE_ENV':'"development"','import.meta.env':'{}'},logLevel:'silent'});
  const js=out.outputFiles.find(f=>f.path.endsWith('.js')).text,css=out.outputFiles.find(f=>f.path.endsWith('.css')).text;
  for(const [query,plan] of [['?plan=Starter','Starter'],['?plan=Operator','Operator'],['?plan=QuoteDone','QuoteDone'],['','QuoteDone'],['?plan=Scale','QuoteDone'],['?plan=starter','QuoteDone']]){
    const page=await browser.newPage();
    await page.route(/fonts\.(googleapis|gstatic)\.com/,r=>r.abort());
    await page.route('https://synthetic.invalid/**',r=>r.fulfill({contentType:'text/html',body:`<!doctype html><html><head><style>${css}</style></head><body><div id="root"></div><script>window.fetch=async()=>({ok:true,status:200,json:async()=>({})});</script><script>${js}</script></body></html>`}));
    await page.goto('https://synthetic.invalid/signup'+query);
    await page.getByRole('button',{name:'Starter'}).waitFor();
    const pressed=await page.$$eval('.plan-card[aria-pressed="true"]',bs=>bs.map(b=>b.getAttribute('aria-label')));
    assert.deepEqual(pressed,[plan],query||'(none)');
    await page.close();
  }
});
