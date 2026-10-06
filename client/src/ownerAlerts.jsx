import React,{useState} from 'react';
import {api,go,getToken} from './api.js';
import {sessionClaims} from './sessionIdentity.js';
import {Button,Notice,StatusChip,ErrorMessage} from './ui.jsx';

export function OwnerAlerts({alerts=[],configured,canRetry=true,onRefresh}){
  const [busy,setBusy]=useState(null),[error,setError]=useState(null),[archive,setArchive]=useState(null);
  const writable=canRetry&&(typeof localStorage==='undefined'||sessionClaims(getToken())?.role==='owner');
  async function page(offset=0){setError(null);try{setArchive({...await api('/api/owner-alerts?status=unresolved&offset='+offset),offset});}catch(e){setError(e);}}
  const rows=archive?.alerts||alerts;
  async function retry(id){setBusy(id);setError(null);try{await api('/api/owner-alerts/'+encodeURIComponent(id)+'/retry',{method:'POST',body:{}});if(archive)await page(archive.offset);await onRefresh?.();}catch(e){setError(e);}finally{setBusy(null);}}
  return <section className="editor-section" aria-label="Owner notification status"><h2>Owner notifications</h2>
    {configured===false&&<Notice title="Owner email alerts unavailable">Requests are saved. Email delivery is not configured or enabled. Open the saved request to follow up.</Notice>}
    <p>ACCEPTED means the email provider accepted the alert. Inbox delivery and owner reading are not confirmed.</p><ErrorMessage error={error}/><Button variant="secondary" onClick={()=>page(0)}>All unresolved alerts</Button>
    {archive&&<p>{archive.total} unresolved alerts</p>}
    {!rows.length&&<p>No notification events recorded.</p>}
    {rows.map(alert=><div key={alert.id} className="field-stack"><p>{alert.eventType} · <StatusChip status={alert.status}/></p>
      <p>{alert.createdAt} · Attempts: {alert.attemptCount}{alert.lastErrorCode?' · '+alert.lastErrorCode:''}</p>
      {alert.status==='UNKNOWN'&&<Notice>Delivery is uncertain. The saved request is available. Automatic resending is stopped when it could duplicate an alert.</Notice>}
      {alert.callId&&<Button variant="secondary" onClick={()=>go('/calls?record='+encodeURIComponent(alert.callId))}>Open call</Button>}
      {!alert.callId&&['lead.created','quote.created'].includes(alert.eventType)&&<Button variant="secondary" onClick={()=>go((alert.eventType==='quote.created'?'/quotes':'/leads')+'?record='+encodeURIComponent(alert.aggregateId))}>Open saved request</Button>}
      {writable&&['FAILED','BLOCKED','UNKNOWN'].includes(alert.status)&&<Button variant="secondary" disabled={busy===alert.id} onClick={()=>retry(alert.id)}>Retry owner alert</Button>}
    </div>)}
    {archive?.offset>0&&<Button variant="secondary" onClick={()=>page(Math.max(0,archive.offset-50))}>Previous alerts</Button>}
    {archive&&archive.offset+archive.alerts.length<archive.total&&<Button variant="secondary" onClick={()=>page(archive.offset+50)}>Next alerts</Button>}
  </section>;
}
