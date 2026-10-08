import {callTime} from './callTime.js';
import React,{useState} from 'react';
import {api,go,getToken} from './api.js';
import {sessionClaims} from './sessionIdentity.js';
import {Button,Notice,StatusChip,ErrorMessage} from './ui.jsx';

export function OwnerAlerts({ownerTimezone,alerts=[],configured,canRetry=true,onRefresh}){
  const [busy,setBusy]=useState(null),[error,setError]=useState(null),[archive,setArchive]=useState(null);
  const writable=canRetry&&(typeof localStorage==='undefined'||sessionClaims(getToken())?.role==='owner');
  async function page(offset=0,filter=archive?.filter||'unresolved'){setError(null);try{setArchive({...await api('/api/owner-alerts?status='+filter+'&offset='+offset),offset,filter});}catch(e){setError(e);}}
  const rows=archive?.alerts||alerts;
  async function retry(id){setBusy(id);setError(null);try{await api('/api/owner-alerts/'+encodeURIComponent(id)+'/retry',{method:'POST',body:{}});if(archive)await page(archive.offset);await onRefresh?.();}catch(e){setError(e);}finally{setBusy(null);}}
  async function seen(id){setBusy(id);setError(null);try{await api('/api/owner-alerts/'+encodeURIComponent(id)+'/seen',{method:'POST',body:{}});if(archive)await page(archive.offset);await onRefresh?.();}catch(e){setError(e);}finally{setBusy(null);}}
  return <section className="editor-section" aria-label="Owner notification status"><h2>Owner notifications</h2>
    {configured===false&&<Notice title="Owner email alerts unavailable">Requests are saved. Email delivery is not configured or enabled. Open the saved request to follow up.</Notice>}
    <p>ACCEPTED means the email provider accepted the alert. Inbox delivery and owner reading are not confirmed.</p><ErrorMessage error={error}/><Button variant="secondary" onClick={()=>page(0,'unresolved')}>All unresolved alerts</Button><Button variant="secondary" onClick={()=>page(0,'all')}>All alerts</Button>
    {archive&&<p>{archive.total} {archive.filter==='unresolved'?'unresolved ':''}alerts</p>}
    {!rows.length&&<p>No notification events recorded.</p>}
    {rows.map(alert=><div key={alert.id} className="field-stack">{alert.eventType==='voice.settings_invalid'&&<Notice title="Receptionist setting needs correction">{alert.settingMessage}</Notice>}{alert.eventType==='voice.quoting_unavailable'&&<Notice>Calculated quoting is paused because its saved storage cannot be read. Answering remains available. Restore the saved price book from backup or contact support.</Notice>}<p>{alert.eventType==='booking.confirmed'?'Booking confirmed':alert.eventType} · <StatusChip status={alert.status}/></p>
      <p>{ownerTimezone?callTime(alert.createdAt,ownerTimezone):alert.createdAt} · Attempts: {alert.attemptCount}{alert.lastErrorCode?' · '+alert.lastErrorCode:''}</p>
      {alert.status==='UNKNOWN'&&<Notice>Delivery is uncertain. The saved request is available. Automatic resending is stopped when it could duplicate an alert.</Notice>}
      {alert.callId&&<Button variant="secondary" onClick={()=>go('/calls?record='+encodeURIComponent(alert.callId))}>Open call</Button>}
      {alert.eventType==='booking.confirmed'&&<Button variant="secondary" onClick={()=>go('/calendar')}>Open confirmed booking</Button>}
      {!alert.callId&&['lead.created','quote.created'].includes(alert.eventType)&&<Button variant="secondary" onClick={()=>go((alert.eventType==='quote.created'?'/quotes':'/leads')+'?record='+encodeURIComponent(alert.aggregateId))}>Open saved request</Button>}
      {writable&&['FAILED','BLOCKED','UNKNOWN'].includes(alert.status)&&<Button variant="secondary" disabled={busy===alert.id} onClick={()=>retry(alert.id)}>Retry owner alert</Button>}
      {writable&&!alert.seenAt&&<Button variant="secondary" disabled={busy===alert.id} onClick={()=>seen(alert.id)}>Mark reviewed</Button>}
      {alert.seenAt&&<p>Reviewed in dashboard · {alert.seenAt}</p>}
    </div>)}
    {archive?.offset>0&&<Button variant="secondary" onClick={()=>page(Math.max(0,archive.offset-50))}>Previous alerts</Button>}
    {archive&&archive.offset+archive.alerts.length<archive.total&&<Button variant="secondary" onClick={()=>page(archive.offset+50)}>Next alerts</Button>}
  </section>;
}
