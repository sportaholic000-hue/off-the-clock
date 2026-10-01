import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {createRequire} from 'node:module';
import {startApplication} from '../../client/test/widget-application-harness.mjs';
import {convertApplicationBook} from '../../server/src/quoteDoneBridge.js';
import {measuredScopeCases} from '../../test/measuredScopeFixtures.mjs';
const root=path.resolve(process.argv[2]),evidence=path.resolve(process.argv[3]),site='http://127.0.0.1:4720';
const app=await startApplication(root,evidence,{port:4722,browserOrigins:[site]});
const require=createRequire(path.join(root,'package.json')),{chromium}=require(process.env.PRICEBOOK_BROWSER_MODULE);
const checks=[],wire=[],errors=[];let browser,server;
const check=(name,fn,details={})=>{try{fn();checks.push({name,passed:true,...details});}catch(error){checks.push({name,passed:false,error:error.message,...details});}console.log(JSON.stringify(checks.at(-1)));};
try{
 const owner=await app.owner('opus-layout'),samples=measuredScopeCases().filter(f=>['stairs-installed','siding-removal-installed','demolition-installed','commercial-installed'].includes(f.id));
 const services=samples.map(f=>{const s=structuredClone(f.input.ownerPricing);delete s.origin;delete s.pricing.scopeDetails;delete s.pricing.scopeRates;s.service='[SYNTHETIC] '+f.id;return s;});
 const call=async(method,url,body)=>{const r=await app.request(method,url,body,owner.token);assert.equal(r.status,200,JSON.stringify(r));return r.result;};
 const book=await call('GET','/api/pricebook/'+owner.id);Object.assign(book,convertApplicationBook({services,defaults:samples[0].input.businessDefaults},'toDollars'));await call('POST','/api/pricebook/save',book);
 const dist=path.join(root,'client/dist');
 server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,site);if(url.pathname==='/favicon.ico'){res.writeHead(204).end();return;}if(url.pathname.startsWith('/api/')){const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks),headers={};for(const k of ['origin','content-type','authorization','referer','sec-fetch-site','cookie'])if(req.headers[k])headers[k]=req.headers[k];const r=await fetch(app.base+req.url,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)&&body.length?{body}:{})});const text=await r.text();wire.push({method:req.method,path:req.url,status:r.status,authenticated:!!headers.authorization});res.statusCode=r.status;r.headers.forEach((v,k)=>{if(!['content-length','connection','transfer-encoding','content-encoding'].includes(k))res.setHeader(k,v);});res.end(text);return;}const file=path.resolve(dist,!path.extname(url.pathname)?'index.html':'.'+url.pathname);if(!file.startsWith(dist+path.sep)){res.writeHead(403).end();return;}res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));}catch(e){errors.push(e.message);res.writeHead(500).end('Synthetic fixture error');}});
 await new Promise(r=>server.listen(4720,'127.0.0.1',r));
 browser=await chromium.launch({headless:true,executablePath:process.env.PRICEBOOK_BROWSER_EXECUTABLE,timeout:180000});
 const page=await browser.newPage({viewport:{width:1280,height:900}});page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(token=>localStorage.setItem('otc_token',token),owner.token);await page.goto(site+'/pricebook');await page.getByRole('heading',{name:'Price book',exact:true}).waitFor();
 for(const s of services){await page.locator('.service-pick').filter({hasText:s.service}).click();const coverage=page.locator('.scope-coverage');await coverage.waitFor({state:'visible',timeout:5000}).catch(()=>{});const visible=await coverage.count()?await coverage.innerText():'';check('Opus 6 actionable scope warning '+s.service,()=>assert.match(visible,/lead/i),{warning:visible});}
 const flooring=services.find(s=>s.serviceType==='FLOORING_INSTALL');await page.locator('.service-pick').filter({hasText:flooring.service}).click();
 for(const width of [375,1280]){
  await page.setViewportSize({width,height:900});await page.evaluate(()=>scrollTo(0,0));
  const metrics=await page.evaluate(()=>{const core=document.querySelector('.essentials'),scope=document.querySelector('[data-editor-section="scope"]')||[...document.querySelectorAll('.editor-section')].find(el=>el.querySelector('h2')?.textContent==='Additional priced scope'),picker=document.querySelector('[aria-label="Go to page"]');const r=picker?.getBoundingClientRect(),style=picker?getComputedStyle(picker):null,canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');if(style)ctx.font=style.font;return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,coreTop:core?.getBoundingClientRect().top+scrollY,scopeTop:scope?.getBoundingClientRect().top+scrollY,pickerWidth:r?.width,pickerTextWidth:picker?ctx.measureText(picker.selectedOptions[0]?.textContent||'').width:null,pickerRequired:picker?ctx.measureText(picker.selectedOptions[0]?.textContent||'').width+parseFloat(style.paddingLeft)+parseFloat(style.paddingRight)+24:null};});
  await page.screenshot({path:path.join(evidence,'pricebook-'+width+'.png'),fullPage:true});
  check('Opus 8 core prices precede optional scope at '+width,()=>assert.ok(metrics.coreTop<metrics.scopeTop),{metrics});
  check('Opus 8 default editor is bounded at '+width,()=>assert.ok(metrics.height<6000),{height:metrics.height});
  check('Opus 8 no page horizontal overflow at '+width,()=>assert.ok(metrics.scrollWidth<=width),{scrollWidth:metrics.scrollWidth});
  if(width===375)check('Opus 8 navigation picker fits its selected text',()=>assert.ok(metrics.pickerWidth>=metrics.pickerRequired),{metrics});
 }
 check('Rendered editor has no application errors',()=>assert.deepEqual(errors,[]));
}finally{
 fs.writeFileSync(path.join(evidence,'layout-results.json'),JSON.stringify({checks,wire,errors,liveProviderTraffic:false},null,2));
 if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));await app.stop();
}
process.exitCode=checks.some(c=>!c.passed)||errors.length?1:0;
