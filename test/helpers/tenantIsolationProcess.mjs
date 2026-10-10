import {fork} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {productionEnv} from './railwayEnv.mjs';

export async function startTenantIsolation(t,{production=false,configured=true}={}) {
  const directory=mkdtempSync(path.join(tmpdir(),'otc-tenant-isolation-'));
  const probe=createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
  const origin='https://synthetic-app.example.invalid';
  const env={...process.env,...productionEnv(directory),NODE_ENV:production?'production':'test',PORT:String(port),
    DATABASE_PATH:production?path.join(directory,'off-the-clock.sqlite'):path.join(directory,'synthetic.sqlite'),PRICEBOOK_PATH:path.join(directory,'pricebooks'),
    PUBLIC_BASE_URL:origin,CLIENT_URL:origin,CORS_ALLOWED_ORIGINS:origin,LOCAL_PREVIEW_MODE:production?'false':'true',
    STRIPE_BILLING_ENABLED:configured?'true':'false',STRIPE_SECRET_KEY:'sk_'+(production?'live':'test')+'_SYNTHETIC_NEVER_LIVE',STRIPE_WEBHOOK_SECRET:'whsec_SYNTHETIC',
    STRIPE_STARTER_MONTHLY_PRICE_ID:'price_SYNTHETIC_starter_month',STRIPE_STARTER_ANNUAL_PRICE_ID:'price_SYNTHETIC_starter_year',
    STRIPE_OPERATOR_MONTHLY_PRICE_ID:'price_synthetic_O_month',STRIPE_OPERATOR_ANNUAL_PRICE_ID:'price_synthetic_O_year',STRIPE_QUOTEDONE_MONTHLY_PRICE_ID:'price_synthetic_Q_month',STRIPE_QUOTEDONE_ANNUAL_PRICE_ID:'price_synthetic_Q_year',
    STRIPE_CHECKOUT_SUCCESS_URL:origin+'/billing/success',STRIPE_CHECKOUT_CANCEL_URL:origin+'/billing/cancel',STRIPE_PORTAL_RETURN_URL:origin+'/billing',STRIPE_INTEGRATION_IDENTIFIER:'Synthetic_abcdefgh',
    TWILIO_ACCOUNT_SID:'AC'+'a'.repeat(32),TWILIO_AUTH_TOKEN:'SYNTHETIC_TWILIO_SIGNING_TOKEN',TWILIO_API_KEY_SID:'SK'+'a'.repeat(32),TWILIO_API_KEY_SECRET:'SYNTHETIC_API_KEY_SECRET',
    GEMINI_API_KEY:'SYNTHETIC_GEMINI_KEY',GEMINI_MODEL:'synthetic-live-model',ALLOW_PROVIDER_WRITES:configured?'true':'false',VOICE_RUNTIME_ENABLED:configured?'true':'false',
    DEMO_ENABLED:'true',DEMO_ALLOWED_ORIGINS:origin,OUTBOUND_WEBHOOKS_ENABLED:'false',EMAIL_DELIVERY_ENABLED:'false',
    GOOGLE_CLIENT_ID:'synthetic-client',GOOGLE_CLIENT_SECRET:'synthetic-secret',GOOGLE_CALENDAR_REDIRECT_URI:origin+'/api/onboarding/calendar/google/callback',
    RAILWAY_ENVIRONMENT_ID:'',ADMIN_EMAIL:'',ADMIN_PASSWORD_HASH:''};
  const child=fork(new URL('./tenantIsolationFixture.mjs',import.meta.url),[],{env,execArgv:['--experimental-test-module-mocks'],stdio:['ignore','pipe','pipe','ipc']});
  let output='',counter=0;child.stdout.on('data',data=>output+=data);child.stderr.on('data',data=>output+=data);
  const stop=async()=>{
    if(child.exitCode===null){const exited=once(child,'exit');child.kill('SIGTERM');let timer;await Promise.race([exited,new Promise(resolve=>{timer=setTimeout(()=>{child.kill('SIGKILL');resolve();},5000);})]);clearTimeout(timer);}
    rmSync(directory,{recursive:true,force:true});
  };
  t?.after(stop);
  let ready;
  try {
    ready=await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('Synthetic startup timed out: '+output)),30000);
      child.on('message',message=>{if(message.ready){clearTimeout(timer);resolve(message);}});
      child.on('exit',code=>{clearTimeout(timer);reject(Error('Synthetic startup exit '+code+': '+output));});
      child.on('error',error=>{clearTimeout(timer);reject(error);});
    });
  }catch(error){await stop();throw error;}
  const rpc=(command,extra={})=>new Promise((resolve,reject)=>{
    const id=++counter,timer=setTimeout(()=>{child.off('message',listener);reject(Error('Synthetic command timeout'));},5000);
    const listener=message=>{if(message.id!==id)return;clearTimeout(timer);child.off('message',listener);message.error?reject(Error(message.error)):resolve(message.result);};
    child.on('message',listener);child.send({id,command,...extra});
  });
  const request=async(route,{method='GET',body,token,headers={}}={})=>{
    const response=await fetch('http://127.0.0.1:'+ready.port+route,{method,headers:{...(token?{authorization:'Bearer '+token}:{}),...(body===undefined?{}:{'content-type':'application/json'}),...headers},...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)}),redirect:'manual',signal:AbortSignal.timeout(5000)});
    return {status:response.status,text:await response.text(),headers:Object.fromEntries(response.headers)};
  };
  return {...ready,directory,env,origin,request,rpc,stop,output:()=>output};
}
