import {decryptCredentialPayload} from './credentialEncryption.js';

// No calendar event mutation. A bounded OAuth revocation attempt precedes local
// token deletion, and only the safe outcome is retained in billingCancellations.
export function createCalendarRetentionRevoker({enabled=()=>false,fetchImpl=globalThis.fetch,key,timeoutMs=10000}={}){
  return async connection=>{
    if(!enabled())return 'PROVIDER_DISABLED';
    let credentials;try{credentials=decryptCredentialPayload(connection,{key});}catch{return 'UNREADABLE';}
    const token=credentials.refreshToken||credentials.accessToken;
    if(typeof token!=='string'||!token)return 'UNREADABLE';
    const controller=new AbortController();let timer;
    try{return await Promise.race([
      Promise.resolve().then(()=>fetchImpl('https://oauth2.googleapis.com/revoke',{
        method:'POST',redirect:'error',headers:{'content-type':'application/x-www-form-urlencoded'},
        body:new URLSearchParams({token}).toString(),signal:controller.signal
      })).then(response=>response.status===200?'REVOKED':'FAILED',()=> 'FAILED'),
      new Promise(resolve=>{timer=setTimeout(()=>{controller.abort();resolve('TIMEOUT');},timeoutMs);})
    ]);}finally{clearTimeout(timer);controller.abort();}
  };
}
