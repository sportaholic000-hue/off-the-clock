import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {buildScreens,EXPECTED_AREA,missingConfiguration} from './leadsAreaUI20261010Fixture.mjs';
import {db,seed,knowledgeApp,getBusinessProfile} from './namedReviewContact20261006.fixture.mjs';

// Handwritten before execution: each eligible plan can enter and reload the
// exact Halifax/NS/CA city policy, then all areas; duplicate rows cannot replace
// the saved policy. Calendar displays the three global and one service blocker.
let browser,bundle;test.before(async()=>{bundle=await buildScreens();const {chromium}=createRequire(import.meta.url)(process.env.PRICEBOOK_BROWSER_MODULE||'playwright');browser=await chromium.launch({headless:true,...(process.env.PRICEBOOK_BROWSER_EXECUTABLE?{executablePath:process.env.PRICEBOOK_BROWSER_EXECUTABLE}:{})});});
test.after(async()=>{await browser?.close();db.close();});
async function screen(t,plan){
  const owner=seed(),h=await knowledgeApp(t),page=await browser.newPage();t.after(()=>page.close());
  await page.setExtraHTTPHeaders({Authorization:'Bearer '+owner.token});
  h.app.get('/',(_req,res)=>res.type('html').send('<style>'+bundle.styles.replaceAll('</style','<\\/style')+'</style><div id="root"></div><script>'+bundle.script.replaceAll('</script','<\\/script')+'</script>'));
  async function open(){await page.goto(h.origin);await page.evaluate(async plan=>{const state=await(await fetch('/synthetic/state')).json();window.mountKnowledge({...state,account:{...state.account,plan}});},plan);await page.getByLabel('Where do you work?').waitFor();}
  await open();return {owner,page,open};
}
for(const plan of ['Operator','QuoteDone'])test(`${plan}: service-area city entry, validation, save and reopening in Chromium`,async t=>{
  const {owner,page,open}=await screen(t,plan);
  await page.getByLabel('Where do you work?').selectOption('cities');
  await page.getByLabel('City 1',{exact:true}).fill(' Halifax ');await page.getByLabel('Province/state 1',{exact:true}).fill('NS');await page.getByLabel('Country code 1',{exact:true}).fill('ca');
  await page.getByRole('button',{name:'Review and save',exact:true}).click();await page.waitForFunction(()=>window.saved);
  assert.deepEqual(getBusinessProfile(owner.id).knowledgeBase.serviceArea,EXPECTED_AREA);
  await open();assert.equal(await page.getByLabel('City 1',{exact:true}).inputValue(),'Halifax');
  await page.getByRole('button',{name:'Add city',exact:true}).click();await page.getByLabel('City 2',{exact:true}).fill('halifax');await page.getByLabel('Province/state 2',{exact:true}).fill('ns');await page.getByLabel('Country code 2',{exact:true}).fill('CA');
  await page.getByRole('button',{name:'Review and save',exact:true}).click();await page.getByText('Service-area cities must be unique.',{exact:true}).waitFor();assert.deepEqual(getBusinessProfile(owner.id).knowledgeBase.serviceArea,EXPECTED_AREA);
  await page.getByLabel('Where do you work?').selectOption('all');await page.getByRole('button',{name:'Review and save',exact:true}).click();await page.waitForFunction(()=>window.saved);
  assert.deepEqual(getBusinessProfile(owner.id).knowledgeBase.serviceArea,{mode:'all',cities:[]});await open();assert.equal(await page.getByLabel('Where do you work?').inputValue(),'all');
});
test('Calendar exposes missing booking requirements and links to service-area setup in Chromium',async t=>{
  const {page}=await screen(t,'Operator');await page.evaluate(c=>window.mountRequirements(c),missingConfiguration);
  await page.getByRole('heading',{name:'Booking requirements',exact:true}).waitFor();
  for(const text of ['Save booking hours and scheduling rules.','Connect a destination calendar.','Configure a structured service area before direct booking.','Choose a valid service duration.'])await page.getByText(text,{exact:true}).waitFor();
  await page.getByRole('button',{name:'Set service area',exact:true}).click();assert.ok(page.url().endsWith('/onboarding?step=5'));
});
