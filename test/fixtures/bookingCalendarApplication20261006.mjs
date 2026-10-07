import assert from 'node:assert/strict';
import {writeFileSync,readFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {fileURLToPath} from 'node:url';
import {fixture,SECRET,CUSTOMER,LOCATION} from './bookingCalendar20261006.mjs';
import {createAuthSessionService} from '../../server/src/authSessionService.js';
import {encryptCredentialPayload} from '../../server/src/credentialEncryption.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');

export async function application(t){
  const cleanups=[],s=fixture({after:fn=>cleanups.push(fn)},{now:'2026-10-31T12:00:00.000Z',date:'2026-11-01'});
  const directory=dirname(s.path),key=Buffer.alloc(32,17).toString('hex'),tokens={},stateFile=join(directory,'synthetic-provider.json');
  writeFileSync(stateFile,JSON.stringify({syntheticOnly:true,now:s.clock().toISOString(),mode:'normal',calls:[],events:{}}));
  const provider=()=>JSON.parse(readFileSync(stateFile,'utf8'));
  const changeProvider=changes=>writeFileSync(stateFile,JSON.stringify({...provider(),...changes}));
  const probe=createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;await new Promise(r=>probe.close(r));
  const base='http://127.0.0.1:'+port;
  const sessions=createAuthSessionService(s.db,{environment:{JWT_SECRET:SECRET},clock:s.clock});
  for(const owner of ['synthetic-a','synthetic-b']){
    s.db.prepare('INSERT INTO billingAccounts(ownerId,stripeCustomerId,paymentMethodVerifiedAt,createdAt,updatedAt) VALUES(?,?,?,?,?)').run(owner,'cus_'+owner,s.clock().toISOString(),s.clock().toISOString(),s.clock().toISOString());
    s.db.prepare("UPDATE users SET planStatus='active' WHERE id=?").run(owner);
    const encrypted=encryptCredentialPayload({accessToken:'SYNTHETIC-'+owner,refreshToken:null,tokenType:'Bearer'},{key});
    s.db.prepare('UPDATE calendarConnections SET credentialsCiphertext=?,credentialsIv=?,credentialsTag=?,keyVersion=?,scopesJson=? WHERE ownerId=?').run(encrypted.credentialsCiphertext,encrypted.credentialsIv,encrypted.credentialsTag,encrypted.keyVersion,JSON.stringify(['https://www.googleapis.com/auth/calendar']),owner);
    s.db.prepare('UPDATE quoteAccessKeys SET allowedOriginsJson=? WHERE ownerId=?').run(JSON.stringify([base]),owner);
    tokens[owner]=sessions.create(s.db.prepare('SELECT * FROM users WHERE id=?').get(owner)).token;
  }
  const env={...process.env,NODE_ENV:'test',PORT:String(port),DATABASE_PATH:s.path,PRICEBOOK_PATH:join(directory,'pricebooks'),APP_DATA_DIR:directory,JWT_SECRET:SECRET,BOOKING_SLOT_TOKEN_SECRET:SECRET,BOOKING_SYNTHETIC_PROVIDER:stateFile,CREDENTIAL_ENCRYPTION_KEY:key,CORS_ALLOWED_ORIGINS:base,CLIENT_URL:base,LOCAL_PREVIEW_MODE:'false',LOCAL_PREVIEW:'false',ALLOW_PROVIDER_WRITES:'true',VOICE_RUNTIME_ENABLED:'false',STRIPE_BILLING_ENABLED:'false',GOOGLE_CLIENT_ID:'[SYNTHETIC]',GOOGLE_CLIENT_SECRET:'[SYNTHETIC]',EMAIL_PROVIDER:'console'};
  Object.assign(env,{TWILIO_ACCOUNT_SID:'AC'+'0'.repeat(32),TWILIO_API_KEY_SID:'SK'+'0'.repeat(32),TWILIO_API_KEY_SECRET:'SYNTHETIC-NO-LIVE-SECRET'});
  let child;
  async function stop(){if(child?.exitCode===null){const stopping=child;let timer;stopping.kill();try{await Promise.race([once(stopping,'exit'),new Promise(r=>{timer=setTimeout(()=>{stopping.kill('SIGKILL');r();},5000);timer.unref();})]);}finally{clearTimeout(timer);}}}
  async function boot(){
    child=spawn(process.execPath,['--import','./test/fixtures/bookingCalendarProvider20261006.mjs','server/src/server.js'],{cwd:root,env,stdio:['ignore','pipe','pipe']});
    let output='';for(const stream of [child.stdout,child.stderr])stream.on('data',b=>output+=b);
    const deadline=Date.now()+20000;
    while(!output.includes('Off The Clock AI server listening')){assert.equal(child.exitCode,null,output);if(Date.now()>deadline)throw Error(output);await new Promise(r=>setTimeout(r,25));}
  }
  t.after(async()=>{await stop();for(const cleanup of cleanups)await cleanup();});
  await boot();
  async function request(path,{method='GET',body,owner='synthetic-a',idempotencyKey,publicRequest=false}={}){
    const response=await fetch(base+path,{method,headers:{'content-type':'application/json',Origin:base,...(!publicRequest&&owner?{authorization:'Bearer '+tokens[owner]}:{}),...(idempotencyKey?{'Idempotency-Key':idempotencyKey}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:response.status,body:await response.json()};
  }
  const filters={fromDate:s.date,days:1,scopeConfirmation:'UNCHANGED',customer:CUSTOMER,location:LOCATION};
  return {...s,base,tokens,request,provider,changeProvider,filters,restartApplication:async()=>{await stop();await boot();}};
}
