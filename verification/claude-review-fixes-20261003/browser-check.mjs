import {createRequire} from 'node:module';import fs from 'node:fs';import crypto from 'node:crypto';import path from 'node:path';import {fileURLToPath} from 'node:url';
// Real-browser check of the three review fixes against the real API server (see run-local.sh).
// Synthetic local account and temporary SQLite store only; no provider or customer data.
const REPO=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const require=createRequire(path.join(REPO,'package.json'));
const Database=require('better-sqlite3');const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base='http://127.0.0.1:3201',out=process.env.EVIDENCE_DIR||'/tmp/otc-review-fixes/evidence';fs.mkdirSync(out,{recursive:true});
async function req(p,{token,body}={}){const r=await fetch(base+p,{method:body?'POST':'GET',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json().catch(()=>null)};}
const db=new Database(process.env.DATABASE_PATH||'/tmp/otc-review-fixes/app.sqlite');
const email='fixes-'+Date.now()+'@example.invalid',password=crypto.randomBytes(18).toString('base64url');
const reg=await req('/api/auth/register',{body:{plan:'QuoteDone',email,password,firstName:'Audit',businessName:'Review Fixes Co'}});
const id=reg.body.account.id,now=new Date().toISOString();
db.prepare("INSERT INTO billingAccounts (ownerId,stripeCustomerId,paymentMethodVerifiedAt,createdAt,updatedAt) VALUES (?,?,?,?,?)").run(id,'cus_f_'+id,now,now,now);
db.prepare("UPDATE users SET planStatus='active', emailVerifiedAt=? WHERE id=?").run(now,id);
const token=(await req('/api/auth/login',{body:{email,password}})).body.token;
const all=v=>Object.fromEntries(['labor','material','removal','prep','addon','equipment','travel','disposal','permit','overhead','surcharge'].map(k=>[k,v]));
const common={source:'MANUAL',active:true,tiers:[],feeRules:{travel:'not_applicable',disposal:'not_applicable',permit:'not_applicable',overhead:'not_applicable'},priceBasisByCategory:all('cost'),taxabilityByCategory:all(false)};
const services=[{...common,serviceType:'LANDSCAPING_MULCH',service:'Mulch beds',knownOfferings:{mulchType:{brown:crypto.randomUUID()}},pricing:{mulchMaterialPerYard:{brown:42.5},mulchInstallLaborPerYard:38,minimumServiceCharge:0}},
 {...common,serviceType:'FLOORING_INSTALL',service:'Tile floors',knownOfferings:{existingFloorType:{carpet:crypto.randomUUID()}},pricing:{laborPerSqft:{tile:4.15},materialPerSqft:{tile:3.6},removalPerSqft:{carpet:0.65},minimumJob:0,vinylPlankUnderlaymentRule:'never_included',perStepPrice:40}}];
const defaults={markupPercent:0,markupMode:'markup',overheadFixed:0,minimumJobPrice:0,travelFee:0,disposalFee:0,permitFee:0,taxMode:'TAX_NONE',taxPercent:0,rangeBufferPercent:0,markupApplies:all(true),peakMonths:[],peakSurchargePercent:0};
let book=await req('/api/pricebook/'+id,{token});
console.log('seed',(await req('/api/pricebook/save',{token,body:{revision:book.body.revision,services,defaults}})).status);
const browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1366,height:900}});
const errors=[];page.on('pageerror',e=>errors.push(String(e)));
await page.goto('http://127.0.0.1:4173/login');await page.waitForTimeout(1200);
const signIn=page.getByRole('button',{name:'Sign in'}).first();if(await signIn.count())await signIn.click();
await page.locator('input[type=email]').first().fill(email);await page.locator('input[type=password]').first().fill(password);
await page.locator('button[type=submit]').first().click();await page.waitForTimeout(2500);
await page.goto('http://127.0.0.1:4173/pricebook');await page.waitForTimeout(3500);
await page.locator('button.service-pick',{hasText:'Mulch beds'}).first().click();await page.waitForTimeout(2000);
const alerts=async()=>(await page.locator('[role=alert]').allInnerTexts()).filter(t=>t.trim());
// 1. Price table: punctuation accepted, leading number refused with a reason, duplicate refused with a reason
for(const d of await page.locator('details:not([open])').all()){try{await d.evaluate(el=>el.open=true);}catch{}}
console.log('all input labels:',JSON.stringify(await page.locator('input').evaluateAll(n=>n.map(x=>x.getAttribute('aria-label')||x.getAttribute('placeholder')).filter(Boolean))));
const addInputs=page.locator('input[aria-label$=" product name"], input[aria-label^="Add "]');const labels=await addInputs.evaluateAll(n=>n.map(x=>x.getAttribute('aria-label')));
console.log('price-table add inputs:',JSON.stringify(labels));
const tableInput=addInputs.first();const tableAdd=page.getByRole('button',{name:'Add offering'}).first();
for(const name of ["O'Brien cedar",'3-tab mix',"O'Brien cedar"]){await tableInput.fill(name);await tableAdd.click();await page.waitForTimeout(400);console.log('price table add',JSON.stringify(name),'-> alerts:',JSON.stringify(await alerts()));}
console.log('price table now shows O brien cedar row:',await page.getByText(/O brien cedar/i).count()>0);
// 2. Registered products (in Quote configuration): same name accepted, then duplicate refused
await page.getByText('Quote configuration',{exact:true}).first().click();await page.waitForTimeout(1200);
const reg1=page.locator('input[aria-label$=" product name"]').last();console.log('registry input:',await reg1.getAttribute('aria-label'));
for(const name of ["O'Brien cedar","O'Brien cedar",'3-tab mix']){await reg1.fill(name);await page.getByRole('button',{name:'Register offering'}).last().click();await page.waitForTimeout(400);console.log('register',JSON.stringify(name),'-> alerts:',JSON.stringify(await alerts()));}
await page.screenshot({path:out+'/mulch-names.png',fullPage:true});
// 3. Save through the UI, then read the stored book: both controls stored the same key
const priceInput=page.locator('input[aria-label="Mulch material price per cubic yard by mulch type O brien cedar"]');console.log('new row price input present:',await priceInput.count());await priceInput.fill('39.50');await page.waitForTimeout(500);
console.log('save button disabled:',await page.getByRole('button',{name:'Save & validate'}).first().isDisabled());
console.log('save-like buttons:',JSON.stringify(await page.getByRole('button',{name:/save/i}).allInnerTexts()));
page.on('response',async r=>{if(r.url().includes('/api/pricebook/')&&r.request().method()==='POST')console.log('POST',r.url().split('/api/')[1],r.status(),(await r.text().catch(()=>'')).slice(0,240));});
const saveResponse=page.waitForResponse(r=>r.url().includes('/api/pricebook/save'),{timeout:15000}).catch(()=>null);
await page.getByRole('button',{name:'Save & validate'}).first().click();const sr=await saveResponse;console.log('save response:',sr?sr.status():'none',sr?(await sr.text()).slice(0,200):'');await page.waitForTimeout(1500);console.log('alerts after save:',JSON.stringify(await alerts()));
book=await req('/api/pricebook/'+id,{token});const m=book.body.services.find(s=>s.serviceType==='LANDSCAPING_MULCH');
console.log('stored price-table keys:',JSON.stringify(Object.keys(m.pricing?.mulchMaterialPerYard||m.mulchMaterialPerYard||{})),'| stored registry keys:',JSON.stringify(Object.keys(m.knownOfferings?.mulchType||{})));
// 4. Approval review for the flooring service: retired price only under retained settings, shown as money
await page.locator('button.service-pick',{hasText:'Tile floors'}).first().click();await page.waitForTimeout(2000);
await page.getByRole('button',{name:'Review saved configuration'}).first().click();await page.waitForTimeout(2500);
const text=await page.evaluate(()=>document.body.innerText);fs.writeFileSync(out+'/flooring-approval.txt',text);await page.screenshot({path:out+'/flooring-approval.png',fullPage:true});
const table=text.slice(text.indexOf('SETTING'),text.indexOf('Retained settings from earlier pricing'));
console.log('approval table lists per-step price:',/per step/i.test(table),'| retained section line:',JSON.stringify((text.split('\n').find(l=>/per step/i.test(l)&&!/^Prices/.test(l))||'').trim()));
console.log('page errors:',JSON.stringify(errors));
await browser.close();
