// Uses the application's existing transactional email provider. No console
// simulation counts as delivery, and disabled writes never call the provider.
export function ownerAlertEmailReady(env=process.env){
  return env.ALLOW_PROVIDER_WRITES==='true'&&env.EMAIL_PROVIDER==='resend'&&env.EMAIL_DELIVERY_ENABLED==='true'&&
    typeof env.RESEND_API_KEY==='string'&&Boolean(env.RESEND_API_KEY)&&!/[\r\n]/.test(env.RESEND_API_KEY)&&
    typeof env.EMAIL_FROM==='string'&&/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(env.EMAIL_FROM);
}
export function createOwnerAlertEmailSender({environment=process.env,fetchClient=globalThis.fetch}={}){
  return async ({from,to,subject,text,idempotencyKey},{signal}={})=>{
    if(!ownerAlertEmailReady(environment))throw Object.assign(Error('Owner email unavailable'),{code:'EMAIL_NOT_CONFIGURED',definitive:true});
    const response=await fetchClient('https://api.resend.com/emails',{method:'POST',redirect:'error',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(5000)]):AbortSignal.timeout(5000),
      headers:{'Content-Type':'application/json',Authorization:'Bearer '+environment.RESEND_API_KEY,'Idempotency-Key':idempotencyKey},
      body:JSON.stringify({from,to:[to],subject,text})});
    if(!response.ok)throw Object.assign(Error('Owner email rejected'),{code:'EMAIL_PROVIDER_REJECTED',definitive:[400,401,403,404,422].includes(response.status)});
    const body=await response.json();
    if(typeof body.id!=='string'||!body.id||body.id.length>200)throw Object.assign(Error('Owner email acceptance unknown'),{code:'EMAIL_ACCEPTANCE_UNKNOWN'});
    return {accepted:true,id:body.id};
  };
}
