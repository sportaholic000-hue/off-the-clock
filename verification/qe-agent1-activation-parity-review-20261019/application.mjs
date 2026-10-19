// Synthetic HTTP application sharing the real database/book with voice tools.
import '../../test/pricebookTestEnv.mjs';
import {fixture,at,secret} from '../../test/leadCaptureRepair20261006Fixture.mjs';
import {quoteEmailFixture} from '../../test/quoteEmailFixture.mjs';
import {createAuthSessionService} from '../../server/src/authSessionService.js';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {once} from 'node:events';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
export async function application(t){
 process.env.JWT_SECRET=secret;
 const baseFixture=fixture(t,process.env.DATABASE_PATH),db=baseFixture.db;
 const probe=createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;await new Promise(r=>probe.close(r));
 const base='http://127.0.0.1:'+port,stateFile=join(process.env.PRICEBOOK_PATH,'synthetic-provider.json');
 writeFileSync(stateFile,JSON.stringify({syntheticOnly:true,now:at,mode:'normal',calls:[],events:{}}));
 const tokens={},sessions=createAuthSessionService(db,{environment:{JWT_SECRET:secret},clock:()=>new Date(at)});
 const env={...process.env,NODE_ENV:'test',PORT:String(port),JWT_SECRET:secret,BOOKING_SLOT_TOKEN_SECRET:secret,BOOKING_SYNTHETIC_PROVIDER:stateFile,CREDENTIAL_ENCRYPTION_KEY:'11'.repeat(32),CORS_ALLOWED_ORIGINS:base,CLIENT_URL:base,LOCAL_PREVIEW_MODE:'false',LOCAL_PREVIEW:'false',ALLOW_PROVIDER_WRITES:'false',VOICE_RUNTIME_ENABLED:'false',STRIPE_BILLING_ENABLED:'false',GOOGLE_CLIENT_ID:'[SYNTHETIC]',GOOGLE_CLIENT_SECRET:'[SYNTHETIC]',EMAIL_PROVIDER:'console',TWILIO_ACCOUNT_SID:'AC'+'0'.repeat(32),TWILIO_API_KEY_SID:'SK'+'0'.repeat(32),TWILIO_API_KEY_SECRET:'SYNTHETIC-NO-LIVE-SECRET'};
 const child=spawn(process.execPath,['--import','./test/fixtures/bookingCalendarProvider20261006.mjs','server/src/server.js'],{env,stdio:['ignore','pipe','pipe']});let log='';for(const s of [child.stdout,child.stderr])s.on('data',b=>log+=b);
 t.after(async()=>{if(child.exitCode===null){child.kill();await once(child,'exit');}});
 const deadline=Date.now()+20000;while(!log.includes('Off The Clock AI server listening')){if(child.exitCode!==null||Date.now()>deadline)throw Error(log);await new Promise(r=>setTimeout(r,25));}
 function owner(id){
  db.prepare("INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt) VALUES(?,?,'[SYNTHETIC]','Synthetic','[SYNTHETIC AUDIT]','QuoteDone','active','UTC','owner',?)").run(id,id+'@example.invalid',at);
  db.prepare('INSERT INTO billingAccounts(ownerId,stripeCustomerId,paymentMethodVerifiedAt,createdAt,updatedAt) VALUES(?,?,?,?,?)').run(id,'cus_SYNTHETIC_'+id,at,at,at);
  db.prepare("INSERT INTO businessProfiles(ownerId,knowledgeBaseJson,updatedAt) VALUES(?,'{}',?)").run(id,at);
  db.prepare("UPDATE users SET planStatus='active' WHERE id=?").run(id);
  tokens[id]=sessions.create(db.prepare('SELECT * FROM users WHERE id=?').get(id)).token;
  return quoteEmailFixture(t,{base:baseFixture,context:baseFixture.context(id)});
 }
 async function request(owner,path,{method='GET',body,publicRequest=false}={}){
  const r=await fetch(base+path,{method,headers:{'content-type':'application/json',Origin:base,...(!publicRequest?{authorization:'Bearer '+tokens[owner]}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json()};
 }
 return {base,db,owner,request,log:()=>log};
}
