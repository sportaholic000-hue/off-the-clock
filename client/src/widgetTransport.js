const QUOTE_VERSION='2026-09-29.1';
export function catalogMode(value) {
  if (!value || !Array.isArray(value.services)) throw new Error('Services could not be loaded. Please try again.');
  if (value.contractVersion === undefined) return 'legacy';
  if (value.contractVersion !== QUOTE_VERSION || value.capabilities?.quoteEnvelope !== 'pricing-only-v2'
      || value.capabilities?.booking !== 'booking-v1' || value.capabilities?.postQuoteIdentity !== true || value.capabilities?.serverPricingOnly !== true)
    throw new Error('This form needs an update to match the business. Reload the page before continuing.');
  return 'pricing-only-v2';
}
export function pricingEnvelope(submission,mode) {
  if(mode!=='pricing-only-v2')return submission;
  // Only omit blank fields that the earlier form generated. Existing supplied
  // details remain intact so the server can reject an old shape explicitly.
  const next={...submission};
  if(!next.contact||typeof next.contact!=='object'||Array.isArray(next.contact))return next;
  next.contact={...next.contact};
  if(next.contact.name===undefined||next.contact.name==='')delete next.contact.name;
  const fields=['addressLine1','addressLine2','city','region','postalCode','country'];
  if(next.location&&typeof next.location==='object'&&!Array.isArray(next.location)
      &&Object.entries(next.location).every(([key,value])=>fields.includes(key)&&(value===''||value===undefined)))delete next.location;
  return next;
}
export function createWidgetRequest(origin) {
  const base=new URL(origin),local=['localhost','127.0.0.1','[::1]'].includes(base.hostname);
  if(base.protocol!=='https:'&&!(local&&base.protocol==='http:'))throw new Error('The widget requires HTTPS.');
  return async function request(path,{method='GET',body,idempotencyKey}={}) {
    const supported=value=>value.startsWith('/api/public/quote/')||value.startsWith('/api/public/bookings/');
    if(!supported(path)||!supported(new URL(path,base.origin).pathname))throw new Error('Unsupported widget request.');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
    try {
      const response=await fetch(new URL(path,base.origin),{method,credentials:'omit',signal:controller.signal,
        headers:{accept:'application/json',...(body===undefined?{}:{'content-type':'application/json'}),...(idempotencyKey?{'Idempotency-Key':idempotencyKey}:{})},
        ...(body===undefined?{}:{body:JSON.stringify(body)})}).catch(error=>{
          if(error?.name==='AbortError')throw error;
          throw new Error('The estimate service could not be reached. Please retry the same request.');
        });
      const payload=await response.json().catch(()=>null);
      if(!response.ok){
        const unavailable=path.startsWith('/api/public/quote/')&&[403,404].includes(response.status);
        const error=new Error(unavailable?'Online estimates are unavailable from this page. Please contact the business.':payload?.error||payload?.message||'The request could not be completed. Please try again.');
        error.status=response.status;error.code=payload?.code;error.details=payload?.details;throw error;
      }
      if(!payload||typeof payload!=='object')throw new Error('The business response could not be confirmed. Please try again.');
      return payload;
    } catch(error) {
      if(error.name==='AbortError')throw new Error('The response has not arrived. Please retry the same request.');
      throw error;
    } finally {clearTimeout(timer);}
  };
}
export function widgetBranding(value) {
  return {
    businessName:typeof value?.businessName==='string'&&value.businessName.trim()?value.businessName:'Off The Clock AI',
    accentColor:/^#[0-9a-f]{6}$/i.test(value?.accentColor||'')?value.accentColor:'#00E676',
    launcherLabel:typeof value?.launcherLabel==='string'&&value.launcherLabel.trim()?value.launcherLabel:'Get an estimate',
    phone:typeof value?.clickToCallNumber==='string'&&/^\+[1-9][0-9]{6,14}$/.test(value.clickToCallNumber)?value.clickToCallNumber:null
  };
}
export function validInstant(value) {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?Z$/.test(value))return false;
  const time=Date.parse(value);return Number.isFinite(time)&&new Date(time).toISOString().slice(0,19)===value.slice(0,19);
}
export function validSchedule(value) {
  if(!value||!['site_visit_first','book_job'].includes(value.bookingMode)||typeof value.timezone!=='string')return false;
  try{new Intl.DateTimeFormat('en',{timeZone:value.timezone});}catch{return false;}return true;
}
export function validSlot(value) {
  return typeof value?.slotId==='string'&&!!value.slotId&&typeof value.label==='string'&&!!value.label.trim()
    &&validInstant(value.startUtc)&&validInstant(value.endUtc)&&Date.parse(value.endUtc)>Date.parse(value.startUtc);
}
export function validAppointment(value,slot) {
  return value?.status==='CONFIRMED'&&value.calendarEventStatus==='CONFIRMED'
    &&typeof value.appointmentId==='string'&&!!value.appointmentId&&validSchedule(value)
    &&validInstant(value.startUtc)&&validInstant(value.endUtc)&&Date.parse(value.endUtc)>Date.parse(value.startUtc)
    &&(!slot||(value.startUtc===slot.startUtc&&value.endUtc===slot.endUtc));
}
export function safeExternalUrl(value) {
  try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:null;}catch{return null;}
}
