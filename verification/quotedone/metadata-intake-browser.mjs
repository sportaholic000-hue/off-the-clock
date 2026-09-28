import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {startApplication} from './application-harness.mjs';
import {mowingFixture} from './repair-fixture.mjs';

const [root,evidence]=process.argv.slice(2).map(v=>path.resolve(v));
const require=createRequire(path.join(root,'package.json'));
const {chromium}=require(process.env.PRICEBOOK_BROWSER_MODULE),Database=require('better-sqlite3');
const app=await startApplication(root,evidence,{port:4507});
const ui='http://127.0.0.1:4508',rows=[],logs=[],wire=[];
const ready='INSTANT_ESTIMATE_READY',review='ESTIMATE_REQUIRES_REVIEW';
let browser,vite,db;
try {
  const f=await mowingFixture(app,'metadata-browser',[ui]),saved=await f.read();
  db=new Database(path.join(evidence,'application.sqlite'));
  const stored=body=>db.prepare('SELECT * FROM quoteSubmissions WHERE ownerId=? AND requestId=?').get(f.owner.id,body.requestId);
  vite=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','4508','--strictPort'],{cwd:path.join(root,'client'),env:{...app.env,VITE_API_URL:app.base},windowsHide:true,stdio:['ignore','pipe','pipe']});
  vite.stdout.on('data',b=>logs.push(String(b)));vite.stderr.on('data',b=>logs.push(String(b)));
  let running=false;
  for(let i=0;i<1200;i++){if(vite.exitCode!==null)throw Error(logs.join(''));try{if((await fetch(ui)).ok){running=true;break;}}catch{}await delay(100);}
  assert.ok(running,'Vite starts');
  browser=await chromium.launch({headless:true,executablePath:process.env.PRICEBOOK_BROWSER_EXECUTABLE});
  async function newPage(){const p=await browser.newPage({viewport:{width:1440,height:1100}});p.setDefaultTimeout(60000);p.setDefaultNavigationTimeout(120000);p.on('pageerror',e=>logs.push('PAGE ERROR '+e.stack));return p;}
  async function form(p,fields={}) {
    await p.goto(ui+'/quote/'+f.access.publicKey);
    await p.getByLabel('Service',{exact:true}).selectOption(f.id);
    for(const [key,value]of Object.entries(f.inputs)){
      const field=f.meta.services.find(s=>s.serviceType==='LANDSCAPING_MOWING').customerFields.find(field=>field.name===key);
      if(field.type==='number')await p.getByLabel(field.label,{exact:true}).fill(String(value));
      else await p.getByRole('combobox',{name:field.label,exact:true}).selectOption(String(value));
    }
    for(const [label,value]of Object.entries({Email:'synthetic@example.invalid',...fields}))await p.getByLabel(label,{exact:true}).fill(value);
  }
  async function send(p,status=201){
    const waiting=p.waitForResponse(r=>r.url().endsWith(f.url)&&r.request().method()==='POST');
    await p.getByRole('button',{name:'Submit estimate request',exact:true}).click();
    const r=await waiting,result=await r.json(),body=r.request().postDataJSON();
    wire.push({status:r.status(),body,result});assert.equal(r.status(),status);return {body,result};
  }
  const extra='Today please. Include hedge trimming and removal in this same estimate.';
  const uncertain='Please call today. The 10000 square feet is a guess; the lawn has not been measured.';
  const cases=[
    {name:'complete measured email-only quote',fields:{},expected:ready},
    {name:'complete measured phone-only quote',fields:{Email:'',Phone:'+1 (902) 555-0123'},expected:ready},
    {name:'additional scope in urgency',fields:{Urgency:extra},expected:review},
    {name:'measurement uncertainty in urgency',fields:{Urgency:uncertain},expected:review},
    {name:'additional scope in location',fields:{'Project location':'123 Synthetic Street. '+extra},expected:review},
    {name:'additional scope in contact name',fields:{Name:extra},expected:review},
    {name:'uncertainty in alternate phone',fields:{Phone:uncertain},expected:review},
    {name:'scope in alternate email',fields:{Email:extra,Phone:'555-0123'},expected:review},
  ];
  for(const [index,c]of cases.entries()){
    const p=await newPage();await form(p,c.fields);
    await p.screenshot({path:path.join(evidence,index+'-input.png'),fullPage:true});
    const {body,result}=await send(p),row={name:c.name,expected:c.expected,body,result};rows.push(row);
    assert.deepEqual(body.customerInputs,f.inputs);assert.equal(result.resultType,c.expected,c.name);
    if(c.expected===ready){assert.equal(result.midEstimate,50);await p.getByRole('heading',{name:'Estimate',exact:true}).waitFor();assert.equal(await p.getByText('$50',{exact:true}).count(),1);}
    else {for(const key of ['lowEstimate','midEstimate','highEstimate','options'])assert.equal(Object.hasOwn(result,key),false);await p.getByText('Request saved for review',{exact:true}).waitFor();assert.equal(await p.getByRole('heading',{name:'Estimate',exact:true}).count(),0);}
    const receipt=stored(body);assert.ok(receipt);assert.deepEqual(JSON.parse(receipt.originalSubmissionJson),body);assert.deepEqual(JSON.parse(receipt.customerResponseJson),result);
    if(c.expected===review){const lead=await f.call('GET','/api/leads/'+receipt.recordId);for(const key of ['contact','location','urgency'])assert.deepEqual(lead[key],body[key]);}
    row.stored=receipt;row.visibleText=await p.locator('body').innerText();row.passed=true;
    await p.screenshot({path:path.join(evidence,index+'-result.png'),fullPage:true});await p.close();
  }
  // Real validation rejection must preserve all the unresolved text while the
  // customer adds a callback channel; correcting contact must not drop scope.
  const p=await newPage();const fields={Email:'',Name:extra,'Project location':'123 Synthetic Street. '+extra,Urgency:uncertain};
  await form(p,fields);const rejected=await send(p,422);assert.equal(stored(rejected.body),undefined);
  await p.getByLabel('Service',{exact:true}).waitFor();await p.reload();await p.getByLabel('Service',{exact:true}).waitFor();
  for(const [label,value]of Object.entries(fields))assert.equal(await p.getByLabel(label,{exact:true}).inputValue(),value);
  await p.getByLabel('Service',{exact:true}).locator('option[value="'+f.id+'"]').waitFor({state:'attached'});
  await p.getByLabel('Phone',{exact:true}).fill('555-0123');
  const corrected=await send(p);assert.notEqual(corrected.body.requestId,rejected.body.requestId);assert.equal(corrected.result.resultType,review);
  for(const key of ['location','urgency','customerInputs'])assert.deepEqual(corrected.body[key],rejected.body[key]);
  assert.equal(corrected.body.contact.name,rejected.body.contact.name);assert.equal(stored(rejected.body),undefined);
  assert.deepEqual(JSON.parse(stored(corrected.body).originalSubmissionJson),corrected.body);
  await p.getByText('Request saved for review',{exact:true}).waitFor();await p.screenshot({path:path.join(evidence,'contact-corrected-scope-retained.png'),fullPage:true});
  rows.push({name:'422 and reload retain all scope; callback correction still requires review',passed:true,rejected,corrected,stored:stored(corrected.body)});await p.close();
  // Owner sees the actual retained text in the ordinary CRM after sign-in.
  const owner=await newPage();await owner.goto(ui);await owner.getByRole('button',{name:'Sign in',exact:true}).first().click();
  await owner.getByLabel('Email',{exact:true}).fill(f.owner.email);await owner.getByLabel('Password',{exact:true}).fill(f.owner.password);await owner.locator('button[type=submit]').click();await owner.waitForFunction(()=>!!localStorage.getItem('otc_token'));
  await owner.goto(ui+'/leads');await owner.getByRole('button',{name:'Dismiss',exact:true}).first().waitFor();
  const visible=await owner.locator('main').innerText();assert.ok(visible.includes(extra));assert.ok(visible.includes(uncertain));
  await owner.screenshot({path:path.join(evidence,'owner-retained-details.png'),fullPage:true});fs.writeFileSync(path.join(evidence,'owner-leads.txt'),visible);
  assert.deepEqual(await f.read(),saved);
  fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({passed:true,checks:rows.length,rows,method:'Real Chromium controls, genuine HTTP and SQLite; no request or response substitution'},null,2));
  console.log(JSON.stringify({passed:true,checks:rows.length},null,2));
}catch(error){
  fs.writeFileSync(path.join(evidence,'failed-results.json'),JSON.stringify({passed:false,rows,error:String(error.stack)},null,2));
  if(browser)for(const [i,p]of browser.contexts().flatMap(c=>c.pages()).entries())await p.screenshot({path:path.join(evidence,'failure-'+i+'.png'),fullPage:true}).catch(()=>{});
  throw error;
}finally{
  if(browser)await browser.close();if(vite&&vite.exitCode===null){const closed=new Promise(r=>vite.once('close',r));vite.kill();await closed;}if(db)db.close();
  fs.writeFileSync(path.join(evidence,'browser-responses.json'),JSON.stringify(wire,null,2));fs.writeFileSync(path.join(evidence,'browser-vite.log'),logs.join('\n'));await app.stop();
}
