import React, {useEffect,useState} from 'react';
import {api} from './api.js';
import {Button,Field,TextInput,Notice,ErrorMessage} from './ui.jsx';
import {downloadOwnerCsv} from './integrationDownloads.js';

const EVENTS = [
  ['lead.created','New lead'], ['quote.requested','New quote request'], ['appointment.booked','Confirmed booking']
];

export default function OwnerIntegrations() {
  const [configuration,setConfiguration]=useState(null),[url,setUrl]=useState('');
  const [events,setEvents]=useState(EVENTS.map(([type])=>type));
  const [secret,setSecret]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(null);
  const [history,setHistory]=useState(null),[historyStatus,setHistoryStatus]=useState('unresolved'),[offset,setOffset]=useState(0),[refresh,setRefresh]=useState(0);
  function apply(result) {
    setConfiguration(result);setUrl(result.webhook?.url||'');
    setEvents(result.webhook?.events||EVENTS.map(([type])=>type));
    setSecret(result.signingSecret||'');
  }
  useEffect(()=>{let alive=true;api('/api/integrations/webhook').then(result=>{if(alive)apply(result);}).catch(error=>{if(alive)setError(error);});return()=>{alive=false;};},[]);
  useEffect(()=>{let alive=true;setHistory(null);api('/api/integrations/webhook/deliveries?status='+historyStatus+'&offset='+offset).then(result=>{if(alive)setHistory(result);}).catch(error=>{if(alive)setError(error);});return()=>{alive=false;};},[historyStatus,offset,refresh]);
  async function run(operation,settings=true) {
    setBusy(true);setError(null);
    try {const result=await operation();if(result){if(settings)apply(result);else setConfiguration(result);}setRefresh(value=>value+1);}
    catch(error){setError(error);}
    finally{setBusy(false);}
  }
  return <section className="dashboard-band" aria-labelledby="owner-integrations-title">
    <div className="band-heading"><h2 id="owner-integrations-title">Webhooks and CSV support</h2></div>
    <p>Download your records or send new activity to your own system.</p>
    <div className="header-actions">
      <Button variant="secondary" disabled={busy} onClick={()=>run(()=>downloadOwnerCsv('leads'))}>Download leads CSV</Button>
      <Button variant="secondary" disabled={busy} onClick={()=>run(()=>downloadOwnerCsv('quote-requests'))}>Download quote requests CSV</Button>
      <Button variant="secondary" disabled={busy} onClick={()=>run(()=>downloadOwnerCsv('bookings'))}>Download bookings CSV</Button>
    </div>
    <p>Webhook</p>
    <form onSubmit={event=>{event.preventDefault();run(()=>api('/api/integrations/webhook',{method:'PUT',body:{url,events}}));}}>
      <Field label="HTTPS webhook URL"><TextInput type="url" required maxLength={2048} value={url}
        disabled={busy||!configuration} onChange={event=>setUrl(event.target.value)}/></Field>
      <fieldset disabled={busy||!configuration}><legend>Send these events</legend>
        {EVENTS.map(([type,label])=><label key={type}><input type="checkbox" checked={events.includes(type)}
          onChange={event=>setEvents(previous=>event.target.checked?[...previous,type]:previous.filter(value=>value!==type))}/>{label}</label>)}
      </fieldset>
      <div className="header-actions">
        <Button type="submit" disabled={busy||!configuration}>Save webhook</Button>
        {configuration?.webhook&&<>
          <Button variant="secondary" disabled={busy} onClick={()=>run(()=>api('/api/integrations/webhook/rotate-secret',{method:'POST'}))}>Rotate signing secret</Button>
          <Button variant="secondary" disabled={busy} onClick={()=>run(()=>api('/api/integrations/webhook',{method:'DELETE'}))}>Remove webhook</Button>
        </>}
        <Button variant="secondary" disabled={busy} onClick={()=>run(()=>api('/api/integrations/webhook'),false)}>Refresh delivery status</Button>
      </div>
    </form>
    {secret&&<Notice title="Signing secret — shown once">
      Copy this into your receiving system before leaving this page.
      <Field label="Webhook signing secret"><TextInput readOnly value={secret} onFocus={event=>event.target.select()}/></Field>
    </Notice>}
    {configuration?.webhook&&<p role="status">Saved. {configuration.webhook.events.length
      ? 'New activity for the selected events will be queued for delivery.' : 'All webhook events are paused.'}</p>}
    {configuration&&configuration.dispatchEnabled===false&&<Notice>Delivery is disabled in this environment. Queued events will wait until delivery is enabled.</Notice>}
    {configuration?.deliveries?.length>0&&<>
      <p>Recent deliveries</p>
      <ul>{configuration.deliveries.map(delivery=><li key={delivery.id}>
        <span>{delivery.eventType} · {delivery.status} · {delivery.attemptCount} attempts</span>
        {delivery.lastHttpStatus&&<span> · HTTP {delivery.lastHttpStatus}</span>}
        {delivery.status==='PENDING'&&delivery.lastErrorCode==='ACCOUNT_ACCESS_PAUSED'&&<span> · Waiting for account access</span>}
        {delivery.status==='FAILED'&&<Button variant="secondary" disabled={busy}
          onClick={()=>run(()=>api('/api/integrations/webhook/deliveries/'+encodeURIComponent(delivery.id)+'/retry',{method:'POST'}),false)}>Retry delivery</Button>}
      </li>)}</ul>
    </>}
    <div className="header-actions"><Button variant="secondary" disabled={busy} onClick={()=>{setHistoryStatus('unresolved');setOffset(0);}}>Unresolved deliveries</Button>
      <Button variant="secondary" disabled={busy} onClick={()=>{setHistoryStatus('all');setOffset(0);}}>All deliveries</Button></div>
    {history&&<><p>{history.total} {historyStatus==='unresolved'?'unresolved deliveries':'deliveries'}</p>
      <WebhookDeliveryHistory deliveries={history.deliveries} busy={busy} onRetry={id=>run(()=>api('/api/integrations/webhook/deliveries/'+encodeURIComponent(id)+'/retry',{method:'POST'}),false)}/>
      {offset>0&&<Button variant="secondary" disabled={busy} onClick={()=>setOffset(Math.max(0,offset-50))}>Previous deliveries</Button>}
      {history.nextOffset!==null&&<Button variant="secondary" disabled={busy} onClick={()=>setOffset(history.nextOffset)}>Next deliveries</Button>}</>}
    <ErrorMessage error={error}/>
  </section>;
}

export function WebhookDeliveryHistory({deliveries,busy=false,onRetry}){
  return <ul>{deliveries.map(delivery=><li key={delivery.id}>{delivery.id} · {delivery.eventType} · {delivery.status} · {delivery.attemptCount} attempts
    {delivery.lastErrorCode&&<> · {delivery.lastErrorCode}</>}
    {delivery.status==='FAILED'&&<Button variant="secondary" disabled={busy} onClick={()=>onRetry(delivery.id)}>Retry delivery</Button>}
    </li>)}</ul>;
}
