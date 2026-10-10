import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {httpFixture,seedViews} from './leadCaptureRepair20261006HttpFixture.mjs';

test('owner dashboard browser: real compiled calls, review, progression, reports and staff boundaries',{timeout:90000},async t=>{
  const {chromium}=createRequire(import.meta.url)(process.env.PRICEBOOK_BROWSER_MODULE||'playwright');
  const browser=await chromium.launch({headless:true,...(process.env.PRICEBOOK_BROWSER_EXECUTABLE?{executablePath:process.env.PRICEBOOK_BROWSER_EXECUTABLE}:{})});t.after(()=>browser.close());
  const f=await httpFixture(t),s=await seedViews(f),p=await browser.newPage(),errors=[];p.on('pageerror',error=>errors.push(error.message));
  f.db.prepare('UPDATE calls SET minutesBilled=3,transportOutcome=?,transcriptJson=? WHERE ownerId=? AND id=?').run('SYNTHETIC_TRANSPORT',JSON.stringify([{role:'caller',text:'[SYNTHETIC] Searchable cedar gate words'}]),s.c.ownerId,s.c.callSid);
  await p.goto(f.base+'/login');await p.evaluate(token=>localStorage.setItem('otc_token',token),f.tokens['synthetic-a']);
  await t.test('search, filters, deep link, stored billing and text transcript download',async()=>{
    await p.goto(f.base+'/calls');await p.getByLabel('Search calls',{exact:true}).fill('Searchable cedar');await p.getByRole('button',{name:'Apply filters',exact:true}).click();
    await p.getByText('1 calls',{exact:true}).waitFor();await p.getByRole('button').filter({hasText:'Initial captured gate'}).click();
    await p.getByRole('heading',{name:'Transcript',exact:true}).waitFor();assert.match(await p.locator('main').innerText(),/Billed minutes\s+3/);assert.match(await p.locator('main').innerText(),/SYNTHETIC_TRANSPORT/);
    const [download]=await Promise.all([p.waitForEvent('download'),p.getByRole('button',{name:'Download transcript',exact:true}).click()]);assert.match(await readFile(await download.path(),'utf8'),/Searchable cedar gate words/);
    await p.reload();await p.getByText('[SYNTHETIC] Searchable cedar gate words',{exact:true}).waitFor();
  });
  let quoteId;
  await t.test('owner reviews captured lead and retains customer material qualification',async()=>{
    await p.goto(f.base+'/leads?record='+s.row.id);await p.getByLabel('Follow-up action',{exact:true}).selectOption('REVIEW');
    await p.getByLabel('Follow-up note',{exact:true}).fill('[SYNTHETIC] Owner checked gate measurements');
    await p.getByLabel('Low estimate',{exact:true}).fill('100.10');await p.getByLabel('High estimate',{exact:true}).fill('120.20');
    await p.getByLabel('Currency',{exact:true}).selectOption('CAD');await p.getByLabel('Priced scope',{exact:true}).fill('[SYNTHETIC] Gate labor only');
    await p.getByLabel('Materials and qualifications',{exact:true}).fill('[SYNTHETIC] Customer supplies all materials');await p.getByLabel('Tax treatment',{exact:true}).selectOption('No tax added.');
    const [response]=await Promise.all([p.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/actions')),p.getByRole('button',{name:'Save action',exact:true}).click()]);assert.equal(response.status(),200);quoteId=(await response.json()).workflow.reviewedQuoteId;
    await p.getByRole('button',{name:'Open reviewed quote',exact:true}).click();await p.getByText('[SYNTHETIC] Gate labor only',{exact:true}).first().waitFor();assert.match(await p.locator('main').innerText(),/100.10/);assert.match(await p.locator('main').innerText(),/Customer supplies all materials/);
  });
  await t.test('owner records real progression without caller delivery and saves an exact invoice',async()=>{
    for(const action of ['SENT','VIEWED','ACCEPTED','INVOICED']){
      await p.getByLabel('Follow-up action',{exact:true}).selectOption(action);await p.getByLabel('Follow-up note',{exact:true}).fill('[SYNTHETIC] Outside-app event '+action);
      if(action==='INVOICED')await p.getByLabel('Final invoice amount (CAD)',{exact:true}).fill('110.15');
      await p.getByLabel('I confirm this event happened outside the app.').check();
      const [response]=await Promise.all([p.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/actions')),p.getByRole('button',{name:'Save action',exact:true}).click()]);assert.equal(response.status(),200);
      await p.getByText('Action saved.',{exact:true}).waitFor();
    }
    assert.equal(f.db.prepare('SELECT finalInvoiceAmount FROM quotes WHERE ownerId=? AND id=?').get(s.c.ownerId,quoteId).finalInvoiceAmount,11015);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM voiceSmsDeliveries WHERE ownerId=?').get(s.c.ownerId).n,0);
  });
  await t.test('reports expose period, actual value and funnel with an explicit unknown after-hours count',async()=>{
    await p.goto(f.base+'/reports');await p.getByLabel('Period',{exact:true}).selectOption('all');
    const [response]=await Promise.all([p.waitForResponse(r=>new URL(r.url()).pathname==='/api/reports'&&new URL(r.url()).searchParams.get('period')==='all'),p.getByRole('button',{name:'Show report',exact:true}).click()]);assert.equal(response.status(),200);
    await p.getByText(/^All recorded activity · /).waitFor();await p.getByRole('heading',{name:'Service funnel',exact:true}).waitFor();
    const reportText=await p.locator('main').innerText();assert.match(reportText,/CAD \$110.15/);assert.match(reportText,/After-hours classification is unknown/);
    await p.getByText('Business hours for after-hours reporting',{exact:true}).click();assert.equal(await p.getByRole('button',{name:'Save business hours',exact:true}).count(),1);
  });
  await t.test('staff has safe work-area reads but no owner review or reports',async()=>{
    await p.evaluate(token=>{localStorage.setItem('otc_token',token);window.dispatchEvent(new Event('otc:session'));},f.tokens['synthetic-staff']);
    await p.goto(f.base+'/leads?record='+s.row.id);await p.getByLabel('Follow-up action',{exact:true}).waitFor();assert.equal(await p.locator('option[value="REVIEW"]').count(),0);
    await p.goto(f.base+'/reports');await p.waitForURL(f.base+'/calls');await p.getByRole('heading',{name:'Calls',exact:true}).waitFor();
    assert.equal(await p.getByText('Business hours for after-hours reporting',{exact:true}).count(),0);
    assert.doesNotMatch(await p.locator('main').innerText(),/OTHER TENANT|foreign@example.invalid|SECRET_COST/);
  });
  assert.deepEqual(errors,[]);
});
