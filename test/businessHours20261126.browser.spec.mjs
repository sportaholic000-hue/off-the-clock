import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {httpFixture} from './leadCaptureRepair20261006HttpFixture.mjs';

// Business hours end to end: the real server, real database and real compiled
// owner app in Chromium, at desktop and phone widths. No provider is contacted.
// HANDWRITTEN EXPECTATIONS, before execution:
// - Business knowledge: adding Monday 08:00–17:00 and copying it to Tuesday–Friday
//   shows "Monday to Friday: 8:00 AM to 5:00 PM. Saturday and Sunday: closed." and
//   saves that week; the receptionist's hours text is that sentence;
// - Receptionist: "Transfer during my business hours" is ticked; saving makes the
//   transfer windows the week;
// - Calendar availability: "Take appointments during my business hours" is ticked;
//   saving makes booking availability the week;
// - Reports: after-hours calls are counted against those hours, named in a sentence;
// - no page scrolls sideways at 390 px or 1280 px, and no page error is raised.
const WEEK={mon:[{start:'08:00',end:'17:00'}],tue:[{start:'08:00',end:'17:00'}],wed:[{start:'08:00',end:'17:00'}],thu:[{start:'08:00',end:'17:00'}],fri:[{start:'08:00',end:'17:00'}],sat:[],sun:[]};
const TEXT='Monday to Friday: 8:00 AM to 5:00 PM. Saturday and Sunday: closed.';
const SHOTS=process.env.BUSINESS_HOURS_SCREENSHOTS||'';

test('business hours browser: one week feeds the receptionist, transfers, booking and reports',{timeout:180000},async t=>{
  const {chromium}=createRequire(import.meta.url)(process.env.PRICEBOOK_BROWSER_MODULE||'playwright');
  const browser=await chromium.launch({headless:true,...(process.env.PRICEBOOK_BROWSER_EXECUTABLE?{executablePath:process.env.PRICEBOOK_BROWSER_EXECUTABLE}:{})});t.after(()=>browser.close());
  const f=await httpFixture(t),owner='synthetic-a';
  f.db.prepare("UPDATE users SET plan='Operator',planStatus='active',timezone='America/Moncton' WHERE id=?").run(owner);
  const kb=()=>JSON.parse(f.db.prepare('SELECT knowledgeBaseJson FROM businessProfiles WHERE ownerId=?').get(owner).knowledgeBaseJson||'{}');
  const start=kb();
  f.db.prepare('UPDATE businessProfiles SET knowledgeBaseJson=? WHERE ownerId=?').run(JSON.stringify({...start,about:start.about||'[SYNTHETIC] Fences in Saint John',hours:'',weeklyHours:undefined,transferWindows:undefined,
    transferNumber:start.transferNumber||'+15065550188',reviewContact:start.reviewContact||{name:'[PLACEHOLDER] Pat',role:'owner'},serviceArea:start.serviceArea||{mode:'all',cities:[]}}),owner);
  const errors=[];
  async function page(width){
    const p=await browser.newPage({viewport:{width,height:900}});p.on('pageerror',error=>errors.push(error.message));
    await p.goto(f.base+'/login');await p.evaluate(token=>localStorage.setItem('otc_token',token),f.tokens[owner]);return p;
  }
  const noSideScroll=async(p,label)=>assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),label+' scrolls sideways');
  const shot=async(p,name)=>{if(SHOTS)await p.screenshot({path:`${SHOTS}/${name}.png`,fullPage:true});};
  const desk=await page(1280);

  await t.test('business knowledge: enter Monday, copy to the weekdays, save',async()=>{
    await desk.goto(f.base+'/settings?section=knowledge');
    await desk.getByRole('button',{name:'Add Monday hours',exact:true}).click();
    await desk.getByLabel('Monday opens 1',{exact:true}).fill('08:00');await desk.getByLabel('Monday closes 1',{exact:true}).fill('17:00');
    await desk.getByRole('button',{name:'Copy Monday to Tuesday–Friday',exact:true}).click();
    await desk.getByText('Hours your receptionist gives callers:',{exact:false}).waitFor();
    assert.match(await desk.locator('fieldset.business-hours').innerText(),new RegExp(TEXT.replace(/[.]/g,'\\.')));
    await noSideScroll(desk,'knowledge 1280');await shot(desk,'knowledge-1280');
    const [response]=await Promise.all([desk.waitForResponse(r=>r.url().endsWith('/api/onboarding/knowledge-base')&&r.request().method()==='POST'),desk.getByRole('button',{name:'Save',exact:true}).click()]);
    assert.equal(response.status(),200,await response.text());
    assert.deepEqual(kb().weeklyHours,WEEK);assert.equal(kb().hours,TEXT);
  });

  await t.test('receptionist: transfers follow business hours',async()=>{
    await desk.goto(f.base+'/settings');
    const box=desk.getByLabel('Transfer during my business hours',{exact:true});await box.waitFor();
    assert.equal(await box.isChecked(),true);
    assert.match(await desk.locator('main').innerText(),new RegExp(TEXT.replace(/[.]/g,'\\.')+' Change these under Settings, Business knowledge\\.'));
    await noSideScroll(desk,'receptionist 1280');await shot(desk,'receptionist-1280');
    const [response]=await Promise.all([desk.waitForResponse(r=>r.url().endsWith('/api/onboarding/voice')&&r.request().method()==='POST'),desk.getByRole('button',{name:'Save',exact:true}).click()]);
    assert.equal(response.status(),200,await response.text());
    assert.equal(kb().transferUsesBusinessHours,true);assert.deepEqual(kb().transferWindows,WEEK);
  });

  await t.test('calendar: availability follows business hours',async()=>{
    await desk.goto(f.base+'/calendar');
    await desk.getByRole('tab',{name:'Availability',exact:true}).click();
    const box=desk.getByLabel('Take appointments during my business hours',{exact:true});await box.waitFor();
    assert.equal(await box.isChecked(),true);
    assert.equal(await desk.locator('section[aria-label="Availability settings"] legend',{hasText:'Monday'}).count(),0,'day rows hidden');
    await noSideScroll(desk,'calendar 1280');await shot(desk,'calendar-1280');
    const form=desk.locator('section[aria-label="Availability settings"]');
    for(const [label,value] of [['Days ahead customers can book','30'],['Minimum notice (minutes)','60'],['Start time intervals (minutes)','30'],['Buffer before appointments (minutes)','0'],['Buffer after appointments (minutes)','0']])
      await form.getByLabel(label,{exact:true}).fill(value);
    const [response]=await Promise.all([desk.waitForResponse(r=>r.url().endsWith('/api/booking/settings')&&r.request().method()==='PUT'),desk.getByRole('button',{name:'Save availability',exact:true}).click()]);
    assert.equal(response.status(),200,await response.text());
    const saved=JSON.parse(f.db.prepare('SELECT weeklyAvailabilityJson FROM bookingSettings WHERE ownerId=?').get(owner).weeklyAvailabilityJson);
    for(const day of Object.keys(WEEK))assert.deepEqual(saved[day],WEEK[day],day);
    assert.equal(kb().bookingUsesBusinessHours,true);
  });

  await t.test('reports: after-hours uses the business hours',async()=>{
    await desk.goto(f.base+'/reports');
    await desk.getByText('After-hours calls are counted against your business hours:',{exact:false}).waitFor();
    assert.match(await desk.locator('main').innerText(),new RegExp('After-hours calls are counted against your business hours: '+TEXT.replace(/[.]/g,'\\.')+' Change them under Settings, Business knowledge\\.'));
    await shot(desk,'reports-1280');
  });

  await t.test('phone width: the same pages fit at 390 px',async()=>{
    const phone=await page(390);
    for(const [path,name] of [['/settings?section=knowledge','knowledge-390'],['/settings','receptionist-390'],['/calendar','calendar-390'],['/reports','reports-390']]){
      await phone.goto(f.base+path);await phone.waitForLoadState('networkidle');
      if(path==='/calendar'){await phone.getByRole('tab',{name:'Availability',exact:true}).click();await phone.getByLabel('Take appointments during my business hours',{exact:true}).waitFor();}
      await noSideScroll(phone,name);await shot(phone,name);
    }
  });
  assert.deepEqual(errors,[]);
});

// HANDWRITTEN EXPECTATIONS, before execution: during setup, step 5 cannot continue
// until a day has hours; saving stores the week and moves to step 6; step 9 has
// "Transfer during my business hours" ticked with the hours named; 390 px fits.
test('business hours browser: the setup steps',{timeout:180000},async t=>{
  const {chromium}=createRequire(import.meta.url)(process.env.PRICEBOOK_BROWSER_MODULE||'playwright');
  const browser=await chromium.launch({headless:true,...(process.env.PRICEBOOK_BROWSER_EXECUTABLE?{executablePath:process.env.PRICEBOOK_BROWSER_EXECUTABLE}:{})});t.after(()=>browser.close());
  const f=await httpFixture(t),owner='synthetic-b';
  f.db.prepare("UPDATE users SET plan='Operator',planStatus='active',timezone='America/Moncton' WHERE id=?").run(owner);
  const kb=()=>JSON.parse(f.db.prepare('SELECT knowledgeBaseJson FROM businessProfiles WHERE ownerId=?').get(owner).knowledgeBaseJson||'{}');
  f.db.prepare('UPDATE businessProfiles SET onboardingStep=5,knowledgeBaseJson=? WHERE ownerId=?').run(JSON.stringify({about:'[SYNTHETIC] Fences',reviewContact:{name:'[PLACEHOLDER] Pat',role:'owner'},serviceArea:{mode:'all',cities:[]},transferNumber:'+15065550188'}),owner);
  const errors=[],p=await browser.newPage({viewport:{width:390,height:900}});p.on('pageerror',error=>errors.push(error.message));
  await p.goto(f.base+'/login');await p.evaluate(token=>localStorage.setItem('otc_token',token),f.tokens[owner]);
  await p.goto(f.base+'/onboarding?step=5');
  await p.getByRole('button',{name:'Add Monday hours',exact:true}).waitFor();
  const next=p.locator('.step-actions button').last();
  assert.equal(await next.isDisabled(),true,'no hours yet');
  await p.getByRole('button',{name:'Add Monday hours',exact:true}).click();
  await p.getByLabel('Monday opens 1',{exact:true}).fill('08:00');await p.getByLabel('Monday closes 1',{exact:true}).fill('17:00');
  assert.equal(await next.isDisabled(),false);
  const [response]=await Promise.all([p.waitForResponse(r=>r.url().endsWith('/api/onboarding/knowledge-base')&&r.request().method()==='POST'),next.click()]);
  assert.equal(response.status(),200,await response.text());
  assert.deepEqual(kb().weeklyHours.mon,[{start:'08:00',end:'17:00'}]);assert.equal(kb().hours,'Monday: 8:00 AM to 5:00 PM. Tuesday to Sunday: closed.');
  await p.waitForURL(/step=6/);
  await p.goto(f.base+'/onboarding?step=9');
  const box=p.getByLabel('Transfer during my business hours',{exact:true});await box.waitFor();
  assert.equal(await box.isChecked(),true);
  assert.match(await p.locator('main').innerText(),/Monday: 8:00 AM to 5:00 PM\. Tuesday to Sunday: closed\. Change these under Settings, Business knowledge\./);
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'step 9 scrolls sideways');
  assert.deepEqual(errors,[]);
});
