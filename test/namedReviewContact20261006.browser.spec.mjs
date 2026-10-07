import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {buildKnowledgeScreen} from './websitePriceBrowserFixture.mjs';
import {db,seed,knowledgeApp,getBusinessProfile,saveKnowledgeBase} from './namedReviewContact20261006.fixture.mjs';
let browser,bundle;
test.before(async()=>{
  bundle=await buildKnowledgeScreen();
  const {chromium}=createRequire(import.meta.url)(process.env.PRICEBOOK_BROWSER_MODULE||'playwright');
  browser=await chromium.launch({headless:true,...(process.env.PRICEBOOK_BROWSER_EXECUTABLE?{executablePath:process.env.PRICEBOOK_BROWSER_EXECUTABLE}:{})});
});
test.after(async()=>{await browser?.close();db.close();});
async function screen(t,{saved}={}){
  const owner=seed();if(saved)saveKnowledgeBase(owner.id,{about:'[SYNTHETIC] Test business',hours:'Weekdays',reviewContact:saved});
  const h=await knowledgeApp(t),page=await browser.newPage();t.after(()=>page.close());
  await page.setExtraHTTPHeaders({Authorization:'Bearer '+owner.token});
  h.app.get('/',(_req,res)=>res.type('html').send('<style>'+bundle.styles.replaceAll('</style','<\\/style')+'</style><div id="root"></div><script>'+bundle.script.replaceAll('</script','<\\/script')+'</script>'));
  async function open(){
    await page.goto(h.origin);await page.evaluate(async()=>window.mount(await(await fetch('/synthetic/state')).json()));
    await page.getByLabel('Name',{exact:true}).waitFor();
  }
  await open();return {owner,page,open,h};
}
test('named review contact signup prefill remains unconfirmed until save and survives reopening',async t=>{
  const {owner,page,open}=await screen(t);
  assert.equal(await page.getByLabel('Name',{exact:true}).inputValue(),'Synthetic Casey');
  assert.equal(getBusinessProfile(owner.id).knowledgeBase.reviewContact,undefined);
  await page.getByLabel('Name',{exact:true}).fill('Synthetic Morgan');await page.getByLabel('Role',{exact:true}).selectOption('manager');
  await page.getByText('“Let me check with Synthetic Morgan on that. What\'s the best number for a callback?”',{exact:true}).waitFor();
  assert.equal(getBusinessProfile(owner.id).knowledgeBase.reviewContact,undefined);
  await page.getByRole('button',{name:'Review and save',exact:true}).click();await page.waitForFunction(()=>window.saved===true);
  assert.deepEqual(getBusinessProfile(owner.id).knowledgeBase.reviewContact,{name:'Synthetic Morgan',role:'manager'});
  await open();assert.equal(await page.getByLabel('Name',{exact:true}).inputValue(),'Synthetic Morgan');assert.equal(await page.getByLabel('Role',{exact:true}).inputValue(),'manager');
});
test('named review contact AI draft, empty edit and rejected save preserve the confirmed person',async t=>{
  const contact={name:'Synthetic Morgan',role:'manager'}, {owner,page,open}=await screen(t,{saved:contact});
  await page.getByRole('button',{name:'Draft from my business',exact:true}).click();await page.getByText('DRAFT',{exact:true}).waitFor();
  assert.equal(await page.getByLabel('Name',{exact:true}).inputValue(),contact.name);assert.deepEqual(getBusinessProfile(owner.id).knowledgeBase.reviewContact,contact);
  await page.getByLabel('Name',{exact:true}).fill('');assert.equal(await page.getByRole('button',{name:'Review and save',exact:true}).isDisabled(),true);
  await page.getByLabel('Name',{exact:true}).fill('<Synthetic>');await page.getByRole('button',{name:'Review and save',exact:true}).click();
  await page.getByText(/Review contact needs a name/).waitFor();assert.deepEqual(getBusinessProfile(owner.id).knowledgeBase.reviewContact,contact);
  await open();assert.equal(await page.getByLabel('Name',{exact:true}).inputValue(),contact.name);
});
