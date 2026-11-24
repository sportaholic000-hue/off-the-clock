// Homepage (site/www/index.html) for readers that don't run JavaScript: AI assistant
// crawlers and link previews used to read "{{ headlineText }}" and 42 other template
// placeholders. site/build/prerender-home.mjs now saves a drawn copy into the page.
// Real Chromium; every request outside the local site is blocked, the live demo script
// loads but never mounts, and the clock is frozen so the call card stays on its first
// step, as in site/build/prerender-home.mjs.
// HANDWRITTEN EXPECTATIONS, before execution:
// - without JavaScript, at 1280 px and 390 px: the h1 is the headline, no "{{" anywhere
//   in the page text, no sideways scrolling, and the text equals what the runtime draws
//   with JavaScript at the same width;
// - with JavaScript: the drawn copy and the stored template are gone, the runtime's
//   own #dc-root holds the page, and no page errors;
// - with JavaScript and a runtime that never starts, the drawn copy stays on screen;
// - a reader that strips tags without running scripts sees no "{{";
// - the page has lang="en" and parses as Organization, WebSite and SoftwareApplication
//   structured data, the last equal to the pricing page's;
// - the eight industry cards link to their own pages, which exist;
// - running the prerender step again changes nothing.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,statSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {extname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runtimeForm,withPrerender} from '../site/build/prerender-home.mjs';

const ROOT=fileURLToPath(new URL('..',import.meta.url));
const WWW=join(ROOT,'site/www');
const HTML=readFileSync(join(WWW,'index.html'),'utf8');
const HEADLINE='Your AI employee that quotes the job faster than you.';
const TYPES={'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png'};
let browser,server,origin;
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

async function open(width,javaScriptEnabled,{blockRuntime=false}={}){
  const context=await browser.newContext({viewport:{width,height:900},javaScriptEnabled});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{
    const url=route.request().url();
    if(blockRuntime&&url.endsWith('/support.js'))return route.abort();
    if(url.startsWith(origin))return route.continue();
    if(url.includes('/demo/otc-live-demo.js'))return route.fulfill({status:200,contentType:'text/javascript',body:''});
    return route.abort();
  });
  if(javaScriptEnabled)await page.clock.install();
  await page.goto(origin+'/',{waitUntil:'commit'});
  if(javaScriptEnabled&&!blockRuntime)await page.waitForSelector('#dc-root #demo',{timeout:30000});
  else await page.waitForSelector('#otc-prerender h1');
  await page.waitForLoadState('load');
  return {context,page,errors};
}
const read=page=>page.evaluate(()=>({
  text:document.body.innerText,
  h1:[...document.querySelectorAll('h1')].filter(h=>h.offsetParent).map(h=>h.innerText.trim()),
  scrollWidth:document.documentElement.scrollWidth,
  prerender:!!document.getElementById('otc-prerender'),
  template:!!document.getElementById('otc-dc-template'),
  root:!!document.getElementById('dc-root'),
  rawTemplate:!!document.querySelector('x-dc')
}));

for(const width of [1280,390])test(`homepage at ${width}px reads the same with and without JavaScript`,async()=>{
  const off=await open(width,false),on=await open(width,true);
  try{
    const a=await read(off.page),b=await read(on.page);
    assert.deepEqual(a.h1,[HEADLINE]);
    assert.ok(!a.text.includes('{{'),'page text without JavaScript has a template placeholder');
    assert.ok(a.scrollWidth<=width,`no sideways scrolling without JavaScript (${a.scrollWidth})`);
    assert.equal(a.text,b.text,'drawn copy no longer matches the page; run node site/build/prerender-home.mjs');
    assert.deepEqual(b.h1,[HEADLINE]);
    assert.deepEqual({prerender:b.prerender,template:b.template,root:b.root,rawTemplate:b.rawTemplate},{prerender:false,template:false,root:true,rawTemplate:false});
    assert.deepEqual(on.errors,[]);
  }finally{await off.context.close();await on.context.close();}
});

test('with JavaScript on but the runtime failing to load, the drawn page stays readable',async()=>{
  const {context,page}=await open(1280,true,{blockRuntime:true});
  try{
    const r=await read(page);
    assert.deepEqual(r.h1,[HEADLINE]);
    assert.ok(r.prerender);
    assert.ok(!r.text.includes('{{'));
  }finally{await context.close();}
});

test('homepage declares its language and the same product data as the pricing page',()=>{
  assert.match(HTML,/^<!DOCTYPE html>\n<html lang="en">/);
  // A reader that strips tags without running scripts sees the page, not the template.
  const plain=HTML.replace(/<(script|style)\b[\s\S]*?<\/\1>/g,'').replace(/<[^>]+>/g,' ');
  assert.ok(!plain.includes('{{'));
  assert.ok(plain.includes(HEADLINE));
  const blocks=html=>[...html.matchAll(/<script type="application\/ld\+json">([^<]*)<\/script>/g)].map(m=>JSON.parse(m[1]));
  const home=blocks(HTML);
  assert.deepEqual(home.map(b=>b['@type']),['Organization','WebSite','SoftwareApplication']);
  const pricing=blocks(readFileSync(join(WWW,'pricing/index.html'),'utf8')).find(b=>b['@type']==='SoftwareApplication');
  assert.deepEqual(home[2],pricing);
  assert.equal(home[0].email,'support@offtheclockai.com');
});

test('homepage industry cards and footer link to pages that exist',async()=>{
  const {context,page}=await open(1280,true);
  try{
    const cards=await page.$$eval('#industries a',as=>as.map(a=>[a.querySelector('h3').innerText,a.getAttribute('href')]));
    assert.deepEqual(cards,[['Roofing','/industries/roofing/'],['Painting','/industries/painting/'],['Flooring','/industries/flooring/'],['Fencing','/industries/fencing/'],['Concrete','/industries/concrete/'],['Landscaping','/industries/landscaping/'],['Siding','/industries/siding/'],['Any service business','/industries/any-service-business/']]);
    const links=await page.$$eval('a[href^="/"]',as=>[...new Set(as.map(a=>a.getAttribute('href').split('#')[0]))].filter(Boolean));
    for(const href of links)assert.ok(existsSync(join(WWW,href,'index.html'))||existsSync(join(WWW,href)),`homepage links to missing ${href}`);
    for(const href of ['/who-its-for/','/alternatives/','/ai-receptionist-with-quoting/','/ai-receptionist-vs-answering-service/','/privacy/','/terms/'])assert.ok(links.includes(href),`homepage does not link ${href}`);
  }finally{await context.close();}
});

test('running the prerender step on the saved page keeps the same template and layout',()=>{
  const drawn=HTML.match(/<div id="otc-prerender">([\s\S]*?)<\/div>\n<script type="text\/x-dc-template" id="otc-dc-template">/);
  assert.ok(drawn,'drawn copy missing');
  const source=runtimeForm(HTML);
  assert.equal((source.match(/<x-dc>/g)||[]).length,1);
  assert.ok(!source.includes('otc-prerender'));
  const sheets=(source.slice(source.indexOf('<x-dc>'),source.indexOf('</x-dc>')).match(/<link\b[^>]*rel="stylesheet"[^>]*>|<style\b[^>]*>[\s\S]*?<\/style>/g)||[]).join('\n');
  assert.ok(drawn[1].startsWith(sheets));
  assert.equal(withPrerender(HTML,drawn[1].slice(sheets.length)),HTML);
});
