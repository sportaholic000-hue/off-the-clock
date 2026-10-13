import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {httpFixture} from '../leadCaptureRepair20261006HttpFixture.mjs';
import {createOwnerAlertService} from '../../server/src/ownerAlertService.js';

export async function controlledScenario(t,{consumeBeforeRefresh=false}={}){
  const {chromium}=createRequire(import.meta.url)(process.env.PRICEBOOK_BROWSER_MODULE||'playwright');
  const browser=await chromium.launch({headless:true,...(process.env.PRICEBOOK_BROWSER_EXECUTABLE?{executablePath:process.env.PRICEBOOK_BROWSER_EXECUTABLE}:{})});t.after(()=>browser.close());
  const f=await httpFixture(t,{controlledOwnerAlertWorker:true}),c=f.context();
  const words='[SYNTHETIC] Please call after six about the broken latch.';
  await f.voice(c).tool('captureLead',{callbackRequested:true,notes:words});
  f.db.prepare("UPDATE ownerAlerts SET status='FAILED',lastErrorCode='SYNTHETIC_PROVIDER_OUTAGE' WHERE ownerId=?").run(c.ownerId);
  const alert=f.db.prepare("SELECT id,eventType FROM ownerAlerts WHERE ownerId=? AND eventType='callback.requested'").get(c.ownerId);
  assert.ok(alert);
  const read=()=>f.db.prepare('SELECT id,status,lastErrorCode,attemptCount FROM ownerAlerts WHERE ownerId=? AND id=?').get(c.ownerId,alert.id);
  const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(f.base+'/login');await p.evaluate(token=>localStorage.setItem('otc_token',token),f.tokens['synthetic-a']);
  await p.goto(f.base+'/dashboard');await p.getByRole('heading',{name:'Owner notifications',exact:true}).waitFor();
  assert.ok((await p.locator('main').innerText()).includes('SYNTHETIC_PROVIDER_OUTAGE'));
  await p.goto(f.base+'/calls?record='+c.callSid);await p.getByRole('heading',{name:'Callback requests',exact:true}).waitFor();
  await p.reload();await p.getByRole('heading',{name:'Callback requests',exact:true}).waitFor();assert.ok((await p.locator('main').innerText()).includes(words));
  const row=p.locator('[aria-label="Owner notification status"] > .field-stack').filter({hasText:alert.eventType});
  assert.equal(await row.count(),1);
  const order=[],callPath='/api/calls/'+c.callSid,retryPath='/api/owner-alerts/'+alert.id+'/retry';
  let dbBeforeRefresh,dispatch;
  const intercept=async route=>{
    order.push('refresh-intercepted');
    if(consumeBeforeRefresh){dispatch=await f.dispatchOwnerAlerts();order.push('real-disabled-worker-completed');}
    dbBeforeRefresh=read();order.push('refresh-released');await route.continue();
  };
  await p.route(f.base+callPath,intercept);
  const retryWait=p.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname===retryPath);
  const getWait=p.waitForResponse(r=>r.request().method()==='GET'&&new URL(r.url()).pathname===callPath);
  await row.getByRole('button',{name:'Retry owner alert',exact:true}).click();
  const retryResponse=await retryWait,retry=await retryResponse.json();
  assert.equal(retryResponse.status(),200);assert.equal(retry.status,'PENDING');
  const response=await getWait,body=await response.json();assert.equal(response.status(),200);
  await p.unroute(f.base+callPath,intercept);
  const notification=body.notifications.find(item=>item.id===alert.id);assert.ok(notification);
  const expected=consumeBeforeRefresh?'BLOCKED':'PENDING';
  await row.getByText(expected,{exact:true}).waitFor();
  assert.equal(notification.status,expected);assert.equal(dbBeforeRefresh.status,expected);assert.equal(read().status,expected);assert.equal(read().attemptCount,0);
  assert.equal(await row.getByText('PENDING',{exact:true}).count(),consumeBeforeRefresh?0:1);
  if(consumeBeforeRefresh){assert.equal(read().lastErrorCode,'EMAIL_NOT_CONFIGURED');assert.equal(dispatch.processed,0);assert.deepEqual(order,['refresh-intercepted','real-disabled-worker-completed','refresh-released']);}
  else assert.deepEqual(order,['refresh-intercepted','refresh-released']);
  t.diagnostic(JSON.stringify({syntheticOnly:true,alertId:alert.id,ordering:order,retry:{http:retryResponse.status(),status:retry.status},get:{http:response.status(),id:notification.id,status:notification.status},database:read(),rendered:expected,originalPendingAssertionWouldPass:!consumeBeforeRefresh,providerAttempts:0}));
  let sends=0;const accepted=new Set();
  const fake=createOwnerAlertService({database:f.db,ownerQuery:f.ownerQuery,environment:{EMAIL_FROM:'alerts@example.invalid'},ready:()=>true,send:async message=>{sends++;accepted.add(message.idempotencyKey);return {accepted:true,id:'SYNTHETIC_'+message.idempotencyKey};}});
  await fake.dispatchOnce();assert.equal(sends,1);assert.equal(accepted.size,1);assert.equal(read().status,'ACCEPTED');
  const refreshed=p.waitForResponse(r=>r.request().method()==='GET'&&new URL(r.url()).pathname===callPath);
  await p.getByRole('button',{name:'Refresh',exact:true}).click();
  assert.equal((await (await refreshed).json()).notifications.find(item=>item.id===alert.id).status,'ACCEPTED');
  await row.getByText('ACCEPTED',{exact:true}).waitFor();
  await p.getByText('ACCEPTED means the email provider accepted the alert. Inbox delivery and owner reading are not confirmed.',{exact:true}).waitFor();
  await fake.dispatchOnce();assert.equal(sends,1);assert.equal(accepted.size,1);
  assert.equal((await f.request(retryPath,'synthetic-b',{method:'POST',body:{}})).status,404);
  assert.equal((await f.request(callPath,'synthetic-b')).status,404);
  assert.equal((await f.request(retryPath,'synthetic-staff',{method:'POST',body:{}})).status,403);
  await p.evaluate(token=>{localStorage.setItem('otc_token',token);window.dispatchEvent(new Event('otc:session'));},f.tokens['synthetic-staff']);
  await p.goto(f.base+'/calls?record='+c.callSid);await p.getByRole('heading',{name:'Callback requests',exact:true}).waitFor();assert.ok((await p.locator('main').innerText()).includes(words));assert.equal(await p.getByRole('button',{name:'Retry owner alert',exact:true}).count(),0);
  t.diagnostic(JSON.stringify({syntheticOnly:true,alertId:alert.id,finalStatus:read().status,attemptCount:read().attemptCount,fakeProviderCalls:sends,uniqueAcceptances:accepted.size,noResend:true,staffRetry:403,foreignRetry:404,foreignCall:404}));
  assert.deepEqual(errors,[]);
}
