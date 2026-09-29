import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

// Production-browser interface fixtures only. No provider is contacted.
const [rootArg,evidenceArg,mode='final']=process.argv.slice(2);
const root=path.resolve(rootArg),evidence=path.resolve(evidenceArg),dist=path.resolve(process.env.WIDGET_TEST_DIST||path.join(root,'client/dist'));
assert.equal(fs.existsSync(evidence),false,'Use a fresh evidence directory.');
fs.mkdirSync(evidence,{recursive:true});
fs.copyFileSync(fileURLToPath(import.meta.url),path.join(evidence,'executed-test.mjs'));
const require=createRequire(path.join(root,'package.json')),{chromium}=require(process.env.PRICEBOOK_BROWSER_MODULE);
const origin='http://127.0.0.1:4596',wire=[],rows=[],errors=[];
let browser,scenario='before',state={billingEnabled:true,providerAvailable:true,plan:'QuoteDone',planStatus:'pending_subscription',billingInterval:null,trialEndsAt:null,paymentFailedAt:null,graceEndsAt:null,currentPeriodEndAt:null,cancelAtPeriodEnd:false,checkoutState:'NONE',canCheckout:true,canManageBilling:false},mutation,statusCode=200;
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,origin),json=(status,body)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(body));};
  if(url.pathname.startsWith('/api/')){
   const chunks=[];for await(const part of req)chunks.push(part);const raw=Buffer.concat(chunks).toString();
   const row={scenario,method:req.method,path:url.pathname,key:req.headers['idempotency-key']||null,authenticated:!!req.headers.authorization,body:raw?JSON.parse(raw):null};wire.push(row);
   if(url.pathname==='/api/billing/status'&&req.method==='GET'){row.response=state;row.status=statusCode;json(statusCode,state);return;}
   if(url.pathname==='/api/auth/login'){json(200,{token:'synthetic-test-token'});return;}
   if(url.pathname.startsWith('/api/billing/')&&mutation){const answer=await mutation(row);if(answer.abort){row.response='[SYNTHETIC] acknowledgement lost';res.destroy();return;}row.status=answer.status||201;row.response=answer.body;json(row.status,answer.body);return;}
   json(403,{error:'[SYNTHETIC] Account access is unavailable.',code:'ACCOUNT_ACCESS_REQUIRED'});return;
  }
  let file=path.join(dist,url.pathname.slice(1));if(!path.extname(url.pathname))file=path.join(dist,'index.html');
  if(!file.startsWith(dist+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return;}
  res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));
 }catch(error){errors.push(String(error.stack));res.writeHead(500).end();}
});
const pendingState=()=>({billingEnabled:true,providerAvailable:true,plan:'QuoteDone',planStatus:'pending_subscription',billingInterval:null,trialEndsAt:null,paymentFailedAt:null,graceEndsAt:null,currentPeriodEndAt:null,cancelAtPeriodEnd:false,checkoutState:'NONE',canCheckout:true,canManageBilling:false});
const provider='https://checkout.example.invalid/session';
async function fresh({signedIn=true,url='/settings/billing',width=390}={}){
 const p=await browser.newPage({viewport:{width,height:844}});p.setDefaultTimeout(60000);p.setDefaultNavigationTimeout(120000);
 p.on('pageerror',error=>errors.push(String(error.stack)));
 if(signedIn)await p.addInitScript(()=>localStorage.setItem('otc_token','synthetic-test-token'));
 await p.route('https://checkout.example.invalid/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><h1>[SYNTHETIC] Provider destination</h1>'}));
 await p.goto(origin+url,{waitUntil:'domcontentloaded'});return p;
}
async function ready(p){await p.getByText('Subscription pending',{exact:true}).waitFor();}
async function choose(p,plan='QuoteDone',interval='monthly'){
 await p.getByLabel('Plan',{exact:true}).selectOption(plan);await p.getByLabel('Billing interval',{exact:true}).selectOption(interval);
}
async function destination(p){await p.getByRole('heading',{name:'[SYNTHETIC] Provider destination',exact:true}).waitFor();}
async function check(name,run,options){
 scenario=name;state=pendingState();statusCode=200;mutation=async()=>({body:{url:provider}});
 const start=wire.length;let p;
 try{p=await fresh(options);await run(p);rows.push({name,passed:true,requests:wire.slice(start)});}
 catch(error){rows.push({name,passed:false,error:String(error.stack),requests:wire.slice(start)});if(p){await p.screenshot({path:path.join(evidence,name+'.png'),fullPage:true}).catch(()=>{});fs.writeFileSync(path.join(evidence,name+'.txt'),await p.locator('body').innerText().catch(()=>''));}}
 finally{if(p)await p.close();fs.writeFileSync(path.join(evidence,'progress.json'),JSON.stringify({fixtureOnly:true,rows,wire,errors},null,2));}
}
try{
 await new Promise(resolve=>server.listen(4596,'127.0.0.1',resolve));
 browser=await chromium.launch({headless:true,executablePath:process.env.PRICEBOOK_BROWSER_EXECUTABLE,timeout:300000});
 fs.writeFileSync(path.join(evidence,'browser-runtime.json'),JSON.stringify({executable:process.env.PRICEBOOK_BROWSER_EXECUTABLE,version:browser.version()}));
 if(mode==='before'){
  const p=await fresh();
  await p.getByText('[SYNTHETIC] Account access is unavailable.',{exact:true}).waitFor();
  const observed={url:p.url(),billingHeading:await p.getByRole('heading',{name:'Billing',exact:true}).count(),billingActions:await p.getByRole('button',{name:/checkout|manage billing/i}).count(),text:await p.locator('body').innerText()};
  assert.equal(observed.billingHeading,0);assert.equal(observed.billingActions,0);rows.push({name:'Owner cannot reach billing while regular account access is unavailable',reproduced:true,observed});
  await p.screenshot({path:path.join(evidence,'missing-billing-entry.png'),fullPage:true});await p.close();
 }else{
  await check('pending-owner-can-start-checkout-on-mobile',async p=>{
   await ready(p);assert.equal(await p.getByRole('button',{name:'Continue to checkout',exact:true}).isEnabled(),false);
   await choose(p);await p.screenshot({path:path.join(evidence,'mobile-billing.png'),fullPage:true});
   assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await p.getByRole('button',{name:'Continue to checkout',exact:true}).click();await destination(p);
   const sent=wire.filter(r=>r.scenario===scenario&&r.method==='POST');assert.equal(sent.length,1);assert.equal(sent[0].path,'/api/billing/checkout');assert.deepEqual(sent[0].body,{plan:'QuoteDone',billingInterval:'monthly'});assert.ok(sent[0].key);assert.equal(sent[0].authenticated,true);
  });
  await check('canceled-owner-can-manage-billing',async p=>{
   state={...pendingState(),planStatus:'canceled',canManageBilling:true};await p.reload({waitUntil:'domcontentloaded'});await p.getByText('Canceled',{exact:true}).waitFor();
   assert.equal(await p.getByRole('button',{name:'Continue to checkout',exact:true}).count(),1);
   await p.getByRole('button',{name:'Manage billing',exact:true}).click();await destination(p);
   const sent=wire.filter(r=>r.scenario===scenario&&r.method==='POST');assert.equal(sent.length,1);assert.equal(sent[0].path,'/api/billing/portal');assert.deepEqual(sent[0].body,{});assert.ok(sent[0].key);
  });
  await check('return-query-does-not-activate-a-subscription',async p=>{
   await ready(p);assert.equal(await p.getByText('Active',{exact:true}).count(),0);assert.equal(wire.filter(r=>r.scenario===scenario&&r.method==='POST').length,0);
   state={...pendingState(),planStatus:'active',billingInterval:'monthly',canCheckout:false,canManageBilling:true};
   await p.getByRole('button',{name:'Refresh billing status',exact:true}).click();await p.getByText('Active',{exact:true}).waitFor();
   assert.equal(await p.getByRole('button',{name:'Continue to checkout',exact:true}).count(),0);assert.equal(await p.getByRole('button',{name:'Manage billing',exact:true}).count(),1);
  },{url:'/settings/billing?checkout=success&plan=Scale'});
  await check('uncertain-checkout-keeps-exact-body-and-key-after-reload',async p=>{
   await ready(p);let attempts=0;mutation=async()=>++attempts===1?{status:502,body:{code:'BILLING_PROVIDER_ERROR',error:'[SYNTHETIC] private provider diagnostic'}}:attempts===2?{status:409,body:{code:'CHECKOUT_IN_PROGRESS',error:'[SYNTHETIC] pending'}}:{body:{url:provider}};
   await choose(p,'Scale','annual');await p.getByRole('button',{name:'Continue to checkout',exact:true}).click();await p.getByRole('button',{name:'Resume checkout',exact:true}).waitFor();
   assert.ok(!(await p.locator('body').innerText()).includes('private provider diagnostic'));assert.equal(await p.getByLabel('Plan',{exact:true}).isEnabled(),false);
   await p.reload({waitUntil:'domcontentloaded'});await p.getByRole('button',{name:'Resume checkout',exact:true}).click();await p.getByText('Checkout is still being prepared. Retry the same request shortly.',{exact:true}).waitFor();
   await p.getByRole('button',{name:'Resume checkout',exact:true}).click();await destination(p);
   const sent=wire.filter(r=>r.scenario===scenario&&r.method==='POST');assert.equal(sent.length,3);for(const row of sent){assert.deepEqual(row.body,sent[0].body);assert.equal(row.key,sent[0].key);}
  });
  await check('uncertain-portal-keeps-exact-key-after-reload',async p=>{
   state={...pendingState(),planStatus:'active',canCheckout:false,canManageBilling:true};let attempts=0;mutation=async()=>++attempts===1?{status:502,body:{error:'[SYNTHETIC] provider timeout'}}:{body:{url:provider}};
   await p.reload({waitUntil:'domcontentloaded'});await p.getByRole('button',{name:'Manage billing',exact:true}).click();await p.getByRole('button',{name:'Retry opening billing',exact:true}).waitFor();
   await p.reload({waitUntil:'domcontentloaded'});await p.getByRole('button',{name:'Retry opening billing',exact:true}).click();await destination(p);
   const sent=wire.filter(r=>r.scenario===scenario&&r.method==='POST');assert.equal(sent.length,2);assert.equal(sent[1].key,sent[0].key);assert.deepEqual(sent[1].body,{});
  });
  await check('definite-rejection-allows-correction-with-new-key',async p=>{
   await ready(p);let attempts=0;mutation=async()=>++attempts===1?{status:400,body:{code:'INVALID_REQUEST',error:'[SYNTHETIC] rejected before creating checkout'}}:{body:{url:provider}};
   await choose(p);await p.getByRole('button',{name:'Continue to checkout',exact:true}).click();await p.getByRole('alert').waitFor();await choose(p,'Operator','annual');
   await p.getByRole('button',{name:'Continue to checkout',exact:true}).click();await destination(p);
   const sent=wire.filter(r=>r.scenario===scenario&&r.method==='POST');assert.equal(sent.length,2);assert.notEqual(sent[1].key,sent[0].key);assert.deepEqual(sent[1].body,{plan:'Operator',billingInterval:'annual'});
  });
  await check('malformed-success-cannot-navigate-or-activate',async p=>{
   await ready(p);mutation=async()=>({body:{url:'javascript:alert(1)'}});await choose(p);await p.getByRole('button',{name:'Continue to checkout',exact:true}).click();await p.getByRole('alert').waitFor();
   assert.ok(p.url().startsWith(origin));assert.equal(await p.getByText('Active',{exact:true}).count(),0);assert.equal(await p.getByRole('button',{name:'Resume checkout',exact:true}).count(),1);
  });
  await check('unavailable-provider-disables-all-provider-actions',async p=>{
   state={...pendingState(),providerAvailable:false,canManageBilling:true};await p.reload({waitUntil:'domcontentloaded'});await p.getByText('Billing is temporarily unavailable. Your account status is shown above.',{exact:true}).waitFor();
   assert.equal(await p.getByRole('button',{name:'Manage billing',exact:true}).isEnabled(),false);assert.equal(await p.getByLabel('Plan',{exact:true}).isEnabled(),false);assert.equal(wire.filter(r=>r.scenario===scenario&&r.method==='POST').length,0);
  });
  await check('non-owner-cannot-see-billing-mutation-controls',async p=>{
   statusCode=403;state={error:'[SYNTHETIC] owner required'};await p.reload({waitUntil:'domcontentloaded'});await p.getByText('Billing is unavailable for this account. Only the business owner can manage billing.',{exact:true}).waitFor();
   assert.equal(await p.getByRole('button',{name:'Continue to checkout',exact:true}).count(),0);assert.equal(await p.getByRole('button',{name:'Manage billing',exact:true}).count(),0);
  });
  await check('blocked-dashboard-retains-mobile-settings-entry',async p=>{
   await p.getByRole('button',{name:'Settings',exact:true}).click();await ready(p);assert.equal(await p.getByRole('heading',{name:'Billing',exact:true}).count(),1);
  },{url:'/dashboard'});
  await check('sign-in-can-reach-billing-without-paid-dashboard-access',async p=>{
   await p.getByRole('button',{name:'Sign in',exact:true}).first().click();await p.getByLabel('Email',{exact:true}).fill('synthetic@example.invalid');await p.getByLabel('Password',{exact:true}).fill('synthetic-password');await p.locator('button[type=submit]').click();await ready(p);
   assert.ok(p.url().includes('/settings/billing'));
  },{signedIn:false,url:'/settings/billing'});
 }
}catch(error){rows.push({scenario,passed:false,error:String(error.stack)});process.exitCode=1;}
finally{
 if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));
 const built={};function bind(dir,prefix=''){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const name=prefix+entry.name,full=path.join(dir,entry.name);if(entry.isDirectory())bind(full,name+'/');else built[name]=crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');}}bind(dist);
 const passed=rows.length>0&&rows.every(row=>row.passed||row.reproduced)&&errors.length===0;
 fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({passed,fixtureOnly:true,realBillingVerified:false,mode,rows,wire,errors,buildFiles:built},null,2));
 if(!passed)process.exitCode=1;console.log(JSON.stringify({mode,passed,rows:rows.map(({name,passed,reproduced,error})=>({name,passed,reproduced,error})),errors},null,2));
}