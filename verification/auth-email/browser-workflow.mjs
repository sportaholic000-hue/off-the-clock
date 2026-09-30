import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import Database from 'better-sqlite3';
import {startApplication} from '../../client/test/widget-application-harness.mjs';
const [rootArg,evidenceArg]=process.argv.slice(2);
const root=path.resolve(rootArg), evidence=path.resolve(evidenceArg), site='http://127.0.0.1:4690';
const app=await startApplication(root,evidence,{port:4692,browserOrigins:[site]});
const fixtureFile=path.join(evidence,'synthetic-email-private.json');
fs.writeFileSync(fixtureFile,JSON.stringify({syntheticOnly:true,mode:'unavailable',messages:[],calls:[]}));
Object.assign(app.env,{CLIENT_URL:site,EMAIL_PROVIDER:'resend',EMAIL_DELIVERY_ENABLED:'true',
 RESEND_API_KEY:'re_SYNTHETIC_AUTH_BROWSER',EMAIL_FROM:'account@example.invalid',AUTH_EMAIL_FIXTURE:fixtureFile,
 NODE_OPTIONS:'--import='+pathToFileURL(path.join(root,'verification/auth-email/email-provider-fixture.mjs')).href});
await app.restart();
const require=createRequire(path.join(root,'package.json')), {chromium}=require(process.env.PRICEBOOK_BROWSER_MODULE);
const rows=[],wire=[],errors=[],safe=value=>JSON.parse(JSON.stringify(value,(k,v)=>['token','password','passwordHash'].includes(k)?'[SECRET OMITTED]':v));
const fixture=()=>JSON.parse(fs.readFileSync(fixtureFile,'utf8'));
const changeFixture=patch=>fs.writeFileSync(fixtureFile,JSON.stringify({...fixture(),...patch}));
const linkFor=subject=>fixture().messages.filter(m=>m.subject===subject).at(-1).text.match(/https?:\/\/\S+/)[0];
const check=(name,details={})=>{rows.push({name,passed:true,...details});console.log('PASS '+name);};
let server,browser,page,db;
try {
 const dist=path.join(root,'client/dist');
 server=http.createServer(async(req,res)=>{
  try {
   const url=new URL(req.url,site);
   if(url.pathname.startsWith('/api/')){
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    const body=Buffer.concat(chunks), headers={};
    for(const key of ['origin','content-type','authorization','referer','sec-fetch-site','cookie'])if(req.headers[key])headers[key]=req.headers[key];
    const response=await fetch(app.base+req.url,{method:req.method,headers,redirect:'manual',...(!['GET','HEAD'].includes(req.method)&&body.length?{body}:{})});
    const text=await response.text();let payload;try{payload=JSON.parse(text);}catch{payload={nonJson:true};}
    wire.push({method:req.method,path:req.url,status:response.status,body:safe(body.length?JSON.parse(body):null),response:safe(payload)});
    res.statusCode=response.status;response.headers.forEach((value,key)=>{if(!['content-length','connection','transfer-encoding','content-encoding'].includes(key))res.setHeader(key,value);});res.end(text);return;
   }
   const file=path.resolve(dist,!path.extname(url.pathname)?'index.html':'.'+url.pathname);
   if(!file.startsWith(dist+path.sep)){res.writeHead(403).end();return;}
   res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'text/html');
   res.setHeader('cache-control','no-store');res.end(fs.readFileSync(file));
  }catch{res.writeHead(500).end('Synthetic browser fixture error');}
 });
 await new Promise(resolve=>server.listen(4690,'127.0.0.1',resolve));
 browser=await chromium.launch({headless:true,executablePath:process.env.PRICEBOOK_BROWSER_EXECUTABLE,timeout:180000});
 page=await browser.newPage({viewport:{width:1360,height:950}});page.setDefaultTimeout(30000);
 page.on('pageerror',e=>errors.push(String(e.stack)));
 db=new Database(app.env.DATABASE_PATH);
 const email='synthetic-auth-browser@example.invalid',oldPassword='Synthetic-original-2026',newPassword='Synthetic-replacement-2026';
 await page.goto(site+'/onboarding');
 await page.getByLabel('Owner first name',{exact:true}).fill('[SYNTHETIC] Owner');
 await page.getByLabel('Business name',{exact:true}).fill('[SYNTHETIC] Account email');
 await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill(oldPassword);
 const registered=page.waitForResponse(r=>r.url().endsWith('/api/auth/register'));
 await page.getByRole('button',{name:'Start setup',exact:true}).click();
 const registerResponse=await registered;assert.equal(registerResponse.status(),201);const registration=await registerResponse.json();
 assert.equal(registration.verificationDelivery.status,'retry_needed');assert.equal(registration.account.planStatus,'pending_payment');
 await page.getByRole('region',{name:'Email verification'}).getByText('Your account was created, but the email could not be sent. Request another link.',{exact:true}).waitFor();
 assert.equal(db.prepare('SELECT planStatus FROM users WHERE email=?').get(email).planStatus,'pending_payment');
 assert.equal(fixture().calls.length,3);assert.equal(fixture().messages.length,0);
 check('Signup survives failed provider delivery, exposes retry and preserves pending_payment');
 await page.screenshot({path:path.join(evidence,'signup-delivery-failure.png'),fullPage:true});
 changeFixture({mode:'normal'});
 await page.getByRole('button',{name:'Resend verification email',exact:true}).click();
 await page.getByText('The email provider accepted your verification email. Check your inbox and spam folder.',{exact:true}).waitFor();
 assert.equal(fixture().messages.length,1);
 const verifyLink=linkFor('Verify your Off The Clock AI email');assert.equal(new URL(verifyLink).origin,site);
 const verifyCount=wire.filter(r=>r.path==='/api/auth/verify-email').length;
 await page.goto(verifyLink);await page.getByRole('heading',{name:'Verify your email',exact:true}).waitFor();
 assert.equal(new URL(page.url()).hash,'');assert.equal(wire.filter(r=>r.path==='/api/auth/verify-email').length,verifyCount);
 assert.equal(db.prepare('SELECT emailVerifiedAt FROM users WHERE email=?').get(email).emailVerifiedAt,null);
 await page.getByRole('button',{name:'Verify email',exact:true}).click();await page.getByText('Your email is verified.',{exact:true}).waitFor();
 assert.ok(db.prepare('SELECT emailVerifiedAt FROM users WHERE email=?').get(email).emailVerifiedAt);
 check('Resend gives an absolute link; opening it hides the fragment and requires explicit verification');
 await page.goto(site+'/account/email');await page.getByText('Your account email is verified.',{exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Resend verification email',exact:true}).count(),0);
 check('Signed-in account screen shows verified state');
 await page.goto(verifyLink);await page.getByRole('button',{name:'Verify email',exact:true}).click();
 await page.getByText('This link is invalid or has expired.',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Request a new verification link',exact:true}).click();
 await page.getByLabel('Email',{exact:true}).fill(email);await page.getByRole('button',{name:'Request email',exact:true}).click();
 const generic='Request received. If this account needs an email, we will attempt to send a new link. Check your inbox and spam folder.';
 await page.getByText(generic,{exact:true}).waitFor();assert.equal(fixture().messages.length,1);
 check('Reused verification link is rejected and recovery request stays private for verified accounts');
 await page.getByRole('button',{name:'Back to sign in',exact:true}).click();await page.getByLabel('Password',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Forgot password?',exact:true}).click();await page.getByRole('heading',{name:'Forgot password',exact:true}).waitFor();
 await page.getByLabel('Email',{exact:true}).fill(email);await page.getByRole('button',{name:'Request email',exact:true}).click();await page.getByText(generic,{exact:true}).waitFor();
 const resetLink=linkFor('Reset your password'),messageCount=fixture().messages.length;
 await page.goto(site+'/forgot-password');await page.getByLabel('Email',{exact:true}).fill('synthetic-absent@example.invalid');
 await page.getByRole('button',{name:'Request email',exact:true}).click();await page.getByText(generic,{exact:true}).waitFor();
 assert.equal(fixture().messages.length,messageCount);check('Sign-in exposes password recovery; known and unknown requests show the same response');
 await app.restart();
 await page.goto(resetLink);await page.getByLabel('New password',{exact:true}).waitFor();assert.equal(new URL(page.url()).hash,'');
 await page.getByLabel('New password',{exact:true}).fill(newPassword);await page.getByLabel('Confirm new password',{exact:true}).fill('Synthetic-wrong-match');
 const resetCount=wire.filter(r=>r.path==='/api/auth/reset-password').length;
 await page.getByRole('button',{name:'Reset password',exact:true}).click();await page.getByText('The passwords do not match.',{exact:true}).waitFor();
 assert.equal(wire.filter(r=>r.path==='/api/auth/reset-password').length,resetCount);
 await page.getByLabel('Confirm new password',{exact:true}).fill(newPassword);
 await page.getByRole('button',{name:'Reset password',exact:true}).click();await page.getByText('Your password has been reset. Sign in with your new password.',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>localStorage.getItem('otc_token')),null);
 check('Durable reset works after server restart; confirmation mismatch stays on the form; successful reset clears the browser session');
 await page.getByRole('button',{name:'Back to sign in',exact:true}).click();await page.getByLabel('Email',{exact:true}).fill(email);
 await page.getByLabel('Password',{exact:true}).fill(oldPassword);await page.getByRole('button',{name:'Sign in',exact:true}).last().click();
 await page.getByText('Invalid credentials',{exact:true}).waitFor();
 await page.getByLabel('Password',{exact:true}).fill(newPassword);await page.getByRole('button',{name:'Sign in',exact:true}).last().click();
 await page.waitForURL(site+'/onboarding?step=2');assert.ok(await page.evaluate(()=>localStorage.getItem('otc_token')));
 assert.equal(db.prepare('SELECT planStatus FROM users WHERE email=?').get(email).planStatus,'pending_payment');
 await page.getByRole('navigation',{name:'Primary'}).getByRole('button',{name:'Settings',exact:true}).click();await page.waitForURL(site+'/settings');
 check('Old password fails, new password signs in and existing signup/billing flow preserves pending_payment');
 await page.goto(resetLink);await page.getByLabel('New password',{exact:true}).fill('Synthetic-another-2026');
 await page.getByLabel('Confirm new password',{exact:true}).fill('Synthetic-another-2026');
 await page.getByRole('button',{name:'Reset password',exact:true}).click();await page.getByText('This link is invalid or has expired.',{exact:true}).waitFor();
 assert.equal(await page.getByLabel('New password',{exact:true}).inputValue(),'Synthetic-another-2026');
 check('Reused reset fails and preserves entered form values');
 await page.setViewportSize({width:390,height:844});
 await page.goto(site+'/reset-password#token=bad');await page.getByText('This link is invalid or has expired. Request a new one.',{exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Reset password',exact:true}).isDisabled(),true);
 await page.getByRole('button',{name:'Request a new reset link',exact:true}).click();await page.getByLabel('Email',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false);
 await page.screenshot({path:path.join(evidence,'recovery-mobile.png'),fullPage:true});
 check('Malformed links offer recovery on mobile without horizontal overflow');
 assert.deepEqual(errors,[]);
 const serverLog=fs.readFileSync(path.join(evidence,'server.log'),'utf8');
 for(const m of fixture().messages){const token=new URL(m.text.match(/https?:\/\/\S+/)[0]).hash.slice(7);assert.equal(serverLog.includes(token),false);}
 check('No browser runtime errors or account link tokens in application logs');
} finally {
 if(page&&rows.length<10)await page.screenshot({path:path.join(evidence,'failure.png'),fullPage:true}).catch(()=>{});
 if(db)db.close();if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));await app.stop();
 fs.writeFileSync(path.join(evidence,'browser-results.json'),JSON.stringify({syntheticOnly:true,liveProviderTraffic:false,rows,wire,errors},null,2));
}
