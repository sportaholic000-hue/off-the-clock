import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import Database from 'better-sqlite3';
import jwt from 'jsonwebtoken';
import {startApplication} from '../../client/test/widget-application-harness.mjs';

const [rootArg,evidenceArg,sourceCommit='local candidate']=process.argv.slice(2),root=path.resolve(rootArg),evidence=path.resolve(evidenceArg);
const site='http://127.0.0.1:4710';
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
async function cookieSession(context,sessionId){
  const cookies=await context.cookies(site);
  // The legacy lookup allows this acceptance test to run red against the old source.
  const cookie=cookies.find(c=>c.name==='otc_refresh_'+sessionId)||cookies.find(c=>c.name==='otc_refresh');
  if(!cookie)return null;
  return db.prepare('SELECT sessionId FROM authRefreshTokens WHERE tokenHash=?').get(crypto.createHash('sha256').update(cookie.value).digest('hex'))?.sessionId??null;
}
try {
  const dist=path.join(root,'client/dist');
  server=http.createServer(async(req,res)=>{
    try {
      const url=new URL(req.url,site);
      if(url.pathname==='/favicon.ico'){res.writeHead(204).end();return;}
      if(url.pathname.startsWith('/api/')){
        const chunks=[];for await(const chunk of req)chunks.push(chunk);
        const body=Buffer.concat(chunks),headers={};
        for(const key of ['origin','content-type','authorization','referer','sec-fetch-site','cookie'])
          if(req.headers[key])headers[key]=req.headers[key];
        const response=await fetch(app.base+req.url,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)&&body.length?{body}:{})});
        const responseText=await response.text();
        const entry={method:req.method,path:url.pathname,status:response.status,setsCookie:response.headers.has('set-cookie')};
        wire.push(entry);
        if(hold&&!hold.used&&req.method==='POST'&&url.pathname===hold.endpoint){
          const current=hold;current.used=true;entry.responseHeld=true;current.received(entry);
          await current.released;hold=undefined;entry.responseReleased=true;
        }
        res.statusCode=response.status;
        response.headers.forEach((v,k)=>{if(!['content-length','connection','transfer-encoding','content-encoding'].includes(k))res.setHeader(k,v);});
        res.end(responseText);return;
      }
      const file=path.resolve(dist,!path.extname(url.pathname)?'index.html':'.'+url.pathname);
      if(!file.startsWith(dist+path.sep)){res.writeHead(403).end();return;}
      res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'text/html');
      res.setHeader('cache-control','no-store');res.end(fs.readFileSync(file));
    }catch(e){errors.push({server:e.message});res.writeHead(500).end('Synthetic fixture error');}
  });
  await new Promise(r=>server.listen(4710,'127.0.0.1',r));
  const owner=await app.owner('response-order-a'),other=await app.owner('response-order-b');
  db=new Database(app.env.DATABASE_PATH);
  browser=await chromium.launch({headless:true,executablePath:process.env.PRICEBOOK_BROWSER_EXECUTABLE,timeout:180000});
  async function newTabs(){
    const context=await browser.newContext({viewport:{width:1360,height:950}});
    const first=await context.newPage(),second=await context.newPage();
    for(const p of [first,second]){
      p.setDefaultTimeout(30000);
      p.on('pageerror',e=>errors.push({browser:e.message}));
    }
    return {context,first,second};
  }
  async function assertRenewal(page,context,token){
    const sid=jwt.decode(token).sid,renewed=await renew(page);
    assert.equal(jwt.decode(renewed)?.sid,sid,'renewal must preserve the new session');
    assert.equal(await cookieSession(context,sid),sid,'renewal must retain its matching refresh receipt');
    assert.equal(wire.filter(x=>x.path==='/api/auth/refresh').at(-1)?.status,200);
    return sid;
  }
  {
    const {context,first}=await newTabs();
    const token=await signIn(first,owner);
    await assertRenewal(first,context,token);
    record('Ordinary same-account access renewal succeeds',true);
    await first.goto(site+'/onboarding?step=1');await signOut(first);
    const next=await signIn(first,other);
    await assertRenewal(first,context,next);
    record('Ordinary sign-out, different-account sign-in and renewal succeed',true);
    await context.close();
  }
  for(const endpoint of ['/api/auth/refresh','/api/auth/logout']){
    for(const sameAccount of [false,true]){
      const name='Delayed old '+endpoint.split('/').at(-1)+' response preserves '+(sameAccount?'same-account fresh':'different-account')+' login and renewal';
      const {context,first,second}=await newTabs();
      const old=await signIn(first,owner),oldSid=jwt.decode(old).sid;
      await second.goto(site+'/onboarding?step=1');
      await second.getByRole('button',{name:'Sign out',exact:true}).waitFor();
      let gate;
      if(endpoint.endsWith('/refresh')){
        await first.goto(site+'/account/email');
        await first.getByRole('button',{name:'Check verification status',exact:true}).waitFor();
        await first.evaluate(t=>localStorage.setItem('otc_token',t),expire(old));
        gate=armHold(endpoint);
        await first.getByRole('button',{name:'Check verification status',exact:true}).click();
      }else{
        gate=armHold(endpoint);
        await first.getByRole('button',{name:'Sign out',exact:true}).click();
      }
      const held=await Promise.race([gate.arrived,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Response hold was not reached')),30000))]);
      assert.equal(held.status,200);
      // Another tab finishes sign-out, then signs in again while the old headers are still withheld.
      await signOut(second);
      const fresh=await signIn(second,sameAccount?owner:other),freshSid=jwt.decode(fresh).sid;
      assert.notEqual(freshSid,oldSid,'fresh login must have independent session identity');
      assert.equal(await cookieSession(context,freshSid),freshSid);
      assert.notEqual(db.prepare('SELECT revokedAt FROM authSessions WHERE id=?').get(oldSid).revokedAt,null);
      const delivered=first.waitForResponse(r=>r.url().endsWith(endpoint)&&r.status()===200);
      gate.release();await delivered;await first.waitForLoadState('networkidle');
      const retained=await second.evaluate(()=>localStorage.getItem('otc_token'));
      assert.equal(jwt.decode(retained)?.sid,freshSid,'old JavaScript completion must preserve the new access token');
      assert.equal(await cookieSession(context,freshSid),freshSid,'old Set-Cookie must preserve the new refresh receipt');
      await assertRenewal(second,context,fresh);
      assert.notEqual(db.prepare('SELECT revokedAt FROM authSessions WHERE id=?').get(oldSid).revokedAt,null);
      record(name,true,{oldSessionRevoked:true,newAccessPreserved:true,newRefreshReceiptPreserved:true,renewalStatus:200});
      await context.close();
    }
  }
  {
    const {context,first,second}=await newTabs();
    await first.goto(site+'/onboarding?mode=login');
    const gate=armHold('/api/auth/logout');
    const request=first.evaluate(async()=>{const response=await fetch('/api/auth/logout',{method:'POST',credentials:'include'});return response.status;});
    const held=await Promise.race([gate.arrived,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Anonymous logout hold was not reached')),30000))]);
    assert.equal(held.status,200);
    const fresh=await signIn(second,other),sid=jwt.decode(fresh).sid;
    gate.release();assert.equal(await request,200);
    assert.equal(await cookieSession(context,sid),sid,'anonymous logout must not expire a newer cookie');
    assert.equal(held.setsCookie,false,'anonymous logout must not send cookie deletion headers');
    await assertRenewal(second,context,fresh);
    record('Delayed anonymous logout preserves a later sign-in and renewal',true,{setsCookie:false,renewalStatus:200});
    await context.close();
  }
  assert.deepEqual(errors,[]);
} catch(error) {
  rows.push({name:'Response-order browser acceptance',passed:false,error:error.message});
  throw error;
} finally {
  if(hold)hold.release();
  if(browser)await browser.close();
  if(db)db.close();
  if(server)await new Promise(r=>server.close(r));
  await app.stop();
  fs.writeFileSync(path.join(evidence,'browser-results.json'),JSON.stringify({sourceCommit,syntheticOnly:true,liveProviderTraffic:false,rows,wire,errors},null,2));
}
