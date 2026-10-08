import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
export function syntheticVoiceEnvironment(dataDirectory='/data/app'){
 return {NODE_ENV:'production',PORT:'3000',APP_DATA_DIR:dataDirectory,RAILWAY_VOLUME_MOUNT_PATH:dataDirectory,TRUST_PROXY:'railway',RAILWAY_ENVIRONMENT_ID:'synthetic-docker-proof',RAILWAY_DEPLOYMENT_DRAINING_SECONDS:'120',SHUTDOWN_TIMEOUT_SECONDS:'5',
  DATABASE_PATH:dataDirectory+'/off-the-clock.sqlite',PRICEBOOK_PATH:dataDirectory+'/pricebooks',
  JWT_SECRET:'SYNTHETIC-JWT-NEVER-LIVE-'.repeat(3),BOOKING_SLOT_TOKEN_SECRET:'SYNTHETIC-BOOKING-NEVER-LIVE-'.repeat(3),CREDENTIAL_ENCRYPTION_KEY:'000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f',
  PUBLIC_BASE_URL:'https://synthetic-receptionist.example.invalid',CLIENT_URL:'https://synthetic-receptionist.example.invalid',CORS_ALLOWED_ORIGINS:'https://synthetic-receptionist.example.invalid',
  ALLOW_PROVIDER_WRITES:'true',VOICE_RUNTIME_ENABLED:'true',STRIPE_BILLING_ENABLED:'false',EMAIL_DELIVERY_ENABLED:'false',OUTBOUND_WEBHOOKS_ENABLED:'false',DEMO_ENABLED:'false',
  TWILIO_ACCOUNT_SID:'AC'+'a'.repeat(32),TWILIO_AUTH_TOKEN:'synthetic-token',TWILIO_API_KEY_SID:'SK'+'b'.repeat(32),TWILIO_API_KEY_SECRET:'synthetic-secret',GEMINI_API_KEY:'synthetic-key',GEMINI_MODEL:'synthetic-live-model',
  BACKUP_INTERVAL_SECONDS:'21600',BACKUP_RETENTION_DAYS:'30'};
}
async function smoke(image){
 const name='synthetic-receptionist-'+randomUUID(),docker=(args)=>execFileSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']});
 try{
  // No network interface: synthetic credentials can never contact a provider.
  docker(['run','--detach','--name',name,'--network','none','--tmpfs','/data/app',...Object.entries(syntheticVoiceEnvironment()).flatMap(([k,v])=>['--env',k+'='+v]),image]);
  let healthy=false,last='';
  for(let i=0;i<60;i++){
   try{docker(['exec',name,'node','--input-type=module','-e',`import assert from 'node:assert/strict';import {existsSync} from 'node:fs';import {voiceRouteReadiness} from './server/src/voice/voiceReadiness.js';assert.equal(existsSync('/app/specs'),false);assert.equal(voiceRouteReadiness().ready,true);assert.equal((await fetch('http://127.0.0.1:3000/api/health')).status,200);`]);healthy=true;break;}catch(error){last=error.stderr?.toString()||error.message;}
   await new Promise(resolve=>setTimeout(resolve,500));
  }
  assert.ok(healthy,'Voice-enabled image did not become healthy: '+last+'\n'+docker(['logs',name]));
  console.log('PASS: production Docker image, no specs, voice enabled, synthetic credentials, network disabled, /api/health 200');
 }finally{try{docker(['rm','--force',name]);}catch{}}
}
if(process.argv[1]?.endsWith('/docker-voice-smoke.mjs'))await smoke(process.argv[2]||'otc-receptionist:synthetic');
