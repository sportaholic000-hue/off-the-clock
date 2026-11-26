// Homepage live demo (site/www/index.html): when the live widget script from the app
// host does not load, the demo area says so and offers what works. It never plays a
// scripted conversation labelled as live, and never shows words the visitor did not say.
// When the widget loads, it mounts over the demo area exactly as before.
// Real Chromium; every request outside the local site is stubbed or blocked.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,statSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {extname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=fileURLToPath(new URL('..',import.meta.url));
const WWW=join(ROOT,'site/www');
const WIDGET_URL='https://app.offtheclockai.com/demo/otc-live-demo.js';
const WIDGET=readFileSync(join(ROOT,'server/public/otc-live-demo.js'),'utf8');
const UNAVAILABLE_STATUS='DEMO UNAVAILABLE';
const UNAVAILABLE_TEXT="The live demo couldn't load. Refresh the page to try again, or email support@offtheclockai.com.";
const SCRIPTED=['LIVE SESSION','MIC LIVE','Small fencing company','And when a job','I only talk shop','honest pitch','SESSION ENDED','SESSION CLOSED'];

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

const wait=ms=>new Promise(r=>setTimeout(r,ms));
// widget: 'blocked' | 'error500' | 'served'; delayMs holds the script response back.
async function open(viewport,{widget,delayMs=0}){
  const context=await browser.newContext({viewport,...(viewport.width<500?{isMobile:true,hasTouch:true,deviceScaleFactor:1}:{})});
  const page=await context.newPage();
  const external=[];
  await page.route('**/*',async route=>{
    const url=route.request().url();
    if(url.startsWith(origin))return route.continue();
    if(url===WIDGET_URL){
      if(delayMs)await wait(delayMs);
      if(widget==='served')return route.fulfill({status:200,contentType:'text/javascript',body:WIDGET});
      if(widget==='error500')return route.fulfill({status:500,contentType:'text/html',body:'<h1>Bad gateway</h1>'});
      return route.abort();
    }
    external.push(url);return route.abort();
  });
  // The page renders and takes presses while the deferred widget script is still loading.
  await page.goto(origin+'/',{waitUntil:'commit'});
  await page.waitForSelector('#demo');
  return {context,page,external};
}
const demoText=page=>page.evaluate(()=>document.getElementById('demo').innerText);
async function clickDesignControls(page){
  // The page's own demo controls (the live widget, when present, sits over them).
  const clicked=[];
  for(const selector of ['#demo button:has(svg)','#demo a:text-is("use text chat")']){
    const el=await page.$(selector);
    if(el&&await el.isVisible()){await el.click({force:true}).catch(()=>{});clicked.push(selector);}
  }
  return clicked;
}
function assertNoScript(text,html,label){
  for(const s of SCRIPTED)assert.ok(!text.includes(s),`${label}: demo area shows "${s}"`);
  assert.ok(!/^YOU\b/m.test(text),`${label}: demo area shows a YOU line`);
  for(const s of ['Small fencing company','LIVE SESSION'])assert.ok(!html.includes(s),`${label}: page source still carries "${s}"`);
}

for(const viewport of [{width:1280,height:900},{width:390,height:844}]){
  for(const widget of ['blocked','error500'])test(`homepage demo ${viewport.width}px, widget ${widget}: says it is unavailable, offers sign-up and email, never plays a script`,async()=>{
    const {context,page}=await open(viewport,{widget});
    try{
      await page.waitForFunction(s=>document.getElementById('demo').innerText.includes(s),UNAVAILABLE_STATUS,{timeout:10000});
      await page.locator('#demo').scrollIntoViewIfNeeded();
      let text=await demoText(page);
      assert.ok(text.includes(UNAVAILABLE_TEXT),text);
      const links=await page.$$eval('#demo a',as=>as.filter(a=>a.offsetParent).map(a=>({text:a.textContent.trim(),href:a.getAttribute('href')})));
      assert.deepEqual(links.filter(l=>l.href!=='#demo'),[{text:'support@offtheclockai.com',href:'mailto:support@offtheclockai.com'},{text:'Start free',href:'https://app.offtheclockai.com/signup'}]);
      assert.ok(!text.includes('Start Live Demo Call'),'no dead start button');
      assert.ok(!text.includes('use text chat'),'no dead text-chat link');
      await clickDesignControls(page);await wait(3000);
      text=await demoText(page);
      assertNoScript(text,await page.content(),'after clicks');
      assert.ok(text.includes(UNAVAILABLE_TEXT));
      assert.equal(await page.$('#otc-live-demo'),null);
    }finally{await context.close();}
  });
  test(`homepage demo ${viewport.width}px: presses while the widget is still loading never play a script; a failed load then says unavailable`,async()=>{
    const {context,page}=await open(viewport,{widget:'blocked',delayMs:4000});
    try{
      await page.waitForFunction(()=>document.getElementById('demo').innerText.includes('Start Live Demo Call'),null,{timeout:10000});
      await page.locator('#demo').scrollIntoViewIfNeeded();
      const clicked=await clickDesignControls(page);
      assert.ok(clicked.length===2,JSON.stringify(clicked));
      await wait(1500);
      assertNoScript(await demoText(page),await page.content(),'while loading');
      await page.waitForFunction(s=>document.getElementById('demo').innerText.includes(s),UNAVAILABLE_STATUS,{timeout:10000});
      assertNoScript(await demoText(page),await page.content(),'after failure');
    }finally{await context.close();}
  });
  for(const delayMs of [0,3000])test(`homepage demo ${viewport.width}px, widget served${delayMs?' after a press during a slow load':''}: the live widget mounts over the demo area`,async()=>{
    const {context,page,external}=await open(viewport,{widget:'served',delayMs});
    try{
      if(delayMs){
        await page.waitForFunction(()=>document.getElementById('demo').innerText.includes('Start Live Demo Call'),null,{timeout:10000});
        await page.locator('#demo').scrollIntoViewIfNeeded();
        assert.equal((await clickDesignControls(page)).length,2);
        await wait(500);assertNoScript(await demoText(page),await page.content(),'while loading');
      }
      await page.waitForFunction(()=>{const r=document.getElementById('otc-live-demo');return r&&getComputedStyle(r).display==='block'&&r.getBoundingClientRect().width>0;},null,{timeout:15000});
      const state=await page.evaluate(()=>{
        const root=document.getElementById('otc-live-demo'),grid=document.querySelector('[data-otc-replaced]');
        return {widgetText:root.innerText,gridHidden:grid&&getComputedStyle(grid).visibility==='hidden',
          gridInsideDemo:!!grid&&document.getElementById('demo').contains(grid),
          overlap:(()=>{const a=root.getBoundingClientRect(),b=grid.getBoundingClientRect();return Math.abs(a.top-b.top)<1&&Math.abs(a.left-b.left)<1&&Math.abs(a.width-b.width)<1;})()};
      });
      assert.ok(state.gridHidden&&state.gridInsideDemo&&state.overlap,JSON.stringify(state));
      for(const s of ['Miles','Nova','Demo rules','Standing by','Start Live Demo Call','use text chat'])assert.ok(state.widgetText.toLowerCase().includes(s.toLowerCase()),s+' in '+state.widgetText);
      assert.ok(!(await demoText(page)).includes(UNAVAILABLE_STATUS));
      assert.ok(!external.includes(WIDGET_URL));
    }finally{await context.close();}
  });
}
