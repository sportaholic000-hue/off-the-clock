import {ownerAlertEmailReady} from './ownerAlertEmail.js';
export function createQuoteEmailProvider({environment=process.env,fetchClient=globalThis.fetch}={}){
  const ready=()=>ownerAlertEmailReady(environment);
  const request=async(path,options,signal)=>{
    if(!ready())throw Object.assign(Error('Email unavailable'),{code:'EMAIL_NOT_CONFIGURED',definitive:true});
    const response=await fetchClient('https://api.resend.com/emails'+path,{...options,redirect:'error',
      signal:signal?AbortSignal.any([signal,AbortSignal.timeout(5000)]):AbortSignal.timeout(5000),
      headers:{Authorization:'Bearer '+environment.RESEND_API_KEY,...options.headers}});
    if(!response.ok)throw Object.assign(Error('Email provider rejected request'),{definitive:[400,401,403,404,422].includes(response.status)});
    return response.json();
  };
  return {ready,async send(message,{signal}={}){
    const result=await request('',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':message.idempotencyKey},
      body:JSON.stringify({from:message.from,to:[message.to],reply_to:message.replyTo,subject:message.subject,text:message.text})},signal);
    if(typeof result?.id!=='string'||!result.id||result.id.length>200)throw Error('Email acceptance unknown');
    return {accepted:true,id:result.id};
  },read:(id,{signal}={})=>request('/'+encodeURIComponent(id),{method:'GET'},signal)};
}
