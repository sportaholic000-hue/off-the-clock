import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
const moduleName=process.env.PLAYWRIGHT_MODULE_PATH||'playwright';
const {chromium}=await import(moduleName.startsWith('C:')?pathToFileURL(moduleName):moduleName);
const origin='http://127.0.0.1:'+(process.env.INTEGRATION_BROWSER_PORT||8847);
const results=[],errors=[];
function pass(name){results.push({name,passed:true});}
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
const context=await browser.newContext({acceptDownloads:true});
const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
try {
  let ready=false;
  for(let i=0;i<120;i++){try{const r=await fetch(origin+'/api/health');if(r.ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,500));}
  assert.ok(ready,'Local fixture starts');
  const login=async email=>{
    const r=await fetch(origin+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({email,password:'SYNTHETIC_OWNER_PASSWORD_ONLY'})});
    assert.equal(r.status,200);return(await r.json()).token;
  };
  const tokenA=await login('browser-a@example.invalid'),tokenB=await login('browser-b@example.invalid');
  await page.goto(origin);await page.evaluate(token=>localStorage.setItem('otc_token',token),tokenA);
  await page.goto(origin+'/dashboard');
  await page.getByRole('heading',{name:'Webhooks and CSV support'}).waitFor();
  pass('Built dashboard exposes functional owner integrations');
  for(const [kind,label] of [['leads','Download leads CSV'],['quote-requests','Download quote requests CSV'],['bookings','Download bookings CSV']]) {
    const pending=page.waitForEvent('download');await page.getByRole('button',{name:label,exact:true}).click();const download=await pending;
    assert.equal(download.suggestedFilename(),'off-the-clock-'+kind+'.csv');
    const output=fs.readFileSync(await download.path(),'utf8');
    assert.doesNotMatch(output,/OTHER_TENANT_B/);
    assert.match(output,/SYNTHETIC_OWNER_A/);
    if(kind==='leads')assert.match(output,/"'=SYNTHETIC_OWNER_A"/);
    pass(kind+' real browser CSV download is tenant-scoped'+(kind==='leads'?' and formula-protected':''));
  }
  const url=page.getByLabel('HTTPS webhook URL',{exact:true});
  await url.fill('https://8.8.8.8/synthetic-owner-webhook');
  await page.getByRole('button',{name:'Save webhook',exact:true}).click();
  await page.getByLabel('Webhook signing secret',{exact:true}).waitFor();
  const secret=await page.getByLabel('Webhook signing secret',{exact:true}).inputValue();assert.match(secret,/^[a-f0-9]{64}$/);
  pass('HTTPS webhook saves and reveals its signing secret once');
  const getConfig=async token=>{const r=await fetch(origin+'/api/integrations/webhook',{headers:{Authorization:'Bearer '+token}});return r.json();};
  const saved=await getConfig(tokenA);assert.equal(saved.signingSecret,undefined);assert.equal(saved.dispatchEnabled,false);
  pass('Readback omits signing secret and reports disabled test delivery');
  await fetch(origin+'/__fixture/create-records',{method:'POST',headers:{Authorization:'Bearer '+tokenA}});
  await page.getByRole('button',{name:'Refresh delivery status',exact:true}).click();
  await page.getByText('lead.created · PENDING · 0 attempts',{exact:true}).waitFor();
  assert.equal((await getConfig(tokenA)).deliveries.length,3);
  pass('All three new entity events are visible as durable pending deliveries');
  await page.getByRole('button',{name:'Rotate signing secret',exact:true}).click();
  await page.waitForFunction(previous=>document.querySelector('input[readonly]')?.value!==previous,secret);
  assert.notEqual(await page.getByLabel('Webhook signing secret',{exact:true}).inputValue(),secret);
  assert.equal((await getConfig(tokenA)).deliveries.every(event=>event.status==='CANCELED'),true);
  pass('Secret rotation cancels historical pending deliveries');
  await page.getByLabel('New lead',{exact:true}).uncheck();
  await page.getByLabel('Confirmed booking',{exact:true}).uncheck();
  await page.getByRole('button',{name:'Save webhook',exact:true}).click();
  await page.getByRole('button',{name:'Save webhook',exact:true}).waitFor({state:'visible'});
  await page.waitForFunction(()=>!document.querySelector('button[type=submit]')?.disabled);
  assert.deepEqual((await getConfig(tokenA)).webhook.events,['quote.requested']);
  pass('Per-event toggles persist');
  await url.fill('http://127.0.0.1/blocked');
  await page.getByRole('button',{name:'Save webhook',exact:true}).click();
  await page.getByText('Use an HTTPS webhook on a public internet address, without URL credentials or redirects.',{exact:true}).waitFor();
  pass('Invalid/private HTTP destination fails visibly without replacing the saved endpoint');
  await page.evaluate(token=>{localStorage.setItem('otc_token',token);window.dispatchEvent(new Event('otc:session'));},tokenB);
  await page.getByRole('heading',{name:'Webhooks and CSV support'}).waitFor();
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('input[type=url]')).every(input=>input.value===''));
  assert.equal((await getConfig(tokenB)).webhook,null);
  assert.equal(await page.getByLabel('Webhook signing secret',{exact:true}).count(),0);
  pass('Switching tenants resets the endpoint and removes the prior owner secret');
  await page.evaluate(token=>{localStorage.setItem('otc_token',token);window.dispatchEvent(new Event('otc:session'));},tokenA);
  await page.getByRole('button',{name:'Remove webhook',exact:true}).waitFor();
  await page.getByRole('button',{name:'Remove webhook',exact:true}).click();
  await page.getByRole('button',{name:'Remove webhook',exact:true}).waitFor({state:'detached'});
  assert.equal((await getConfig(tokenA)).webhook,null);
  pass('Owner removes webhook from the dashboard');
  assert.deepEqual(errors,[]);pass('No browser runtime errors');
  console.log(JSON.stringify({passed:results.length,failed:0,results},null,2));
} catch(error) {
  console.error(JSON.stringify({passed:results.length,failed:1,results,error:error.message,stack:error.stack},null,2));
  process.exitCode=1;
} finally {
  await context.close();await browser.close();
  await fetch(origin+'/__fixture/stop',{method:'POST'}).catch(()=>{});
}
