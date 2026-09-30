import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import Database from 'better-sqlite3';
import jwt from 'jsonwebtoken';
import {startApplication} from '../../client/test/widget-application-harness.mjs';

const [rootArg,evidenceArg]=process.argv.slice(2),root=path.resolve(rootArg),evidence=path.resolve(evidenceArg);
const site='http://127.0.0.1:4700';
const app=await startApplication(root,evidence,{port:4702,browserOrigins:[site]});
const fixtureFile=path.join(evidence,'synthetic-email-private.json');
fs.writeFileSync(fixtureFile,JSON.stringify({syntheticOnly:true,mode:'normal',messages:[],calls:[]}));
Object.assign(app.env,{CLIENT_URL:site,EMAIL_PROVIDER:'resend',EMAIL_DELIVERY_ENABLED:'true',
 RESEND_API_KEY:'re_SYNTHETIC_AUTH_BROWSER',EMAIL_FROM:'account@example.invalid',AUTH_EMAIL_FIXTURE:fixtureFile,
 NODE_OPTIONS:'--import='+pathToFileURL(path.join(root,'verification/auth-email/email-provider-fixture.mjs')).href});
const clockFile=path.join(evidence,'synthetic-clock-private.json');
fs.writeFileSync(clockFile,JSON.stringify({syntheticOnly:true,now:Date.now()+300000}));
app.env.AUTH_SESSION_CLOCK_FIXTURE=clockFile;
app.env.NODE_OPTIONS+=' --import='+pathToFileURL(path.join(root,'verification/session-security/session-clock-fixture.mjs')).href;
await app.restart();
const require=createRequire(path.join(root,'package.json')),{chromium}=require(process.env.PRICEBOOK_BROWSER_MODULE);
const rows=[],wire=[],errors=[],check=(name,details={})=>{rows.push({name,passed:true,...details});console.log('PASS '+name);};
let browser,server,db;
async function signin(page,owner) {
 await page.goto(site+'/onboarding?mode=login');
 await page.getByLabel('Email',{exact:true}).fill(owner.email);await page.getByLabel('Password',{exact:true}).fill(owner.password);
 await page.getByRole('button',{name:'Sign in',exact:true}).last().click();
 await page.getByRole('navigation',{name:'Setup progress'}).waitFor();
 return page.evaluate(()=>localStorage.getItem('otc_token'));
}
function expire(token){return jwt.sign({...jwt.decode(token),exp:Math.floor(Date.now()/1000)-1},app.env.JWT_SECRET,{algorithm:'HS256'});}
async function invalidateAccess(page){const token=await page.evaluate(()=>localStorage.getItem('otc_token'));await page.evaluate(value=>localStorage.setItem('otc_token',value),expire(token));return token;}
async function checkAccount(page){const done=page.waitForResponse(r=>r.url().endsWith('/api/auth/account')&&r.status()===200);await page.getByRole('button',{name:'Check verification status',exact:true}).click();await done;}
try {
 const dist=path.join(root,'client/dist');
 server=http.createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,site);
   if(url.pathname.startsWith('/api/')){
    const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks),headers={};
    for(const key of ['origin','content-type','authorization','referer','sec-fetch-site','cookie','idempotency-key'])if(req.headers[key])headers[key]=req.headers[key];
    const response=await fetch(app.base+req.url,{method:req.method,headers,redirect:'manual',...(!['GET','HEAD'].includes(req.method)&&body.length?{body}:{})});
    const text=await response.text();wire.push({method:req.method,path:url.pathname,status:response.status});
    res.statusCode=response.status;response.headers.forEach((v,k)=>{if(!['content-length','connection','transfer-encoding','content-encoding'].includes(k))res.setHeader(k,v);});res.end(text);return;
   }
   const file=path.resolve(dist,!path.extname(url.pathname)?'index.html':'.'+url.pathname);
   if(!file.startsWith(dist+path.sep)){res.writeHead(403).end();return;}
   res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'text/html');
   res.setHeader('cache-control','no-store');res.end(fs.readFileSync(file));
  }catch{res.writeHead(500).end('Synthetic fixture error');}
 });
 await new Promise(resolve=>server.listen(4700,'127.0.0.1',resolve));
 const owner=await app.owner('session-browser-a'),other=await app.owner('session-browser-b');
 browser=await chromium.launch({headless:true,executablePath:process.env.PRICEBOOK_BROWSER_EXECUTABLE,timeout:180000});
 const context=await browser.newContext({viewport:{width:1360,height:950}}),page=await context.newPage();
 page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));
 const original=await signin(page,owner);
 const cookieName='otc_refresh_'+jwt.decode(original).sid;
 const cookies=await context.cookies(site),refresh=cookies.find(c=>c.name===cookieName);
 assert.ok(refresh?.httpOnly);assert.equal(refresh.sameSite,'Lax');assert.equal(await page.evaluate(()=>document.cookie.includes('otc_refresh')),false);
 assert.equal((await app.request('GET','/api/auth/account',undefined,original)).status,200);
 check('Real browser login sets an HttpOnly cookie and authorizes the owner');

 await page.goto(site+'/onboarding?step=1');await page.getByLabel('Business name',{exact:true}).waitFor();
 await page.getByLabel('Business name',{exact:true}).fill('SYNTHETIC unsaved form remains');
 await page.getByLabel('Business name',{exact:true}).evaluate(element=>{element.dataset.sessionPreservation='yes';});
 await invalidateAccess(page);await checkAccount(page);
 const fresh=await page.evaluate(()=>localStorage.getItem('otc_token'));
 assert.notEqual(fresh,original,'Same-second access JWT can equal the original still-valid JWT');assert.equal(jwt.decode(fresh).sid,jwt.decode(original).sid);
 assert.equal(await page.getByLabel('Business name',{exact:true}).inputValue(),'SYNTHETIC unsaved form remains');
 assert.equal(await page.getByLabel('Business name',{exact:true}).getAttribute('data-session-preservation'),'yes');
 assert.notEqual((await context.cookies(site)).find(c=>c.name===cookieName).value,refresh.value);
 check('Expired access renews through the real route without remounting or losing an unsaved owner form');

 const tab=await context.newPage();tab.setDefaultTimeout(60000);tab.on('pageerror',e=>errors.push(e.message));
 await tab.goto(site+'/account/email');await tab.getByRole('button',{name:'Check verification status',exact:true}).waitFor();
 await invalidateAccess(page);
 await Promise.all([checkAccount(page),checkAccount(tab)]);
 assert.equal(await page.getByLabel('Business name',{exact:true}).inputValue(),'SYNTHETIC unsaved form remains');
 assert.ok(await tab.evaluate(()=>localStorage.getItem('otc_token')));
 check('Two tabs renew concurrently and remain authorized without discarding the owner draft');
 await tab.close();

 await app.restart();await invalidateAccess(page);await checkAccount(page);
 check('Refresh receipts remain valid across an actual application restart');

 const secondContext=await browser.newContext({viewport:{width:1360,height:950}}),second=await secondContext.newPage();
 second.setDefaultTimeout(60000);second.on('pageerror',e=>errors.push(e.message));const secondToken=await signin(second,owner);
 await page.setViewportSize({width:390,height:844});
 await context.route('**/api/auth/logout',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Synthetic sign-out failure'})}));
 await page.getByRole('button',{name:'Sign out',exact:true}).click();
 await page.getByText('Synthetic sign-out failure',{exact:true}).last().waitFor();
 assert.ok(await page.evaluate(()=>localStorage.getItem('otc_token')));
 assert.equal((await app.request('GET','/api/auth/account',undefined,await page.evaluate(()=>localStorage.getItem('otc_token')))).status,200);
 await context.unroute('**/api/auth/logout');
 const beforeLogout=await page.evaluate(()=>localStorage.getItem('otc_token'));
 await page.getByRole('button',{name:'Sign out',exact:true}).click();
 await page.getByLabel('Password',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>localStorage.getItem('otc_token')),null);
 assert.equal((await app.request('GET','/api/auth/account',undefined,beforeLogout)).status,401);
 assert.equal((await app.request('GET','/api/auth/account',undefined,secondToken)).status,200);
 assert.equal((await context.cookies(site)).some(c=>c.name==='otc_refresh_'+jwt.decode(beforeLogout).sid),false);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 check('Mobile sign-out retries a failure, then revokes only that server session and clears its cookie');

 await page.setViewportSize({width:1360,height:950});await signin(page,owner);
 const thirdContext=await browser.newContext({viewport:{width:1360,height:950}}),third=await thirdContext.newPage();
 third.setDefaultTimeout(60000);third.on('pageerror',e=>errors.push(e.message));const otherToken=await signin(third,other);
 const ownerToken=await page.evaluate(()=>localStorage.getItem('otc_token'));
 await page.goto(site+'/forgot-password');await page.getByLabel('Email',{exact:true}).fill(owner.email);
 await page.getByRole('button',{name:'Request email',exact:true}).click();
 await page.getByText('Request received. If this account needs an email, we will attempt to send a new link. Check your inbox and spam folder.',{exact:true}).waitFor();
 const message=JSON.parse(fs.readFileSync(fixtureFile,'utf8')).messages.filter(m=>m.subject==='Reset your password'&&Array.isArray(m.to)&&m.to.includes(owner.email)).at(-1);
 assert.ok(message);const link=message.text.match(/https?:\/\/\S+/)[0];
 await page.goto(link);await page.getByLabel('New password',{exact:true}).fill('Synthetic-new-session-password-2026');
 await page.getByLabel('Confirm new password',{exact:true}).fill('Synthetic-new-session-password-2026');
 await page.getByRole('button',{name:'Reset password',exact:true}).click();
 await page.getByText('Your password has been reset. Sign in with your new password.',{exact:true}).waitFor();
 await page.waitForFunction(()=>localStorage.getItem('otc_token')===null);
 assert.equal(await page.getByText('Your password has been reset. Sign in with your new password.',{exact:true}).isVisible(),true);
 assert.equal((await app.request('GET','/api/auth/account',undefined,ownerToken)).status,401);
 assert.equal((await app.request('GET','/api/auth/account',undefined,secondToken)).status,401);
 assert.equal((await app.request('GET','/api/auth/account',undefined,otherToken)).status,200);
 await second.goto(site+'/account/email');await second.getByText('Sign in to check your account email.',{exact:true}).waitFor();
 assert.equal(await second.evaluate(()=>localStorage.getItem('otc_token')),null);
 assert.ok(await third.evaluate(()=>localStorage.getItem('otc_token')));
 check('Password reset revokes every owner device, preserves another tenant, and keeps the reset success message visible');

 const rejected=await app.request('POST','/api/auth/logout',{},otherToken,{Origin:'https://attacker.invalid'});
 assert.equal(rejected.status,403);assert.equal((await app.request('GET','/api/auth/account',undefined,otherToken)).status,200);
 check('The real application rejects an untrusted origin without logging the owner out');

 db=new Database(app.env.DATABASE_PATH);
 const sid=jwt.decode(otherToken).sid,at=Date.now();
 db.prepare('UPDATE authSessions SET createdAt=?,expiresAt=? WHERE id=?').run(at-8*3600000-1000,at-1000,sid);
 await third.goto(site+'/account/email');await third.getByText('Sign in to check your account email.',{exact:true}).waitFor();
 assert.equal(await third.evaluate(()=>localStorage.getItem('otc_token')),null);
 check('The eight-hour absolute session limit requires sign-in again instead of extending indefinitely');

 assert.deepEqual(errors,[]);
 const log=fs.readFileSync(path.join(evidence,'server.log'),'utf8');
 assert.equal(log.includes(original),false);assert.equal(log.includes(refresh.value),false);
 check('No browser runtime errors, access tokens or refresh secrets appear in application logs');
} finally {
 if(db)db.close();if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));await app.stop();
 fs.writeFileSync(path.join(evidence,'browser-results.json'),JSON.stringify({syntheticOnly:true,liveProviderTraffic:false,rows,wire,errors},null,2));
}
