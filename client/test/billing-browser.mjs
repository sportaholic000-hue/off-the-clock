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
let browser,scenario='before',state={billingEnabled:true,providerAvailable:true,plan:'QuoteDone',planStatus:'pending_subscription',billingInterval:null,trialEndsAt:null,paymentFailedAt:null,graceEndsAt:null,currentPeriodEndAt:null,cancelAtPeriodEnd:false,checkoutState:'NONE',canCheckout:true,canManageBilling:false},mutation;
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,origin),json=(status,body)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(body));};
  if(url.pathname.startsWith('/api/')){
   const chunks=[];for await(const part of req)chunks.push(part);const raw=Buffer.concat(chunks).toString();
   const row={scenario,method:req.method,path:url.pathname,key:req.headers['idempotency-key']||null,authenticated:!!req.headers.authorization,body:raw?JSON.parse(raw):null};wire.push(row);
   if(url.pathname==='/api/billing/status'&&req.method==='GET'){row.response=state;json(200,state);return;}
   if(url.pathname.startsWith('/api/billing/')&&mutation){const answer=await mutation(row);if(answer.abort){row.response='[SYNTHETIC] acknowledgement lost';res.destroy();return;}row.status=answer.status||201;row.response=answer.body;json(row.status,answer.body);return;}
   json(403,{error:'[SYNTHETIC] Account access is unavailable.',code:'ACCOUNT_ACCESS_REQUIRED'});return;
  }
  let file=path.join(dist,url.pathname.slice(1));if(!path.extname(url.pathname))file=path.join(dist,'index.html');
  if(!file.startsWith(dist+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return;}
  res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));
 }catch(error){errors.push(String(error.stack));res.writeHead(500).end();}
});
try{
 await new Promise(resolve=>server.listen(4596,'127.0.0.1',resolve));
 browser=await chromium.launch({headless:true,executablePath:process.env.PRICEBOOK_BROWSER_EXECUTABLE,timeout:300000});
 const p=await browser.newPage({viewport:{width:390,height:844}});p.setDefaultTimeout(60000);p.setDefaultNavigationTimeout(120000);p.on('pageerror',error=>errors.push(String(error.stack)));
 await p.addInitScript(()=>localStorage.setItem('otc_token','synthetic-test-token'));
 await p.goto(origin+'/settings/billing',{waitUntil:'domcontentloaded'});
 if(mode==='before'){
  await p.getByText('[SYNTHETIC] Account access is unavailable.',{exact:true}).waitFor();
  const observed={url:p.url(),billingHeading:await p.getByRole('heading',{name:'Billing',exact:true}).count(),billingActions:await p.getByRole('button',{name:/checkout|manage billing/i}).count(),text:await p.locator('body').innerText()};
  assert.equal(observed.billingHeading,0);assert.equal(observed.billingActions,0);
  rows.push({name:'Owner cannot reach billing while regular account access is unavailable',reproduced:true,observed});
  await p.screenshot({path:path.join(evidence,'missing-billing-entry.png'),fullPage:true});
 }else{
  await p.getByRole('heading',{name:'Billing',exact:true}).waitFor();
  rows.push({name:'Billing entry visible',passed:true});
 }
 await p.close();
}catch(error){rows.push({scenario,passed:false,error:String(error.stack)});process.exitCode=1;}
finally{
 if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));
 const built={};function bind(dir,prefix=''){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const name=prefix+entry.name,full=path.join(dir,entry.name);if(entry.isDirectory())bind(full,name+'/');else built[name]=crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');}}bind(dist);
 fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({fixtureOnly:true,realBillingVerified:false,mode,rows,wire,errors,buildFiles:built},null,2));
 console.log(JSON.stringify({mode,rows,errors},null,2));
}