import React,{useEffect,useRef,useState} from 'react';
import {Button,Field,Notice,Select,TextInput,Textarea,ErrorMessage} from './ui.jsx';
import {safeExternalUrl,validAppointment,validInstant,validSchedule,validSlot,widgetBranding} from './widgetTransport.js';

const addressLabels={addressLine1:'Project location',addressLine2:'Address line 2',city:'City',region:'State / province',postalCode:'Postal / ZIP code',country:'Country'};
export function WidgetBooking({result,request,branding:providedBranding,cachePrefix,onChangeJob,initialContact={},initialDraft,onPendingChange}) {
  const branding=providedBranding||widgetBranding(null);
  const enabled=typeof result.bookingToken==='string'&&!!result.bookingToken;
  const base=enabled?'/api/public/bookings/'+encodeURIComponent(result.bookingToken):null;
  const cacheKey=cachePrefix+'booking-'+result.quoteId;
  const [restored]=useState(()=>{try{const value=JSON.parse(sessionStorage.getItem(cacheKey)||'null');return value?.token===result.bookingToken?value:null;}catch{return null;}});
  const [draft,setDraft]=useState(()=>({preferredWindows:[{date:'',timeOfDay:''}],note:'',...initialDraft,scopeConfirmation:'',tierName:'',customer:{...initialDraft?.customer,...initialContact,...(initialDraft?.customer?.name!==undefined?{name:initialDraft.customer.name}:{})},location:{...initialDraft?.location},...restored?.draft}));
  const [availability,setAvailability]=useState(restored?.availability||null),[slotId,setSlotId]=useState('');
  const [held,setHeld]=useState(restored?.held||null),[pending,setPending]=useState(restored?.pending||null);
  const [confirmed,setConfirmed]=useState(restored?.confirmed||null),[preference,setPreference]=useState(restored?.preference||null);
  const [busy,setBusy]=useState(false),[error,setError]=useState(null),[addressConfirmed,setAddressConfirmed]=useState(false);
  const [expired,setExpired]=useState(false),[providerPending,setProviderPending]=useState(Boolean(restored?.pending?.confirmationId));
  const inFlight=useRef(false);
  useEffect(()=>{onPendingChange?.(Boolean(pending||held&&!confirmed));return ()=>onPendingChange?.(false);},[pending,held,confirmed,onPendingChange]);
  const estimate=result.resultType==='PARTIAL_ESTIMATE_READY'?result.pricedEstimate:result;
  const tiers=(estimate.options||[]).filter(option=>typeof option.tierName==='string').map(option=>option.tierName);
  function cache(changes={}) {
    try{sessionStorage.setItem(cacheKey,JSON.stringify({token:result.bookingToken,draft,availability,held,pending,confirmed,preference,...changes}));}catch{}
  }
  function change(field,value){const next={...draft,[field]:value};setDraft(next);setAvailability(null);setSlotId('');cache({draft:next,availability:null});}
  function changePreference(field,value){const next={...draft,[field]:value};setDraft(next);cache({draft:next});}
  const call=(action,body,key)=>request(base+'/'+action,{method:'POST',auth:false,body,...(key?{idempotencyKey:key}:{})});
  const scheduling=()=>({scopeConfirmation:draft.scopeConfirmation,customer:draft.customer,location:draft.location,...(draft.tierName?{tierName:draft.tierName}:{})});
  async function loadSlots(){
    const value=await call('availability',scheduling());
    if(!['AVAILABLE','EXTERNAL_HANDOFF','PREFERRED_TIME_ONLY','UNAVAILABLE'].includes(value.status))throw new Error('Availability could not be confirmed. Please try again.');
    if(value.status==='AVAILABLE'&&(!validSchedule(value)||!Array.isArray(value.slots)||!value.slots.every(validSlot)||new Set(value.slots.map(slot=>slot.slotId)).size!==value.slots.length))throw new Error('Available times could not be confirmed. Please try again.');
    if(value.status==='EXTERNAL_HANDOFF'&&!safeExternalUrl(value.externalUrl))throw new Error('The external booking link could not be confirmed.');
    setAvailability(value);setSlotId('');cache({availability:value,pending:null,held:null});
  }
  function returnToJob(err){
    if(!['REQUOTE_REQUIRED','QUOTE_NEEDS_DETAILS'].includes(err.code))return false;
    setPending(null);setHeld(null);setAvailability(null);setProviderPending(false);
    cache({pending:null,held:null,availability:null});
    if(onChangeJob)onChangeJob(draft,err);else setExpired(true);
    return true;
  }
  async function open(){
    if(inFlight.current)return;
    if(draft.scopeConfirmation==='CHANGED'){onChangeJob?.(draft);return;}
    inFlight.current=true;setBusy(true);setError(null);setAvailability(null);
    try{await loadSlots();}catch(err){setError(err);if(!returnToJob(err)&&err.code==='BOOKING_CONTEXT_EXPIRED')setExpired(true);}finally{inFlight.current=false;setBusy(false);}
  }
  async function mutate(action,body,slot){
    if(inFlight.current)return;
    const job=pending||{action,body,key:crypto.randomUUID(),slot};
    inFlight.current=true;setBusy(true);setError(null);setPending(job);cache({pending:job});
    try {
      const saved=job.action==='release'
        ?await request(base+'/holds/'+encodeURIComponent(job.body.holdId),{method:'DELETE',auth:false,idempotencyKey:job.key})
        :await call(job.action,job.body,job.key);
      if(job.action==='holds'){
        if(saved.status!=='HELD'||typeof saved.holdId!=='string'||!saved.holdId||!validInstant(saved.expiresAtUtc)||!validSlot(saved.slot)||saved.slot.slotId!==job.slot.slotId||saved.slot.startUtc!==job.slot.startUtc||saved.slot.endUtc!==job.slot.endUtc)throw new Error('The held time could not be confirmed. Retry the same request.');
        const next={...saved,timezone:availability?.timezone,bookingMode:availability?.bookingMode};
        setHeld(next);setPending(null);setAddressConfirmed(false);cache({held:next,pending:null});
      }else if(job.action==='release'){
        if(saved.status!=='RELEASED'||saved.holdId!==job.body.holdId)throw new Error('The time release could not be confirmed. Retry the same request.');
        setHeld(null);setPending(null);setAvailability(null);setSlotId('');setAddressConfirmed(false);cache({held:null,pending:null,availability:null});
      }else if(job.action==='confirm'){
        if(saved.status==='PENDING_CONFIRMATION'){if(typeof saved.confirmationId!=='string'||!saved.confirmationId)throw new Error('The pending confirmation reference could not be checked. Retry the same request.');const tracked={...job,confirmationId:saved.confirmationId};setPending(tracked);setProviderPending(true);cache({pending:tracked});return;}
        if(!validAppointment(saved,job.slot))throw new Error('The booking acknowledgement could not be confirmed. Retry the same request.');
        setConfirmed({...saved,label:job.slot?.label});setPending(null);setProviderPending(false);cache({confirmed:{...saved,label:job.slot?.label},pending:null});
      }else if(job.action==='preference'){
        if(saved.status!=='REQUESTED'||typeof saved.preferenceRequestId!=='string'||!saved.preferenceRequestId)throw new Error('The preferred-time request could not be confirmed. Retry the same request.');
        setPreference(saved);setPending(null);cache({preference:saved,pending:null});
      }
    }catch(err){
      setError(err);
      if(returnToJob(err)){
        // The server requires updated job facts before booking can continue.
      }else if(['SLOT_UNAVAILABLE','SCHEDULE_CHANGED','HOLD_EXPIRED'].includes(err.code)){
        setPending(null);setHeld(null);setAvailability(null);setAddressConfirmed(false);cache({pending:null,held:null,availability:null});
        try{await loadSlots();}catch(refreshError){setError(refreshError);if(!returnToJob(refreshError)&&refreshError.code==='BOOKING_CONTEXT_EXPIRED')setExpired(true);}
      }else if(err.code==='BOOKING_CONTEXT_EXPIRED'){
        setPending(null);setHeld(null);setExpired(true);cache({pending:null,held:null});
      }else if(err.status===400&&err.code==='INVALID_REQUEST'){
        // The server explicitly rejected the request before accepting a mutation.
        // Preserve the draft, restore editing, and use a new key after correction.
        setPending(null);cache({pending:null});
      }
    }finally{inFlight.current=false;setBusy(false);}
  }
  useEffect(()=>{
    if(!pending?.confirmationId||!enabled)return;
    let stopped=false,timer;
    async function check(){
      try{
        const saved=await request(base+'/confirmations/'+encodeURIComponent(pending.confirmationId),{auth:false});
        if(stopped)return;
        if(saved.status==='CONFIRMED'){
          if(!validAppointment(saved,pending.slot))throw new Error('The appointment details could not be confirmed. Contact the business before relying on this booking.');
          const value={...saved,label:pending.slot?.label};setConfirmed(value);setPending(null);setProviderPending(false);setError(null);cache({confirmed:value,pending:null});return;
        }
        if(saved.status==='FAILED'){
          setPending(null);setHeld(null);setAvailability(null);setProviderPending(false);cache({pending:null,held:null,availability:null});
          setError(new Error(saved.message||'The calendar could not confirm the appointment. Please choose a new time or contact the business.'));return;
        }
        if(saved.status!=='PENDING_CONFIRMATION')throw new Error('The booking status could not be confirmed. Please contact the business.');
        setProviderPending(true);setError(null);
      }catch(err){if(stopped)return;setError(err);}
      if(!stopped)timer=setTimeout(check,3000);
    }
    timer=setTimeout(check,3000);
    return ()=>{stopped=true;clearTimeout(timer);};
  },[pending?.confirmationId,enabled,base,request]);
  function hold(){const slot=availability.slots.find(item=>item.slotId===slotId);if(slot)mutate('holds',{slotId:slot.slotId},slot);}
  function confirm(){mutate('confirm',{holdId:held.holdId,confirmedSlotId:held.slot.slotId,explicitConfirmation:true,...(draft.tierName?{tierName:draft.tierName}:{}),customer:draft.customer,location:draft.location,addressConfirmation:true},held.slot);}
  function requestPreference(){mutate('preference',{scopeConfirmation:draft.scopeConfirmation,preferredWindows:draft.preferredWindows,customer:draft.customer,location:draft.location,...(draft.note?{note:draft.note}:{})});}
  const hasConfirmation=validAppointment(confirmed);
  const needsPreference=availability?.status==='PREFERRED_TIME_ONLY';
  return <section className="widget-next" aria-label="Next steps">
    <h2>Next steps</h2>
    <Button variant="secondary" onClick={()=>onChangeJob?.(draft)} disabled={busy||!!pending||!!held&&!hasConfirmation}>Change job details</Button>
    <p>If work or measurements have changed, update the job details to get a new estimate.</p>
    {hasConfirmation?<Notice title={confirmed.bookingMode==='site_visit_first'?'Site visit booked':'Job booked'}>
      <p>{confirmed.label||confirmed.startLocal}</p><p>{confirmed.timezone}</p><p>Booking reference: {confirmed.appointmentId}</p>
    </Notice>:preference?<Notice title="Preferred time requested"><p>{preference.message||'The business will contact you to confirm a time.'}</p><p>An appointment has not been booked.</p></Notice>:pending?<>
      <Notice title={providerPending?'Confirmation pending':'Booking request awaiting confirmation'}>An appointment is confirmed only after the business calendar confirms it. Retry sends the same request.</Notice>
      {!pending.confirmationId&&<Button disabled={busy} onClick={()=>mutate(pending.action,pending.body,pending.slot)}>{busy?'Checking confirmation':'Retry booking request'}</Button>}
    </>:expired?<Notice title="Check the current job details">Return to the job details to get an updated quote or review before arranging a time.</Notice>:enabled?<>
      {!held&&<fieldset disabled={busy} className="wizard-fields">
        <h3>Contact and job site</h3>
        <p>These details arrange the visit. Use Change job details above for any change to the quoted work or measurements.</p>
        <Field label="Name"><TextInput autoComplete="name" value={draft.customer?.name||''} onChange={event=>change('customer',{...draft.customer,name:event.target.value})}/></Field>
        <Field label="Email"><TextInput type="email" autoComplete="email" value={draft.customer?.email||''} onChange={event=>change('customer',{...draft.customer,email:event.target.value})}/></Field>
        <Field label="Phone"><TextInput type="tel" autoComplete="tel" value={draft.customer?.phone||''} onChange={event=>change('customer',{...draft.customer,phone:event.target.value})}/></Field>
        {Object.entries(addressLabels).map(([key,label])=><Field key={key} label={label}><TextInput value={draft.location?.[key]||''} onChange={event=>change('location',{...draft.location,[key]:event.target.value})}/></Field>)}
        <Field label="Have the work or measurements changed since this estimate?"><Select aria-label="Have the work or measurements changed since this estimate?" value={draft.scopeConfirmation} onChange={event=>change('scopeConfirmation',event.target.value)}><option value="">Choose an answer</option><option value="UNCHANGED">No, the job details are unchanged</option><option value="CHANGED">Yes, I need to update the job details</option></Select></Field>
        {tiers.length>1&&<Field label="Choose an estimate option"><Select aria-label="Choose an estimate option" value={draft.tierName} onChange={event=>change('tierName',event.target.value)}><option value="">Choose an option</option>{tiers.map(name=><option key={name} value={name}>{name}</option>)}</Select></Field>}
      </fieldset>}
      {held?<>
        <h3>Check your appointment details</h3><p>{held.slot.label}</p><p>{held.timezone}</p>
        <p>{held.bookingMode==='site_visit_first'?'Site visit':'Job appointment'}</p>
        <dl>{Object.entries(draft.customer||{}).filter(([,value])=>value).map(([key,value])=><React.Fragment key={key}><dt>{key}</dt><dd>{value}</dd></React.Fragment>)}
        {Object.entries(draft.location||{}).filter(([,value])=>value).map(([key,value])=><React.Fragment key={key}><dt>{addressLabels[key]||key}</dt><dd>{value}</dd></React.Fragment>)}</dl>
        <label className="widget-confirmation"><input type="checkbox" checked={addressConfirmed} onChange={event=>setAddressConfirmed(event.target.checked)}/> I confirm this appointment, contact information and job site.</label>
        <Button disabled={busy||!addressConfirmed} onClick={confirm}>{busy?'Confirming appointment':'Confirm appointment'}</Button>
        <Button variant="secondary" disabled={busy} onClick={()=>mutate("release",{holdId:held.holdId},held.slot)}>Change appointment details</Button>
        <p>This releases the held time so you can correct the contact, job site or time before confirming.</p>
      </>:!availability?<Button onClick={open} disabled={busy||!draft.scopeConfirmation||(tiers.length>1&&!draft.tierName)}>{busy?'Checking availability':draft.scopeConfirmation==='CHANGED'?'Update job details':'Book it'}</Button>:<>
        {availability.reason&&<p>{availability.reason}</p>}
        {availability.status==='AVAILABLE'&&<>
          <h3>{availability.bookingMode==='site_visit_first'?'Choose a site visit':'Choose a job appointment'}</h3><p>Times shown in {availability.timezone}.</p>
          {availability.slots.length?<fieldset className="widget-slots"><legend>Available times</legend>{availability.slots.map(slot=><label key={slot.slotId}><input type="radio" name="slot" checked={slotId===slot.slotId} onChange={()=>setSlotId(slot.slotId)}/>{slot.label}</label>)}</fieldset>:<Notice>No online times are currently available. Contact the business to arrange a time.</Notice>}
          {!!availability.slots.length&&<Button onClick={hold} disabled={busy||!slotId}>Review appointment</Button>}
          <Button variant="secondary" onClick={open} disabled={busy}>Refresh available times</Button>
        </>}
        {availability.status==='EXTERNAL_HANDOFF'&&<><p>Continue to the business's booking site to choose and confirm a time.</p><a className="button button-primary" href={safeExternalUrl(availability.externalUrl)} target="_blank" rel="noopener noreferrer">Open booking site</a></>}
        {needsPreference&&<>
          <h3>Request a preferred time</h3><p>The business will confirm availability with you. This does not book an appointment.</p>
          {draft.preferredWindows.map((window,index)=><div key={index} className="field-stack"><Field label={'Preferred date '+(index+1)}><TextInput type="date" value={window.date} onChange={event=>{const next=draft.preferredWindows.map((item,i)=>i===index?{...item,date:event.target.value}:item);changePreference('preferredWindows',next);}}/></Field>
            <Field label={'Preferred time '+(index+1)}><Select aria-label={"Preferred time "+(index+1)} value={window.timeOfDay} onChange={event=>changePreference('preferredWindows',draft.preferredWindows.map((item,i)=>i===index?{...item,timeOfDay:event.target.value}:item))}><option value="">Choose a time of day</option><option value="morning">Morning</option><option value="afternoon">Afternoon</option><option value="evening">Evening</option></Select></Field></div>)}
          {draft.preferredWindows.length<3&&<Button variant="secondary" onClick={()=>changePreference('preferredWindows',[...draft.preferredWindows,{date:'',timeOfDay:''}])}>Add another preferred time</Button>}
          <Field label="Scheduling note"><Textarea aria-label="Scheduling note" maxLength={500} value={draft.note} onChange={event=>changePreference('note',event.target.value)}/></Field>
          <Button onClick={requestPreference} disabled={busy||draft.preferredWindows.some(window=>!window.date||!window.timeOfDay)}>Request preferred time</Button>
        </>}
        {availability.status==='UNAVAILABLE'&&<Notice>Online booking is unavailable for this request. Contact the business to arrange the next step.</Notice>}
      </>}
    </>:<p>Online booking is not available for this request. The business has your contact details.</p>}
    {branding.phone&&<a className="button button-secondary widget-call" href={'tel:'+branding.phone}>Talk to us</a>}
    {error&&<div role="alert"><ErrorMessage error={error}/></div>}
  </section>;
}
