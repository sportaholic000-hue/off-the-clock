import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {startApplication} from './widget-application-harness.mjs';
import {mowingFixture} from '../../verification/quotedone/repair-fixture.mjs';

const [rootArg,evidenceArg,mode='before']=process.argv.slice(2);
const root=path.resolve(rootArg),evidence=path.resolve(evidenceArg),site='http://127.0.0.1:4680';
const app=await startApplication(root,evidence,{port:4682,calendarFixture:true,browserOrigins:[site]});
if(mode!=='before'){app.env.CLIENT_URL=site;await app.restart();}
const require=createRequire(path.join(root,'package.json'));
const {chromium}=require(process.env.PRICEBOOK_BROWSER_MODULE);
const rows=[],wire=[],errors=[];
let browser,server,db,page;
try {
 fs.copyFileSync(fileURLToPath(import.meta.url),path.join(evidence,'executed-browser.mjs'));
 const f=await mowingFixture(app,'owner-calendar',[site]);
 const dist=path.join(root,'client/dist');
 server=http.createServer(async(req,res)=>{
  try {
   const url=new URL(req.url,site);
   if(url.pathname.startsWith('/api/')){
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    const body=Buffer.concat(chunks),headers={};
    for(const name of ['origin','content-type','authorization','referer','sec-fetch-site','idempotency-key'])if(req.headers[name])headers[name]=req.headers[name];
    const response=await fetch(app.base+req.url,{method:req.method,headers,redirect:'manual',...(!['GET','HEAD'].includes(req.method)&&body.length?{body}:{})});
    const reply=await response.text();let json;try{json=JSON.parse(reply);}catch{json={text:reply};}
    wire.push({method:req.method,path:req.url,authenticated:!!headers.authorization,body:body.length?JSON.parse(body):null,status:response.status,response:json});
    res.statusCode=response.status;response.headers.forEach((value,key)=>{if(!['content-length','connection','transfer-encoding','content-encoding'].includes(key))res.setHeader(key,value);});res.end(reply);return;
   }
   const file=path.resolve(dist,!path.extname(url.pathname)?'index.html':'.'+url.pathname);
   if(!file.startsWith(dist+path.sep)){res.writeHead(403).end();return;}
   res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.setHeader('cache-control','no-store');res.end(fs.readFileSync(file));
  }catch(e){res.writeHead(500,{'content-type':'text/plain'}).end(String(e));}
 });
 await new Promise(resolve=>server.listen(4680,'127.0.0.1',resolve));
 browser=await chromium.launch({headless:true,executablePath:process.env.PRICEBOOK_BROWSER_EXECUTABLE,timeout:180000});
 page=await browser.newPage({viewport:{width:1360,height:950}});page.setDefaultTimeout(30000);
 page.on('pageerror',error=>errors.push(String(error.stack)));
 await page.addInitScript(token=>localStorage.setItem('otc_token',token),f.owner.token);
 await page.goto(site+'/dashboard');await page.getByRole('navigation',{name:'Primary'}).waitFor();
 if(mode==='before'){
  await page.getByRole('navigation',{name:'Primary'}).getByRole('button',{name:'Calendar',exact:true}).click();
  await page.getByRole('heading',{name:'Connect your calendar',exact:true}).waitFor();
  assert.ok(page.url().includes('/onboarding?step=8'));
  const missing=await app.request('GET','/api/calendar/schedule?fromDate=2026-10-01&days=7',undefined,f.owner.token);
  assert.equal(missing.status,404);
  const control=await app.request('GET','/api/booking/configuration',undefined,f.owner.token);assert.equal(control.status,200);
  rows.push({name:'Calendar navigation opens onboarding; owner schedule endpoint is missing',passed:true,url:page.url(),missing,control});
  await page.screenshot({path:path.join(evidence,'calendar-before.png'),fullPage:true});
 } else {
  db=new Database(path.join(evidence,'application.sqlite'));
  const fromDate=new Date(Date.now()+2*86400000).toISOString().slice(0,10);
  const providerPath=path.join(evidence,'synthetic-calendar-provider.json');
  const provider=()=>JSON.parse(fs.readFileSync(providerPath,'utf8'));
  const changeProvider=patch=>fs.writeFileSync(providerPath,JSON.stringify({...provider(),...patch},null,2));
  const customer={name:'[SYNTHETIC] Calendar Customer',email:'calendar-customer@example.invalid',phone:''};
  const location={addressLine1:'[SYNTHETIC] 123 Example Street',addressLine2:'',city:'Halifax',region:'NS',postalCode:'B3H 0A1',country:'CA'};
  const filters={fromDate,days:1,timeOfDay:'any',scopeConfirmation:'UNCHANGED',customer,location};
  const note='[SYNTHETIC] Please contact me to agree a time.';
  const additional='[SYNTHETIC] Remove the hedge along the driveway.';
  const check=(name,detail={})=>{rows.push({name,passed:true,...detail});console.log('PASS '+name);};
  const requireText=async(text)=>page.getByText(text,{exact:true}).first().waitFor();
  const tab=async(name)=>page.getByRole('tab',{name,exact:true}).click();
  const booking=async(q,method,suffix,body)=>app.request(method,'/api/public/bookings/'+q.bookingToken+suffix,body,undefined,{...f.headers,...(method!=='GET'?{'Idempotency-Key':crypto.randomUUID()}:{})});
  async function quote(extra={},review=false){
   const body=f.submission({intakeFlow:'job-details-v1',urgency:'flexible',...extra});
   const prep=await app.request('POST',f.url+'/prepare',body,undefined,f.headers);assert.equal(prep.status,200,JSON.stringify(prep));
   const submission={...body,...(prep.result.status==='ready'?{intakeConfirmation:prep.result.confirmation}:{reviewRequested:true})};
   const result=await app.request('POST',f.url,submission,undefined,f.headers);assert.equal(result.status,201,JSON.stringify(result));
   if(review)assert.equal(result.result.resultType,'ESTIMATE_REQUIRES_REVIEW');else assert.equal((result.result.pricedEstimate||result.result).midEstimate,50);
   return result.result;
  }
  const qPreference=await quote({customerInputs:{...f.inputs,yardSqft:null}},true);
  const preference=await booking(qPreference,'POST','/preference',{scopeConfirmation:'UNCHANGED',preferredWindows:[{date:fromDate,timeOfDay:'morning'}],customer,location,note});
  assert.equal(preference.status,201,JSON.stringify(preference));assert.equal(preference.result.status,'REQUESTED');
  await page.getByRole('navigation',{name:'Primary'}).getByRole('button',{name:'Calendar',exact:true}).click();
  await page.getByRole('heading',{name:'Calendar',exact:true}).waitFor();await page.getByRole('tab',{name:'Availability'}).waitFor();
  await page.getByLabel('Week starting').fill(fromDate);await page.getByRole('button',{name:'Show week'}).click();
  await page.getByRole('article',{name:'Requested time: '+customer.name}).waitFor();await requireText(note);
  assert.equal(await page.getByRole('article').count(),1);
  await page.getByRole('article').getByRole('button',{name:'Open lead',exact:true}).click();await page.getByRole('heading',{name:'Leads',exact:true}).waitFor();
  assert.ok(new URL(page.url()).searchParams.get('record'));assert.equal(await page.locator('main.pricebook-page > section.editor-section').count(),1);
  await page.getByRole('navigation',{name:'Primary'}).getByRole('button',{name:'Calendar',exact:true}).click();await page.getByRole('tab',{name:'Availability'}).waitFor();
  check('Calendar navigation shows a persisted preferred-time request, not a confirmed appointment, and opens its exact lead');
  await tab('Availability');
  assert.equal(await page.getByLabel('Days ahead customers can book').inputValue(),'');
  await page.getByLabel('Timezone',{exact:true}).selectOption('America/Halifax');
  for(const day of ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']){
   await page.getByRole('button',{name:'Add '+day+' hours',exact:true}).click();
   await page.getByLabel(day+' start 1',{exact:true}).fill('09:00');await page.getByLabel(day+' end 1',{exact:true}).fill('17:00');
  }
  for(const [label,value] of [['Days ahead customers can book','14'],['Minimum notice (minutes)','0'],['Start time intervals (minutes)','30'],['Buffer before appointments (minutes)','15'],['Buffer after appointments (minutes)','30']])await page.getByLabel(label,{exact:true}).fill(value);
  await page.getByLabel('Allow customers to book available times').check();
  await page.getByRole('button',{name:'Add blocked period',exact:true}).click();
  await page.getByLabel('Blocked period 1 start',{exact:true}).fill(fromDate+'T12:00');await page.getByLabel('Blocked period 1 end',{exact:true}).fill(fromDate+'T13:00');
  await page.getByRole('button',{name:'Save availability',exact:true}).click();await requireText('Availability saved.');
  const saved=(await f.call('GET','/api/booking/configuration')).settings;
  assert.equal(saved.timezone,'America/Halifax');assert.equal(saved.bufferBeforeMinutes,15);assert.equal(saved.bufferAfterMinutes,30);assert.equal(saved.blackouts.length,1);
  check('Owner saves working hours, timezone, notice, increments, buffers and blackout through the real form',{saved});
  const monday=page.getByRole('button',{name:'Add Monday hours',exact:true});await monday.click();
  await page.getByLabel('Monday start 2',{exact:true}).fill('14:00');await page.getByLabel('Monday end 2',{exact:true}).fill('18:00');
  const rejected=page.waitForResponse(r=>r.url().includes('/api/booking/settings')&&r.request().method()==='PUT');
  await page.getByRole('button',{name:'Save availability',exact:true}).click();assert.equal((await rejected).status(),400);
  assert.equal(await page.getByText('Availability saved.',{exact:true}).count(),0);
  assert.equal(await page.getByLabel('Monday start 2').inputValue(),'14:00');
  assert.equal((await f.call('GET','/api/booking/configuration')).settings.revision,saved.revision);
  await page.getByRole('button',{name:'Remove Monday hours 2'}).click();
  const corrected=page.waitForResponse(r=>r.url().includes('/api/booking/settings')&&r.request().method()==='PUT');await page.getByRole('button',{name:'Save availability',exact:true}).click();assert.equal((await corrected).status(),200);
  check('Overlapping hours are rejected without overwriting saved settings; correction can be saved');
  await page.getByLabel('[SYNTHETIC] Mowing booking type',{exact:true}).selectOption('site_visit_first');
  await page.getByLabel('[SYNTHETIC] Mowing duration (minutes)',{exact:true}).fill('60');
  await page.getByLabel('Offer booking for [SYNTHETIC] Mowing',{exact:true}).check();
  await page.getByRole('button',{name:'Save [SYNTHETIC] Mowing booking',exact:true}).click();await requireText('[SYNTHETIC] Mowing booking settings saved.');
  await f.call('POST','/api/onboarding/knowledge-base',{sections:[],serviceArea:{mode:'cities',cities:[{city:'Halifax',region:'NS',country:'CA'}]}});
  await tab('Connection');
  await page.getByLabel('Calendly scheduling link').fill('https://example.invalid/scheduling');
  const badLink=page.waitForResponse(r=>r.url().endsWith('/api/onboarding/calendar')&&r.request().method()==='POST');
  await page.getByRole('button',{name:'Use Calendly link'}).click();assert.equal((await badLink).status(),400);
  assert.equal(await page.getByLabel('Calendly scheduling link').inputValue(),'https://example.invalid/scheduling');
  await page.getByLabel('Calendly scheduling link').fill('https://calendly.com/synthetic-calendar/estimate');
  await page.getByRole('button',{name:'Use Calendly link'}).click();await requireText('Calendly link saved');
  const calendly=await booking(await quote(),'POST','/availability',filters);assert.equal(calendly.result.status,'EXTERNAL_HANDOFF',JSON.stringify(calendly));
  assert.equal(calendly.result.externalUrl,'https://calendly.com/synthetic-calendar/estimate');
  await page.getByRole('button',{name:'Disconnect calendar'}).click();await requireText('No connected calendar');
  assert.deepEqual((await f.call('GET','/api/booking/configuration')).settings.weeklyAvailability,saved.weeklyAvailability);
  check('Calendly validates editable URLs, gives the customer an external handoff, and disconnect preserves hours',{calendly});
  let oauthCallback;
  await page.route('https://accounts.google.com/**',async route=>{
   const url=new URL(route.request().url());oauthCallback=app.base+'/api/onboarding/calendar/google/callback?state='+encodeURIComponent(url.searchParams.get('state'))+'&code=SYNTHETIC-CALENDAR-CODE';
   const response=await fetch(oauthCallback,{redirect:'manual'});assert.equal(response.status,302);
   const destination=response.headers.get('location');assert.equal(destination,site+'/onboarding?step=8&calendar=connected');
   await route.fulfill({status:302,headers:{location:destination},body:''});
  });
  const returned=page.waitForEvent('framenavigated',{predicate:frame=>frame===page.mainFrame()&&frame.url()===site+'/onboarding?step=8&calendar=connected'});
  await page.getByRole('button',{name:'Connect Google Calendar',exact:true}).click();await returned;
  await page.waitForURL(site+'/calendar');await page.getByRole('tab',{name:'Connection',exact:true}).waitFor();await tab('Connection');
  await requireText('Google Calendar connected · Primary calendar');
  const reused=await fetch(oauthCallback,{redirect:'manual'}),reuseBody=await reused.json();assert.equal(reused.status,403);assert.equal(reuseBody.code,'CALENDAR_OAUTH_STATE_REPLAYED');
  check('Existing Google OAuth connects from Calendar and returns to Calendar; one-use state is preserved',{reused:{status:reused.status,body:reuseBody}});
  const timezone='America/Halifax';
  // Convert this fixture date explicitly using the production timezone only for setup; slot expectations below use local clock values.
  const {localDateTimeCandidates}=await import('../../server/src/calendarTime.js');
  const instant=(date,time)=>localDateTimeCandidates(date,time,timezone)[0];
  changeProvider({busy:[{start:instant(fromDate,'10:15'),end:instant(fromDate,'10:30')},{start:instant(fromDate,'13:00'),end:instant(fromDate,'14:00')}]});
  await tab('Schedule');await page.getByLabel('Week starting').fill(fromDate);await page.getByRole('button',{name:'Show week'}).click();
  await page.locator('.calendar-busy li').first().waitFor();assert.equal(await page.locator('.calendar-busy li').count(),2);
  const q=await quote({additionalWork:[additional]});
  let availability=await booking(q,'POST','/availability',filters);assert.equal(availability.result.status,'AVAILABLE',JSON.stringify(availability));
  const localStart=slot=>new Intl.DateTimeFormat('en-GB',{timeZone:timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(slot.startUtc));
  // Existing booking rules apply buffers against busy events/other appointments;
  // working hours and blackouts constrain the appointment itself. Do not change that policy in this UI task.
  // 09:00 is excluded by its 30-minute after-buffer; 10:30 and 14:00 by the 15-minute before-buffer.
  assert.deepEqual(availability.result.slots.map(localStart),['11:00','14:30','15:00','15:30','16:00']);
  check('Busy periods from existing Google calendar, blackouts, working hours and both buffers affect real public availability',{availability});
  const stale=availability.result.slots[0];
  await tab('Availability');await page.getByLabel('[SYNTHETIC] Mowing duration (minutes)',{exact:true}).fill('90');
  let updated=page.waitForResponse(r=>r.url().includes('/api/booking/policies/')&&r.request().method()==='PUT');
  await page.getByRole('button',{name:'Save [SYNTHETIC] Mowing booking',exact:true}).click();assert.equal((await updated).status(),200);
  const oldHold=await booking(q,'POST','/holds',{slotId:stale.slotId});assert.equal(oldHold.status,409);
  availability=await booking(q,'POST','/availability',filters);assert.deepEqual(availability.result.slots.map(localStart),['14:30','15:00','15:30']);
  await page.getByLabel('[SYNTHETIC] Mowing duration (minutes)',{exact:true}).fill('60');updated=page.waitForResponse(r=>r.url().includes('/api/booking/policies/')&&r.request().method()==='PUT');
  await page.getByRole('button',{name:'Save [SYNTHETIC] Mowing booking',exact:true}).click();assert.equal((await updated).status(),200);
  check('Changed service duration changes offered slots and invalidates old slot choices',{oldHold,availability});
  async function confirm(q,person,mode){
   changeProvider({mode});const a=await booking(q,'POST','/availability',{...filters,customer:person});assert.equal(a.result.status,'AVAILABLE');
   const slot=a.result.slots[0],hold=await booking(q,'POST','/holds',{slotId:slot.slotId});assert.equal(hold.status,201,JSON.stringify(hold));
   const result=await booking(q,'POST','/confirm',{holdId:hold.result.holdId,confirmedSlotId:slot.slotId,explicitConfirmation:true,addressConfirmation:true,customer:person,location});
   return result;
  }
  const confirmed=await confirm(q,customer,'normal');assert.equal(confirmed.result.status,'CONFIRMED',JSON.stringify(confirmed));
  const pendingCustomer={...customer,name:'[SYNTHETIC] Pending Customer'};
  const pending=await confirm(await quote(),pendingCustomer,'ambiguous');assert.equal(pending.result.status,'PENDING_CONFIRMATION',JSON.stringify(pending));
  await tab('Schedule');await page.getByRole('button',{name:'Refresh calendar'}).click();
  const confirmedCard=page.getByRole('article',{name:'Confirmed: '+customer.name,exact:true});await confirmedCard.waitFor();
  const pendingCard=page.getByRole('article',{name:'Pending confirmation: '+pendingCustomer.name,exact:true});await pendingCard.waitFor();
  await page.getByRole('article',{name:'Requested time: '+customer.name,exact:true}).waitFor();
  assert.ok((await pendingCard.innerText()).includes('has not been confirmed'));
  await page.screenshot({path:path.join(evidence,'calendar-schedule-desktop.png'),fullPage:true});
  await confirmedCard.getByRole('button',{name:'Open quote',exact:true}).click();
  await page.getByRole('heading',{name:'Quotes',exact:true}).waitFor();await requireText(additional);
  const selectedId=new URL(page.url()).searchParams.get('record');assert.ok(selectedId);assert.equal(await page.locator('main.pricebook-page > section.editor-section').count(),1);
  assert.equal(db.prepare('SELECT quoteId FROM appointments WHERE id=?').get(confirmed.result.appointmentId).quoteId,selectedId);
  check('Confirmed, pending and requested states stay distinct; booking opens its exact quote including separate work',{confirmed,pending,selectedId});
  await page.getByRole('navigation',{name:'Primary'}).getByRole('button',{name:'Calendar',exact:true}).click();
  await page.getByRole('tab',{name:'Availability'}).waitFor();await page.getByLabel('Week starting').fill(fromDate);await page.getByRole('button',{name:'Show week'}).click();
  changeProvider({mode:'busy-unavailable'});await page.getByRole('button',{name:'Refresh calendar'}).click();
  await requireText('Busy times could not be checked. This does not mean the calendar is free.');
  assert.equal(await page.locator('.calendar-busy li').count(),0);assert.equal(await page.getByRole('article').count(),3);
  changeProvider({mode:'normal'});await page.getByRole('button',{name:'Refresh calendar'}).click();await page.locator('.calendar-busy li').first().waitFor();
  check('Provider read failure clears stale busy times, preserves saved appointments, and recovers on refresh');
  const foreign=await app.owner('foreign-calendar');
  const other=await app.request('GET','/api/calendar/schedule?fromDate='+fromDate+'&days=7',undefined,foreign.token);
  assert.equal(other.status,200);assert.deepEqual(other.result.appointments,[]);assert.deepEqual(other.result.requests,[]);
  for(const query of ['ownerId='+f.owner.id,'days=0','days=32','days[]=7','fromDate=2026-02-31'])assert.equal((await app.request('GET','/api/calendar/schedule?'+query,undefined,f.owner.token)).status,400);
  assert.equal((await app.request('GET','/api/calendar/schedule')).status,401);
  const staffId=crypto.randomUUID(),account=db.prepare('SELECT * FROM users WHERE id=?').get(f.owner.id);
  db.prepare("INSERT INTO users (id,ownerId,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt) VALUES (?,?,?,?,?,?,'QuoteDone','active',?,'staff',?)").run(staffId,f.owner.id,'synthetic-calendar-staff@example.invalid',account.passwordHash,'Synthetic staff','Synthetic staff',timezone,new Date().toISOString());
  const staff=await app.request('POST','/api/auth/login',{email:'synthetic-calendar-staff@example.invalid',password:f.owner.password});assert.equal(staff.status,200);
  const staffSchedule=await app.request('GET','/api/calendar/schedule?fromDate='+fromDate+'&days=7',undefined,staff.result.token);
  assert.equal(staffSchedule.status,200);assert.equal(staffSchedule.result.canManage,false);assert.equal(staffSchedule.result.appointments.length,2);
  for(const [method,url,body] of [['PUT','/api/booking/settings',saved],['PUT','/api/booking/policies/'+f.id,{bookingMode:'book_job',durationMinutes:1,enabled:true}],['GET','/api/booking/configuration'],['POST','/api/onboarding/calendar',{skipped:true}],['GET','/api/onboarding/calendar/google/start']])assert.equal((await app.request(method,url,body,staff.result.token)).status,403);
  const raw=JSON.stringify(staffSchedule.result);for(const key of ['credentialsCiphertext','accessToken','refreshToken','providerEventId','policyRevision','mowingBaseRatePerSqft'])assert.equal(raw.includes(key),false);
  check('Real authentication, staff read-only access, tenant isolation, input validation and safe schedule projection',{other,staffSchedule});
  const staffPage=await browser.newPage({viewport:{width:390,height:844}});staffPage.setDefaultTimeout(30000);
  await staffPage.addInitScript(token=>localStorage.setItem('otc_token',token),staff.result.token);await staffPage.goto(site+'/dashboard');
  await staffPage.getByRole('combobox',{name:'Go to page'}).selectOption('/calendar');await staffPage.getByRole('heading',{name:'Calendar',exact:true}).waitFor();
  await staffPage.getByLabel('Week starting').fill(fromDate);await staffPage.getByRole('button',{name:'Show week'}).click();await staffPage.getByRole('article').first().waitFor();
  assert.equal(await staffPage.getByRole('tab',{name:'Availability'}).count(),0);assert.equal(await staffPage.getByRole('tab',{name:'Connection'}).count(),0);
  assert.equal(await staffPage.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
  await staffPage.screenshot({path:path.join(evidence,'calendar-staff-mobile.png'),fullPage:true});await staffPage.close();
  await page.setViewportSize({width:390,height:844});await tab('Availability');
  assert.equal(await page.getByLabel('Timezone',{exact:true}).inputValue(),timezone);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
  await page.screenshot({path:path.join(evidence,'calendar-availability-mobile.png'),fullPage:true});
  await tab('Connection');await page.screenshot({path:path.join(evidence,'calendar-connection-mobile.png'),fullPage:true});
  check('Owner availability and staff read-only calendar work on mobile with normal navigation');
  const records=Object.fromEntries(['bookingSettings','bookingPolicies','bookingIntents','bookingHolds','bookingIdempotency','bookingPreferences','appointments','quotes','leads'].map(table=>[table,db.prepare('SELECT * FROM '+table+' WHERE ownerId=?').all(f.owner.id)]));
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  fs.writeFileSync(path.join(evidence,'stored-records.json'),JSON.stringify(records,null,2));
  await app.restart();const reloaded=await app.request('GET','/api/calendar/schedule?fromDate='+fromDate+'&days=7',undefined,f.owner.token);assert.equal(reloaded.result.appointments.length,2);assert.equal(reloaded.result.requests.length,1);
  check('Settings, appointments and preferred-time requests survive a real application restart',{reloaded});
 }
 assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(evidence,'results.json'),JSON.stringify({mode,passed:true,rows},null,2));
 console.log(JSON.stringify({mode,passed:true,checks:rows.length}));
} catch(error){fs.writeFileSync(path.join(evidence,'failure.json'),JSON.stringify({rows,error:String(error.stack),errors},null,2));
 if(page&&!page.isClosed()){await page.screenshot({path:path.join(evidence,'failure.png'),fullPage:true}).catch(()=>{});fs.writeFileSync(path.join(evidence,'failure.html'),await page.content().catch(()=>''));}throw error;}
finally{
 fs.writeFileSync(path.join(evidence,'browser-http.json'),JSON.stringify(wire,null,2));
 await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));db?.close();await app.stop();
}
