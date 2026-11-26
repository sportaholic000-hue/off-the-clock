import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {once} from 'node:events';
import path from 'node:path';
import express from 'express';
import {httpFixture} from './leadCaptureRepair20261006HttpFixture.mjs';
import {installSecurityHeaders,OWNER_APP_CSP} from '../server/src/securityHeaders.js';
import {installOwnerAssets} from '../server/src/productionAssets.js';
import {wavFromPcm} from '../server/src/voicePreviewRoutes.js';

// Owner-app launch fixes, 2026-11-16, in Chromium against the real compiled app
// and the real API, behind the production security headers
// (installSecurityHeaders with production on, and the owner page's own policy).
// Only the greeting preview's audio is synthetic: the front answers
// /api/onboarding/voice/preview with a 1-second tone built by the server's own
// WAV builder, so no Google request is made.
//
// Expected results, written before running:
//  Preview (onboarding step 9 and Settings > Receptionist): both clips start,
//   no securitypolicyviolation fires and no status message shows. Today: two
//   media-src violations and "Your browser blocked playback. Press Preview again."
//  Blank transfer window: pressing Finish setup / Save sends no request, shows
//   "Enter a start and end time for <Day>'s transfer window, or remove it." and
//   focuses that day's empty field. Today: the request is sent and the server
//   answers "Transfer times must use HH:mm."
//  Starter dashboard: none of the QuoteDone, price book, calendar, job-cost or
//   webhook sections; Operator: all of them.
const root=fileURLToPath(new URL('..',import.meta.url));
const pcm=Buffer.alloc(48000);for(let i=0;i<24000;i++)pcm.writeInt16LE(Math.round(8000*Math.sin(2*Math.PI*440*i/24000)),i*2);
const CLIP=wavFromPcm(pcm).toString('base64');

async function productionFront(t,f){
  const app=express(),voiceRequests=[];
  installSecurityHeaders(app,{production:true});
  app.post('/api/onboarding/voice/preview',(_req,res)=>res.json({audio:CLIP,mimeType:'audio/wav',cached:false}));
  app.use('/api',express.raw({type:()=>true,limit:'5mb'}),async(req,res,next)=>{try{
    if(req.originalUrl==='/api/onboarding/voice'&&req.method==='POST')voiceRequests.push(JSON.parse(req.body.toString('utf8')));
    const headers={};for(const name of ['authorization','content-type','accept','idempotency-key'])if(req.get(name))headers[name]=req.get(name);
    const response=await fetch(f.base+req.originalUrl,{method:req.method,headers,body:['GET','HEAD'].includes(req.method)||!req.body?.length?undefined:req.body});
    res.status(response.status);for(const name of ['content-type','cache-control'])if(response.headers.has(name))res.set(name,response.headers.get(name));
    res.send(Buffer.from(await response.arrayBuffer()));
  }catch(error){next(error);}});
  installOwnerAssets(app,path.join(root,'client/dist'));
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
  return {base:'http://127.0.0.1:'+server.address().port,voiceRequests};
}

const observe=()=>{
  window.__violations=[];window.__plays=[];
  document.addEventListener('securitypolicyviolation',e=>window.__violations.push(e.effectiveDirective+' '+String(e.blockedURI).slice(0,40)));
  const play=HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play=function(){
    const source=String(this.src).slice(0,30),promise=play.call(this);
    promise.then(()=>window.__plays.push(source+' resolved'),error=>window.__plays.push(source+' '+error.name));
    return promise;
  };
};

test('owner app launch fixes in Chromium under the production headers',{timeout:180000},async t=>{
  const {chromium}=createRequire(import.meta.url)(process.env.PRICEBOOK_BROWSER_MODULE||'playwright');
  const browser=await chromium.launch({headless:true,...(process.env.PRICEBOOK_BROWSER_EXECUTABLE?{executablePath:process.env.PRICEBOOK_BROWSER_EXECUTABLE}:{})});t.after(()=>browser.close());
  const f=await httpFixture(t),front=await productionFront(t,f);
  async function page(owner){
    const context=await browser.newContext();t.after(()=>context.close());
    await context.addInitScript(([token,script])=>{try{localStorage.setItem('otc_token',token);}catch{}(new Function('return '+script))()();},[f.tokens[owner],observe.toString()]);
    const p=await context.newPage(),errors=[];p.on('pageerror',error=>errors.push(error.message));
    return {p,errors};
  }

  await t.test('greeting preview plays on step 9 and in Settings with no policy violation',async()=>{
    for(const where of ['/onboarding?step=9','/settings']){
      const {p,errors}=await page('synthetic-a');
      const response=await p.goto(front.base+where);
      assert.equal(response.headers()['content-security-policy'],OWNER_APP_CSP,where);
      assert.equal(response.headers()['strict-transport-security'],'max-age=31536000; includeSubDomains',where);
      await p.getByRole('button',{name:'Preview',exact:true}).click();
      await p.waitForFunction(()=>window.__plays.length>=2,null,{timeout:15000});
      await p.getByRole('button',{name:'Preview',exact:true}).waitFor();await p.waitForTimeout(300);
      // The silent unlock clip either finishes or is cut off by the greeting
      // clip (AbortError, by design); the greeting clip itself plays.
      const plays=(await p.evaluate(()=>window.__plays)).sort();
      assert.equal(plays.length,2,where);
      assert.match(plays[0],/^data:audio\/wav;base64,UklGRggC (resolved|AbortError)$/,where);
      assert.equal(plays[1],'data:audio/wav;base64,UklGRqS7 resolved',where);
      assert.deepEqual(await p.evaluate(()=>window.__violations),[],where);
      assert.equal(await p.locator('.greeting-preview [role=status]').count(),0,where);
      assert.deepEqual(errors,[],where);
    }
    assert.match(OWNER_APP_CSP,/; media-src 'self' data:;/);
  });

  await t.test('a blank transfer window is caught on the page, names the day and sends nothing',async()=>{
    const focusedLabel=p=>p.evaluate(()=>document.activeElement?.closest('label')?.querySelector('.field-label')?.textContent||null);
    const notice=p=>p.locator('.notice-error').allTextContents();
    // Onboarding step 9.
    {
      const {p,errors}=await page('synthetic-a');
      await p.goto(front.base+'/onboarding?step=9');
      await p.getByRole('button',{name:'Add Monday hours',exact:true}).click();
      await p.getByRole('button',{name:'Finish setup'}).click();await p.waitForTimeout(300);
      assert.deepEqual(await notice(p),["Enter a start and end time for Monday's transfer window, or remove it."]);
      assert.equal(await focusedLabel(p),'Monday start 1');
      await p.getByLabel('Monday start 1',{exact:true}).fill('09:00');
      await p.getByRole('button',{name:'Finish setup'}).click();await p.waitForTimeout(300);
      assert.deepEqual(await notice(p),["Enter a start and end time for Monday's transfer window, or remove it."]);
      assert.equal(await focusedLabel(p),'Monday end 1');
      await p.getByLabel('Monday end 1',{exact:true}).fill('17:00');
      await p.getByRole('button',{name:'Add Wednesday hours',exact:true}).click();
      await p.getByRole('button',{name:'Finish setup'}).click();await p.waitForTimeout(300);
      assert.deepEqual(await notice(p),["Enter a start and end time for Wednesday's transfer window, or remove it."]);
      assert.equal(await focusedLabel(p),'Wednesday start 1');
      assert.equal(front.voiceRequests.length,0,'nothing was sent');
      // Removing the blank window lets setup finish with Monday's hours.
      await p.locator('fieldset',{hasText:'Wednesday'}).getByRole('button',{name:'Remove',exact:true}).click();
      await p.getByRole('button',{name:'Finish setup'}).click();
      await p.waitForURL(front.base+'/dashboard');
      assert.equal(front.voiceRequests.length,1);
      assert.deepEqual(front.voiceRequests[0].transferWindows.mon,[{start:'09:00',end:'17:00'}]);
      assert.deepEqual(errors,[]);
    }
    // Settings > Receptionist.
    {
      const {p,errors}=await page('synthetic-a');
      await p.goto(front.base+'/settings');
      await p.getByRole('button',{name:'Add Friday hours',exact:true}).click();
      await p.getByRole('button',{name:'Save'}).click();await p.waitForTimeout(300);
      assert.deepEqual(await notice(p),["Enter a start and end time for Friday's transfer window, or remove it."]);
      assert.equal(await focusedLabel(p),'Friday start 1');
      assert.equal(front.voiceRequests.length,1,'nothing more was sent');
      assert.deepEqual(errors,[]);
    }
    // A refusal from the real route names the day.
    const refused=await f.request('/api/onboarding/voice','synthetic-a',{method:'POST',body:{voiceId:'female',agentName:'Nova',greeting:'[SYNTHETIC] Hello',transcriptionNotice:false,transferNumber:'',
      transferWindows:{mon:[],tue:[{start:'17:00',end:'09:00'}],wed:[],thu:[],fri:[],sat:[],sun:[]}}});
    assert.equal(refused.status,400);assert.equal(refused.body.error,'Tuesday transfer windows must be ordered, non-overlapping, and end after they start.');
  });

  await t.test('Starter dashboard shows no QuoteDone, price book, calendar, job-cost or webhook sections; Operator shows them',async()=>{
    const locked=['QUOTEDONE STATUS','BOOKED ON CALENDAR','Quote accuracy and job costs','Webhooks and CSV support','Save webhook'];
    for(const [plan,shown] of [['Starter',false],['Operator',true]]){
      f.db.prepare('UPDATE users SET plan=? WHERE id=?').run(plan,'synthetic-b');
      const {p,errors}=await page('synthetic-b');
      await p.goto(front.base+'/dashboard');
      await p.getByRole('heading',{name:'Follow-up',exact:true}).waitFor();
      if(shown)await p.getByRole('heading',{name:'Webhooks and CSV support',exact:true}).waitFor();
      const text=await p.locator('main').innerText();
      for(const words of locked)assert.equal(text.includes(words),shown,plan+': '+words);
      assert.deepEqual(await p.locator('.setup-facts > div > span').allTextContents(),shown?['Business line','Knowledge base','Calendar','Voice']:['Business line','Knowledge base','Voice'],plan);
      assert.deepEqual(errors,[],plan);
    }
  });
});
