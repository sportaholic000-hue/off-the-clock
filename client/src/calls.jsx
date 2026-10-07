import {DeliveryActions} from './deliveryActions.jsx';
import {OwnerAlerts} from './ownerAlerts.jsx';
import React,{useEffect,useState} from 'react';
import {api,go,getToken} from './api.js';
import {sessionClaims} from './sessionIdentity.js';
import {AppShell,Button,PageHeader,Notice,Loading,ErrorMessage,StatusChip} from './ui.jsx';
import {QuoteResult} from './quotedone.jsx';

const text=value=>value===null||value===undefined?'Not recorded':typeof value==='object'?JSON.stringify(value):String(value);

export function CallFeed({calls,showFiltered=false}) {
  const filtered=calls.filter(c=>c.spamFiltered);
  if(!showFiltered&&filtered.length)return <><CallFeed calls={calls.filter(c=>!c.spamFiltered)} showFiltered/><details><summary>Filtered ({filtered.length})</summary><CallFeed calls={filtered} showFiltered/></details></>;
  return <div className="feed-rows">{calls.map(call=><button type="button" className="service-row feed-row" key={call.id} onClick={()=>go('/calls?record='+encodeURIComponent(call.id))}>
    <span className="feed-copy"><span className="mono feed-time">{call.createdAt} · {call.duration===null?'Duration not recorded':call.duration+' sec'}</span>
    <span className="feed-summary">{call.summaryText||call.callerNumber||'Call'}</span></span>
    <StatusChip status={call.outcome||call.status||'Not recorded'}/>
    {call.urgency&&<span className="mono">Urgency: {text(call.urgency)}</span>}
  </button>)}</div>;
}

export function CallSpamControls({call,onRefresh}){
  const [busy,setBusy]=useState(false),[error,setError]=useState(null);
  if(!call.canManageSpam)return null;
  async function change(){setBusy(true);setError(null);try{
    if(call.blocked)await api('/api/call-blocklist',{method:'DELETE',body:{phoneNumber:call.callerNumber}});
    else await api('/api/calls/'+encodeURIComponent(call.id)+'/spam',{method:'POST',body:{}});
    await onRefresh?.();
  }catch(e){setError(e);}finally{setBusy(false);}}
  return <section aria-label="Spam controls"><Button variant="secondary" disabled={busy} onClick={change}>{call.blocked?'Unblock number':'Mark as spam'}</Button><p>{call.blocked?'Future calls from this number are blocked for your business.':'Marking this call as spam excludes its minutes and blocks future calls from this number for your business.'}</p><ErrorMessage error={error}/></section>;
}

export function CallBlocklist(){
  const [page,setPage]=useState(null),[phone,setPhone]=useState(''),[error,setError]=useState(null),[busy,setBusy]=useState(false),[offset,setOffset]=useState(0);
  async function load(next=offset){setPage(await api('/api/call-blocklist?offset='+next));setOffset(next);}
  useEffect(()=>{let active=true;api('/api/call-blocklist?offset=0').then(p=>{if(active)setPage(p);}).catch(e=>{if(active)setError(e);});return ()=>{active=false;};},[]);
  async function change(method,number){setBusy(true);setError(null);try{await api('/api/call-blocklist',{method,body:{phoneNumber:number}});setPhone('');await load(0);}catch(e){setError(e);}finally{setBusy(false);}}
  return <details className="editor-section"><summary>Blocked numbers{page?' ('+page.total+')':''}</summary><ErrorMessage error={error}/>
    <form onSubmit={e=>{e.preventDefault();void change('POST',phone);}}><label>Phone number<input type="tel" value={phone} onChange={e=>setPhone(e.target.value)} required autoComplete="off"/></label><p>Include the country code, beginning with +.</p><Button type="submit" disabled={busy}>Block number</Button></form>
    {page?.numbers.map(row=><div className="field-stack" key={row.phoneNumber}><p>{row.phoneNumber}</p><Button variant="secondary" disabled={busy} onClick={()=>change('DELETE',row.phoneNumber)}>Unblock number</Button></div>)}
    {offset>0&&<Button variant="secondary" onClick={()=>load(Math.max(0,offset-50)).catch(setError)}>Previous blocked numbers</Button>}
    {page?.nextOffset!==null&&page&&<Button variant="secondary" onClick={()=>load(page.nextOffset).catch(setError)}>Next blocked numbers</Button>}
  </details>;
}

export function CallDetail({call,onRefresh,canRetry=call.canRetryOwnerAlerts===true}) {
  return <section className="editor-section" aria-label="Call details">
    <h2>{call.callerNumber||'Call'}</h2><StatusChip status={call.outcome||call.status||'Not recorded'}/>
    <CallSpamControls call={call} onRefresh={onRefresh}/>
    {call.failureCode==='VOICE_CALLER_THROTTLED'&&<Notice title="Repeated caller — review requested">The caller reached the daily answering limit. Their request is saved for review.</Notice>}
    <dl><dt>Created</dt><dd>{text(call.createdAt)}</dd><dt>Status</dt><dd>{text(call.status)}</dd>
      <dt>Outcome</dt><dd>{text(call.outcome)}</dd><dt>Duration</dt><dd>{call.duration===null?'Not recorded':call.duration+' sec'}</dd>
      <dt>Urgency</dt><dd>{text(call.urgency)}</dd>{call.failureCode&&<><dt>Failure</dt><dd>{call.failureCode}</dd></>}
      {!!call.spamFiltered&&<><dt>Spam</dt><dd>Filtered</dd></>}</dl>
    <h3>Summary</h3><p>{call.summaryText||'No summary recorded.'}</p>
    {call.urgency&&<Notice title="Urgency">Recorded on this call. Owner notification has not been confirmed as received. See the delivery status below.</Notice>}
    <h3>Transcript</h3>{call.transcript.length?<ol>{call.transcript.map((turn,index)=><li key={index}><strong>{text(turn.role)}: </strong><span style={{whiteSpace:'pre-wrap'}}>{turn.text}</span>{turn.interrupted?<span> · interrupted</span>:null}</li>)}</ol>:<Notice>{call.transcriptAvailable?'No transcript recorded.':'Stored transcript could not be read.'}</Notice>}
    {!!call.callbackRequests?.length&&<><h3>Callback requests</h3>{call.callbackRequests.map(request=><section className="editor-section" key={request.id}><p>{request.createdAt} · {request.source} · {request.reason}</p><p style={{whiteSpace:'pre-wrap'}}>{request.notes||'No caller words recorded.'}</p>{request.history?.length>1&&<details><summary>Callback note history</summary>{request.history.map((entry,index)=><p key={index} style={{whiteSpace:'pre-wrap'}}>{entry.at} · {entry.notes}</p>)}</details>}</section>)}</>}
    {call.notifications&&<OwnerAlerts alerts={call.notifications} configured={call.emailAlertsConfigured} canRetry={canRetry} onRefresh={onRefresh}/>}
    <DeliveryActions actions={call.deliveryActions}/>
    <h3>Quotes</h3>{!call.quotes.length&&<Notice>No saved quote for this call.</Notice>}
    {call.quotes.map(quote=><section className="editor-section" key={quote.id}><h3>{quote.serviceType}</h3><p>{quote.status} · {quote.createdAt}{quote.tierChosen?' · '+quote.tierChosen:''}</p><QuoteResult result={quote.result}/>
      {!quote.result&&<Notice>The saved quote has no readable estimate.</Notice>}
      <Button variant="secondary" onClick={()=>go('/quotes?record='+encodeURIComponent(quote.id))}>Quotes</Button>
      {quote.internal&&<details><summary>Owner-only calculation and request evidence</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(quote.internal,null,2)}</pre></details>}
    </section>)}
    <h3>Leads</h3>{!call.leads.length&&<Notice>No saved lead for this call.</Notice>}
    {call.leads.map(lead=><section className="editor-section" key={lead.id}><h3>{lead.customerName||lead.describedService||'Lead'}</h3><p>{lead.status} · {lead.type}</p>
      {lead.reviewReason&&<Notice title="Request saved for review">{lead.reviewReason}</Notice>}
      <dl><dt>Customer</dt><dd>{text(lead.customerName||lead.contact?.name)}</dd><dt>Phone</dt><dd>{text(lead.callerNumber)}</dd><dt>Requested work</dt><dd>{text(lead.describedService)}</dd></dl>
      <pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify({contact:lead.contact,location:lead.location,notes:lead.notes,measurementsAndScope:lead.customerInputs,unknowns:lead.explicitUnknowns,urgency:lead.urgency,context:lead.context,followUpSource:lead.followUpSource,submittedContact:lead.submittedContact,submittedLocation:lead.submittedLocation},null,2)}</pre>
      {!!lead.captureHistory?.length&&<details><summary>Contact and request history</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(lead.captureHistory,null,2)}</pre></details>}
      <Button variant="secondary" onClick={()=>go('/leads?record='+encodeURIComponent(lead.id))}>Leads</Button>
      {lead.internal&&<details><summary>Owner-only calculation and request evidence</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(lead.internal,null,2)}</pre></details>}
    </section>)}
    {!!call.quoteRequests.length&&<><h3>Quote requests</h3>{call.quoteRequests.map(request=><p key={request.id}>{request.describedService} · {request.createdAt}</p>)}</>}
    <h3>Calendar</h3>{!call.bookings.length&&!call.bookingRequests.length&&<Notice>No saved booking for this call.</Notice>}
    {call.bookings.map(booking=><section className="editor-section" key={booking.id}><h3>{booking.serviceType||'Booking'}</h3><StatusChip status={booking.status}/><dl>
      <dt>Start</dt><dd>{text(booking.startAtUtc||booking.datetime)}</dd><dt>End</dt><dd>{text(booking.endAtUtc)}</dd><dt>Timezone</dt><dd>{text(booking.timezone)}</dd>
      <dt>Booking mode</dt><dd>{text(booking.bookingMode)}</dd><dt>Tier chosen</dt><dd>{text(booking.tierChosen)}</dd>
      <dt>Customer</dt><dd>{text(booking.customer)}</dd><dt>Project location</dt><dd>{text(booking.location)}</dd></dl></section>)}
    {call.bookingRequests.map(request=><section className="editor-section" key={request.id}><StatusChip status={request.status}/><p>{text(request.preferredWindows)}</p>{request.note&&<p>{request.note}</p>}<dl><dt>Customer</dt><dd>{text(request.customer)}</dd><dt>Project location</dt><dd>{text(request.location)}</dd></dl></section>)}
    {(call.bookings.length>0||call.bookingRequests.length>0)&&<Button variant="secondary" onClick={()=>go('/calendar')}>Calendar</Button>}
  </section>;
}

export default function Calls({recordId=null}) {
  const [page,setPage]=useState(null),[call,setCall]=useState(null),[offset,setOffset]=useState(0),[error,setError]=useState(null),[refresh,setRefresh]=useState(0);
  useEffect(()=>{
    let active=true;setPage(null);setCall(null);setError(null);
    const request=recordId?api('/api/calls/'+encodeURIComponent(recordId)):api('/api/calls?offset='+offset);
    request.then(value=>{if(active){if(recordId)setCall(value);else setPage(value);}}).catch(error=>{if(active)setError(error);});
    return ()=>{active=false;};
  },[recordId,offset,refresh]);
  return <AppShell activePath="/calls"><main className="pricebook-page"><PageHeader eyebrow="ACTIVITY" title="Calls"/>
    <Button variant="secondary" onClick={()=>setRefresh(value=>value+1)}>Refresh</Button>
    {typeof localStorage!=='undefined'&&sessionClaims(getToken())?.role==='owner'&&<CallBlocklist key={refresh}/>}
    {recordId&&<Button variant="secondary" onClick={()=>go('/calls')}>Calls</Button>}
    {!error&&!page&&!call&&<Loading label="LOADING CALLS"/>}<ErrorMessage error={error}/>
    {call&&<CallDetail call={call} onRefresh={()=>setRefresh(value=>value+1)}/>} {page&&<><p className="mono band-count">{page.total} calls</p>
      {page.calls.length?<CallFeed calls={page.calls}/>:<Notice>No calls yet.</Notice>}
      {offset>0&&<Button variant="secondary" onClick={()=>setOffset(Math.max(0,offset-50))}>Previous</Button>}
      {page.nextOffset!==null&&<Button variant="secondary" onClick={()=>setOffset(page.nextOffset)}>Next</Button>}</>}
  </main></AppShell>;
}
