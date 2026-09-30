import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import Database from 'better-sqlite3';
import jwt from 'jsonwebtoken';
import {startApplication} from '../../client/test/widget-application-harness.mjs';

const [rootArg,evidenceArg]=process.argv.slice(2),root=path.resolve(rootArg),evidence=path.resolve(evidenceArg);
const site='http://127.0.0.1:4710',sourceCommit='8a778d5346f10d69e586d0ae46006238e4fd169c';
const app=await startApplication(root,evidence,{port:4712,browserOrigins:[site]});
app.env.CLIENT_URL=site;await app.restart();
const require=createRequire(path.join(root,'package.json')),{chromium}=require(process.env.PRICEBOOK_BROWSER_MODULE);
const rows=[],wire=[],errors=[];
const safe=value=>JSON.parse(JSON.stringify(value,(k,v)=>['token','password','passwordHash','refreshToken'].includes(k)?'[SECRET OMITTED]':v));
let browser,server,db,hold;
function armHold(endpoint){
  assert.equal(hold,undefined);let received,release;
  const arrived=new Promise(r=>{received=r;}),released=new Promise(r=>{release=r;});
  const state={endpoint,arrived,released,received,release,used:false};hold=state;return state;
}
const expire=token=>jwt.sign({...jwt.decode(token),exp:Math.floor(Date.now()/1000)-1},app.env.JWT_SECRET,{algorithm:'HS256'});
async function signIn(page,owner){
  await page.goto(site+'/onboarding?mode=login');
  await page.getByLabel('Email',{exact:true}).fill(owner.email);
  await page.getByLabel('Password',{exact:true}).fill(owner.password);
  await page.getByRole('button',{name:'Sign in',exact:true}).last().click();
  await page.getByRole('navigation',{name:'Setup progress'}).waitFor();
  return page.evaluate(()=>localStorage.getItem('otc_token'));
}
async function signOut(page){
  await page.getByRole('button',{name:'Sign out',exact:true}).click();
  await page.getByLabel('Password',{exact:true}).waitFor();
}
async function renew(page){
  const token=await page.evaluate(()=>localStorage.getItem('otc_token'));
  await page.evaluate(t=>localStorage.setItem('otc_token',t),expire(token));
  await page.goto(site+'/account/email');
  await page.getByRole('button',{name:'Check verification status',exact:true}).waitFor();
  return page.evaluate(()=>localStorage.getItem('otc_token'));
}
function record(name,passed,details={}){rows.push({name,passed,...details});console.log((passed?'PASS ':'REPRODUCED DEFECT ')+name);}
async function cookieSession(context){
  const cookie=(await context.cookies(site)).find(c=>c.name==='otc_refresh');
  if(!cookie)return null;
  return db.prepare('SELECT sessionId FROM authRefreshTokens WHERE tokenHash=?').get(crypto.createHash('sha256').update(cookie.value).digest('hex'))?.sessionId??null;
}
try{
  const dist=path.join(root,'client/dist');
  server=http.createServer(async(req,res)=>{
    try{
      const url=new URL(req.url,site);
      if(url.pathname.startsWith('/api/')){
        const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks),headers={};
        for(const key of ['origin','content-type','authorization','referer','sec-fetch-site','cookie'])if(req.headers[key])headers[key]=req.headers[key];
        const response=await fetch(app.base+req.url,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)&&body.length?{body}:{})});
        const text=await response.text();let payload;try{payload=JSON.parse(text);}catch{payload={nonJson:true};}
        const entry={method:req.method,path:url.pathname,status:response.status,body:safe(body.length?JSON.parse(body):null),response:safe(payload),setsCookie:response.headers.has('set-cookie')};
        wire.push(entry);
        if(hold&&!hold.used&&req.method==='POST'&&url.pathname===hold.endpoint){
          const current=hold;current.used=true;entry.responseHeld=true;current.received(entry);await current.released;hold=undefined;entry.responseReleased=true;
        }
        res.statusCode=response.status;response.headers.forEach((v,k)=>{if(!['content-length','connection','transfer-encoding','content-encoding'].includes(k))res.setHeader(k,v);});res.end(text);return;
      }
      const file=path.resolve(dist,!path.extname(url.pathname)?'index.html':'.'+url.pathname);
      if(!file.startsWith(dist+path.sep)){res.writeHead(403).end();return;}
      res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'text/html');
      res.setHeader('cache-control','no-store');res.end(fs.readFileSync(file));
    }catch(e){errors.push({server:e.message});res.writeHead(500).end('Synthetic fixture error');}
  });
  await new Promise(r=>server.listen(4710,'127.0.0.1',r));
  const owner=await app.owner('independent-race-a'),other=await app.owner('independent-race-b');
  db=new Database(app.env.DATABASE_PATH);
  browser=await chromium.launch({headless:true,executablePath:process.env.PRICEBOOK_BROWSER_EXECUTABLE,timeout:180000});
  const context=await browser.newContext({viewport:{width:1360,height:950}});
  const page=await context.newPage(),tab=await context.newPage();
  for(const p of[page,tab]){p.setDefaultTimeout(30000);p.on('pageerror',e=>errors.push({browser:e.message}));}
  const first=await signIn(page,owner),rotated=await renew(page);
  assert.equal(jwt.decode(first).sid,jwt.decode(rotated).sid);assert.equal(await cookieSession(context),jwt.decode(rotated).sid);
  record('Ordinary same-account access renewal succeeds',true);
  await page.goto(site+'/onboarding?step=1');await page.getByRole('button',{name:'Sign out',exact:true}).waitFor();
  await signOut(page);const controlB=await signIn(page,other),controlRenewed=await renew(page);
  assert.equal(jwt.decode(controlB).sid,jwt.decode(controlRenewed).sid);assert.equal(await cookieSession(context),jwt.decode(controlB).sid);
  record('Ordinary sign-out, different-account sign-in and renewal succeed',true);
  await page.goto(site+'/onboarding?step=1');await signOut(page);
  const a=await signIn(page,owner),aSid=jwt.decode(a).sid;
  await tab.goto(site+'/onboarding?step=1');await tab.getByRole('button',{name:'Sign out',exact:true}).waitFor();
  await page.goto(site+'/account/email');await page.getByRole('button',{name:'Check verification status',exact:true}).waitFor();
  await page.evaluate(t=>localStorage.setItem('otc_token',t),expire(a));
  const gate=armHold('/api/auth/refresh');
  await page.getByRole('button',{name:'Check verification status',exact:true}).click();
  const held=await gate.arrived;assert.equal(held.status,200);
  await signOut(tab);
  const b=await signIn(tab,other),bSid=jwt.decode(b).sid;
  assert.equal(await cookieSession(context),bSid);
  const before={accessBelongsToNewAccount:true,refreshCookieBelongsToNewAccount:true,oldSessionRevoked:db.prepare('SELECT revokedAt FROM authSessions WHERE id=?').get(aSid).revokedAt!==null};
  const delivered=page.waitForResponse(r=>r.url().endsWith('/api/auth/refresh')&&r.status()===200);
  gate.release();await delivered;
  await page.waitForFunction(()=>!!localStorage.getItem('otc_token'));
  // Waiting for fetch completion is bounded on browser network state, not arbitrary timing.
  await page.waitForLoadState('networkidle');
  const after={accessBelongsToNewAccount:jwt.decode(await tab.evaluate(()=>localStorage.getItem('otc_token'))).sid===bSid,
    refreshCookieBelongsToOldRevokedSession:(await cookieSession(context))===aSid};
  assert.equal(after.accessBelongsToNewAccount,true);assert.equal(after.refreshCookieBelongsToOldRevokedSession,true);
  await tab.evaluate(t=>localStorage.setItem('otc_token',t),expire(b));
  await tab.goto(site+'/account/email');
  await tab.getByText('Sign in to check your account email.',{exact:true}).waitFor();
  assert.equal(await tab.evaluate(()=>localStorage.getItem('otc_token')),null);
  const rejected=wire.filter(x=>x.path==='/api/auth/refresh').at(-1);assert.equal(rejected.status,401);
  record('Delayed old refresh response replaces the new account cookie and forces sign-in on renewal',false,{before,after,renewalStatus:rejected.status,newAccountAccessCleared:true});
  await tab.screenshot({path:path.join(evidence,'delayed-refresh-signin.png'),fullPage:true});
  // Isolate the response-ordering variant for logout using a fresh browser context.
  const context2=await browser.newContext({viewport:{width:1360,height:950}}),oldTab=await context2.newPage(),newTab=await context2.newPage();
  for(const p of[oldTab,newTab])p.setDefaultTimeout(30000);
  const a2=await signIn(oldTab,owner);await newTab.goto(site+'/onboarding?step=1');await newTab.getByRole('button',{name:'Sign out',exact:true}).waitFor();
  const logoutGate=armHold('/api/auth/logout');
  await oldTab.getByRole('button',{name:'Sign out',exact:true}).click();assert.equal((await logoutGate.arrived).status,200);
  await signOut(newTab);
  const b2=await signIn(newTab,other),sid2=jwt.decode(b2).sid;assert.equal(await cookieSession(context2),sid2);
  const logoutDelivered=oldTab.waitForResponse(r=>r.url().endsWith('/api/auth/logout')&&r.status()===200);
  logoutGate.release();await logoutDelivered;await oldTab.waitForLoadState('networkidle');
  const lost=(await cookieSession(context2))===null;assert.equal(lost,true);
  const retained=await newTab.evaluate(()=>localStorage.getItem('otc_token'));assert.equal(jwt.decode(retained).sid,sid2);
  await newTab.evaluate(t=>localStorage.setItem('otc_token',t),expire(b2));await newTab.goto(site+'/account/email');
  await newTab.getByText('Sign in to check your account email.',{exact:true}).waitFor();
  assert.equal(await newTab.evaluate(()=>localStorage.getItem('otc_token')),null);
  record('Delayed old logout response clears the newly signed-in account cookie',false,{newAccountAccessInitiallyPreserved:true,newAccountCookieCleared:true,renewalStatus:wire.filter(x=>x.path==='/api/auth/refresh').at(-1).status,newAccountAccessCleared:true});
  assert.deepEqual(errors,[]);
}finally{
  if(hold)hold.release();if(db)db.close();if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));await app.stop();
  fs.writeFileSync(path.join(evidence,'audit-browser-results.json'),JSON.stringify({sourceCommit,syntheticOnly:true,liveProviderTraffic:false,rows,wire,errors},null,2));
}

