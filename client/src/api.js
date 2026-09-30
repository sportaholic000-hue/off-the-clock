import {sessionClaims,sessionIdentity} from './sessionIdentity.js';
const API_BASE=(import.meta.env?.VITE_API_URL??(import.meta.env?.DEV?'http://localhost:3000':'')).replace(/\/$/,'');
const refreshFlights=new Map();
export function getToken(){return localStorage.getItem('otc_token');}
export function getSessionKey(token=getToken()){return sessionIdentity(token);}
export function setToken(token,{notify=true}={}) {
  if(token)localStorage.setItem('otc_token',token);else localStorage.removeItem('otc_token');
  if(notify)window.dispatchEvent(new Event('otc:session'));
}
function requestError(payload,status) {
  const error=new Error(payload.error||'Request failed');error.status=status;error.details=payload.details;error.code=payload.code;return error;
}
function changed(){return requestError({error:'The signed-in account changed. Please try again.',code:'SESSION_CHANGED'},401);}
async function responseBody(response){return response.json().catch(()=>({}));}
export function refreshSession() {
  const original=getToken(),identity=getSessionKey(original);
  if(!original)return Promise.reject(requestError({error:'Please sign in again.',code:'SESSION_INVALID'},401));
  if(refreshFlights.has(identity))return refreshFlights.get(identity);
  const promise=(async()=>{
    for(let attempt=0;attempt<3;attempt++){
      if(getSessionKey()!==identity)throw changed();
      const response=await fetch(API_BASE+'/api/auth/refresh',{method:'POST',credentials:'include',headers:{accept:'application/json',authorization:'Bearer '+getToken()}});
      const payload=await responseBody(response);
      if(getSessionKey()!==identity)throw changed();
      if(response.status===409&&payload.code==='SESSION_REFRESH_CONFLICT'&&attempt<2){
        await new Promise(resolve=>setTimeout(resolve,150*(attempt+1)));continue;
      }
      if(!response.ok){
        if(response.status===401){setToken(null,{notify:true});}
        throw requestError(payload,response.status);
      }
      if(typeof payload.token!=='string'||getSessionKey(payload.token)!==identity)throw changed();
      setToken(payload.token,{notify:true});return payload.token;
    }
  })().finally(()=>{if(refreshFlights.get(identity)===promise)refreshFlights.delete(identity);});
  refreshFlights.set(identity,promise);return promise;
}
export async function logout() {
  const identity=getSessionKey();
  if(refreshFlights.has(identity))await refreshFlights.get(identity).catch(()=>{});
  if(getSessionKey()!==identity)throw changed();
  const token=getToken();
  const response=await fetch(API_BASE+'/api/auth/logout',{method:'POST',credentials:'include',
    headers:{accept:'application/json',...(token?{authorization:'Bearer '+token}:{})}});
  const payload=await responseBody(response);
  if(!response.ok)throw requestError(payload,response.status);
  if(payload.ok!==true)throw requestError({error:'Sign-out could not be confirmed. Please try again.'},503);
  if(getSessionKey()===identity)setToken(null,{notify:true});
}
export async function api(path,{method='GET',body,auth=true,idempotencyKey}={}) {
  if(!auth&&/^\/api\/auth\/(?:login|register|admin-login)$/.test(path)){
    const flight=refreshFlights.get(getSessionKey());if(flight)await flight.catch(()=>{});
  }
  const identity=getSessionKey(),initial=getToken();
  if(auth&&initial){const expiry=sessionClaims(initial)?.exp;if(Number.isSafeInteger(expiry)&&expiry*1000<=Date.now()+30000)await refreshSession();}
  const execute=async()=>{
    if(auth&&getSessionKey()!==identity)throw changed();
    const token=auth?getToken():null,headers={accept:'application/json'};
    if(idempotencyKey)headers['Idempotency-Key']=idempotencyKey;
    if(body!==undefined)headers['content-type']='application/json';
    if(token)headers.authorization='Bearer '+token;
    const response=await fetch(API_BASE+path,{method,headers,credentials:auth||path.startsWith('/api/auth/')?'include':'omit',
      body:body===undefined?undefined:JSON.stringify(body)});
    return {response,payload:await responseBody(response),token};
  };
  let result=await execute();
  if(auth&&initial&&result.response.status===401){
    if(getSessionKey()!==identity)throw changed();
    if(getToken()===result.token)await refreshSession();
    result=await execute();
  }
  if(!result.response.ok)throw requestError(result.payload,result.response.status);
  if(auth&&getSessionKey()!==identity)throw changed();
  return result.payload;
}
export function go(path){window.history.pushState({},'',path);window.dispatchEvent(new PopStateEvent('popstate'));}
