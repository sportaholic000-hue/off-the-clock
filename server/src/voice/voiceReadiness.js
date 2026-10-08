import {validLiveModelName} from './liveModelName.js';
export function voiceRouteReadiness({env=process.env,runtimeConfig}={}){
  const missing=[];
  if(!(runtimeConfig?.voiceRuntime??String(env.VOICE_RUNTIME_ENABLED).toLowerCase()==='true'))missing.push('Voice runtime');
  if(!(runtimeConfig?.providerWrites??String(env.ALLOW_PROVIDER_WRITES).toLowerCase()==='true'))missing.push('Provider operations');
  if(!/^AC[0-9a-f]{32}$/i.test(env.TWILIO_ACCOUNT_SID||'')||!env.TWILIO_AUTH_TOKEN)missing.push('Signed inbound authentication');
  let base;try{base=new URL(env.PUBLIC_BASE_URL);}catch{}
  if(!base||base.protocol!=='https:'||base.origin!==String(env.PUBLIC_BASE_URL).replace(/\/$/,'')||base.username||base.password)missing.push('Inbound public URL');
  if(!env.GEMINI_API_KEY||!validLiveModelName(env.GEMINI_MODEL))missing.push('Live voice provider');
  if(Buffer.byteLength(env.VOICE_HANDLE_SECRET||env.BOOKING_SLOT_TOKEN_SECRET||env.JWT_SECRET||'')<32)missing.push('Voice session security');
  return {ready:missing.length===0,missing};
}
