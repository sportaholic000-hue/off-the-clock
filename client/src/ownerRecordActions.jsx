import React,{useRef,useState} from 'react';
import {api,go,getSessionKey} from './api.js';
import {Button,Field,Notice,Select,TextInput,Textarea,ErrorMessage} from './ui.jsx';
import {WidgetBooking} from './widgetBooking.jsx';
import {localDateTimeCandidates} from '../../server/src/calendarTime.js';

function OwnerBooking({row}) {
  const intent=row.workflow?.bookingIntent;
  const request=useRef((path,options)=>api(path.replace('/api/public/bookings/','/api/bookings/'),{...options,auth:true})).current;
  if(!intent)return <Notice>A booking follow-up is saved. Check the calendar and confirm the job scope before agreeing a time.</Notice>;
  return <><Notice>Confirm the time and address with the customer yourself. This form sends no caller text, email, invitation or reminder.</Notice>
    <WidgetBooking result={{...(row.result||{}),quoteId:row.id,bookingToken:intent.id}} request={request} cachePrefix={'owner-booking-'+getSessionKey()+'-'} initialContact={row.contact} initialDraft={{location:row.location}}/>
  </>;
}
export function OwnerRecordActions({row,kind,onSaved}) {
  const workflow=row.workflow||{version:0,history:[]},estimate=row.result?.pricedEstimate||row.result;
  const [action,setAction]=useState('CALL_BACK'),[note,setNote]=useState(''),[dueAt,setDueAt]=useState(''),[attested,setAttested]=useState(false),[tierName,setTierName]=useState(''),[invoiceAmount,setInvoiceAmount]=useState('');
  const [review,setReview]=useState({low:estimate?.lowEstimate===undefined?'':String(estimate.lowEstimate),high:estimate?.highEstimate===undefined?'':String(estimate.highEstimate),currency:estimate?.currency||'',scope:estimate?.pricedScope?.service||row.describedService||row.serviceType||'',qualifications:estimate?.disclaimer||'',taxTreatment:estimate?.taxTreatment||'',priceUnit:estimate?.priceUnit||'per job'});
  const [busy,setBusy]=useState(false),[error,setError]=useState(null),[saved,setSaved]=useState(false),pending=useRef(null);
  const mutable=!['DISMISSED','SUPERSEDED','INVOICED','REVIEWED'].includes(row.status);
  const transitions=kind==='quotes'?({INSTANT:['SENT'],SENT:['VIEWED','ACCEPTED'],VIEWED:['ACCEPTED'],ACCEPTED:row.canReview?['INVOICED']:[]}[row.status]||[]):[];
  const labels={CALL_BACK:'Call back',BOOK:'Book',COMPLETE_FOLLOW_UP:'Complete follow-up',DISMISS:'Dismiss',REOPEN:'Reopen for review',REVIEW:'Owner review',SENT:'Record quote shared',VIEWED:'Record quote viewed',ACCEPTED:'Record quote accepted',INVOICED:'Record final invoice'};
  const choices=['CALL_BACK','BOOK',...(workflow.followUpStatus==='OPEN'?['COMPLETE_FOLLOW_UP']:[]),...(row.status==='DISMISSED'?['REOPEN']:mutable&&!['ACCEPTED'].includes(row.status)?['DISMISS']:[]),...(row.canReview&&mutable&&row.status!=='ACCEPTED'?['REVIEW']:[]),...transitions];
  const selected=choices.includes(action)?action:choices[0];
  const progressed=['SENT','VIEWED','ACCEPTED','INVOICED'].includes(selected);
  async function submit(event){event.preventDefault();if(busy)return;setBusy(true);setError(null);setSaved(false);
    try {
      let deadline;
      if(['CALL_BACK','BOOK'].includes(selected)&&dueAt){const [date,time]=dueAt.split('T'),candidates=localDateTimeCandidates(date,time,workflow.timezone);if(candidates.length!==1)throw Error('Choose an unambiguous follow-up time in the business timezone.');deadline=candidates[0];}
      const draft={action:selected,version:workflow.version,note,...(deadline?{dueAt:deadline}:{}),...(selected==='REVIEW'?{estimate:review}:{}),...(progressed?{attested}:{}),...(selected==='ACCEPTED'&&estimate?.options?.length>1?{tierName}:{}),...(selected==='INVOICED'?{invoiceAmount}: {})};
      const digest=JSON.stringify(draft);if(pending.current?.digest!==digest)pending.current={digest,body:{...draft,idempotencyKey:crypto.randomUUID()}};
      await api('/api/owner-records/'+kind+'/'+encodeURIComponent(row.id)+'/actions',{method:'POST',body:pending.current.body});
      pending.current=null;await onSaved?.();setSaved(true);setAttested(false);setNote('');
    }catch(nextError){setError(nextError);}finally{setBusy(false);}
  }
  return <section aria-label="Owner review and follow-up"><h3>Follow-up</h3>
    {workflow.followUpAction&&<p>{labels[workflow.followUpAction]} · {workflow.followUpStatus}{workflow.dueAt?' · '+(workflow.timezone?new Date(workflow.dueAt).toLocaleString(undefined,{timeZone:workflow.timezone})+' '+workflow.timezone:workflow.dueAt):''} {workflow.dueAt&&workflow.followUpStatus==='OPEN'&&Date.parse(workflow.dueAt)<Date.now()?' · Overdue':''}</p>}
    {workflow.note&&<p style={{whiteSpace:'pre-wrap'}}>{workflow.note}</p>}
    {workflow.reviewedQuoteId&&<Button variant="secondary" onClick={()=>go('/quotes?record='+encodeURIComponent(workflow.reviewedQuoteId))}>Open reviewed quote</Button>}
    <form onSubmit={submit}><fieldset disabled={busy} className="calendar-fieldset">
      <Field label="Follow-up action"><Select aria-label="Follow-up action" value={selected} onChange={event=>{setAction(event.target.value);setAttested(false);}}>{choices.map(key=><option value={key} key={key}>{labels[key]}</option>)}</Select></Field>
      <Field label="Follow-up note"><Textarea aria-label="Follow-up note" required maxLength={4000} value={note} onChange={event=>setNote(event.target.value)}/></Field>
      {['CALL_BACK','BOOK'].includes(selected)&&<Field label={'Follow-up due ('+(workflow.timezone||'set business timezone first')+')'}><TextInput type="datetime-local" disabled={!workflow.timezone} value={dueAt} onChange={event=>setDueAt(event.target.value)}/></Field>}
      {selected==='REVIEW'&&<><h4>Owner review</h4><Notice>Review the captured measurements and scope above. Save a separate estimate with explicit material and tax qualifications. The original request stays in history.</Notice>
        <div className="calendar-settings-grid">{[['low','Low estimate'],['high','High estimate']].map(([key,label])=><Field key={key} label={label}><TextInput aria-label={label} required inputMode="decimal" pattern="[0-9]+(\.[0-9]{1,2})?" value={review[key]} onChange={event=>setReview({...review,[key]:event.target.value})}/></Field>)}</div>
        <Field label="Currency"><Select aria-label="Currency" required value={review.currency} onChange={event=>setReview({...review,currency:event.target.value})}><option value="">Choose currency</option><option>CAD</option><option>USD</option></Select></Field>
        <Field label="Priced scope"><Textarea aria-label="Priced scope" required maxLength={4000} value={review.scope} onChange={event=>setReview({...review,scope:event.target.value})}/></Field>
        <Field label="Materials and qualifications"><Textarea aria-label="Materials and qualifications" required maxLength={4000} value={review.qualifications} onChange={event=>setReview({...review,qualifications:event.target.value})}/></Field>
        <Field label="Tax treatment"><Select aria-label="Tax treatment" required value={review.taxTreatment} onChange={event=>setReview({...review,taxTreatment:event.target.value})}><option value="">Choose tax treatment</option>{['Includes applicable tax.','No tax added.','Tax excluded; added to the invoice.'].map(value=><option key={value}>{value}</option>)}</Select></Field>
        <Field label="Price basis"><Select aria-label="Price basis" value={review.priceUnit} onChange={event=>setReview({...review,priceUnit:event.target.value})}><option>per job</option><option>per visit</option></Select></Field>
      </>}
      {selected==='ACCEPTED'&&estimate?.options?.length>1&&<Field label="Accepted quote option"><Select aria-label="Accepted quote option" required value={tierName} onChange={event=>setTierName(event.target.value)}><option value="">Choose accepted option</option>{estimate.options.map(option=><option key={option.tierName}>{option.tierName}</option>)}</Select></Field>}
      {selected==='INVOICED'&&<Field label={'Final invoice amount ('+estimate?.currency+')'}><TextInput aria-label={"Final invoice amount ("+estimate?.currency+")"} required inputMode="decimal" value={invoiceAmount} onChange={event=>setInvoiceAmount(event.target.value)}/></Field>}
      {progressed&&<label><input type="checkbox" required checked={attested} onChange={event=>setAttested(event.target.checked)}/>I confirm this event happened outside the app.</label>}
      <p>Saving records owner activity. No message is sent to the caller.</p><Button type="submit">{busy?'Saving…':'Save action'}</Button>
    </fieldset></form>
    {saved&&<Notice>Action saved.</Notice>}<ErrorMessage error={error}/>
    {workflow.followUpAction==='CALL_BACK'&&workflow.followUpStatus==='OPEN'&&/^\+[1-9]\d{7,14}$/.test(row.contact?.phone||row.callerNumber||'')&&<a href={'tel:'+(row.contact?.phone||row.callerNumber)}>Call customer</a>}
    {workflow.followUpAction==='BOOK'&&workflow.followUpStatus==='OPEN'&&<OwnerBooking row={row}/>}
    {!!workflow.history?.length&&<details><summary>Owner action history</summary>{workflow.history.map(event=><p key={event.id}>{event.createdAt} · {labels[event.action]||event.action} · {event.fromStatus} → {event.toStatus}<br/>{event.note}{event.details?.invoiceCents!==undefined?' · '+event.details.currency+' '+(event.details.invoiceCents/100).toFixed(2):''}</p>)}</details>}
  </section>;
}
