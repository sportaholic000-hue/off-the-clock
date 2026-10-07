import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {httpFixture} from './leadCaptureRepair20261006HttpFixture.mjs';
import {quoteEmailFixture} from './quoteEmailFixture.mjs';
import {createVoiceToolRuntime} from '../server/src/voice/voiceToolRuntime.js';
import {createVoiceToolDispatcher} from '../server/src/voice/toolDispatcher.js';
import {secret,at} from './leadCaptureRepair20261006Fixture.mjs';
test('D19/D20: production browser shows saved quote email status and browses/retries older failures',{timeout:90000},async t=>{
  const {chromium}=createRequire(import.meta.url)(process.env.PRICEBOOK_BROWSER_MODULE||'playwright');const browser=await chromium.launch({headless:true,...(process.env.PRICEBOOK_BROWSER_EXECUTABLE?{executablePath:process.env.PRICEBOOK_BROWSER_EXECUTABLE}:{})});t.after(()=>browser.close());
  const f=await httpFixture(t),c=f.context(),lead=await f.voice(c).tool('captureLead',{description:'[SYNTHETIC] Browser follow-up',notes:'[SYNTHETIC] Call after six.'});
  const mail=quoteEmailFixture(t,{base:f,context:c});await mail.queue();await mail.emailService().dispatchOnce();
  const leadId=f.lead(c)[0].id;
  const webhook=f.webhook();await webhook.save(c.ownerId,{url:'https://synthetic.example.invalid/hook',events:['lead.created']});const version=f.db.prepare('SELECT version FROM webhookEndpoints WHERE ownerId=?').get(c.ownerId).version;
  for(let n=0;n<55;n++)f.db.prepare("INSERT INTO webhookDeliveries(id,ownerId,eventType,aggregateId,endpointVersion,payloadJson,status,nextAttemptAt,createdAt,updatedAt) VALUES(?,?,'lead.created',?,?,'{}',?,0,?,?)").run('SYNTHETIC-browser-'+String(n).padStart(3,'0'),c.ownerId,'SYNTHETIC-browser-lead-'+n,version,n===0?'FAILED':'PENDING',new Date(Date.parse(at)+n*1000).toISOString(),at);
  const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(f.base+'/login');await p.evaluate(token=>localStorage.setItem('otc_token',token),f.tokens['synthetic-a']);
  await t.test('owner/staff read DELIVERED accurately on saved inquiry and refreshed Calls; wrong tenant sees no request',async()=>{
    for(const role of ['synthetic-a','synthetic-staff']){await p.evaluate(token=>localStorage.setItem('otc_token',token),f.tokens[role]);await p.goto(f.base+'/leads?record='+leadId);await p.getByRole('heading',{name:'Delivery and transfer attempts on this call',exact:true}).waitFor();assert.match(await p.locator('main').innerText(),/Quote email to caller@example.invalid · DELIVERED/);if(role==='synthetic-staff')assert.equal(await p.getByText('Owner-only calculation and request evidence').count(),0);
      await p.goto(f.base+'/calls?record='+c.callSid);await p.reload();await p.getByRole('heading',{name:'Delivery and transfer attempts on this call',exact:true}).waitFor();assert.match(await p.locator('main').innerText(),/DELIVERED confirms a delivery receipt/);}
    await p.evaluate(token=>localStorage.setItem('otc_token',token),f.tokens['synthetic-b']);await p.goto(f.base+'/leads?record='+leadId);await p.getByText('No saved leads yet.',{exact:true}).waitFor();assert.equal(await p.getByRole('heading',{name:'Delivery and transfer attempts on this call'}).count(),0);
  });
  await t.test('dashboard reaches oldest failure and retry preserves unsaved editor URL',async()=>{
    await p.evaluate(token=>localStorage.setItem('otc_token',token),f.tokens['synthetic-a']);await p.goto(f.base+'/dashboard');await p.getByText('55 unresolved deliveries',{exact:true}).waitFor();await p.getByRole('textbox',{name:'HTTPS webhook URL',exact:true}).fill('https://synthetic.example.invalid/unsaved');await p.getByRole('button',{name:'Next deliveries',exact:true}).click();const old=p.locator('li').filter({hasText:'SYNTHETIC-browser-000'});await old.waitFor();assert.match(await old.innerText(),/FAILED/);
    const [response]=await Promise.all([p.waitForResponse(r=>r.request().method()==='POST'&&r.url().includes('/SYNTHETIC-browser-000/retry')),old.getByRole('button',{name:'Retry delivery',exact:true}).click()]);assert.equal(response.status(),200);await p.getByRole('button',{name:'Refresh delivery status',exact:true}).click();assert.equal(await p.getByRole('textbox',{name:'HTTPS webhook URL',exact:true}).inputValue(),'https://synthetic.example.invalid/unsaved');assert.equal(f.db.prepare('SELECT status FROM webhookDeliveries WHERE ownerId=? AND id=?').get(c.ownerId,'SYNTHETIC-browser-000').status,'PENDING');
    await p.getByRole('button',{name:'All deliveries',exact:true}).click();await p.getByText('55 deliveries',{exact:true}).waitFor();
  });
  assert.deepEqual(errors,[]);
});
