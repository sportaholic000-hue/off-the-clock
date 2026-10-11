import {decryptCredentialPayload,encryptCredentialPayload} from './credentialEncryption.js';

export function retainCalendarRefreshToken(connection,{key}={}){
  const credentials=decryptCredentialPayload(connection,{key});
  if(typeof credentials.refreshToken!=='string'||!credentials.refreshToken)throw Error('CALENDAR_REFRESH_TOKEN_UNAVAILABLE');
  return encryptCredentialPayload({refreshToken:credentials.refreshToken},{key,keyVersion:connection.keyVersion});
}
// Revoke the refresh token, which removes the grant. An access token alone is
// insufficient evidence that the retained refresh grant is gone.
export function createCalendarRetentionRevoker({enabled=()=>false,fetchImpl=globalThis.fetch,key,timeoutMs=10000}={}){
  const revoke=async connection=>{
    if(!enabled())return 'PROVIDER_DISABLED';
    let credentials;try{credentials=decryptCredentialPayload(connection,{key});}catch{return 'UNREADABLE';}
    const token=credentials.refreshToken;
    if(typeof token!=='string'||!token)return 'UNREADABLE';
    const controller=new AbortController();let timer;
    try{return await Promise.race([
      Promise.resolve().then(()=>fetchImpl('https://oauth2.googleapis.com/revoke',{
        method:'POST',redirect:'error',headers:{'content-type':'application/x-www-form-urlencoded'},
        body:new URLSearchParams({token}).toString(),signal:controller.signal
      })).then(async response=>{
        if(response.status===200)return 'REVOKED';
        if(response.status===400){
          const body=await response.json().catch(()=>null);
          if(body?.error==='invalid_token')return 'ALREADY_REVOKED';
        }
        return 'FAILED';
      }).catch(()=> 'FAILED'),
      new Promise(resolve=>{timer=setTimeout(()=>{resolve('TIMEOUT');controller.abort();},timeoutMs);})
    ]);}finally{clearTimeout(timer);controller.abort();}
  };
  revoke.retain=connection=>retainCalendarRefreshToken(connection,{key});
  return revoke;
}
