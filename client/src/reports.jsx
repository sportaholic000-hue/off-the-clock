import React,{useEffect,useState} from 'react';
import {api,go} from './api.js';
import {AppShell,Button,PageHeader,Field,Select,TextInput,Notice,Loading,ErrorMessage} from './ui.jsx';
import {CounterCard} from './reference.jsx';
import {WEEKDAYS} from './calendarForm.js';
const labels={partial_scope:'Partial scope',unpriced:'Unpriced',unknown_currency:'Currency not recorded',unit_price:'Unit price only',unknown_tier:'Unknown selected tier',incomparable_options:'Incomparable quote options',invalid_qualification:'Invalid saved price qualification',site_visit:'Site visits',unknown_booking_mode:'Booking type not recorded',duplicate_quote_booking:'Repeated booking for the same quote',invalid_invoice:'Invalid invoice evidence'};
export function ReportView({report}) {
  const {counts,range,afterHours,values,funnel,followUp}=report;
  return <>
    <p>{range.fromDate?range.fromDate+' through '+range.toDate:'All recorded activity'} · {range.timezone}</p>
    {Object.values(report.undatedRecords||{}).some(value=>value>0)&&<Notice>Some records have no valid date: {Object.entries(report.undatedRecords).map(([kind,count])=>count+' '+kind).join(', ')}. They are included only in all-time totals; their after-hours classification is unknown.</Notice>}
    <div className="counter-grid"><CounterCard label="CALLS ANSWERED" value={counts.answered} detail={counts.calls+' TOTAL · '+counts.spam+' SPAM'}/>
      <CounterCard label="AFTER-HOURS CALLS" value={afterHours.count} detail={afterHours.unknown+' UNKNOWN · '+afterHours.duringHours+' DURING HOURS'}/>
      <CounterCard label="QUOTES" value={counts.quotes} detail="SAVED IN THIS PERIOD"/>
      <CounterCard label="BOOKED ON CALENDAR" value={counts.bookings} detail="CONFIRMED IN THIS PERIOD"/>
      <CounterCard label="TIME OFF THE CLOCK · EST." value={(counts.seconds/3600).toFixed(1)} unit="hrs" detail="STORED NON-SPAM CALL DURATIONS"/>
      <CounterCard label="BILLED MINUTES" value={counts.billedMinutes} detail="STORED BILLING RECORDS"/></div>
    <p>{afterHours.basis}</p>{afterHours.unknown>0&&<Notice>After-hours classification is unknown for {afterHours.unknown} calls. Set business hours below to classify them.</Notice>}
    <h3>Value</h3><p>{report.valueBasis}</p>
    {['quoted','booked','invoiced'].map(kind=><section key={kind} aria-label={kind+' value'}><h4>{kind==='quoted'?'Quoted value':kind==='booked'?'Booked job value':'Invoiced value'}</h4>
      {!values[kind].length?<p>No complete amounts recorded.</p>:<ul>{values[kind].map((group,index)=><li key={index}>{group.currency} ${group.low}{group.high!==group.low?'–$'+group.high:''} · {group.priceUnit} · {group.taxTreatment} · {group.count} records</li>)}</ul>}
      {Object.entries(report.excludedValues[kind]).map(([reason,count])=><p key={reason}>{labels[reason]||reason}: {count} excluded from this value.</p>)}
    </section>)}
    <h3>Service funnel</h3><p>{report.funnelBasis}</p>
    {!funnel.length?<Notice>No service activity in this period.</Notice>:<div style={{overflowX:'auto'}}><table><caption>Calls → quoted → booked jobs → invoiced</caption><thead><tr><th>Service</th><th>Calls</th><th>Quoted</th><th>Booked</th><th>Invoiced</th><th>Calls to quotes</th><th>Quotes to bookings</th><th>Bookings to invoices</th></tr></thead><tbody>{funnel.map(row=><tr key={row.service}><th scope="row">{row.service}</th>{['calls','quoted','booked','invoiced'].map(key=><td key={key}>{row[key]}</td>)}{['callsToQuoted','quotedToBooked','bookedToInvoiced'].map(key=><td key={key}>{row[key]===null?'—':row[key]+'%'}</td>)}</tr>)}</tbody></table></div>}
    {!!funnel.length&&<details><summary>Value by service for the call cohort</summary>{funnel.map(row=><section key={row.service}><h4>{row.service}</h4>{['quoted','booked','invoiced'].map(kind=><p key={kind}>{kind}: {row.values?.[kind]?.length?row.values[kind].map(group=>group.currency+' $'+group.low+(group.high!==group.low?'–$'+group.high:'')+' · '+group.priceUnit+' · '+group.taxTreatment).join('; '):'No complete amount recorded'}</p>)}</section>)}</details>}
    <h3>Follow-up</h3><p>{followUp.open} open · {followUp.overdue} overdue across all periods.</p>
    {followUp.items.map(row=><section key={row.kind+row.recordId}><p>{row.action==='BOOK'?'Book':'Call back'} · {row.dueAt||'No deadline set'} · {row.note}</p><Button variant="secondary" onClick={()=>go('/'+row.kind+'?record='+encodeURIComponent(row.recordId))}>Open follow-up</Button></section>)}
    {followUp.open>followUp.items.length&&<Notice>Showing the first {followUp.items.length} open follow-ups. Open Leads or Quotes for the remaining records.</Notice>}
  </>;
}
export function ReportHours({settings,onSaved}) {
  const [hours,setHours]=useState(()=>settings.weeklyHours||Object.fromEntries(WEEKDAYS.map(([key])=>[key,[]]))),[error,setError]=useState(null),[busy,setBusy]=useState(false);
  const change=(day,index,key,value)=>setHours(current=>({...current,[day]:current[day].map((window,n)=>n===index?{...window,[key]:value}:window)}));
  async function save(event){event.preventDefault();setBusy(true);setError(null);try{await api('/api/reports/hours',{method:'PUT',body:{weeklyHours:hours,revision:settings.revision}});await onSaved();}catch(next){setError(next);}finally{setBusy(false);}}
  return <details><summary>Business hours for after-hours reporting</summary><form onSubmit={save}><fieldset disabled={busy} className="calendar-fieldset"><p>Use the business timezone shown above. Empty days are closed. These hours apply to all selected historical calls. Split overnight hours across days; 24:00 is a valid closing time. Booking availability is configured separately.</p>
    {WEEKDAYS.map(([day,label])=><section key={day}><h4>{label}</h4>{hours[day].length===0&&<p>Closed</p>}{hours[day].map((window,index)=><div key={index} className="calendar-settings-grid"><Field label={label+' opening '+(index+1)}><TextInput required placeholder="09:00" value={window.start} onChange={event=>change(day,index,'start',event.target.value)}/></Field><Field label={label+' closing '+(index+1)}><TextInput required placeholder="17:00" value={window.end} onChange={event=>change(day,index,'end',event.target.value)}/></Field><Button variant="secondary" onClick={()=>setHours(current=>({...current,[day]:current[day].filter((_,n)=>n!==index)}))}>Remove window</Button></div>)}
      {hours[day].length<4&&<Button variant="secondary" onClick={()=>setHours(current=>({...current,[day]:[...current[day],{start:'',end:''}]}))}>Add {label} hours</Button>}</section>)}
    <Button type="submit">Save business hours</Button><ErrorMessage error={error}/></fieldset></form></details>;
}
export function ReportsPanel({refreshKey=0}) {
  const [period,setPeriod]=useState('month'),[fromDate,setFrom]=useState(''),[toDate,setTo]=useState(''),[query,setQuery]=useState('period=month'),[revision,setRevision]=useState(0),[report,setReport]=useState(null),[error,setError]=useState(null);
  useEffect(()=>{let active=true;setReport(null);setError(null);api('/api/reports?'+query).then(value=>{if(!value.counts||!Array.isArray(value.funnel))throw Error('The report could not be read.');if(active)setReport(value);}).catch(next=>{if(active)setError(next);});return()=>{active=false;};},[query,revision,refreshKey]);
  return <section className="dashboard-band" aria-label="Period reports"><h2>Reports</h2><form onSubmit={event=>{event.preventDefault();setQuery(new URLSearchParams({period,...(period==='custom'?{fromDate,toDate}:{})}).toString());setRevision(value=>value+1);}}>
    <Field label="Period"><Select aria-label="Period" value={period} onChange={event=>setPeriod(event.target.value)}>{[['today','Today'],['week','This week'],['month','This month'],['custom','Custom dates'],['all','All time']].map(([value,label])=><option key={value} value={value}>{label}</option>)}</Select></Field>
    {period==='custom'&&<div className="calendar-settings-grid"><Field label="From date"><TextInput required type="date" value={fromDate} onChange={event=>setFrom(event.target.value)}/></Field><Field label="Through date"><TextInput required type="date" value={toDate} onChange={event=>setTo(event.target.value)}/></Field></div>}<Button type="submit">Show report</Button></form>
    {!report&&!error&&<Loading label="LOADING REPORT"/>}<ErrorMessage error={error}/>{report&&<><ReportView report={report}/>{report.canManage&&<ReportHours key={report.settings.revision} settings={report.settings} onSaved={()=>setRevision(value=>value+1)}/>}</>}
  </section>;
}
export default function Reports(){return <AppShell activePath="/reports"><main className="pricebook-page"><PageHeader eyebrow="YOUR BUSINESS" title="Reports"/><ReportsPanel/></main></AppShell>;}
