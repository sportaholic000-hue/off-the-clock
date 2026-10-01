/** Local project verification. No provider sessions, installs or production writes. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.GROWTH_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'public'),evidence=process.env.GROWTH_EVIDENCE_DIR||path.join(root,'evidence','comparison-conversion');
fs.mkdirSync(evidence,{recursive:true});
const manifest=JSON.parse(fs.readFileSync(path.join(out,'page-manifest.json'),'utf8'));
const html=name=>fs.readFileSync(path.join(out,name),'utf8');
const results=[],requests=[],errors=[];
function check(name,ok){results.push({name,pass:Boolean(ok)});assert.ok(ok,name);}
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.GROWTH_BROWSER_EXECUTABLE||undefined,headless:true});
 try{
 const context=await browser.newContext({viewport:{width:1440,height:950},acceptDownloads:true});
 const page=await context.newPage();page.setDefaultTimeout(8000);
 page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>requests.push(r.url()));
 const runner=fs.readFileSync(path.join(root,'Off_The_Clock_Public_Pages_Review.html'),'utf8');
 async function start(route='compare/index.html'){
  await page.setContent(runner);await page.evaluate(route=>{location.hash=route},route);
  // Reload the portable runner with the chosen route; setContent does not load a URL.
  await page.setContent(runner);const f=page.frameLocator('#site');await f.locator('h1').waitFor();return f;
 }
 let f=await start();
 check('All 12 guides available in portable runner',await f.locator('[data-guide]').count()===12);
 await f.locator('#guide-search').fill('Jobber');await f.locator('[data-filter=head]').click();
 check('Company and type filters intersect',await f.locator('[data-guide]:visible h2').innerText()==='Jobber Receptionist vs Housecall Pro CSR AI');
 await f.locator('[data-filter=alternatives]').click();check('Alternatives filter switches accurately',await f.locator('[data-guide]:visible').count()===1);
 await f.locator('#guide-search').fill('no-such-guide');check('Empty search is visible',await f.locator('#empty-results').isVisible());
 await f.locator('#empty-results [data-clear]').click();check('Reset restores all guides and focus',await f.locator('[data-guide]:visible').count()===12&&await f.locator('#guide-search').evaluate(e=>e===document.activeElement));
 await f.locator('#guide-search').fill('<img src=x onerror=alert(1)>');check('Search does not inject markup',await f.locator('[data-library] img').count()===0);
 for(const guide of manifest.guides){
  f=await start();await f.getByRole('link',{name:guide.title,exact:true}).click();
  check(guide.title+': opens from hub',await f.locator('h1').isVisible()&&await f.locator('#buying-questions').count()===1);
  const primary=f.locator('.article-hero [data-demo-cta]');
  check(guide.title+': primary conversation CTA is near the opening',await primary.count()===1&&await primary.getAttribute('href').then(h=>h.includes('source=')));
  check(guide.title+': all five buying questions and vendor answers exist',await f.locator('.buyer-question').count()===5&&await f.locator('.buyer-answers dt').count()>=10);
  await f.locator('#buy-booking summary').focus();await page.keyboard.press('Enter');
  check(guide.title+': booking answer opens by keyboard',await f.locator('#buy-booking').getAttribute('open')!==null);
  check(guide.title+': booking answer cites official evidence',await f.locator('#buy-booking .buyer-source').count()>0);
  const href=await primary.getAttribute('href'),destination=new URL(href,'https://local-preview.invalid/'+guide.path);
  check(guide.title+': handoff preserves the exact comparison route',destination.searchParams.get('source')===guide.path);
  await primary.click();
  check(guide.title+': conversation opens without intake or account',await f.locator('h1').innerText()==='Talk about your business.'&&await f.locator('input,textarea,form').count()===0);
  check(guide.title+': context survives portable navigation',await f.locator('[data-demo-context]').isVisible());
  check(guide.title+': unconnected demo does not pretend to be live',await f.locator('.handoff-status').innerText().then(t=>t.includes('not connected'))&&await f.locator('button').count()===0);
  await f.locator('[data-demo-return]').click();console.log('Guide verified: '+guide.title);check(guide.title+': return restores the original guide',await f.locator('#buying-questions').count()===1&&await f.locator('.article-hero [data-demo-cta]').getAttribute('href')===href);
 }
 f=await start('demo/index.html?source=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E');
 check('Unknown context is rejected without markup injection',await f.locator('[data-demo-context]').isHidden()&&await f.locator('.demo-handoff img').count()===0);
 check('Unknown context cannot alter the return destination',await f.locator('[data-demo-return]').getAttribute('href')==='../compare/index.html');
 f=await start('alternatives/ruby/index.html');
 check('Obsolete source-limited prices removed',!(await f.locator('main').innerText()).includes('CAD $325')&&!(await f.locator('main').innerText()).includes('$29/month for 60'));
 await page.screenshot({path:path.join(evidence,'ruby-desktop.png')});
 await f.locator('#buy-cost summary').click();await f.locator('#buy-cost').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(evidence,'ruby-cost-desktop.png')});
 f=await start('compare/jobber-receptionist-vs-housecall-pro-csr-ai/index.html');await f.locator('#buy-setup summary').click();await f.locator('#buy-setup').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(evidence,'jobber-housecall-setup.png')});
 f=await start('resources/index.html');
 const downloadPromise=page.waitForEvent('download');await f.getByRole('link',{name:'Download the checklist'}).click();const download=await downloadPromise;const dest=path.join(evidence,'downloaded-checklist.txt');await download.saveAs(dest);check('Checklist download preserved',fs.readFileSync(dest).equals(fs.readFileSync(path.join(out,'resources/five-call-checklist.txt'))));
 await f.getByRole('link',{name:'Open job profit check'}).click();check('Original calculator result preserved',await f.locator('#profit-left').innerText()==='$750.00');await f.locator('[data-profit-mode=markup]').click();check('Original target-markup mode preserved',await f.locator('#profit-left').innerText()==='$2,000.00');
 for(const width of [320,375,390,768,1024,1440]){
  await page.setViewportSize({width,height:950});
  console.log('Checking viewport '+width);for(const name of [...manifest.pages,manifest.demo_handoff]){
   await page.setContent(html(name));check(name+': fits '+width+'px',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   if(manifest.guides.some(g=>g.path===name))check(name+': visible hero CTA at '+width+'px',await page.locator('.article-hero [data-demo-cta]').isVisible());
  }
 }
 await page.setViewportSize({width:390,height:950});await page.setContent(html('alternatives/ruby/index.html'));await page.screenshot({path:path.join(evidence,'ruby-mobile.png')});
 await page.locator('#buy-booking summary').click();await page.locator('#buy-booking').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(evidence,'ruby-booking-mobile.png')});
 await page.setContent(html('compare/jobber-receptionist-vs-housecall-pro-csr-ai/index.html'));const table=page.locator('.competitor-table-wrap');await table.focus();await page.keyboard.press('ArrowRight');await page.waitForTimeout(100);check('Wide table scrolls by keyboard without page overflow',await table.evaluate(e=>e.scrollWidth>e.clientWidth&&e.scrollLeft>0));
 f=await start('alternatives/ruby/index.html');await f.locator('.article-hero [data-demo-cta]').click();await page.screenshot({path:path.join(evidence,'demo-handoff-mobile.png')});
 const nojs=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:950}});const off=await nojs.newPage();await off.setContent(html('compare/index.html'));check('All 12 guide links work without JavaScript',await off.locator('[data-guide]').count()===12&&await off.locator('[data-guide]').last().isVisible());check('Search controls hidden without JavaScript',await off.locator('[data-search-tools]').isHidden());await off.setContent(html('alternatives/ruby/index.html'));await off.locator('#buy-cost summary').click();check('Buying answers expand without JavaScript',await off.locator('#buy-cost').getAttribute('open')!==null);check('Demo CTA exists without JavaScript',await off.locator('.article-hero [data-demo-cta]').getAttribute('href').then(h=>h.includes('source=')));await nojs.close();
 // Direct-file route, query and return are separate from the srcdoc runner.
 await page.goto(require('node:url').pathToFileURL(path.join(out,'alternatives/ruby/index.html')).href);await page.locator('.article-hero [data-demo-cta]').click();check('Direct-file handoff retains context',await page.locator('[data-demo-context]').isVisible());await page.locator('[data-demo-return]').click();check('Direct-file return opens Ruby guide',await page.locator('#buying-questions').count()===1);
 check('No JavaScript errors',errors.length===0);check('No automatic HTTP requests or provider calls',requests.filter(r=>/^https?:/.test(r)).length===0);
 await context.close();
 }finally{await browser.close();}
})().catch(error=>{results.push({name:'Execution completed',pass:false,error:String(error.stack||error)});process.exitCode=1;}).finally(()=>{const report={time:new Date().toISOString(),checks:results.length,passed:results.filter(r=>r.pass).length,failed:results.filter(r=>!r.pass).length,results,method:'Generated HTML, portable runner and direct-file navigation in local Edge (Chromium).',limits:['Other browser engines','Full screen-reader audit','Conversion uplift and search ranking','Live voice/provider acceptance','Production deployment']};fs.writeFileSync(path.join(evidence,'conversion-browser.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({checks:report.checks,passed:report.passed,failed:report.failed}));});
