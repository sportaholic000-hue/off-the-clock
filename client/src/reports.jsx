import {OwnerJobMetrics} from './ownerJobMetrics.jsx';
import {callTime} from './callTime.js';
import React,{useEffect,useState} from 'react';
import {api,go} from './api.js';
import {AppShell,Button,PageHeader,Field,Select,TextInput,Notice,Loading,ErrorMessage,useSessionOwnerPlan} from './ui.jsx';
import {CounterCard} from './reference.jsx';
import {businessHoursText} from '../../server/src/businessHours.js';
import {countOf} from './recordWords.js';
const labels={partial_scope:'Partial scope',unpriced:'Unpriced',unknown_currency:'Currency not recorded',unit_price:'Unit price only',unknown_tier:'Unknown selected tier',incomparable_options:'Incomparable quote options',invalid_qualification:'Invalid saved price qualification',site_visit:'Site visits',unknown_booking_mode:'Booking type not recorded',duplicate_quote_booking:'Repeated booking for the same quote',invalid_invoice:'Invalid invoice evidence'};
// starter: Starter has no calendar booking or price book, so its report leaves
// out the booking counter and the quote accuracy and job cost section. Starter
// cannot make quotes either: unless the period holds quotes, values or funnel
// stages saved on an earlier plan, the quote counter and the value section are
// left out and the funnel is a plain count of calls by service.
const STAGES=['quoted','booked','invoiced'];
export function ReportView({report,starter=false}) {
  const {counts,range,afterHours,values,funnel,followUp}=report;
  const quoteHistory=counts.quotes>0||STAGES.some(kind=>values[kind].length>0||Object.keys(report.excludedValues[kind]||{}).length>0)||funnel.some(row=>STAGES.some(kind=>row[kind]>0));
  const callsOnly=starter&&!quoteHistory;
  return <>
    <p>{range.fromDate?range.fromDate+' through '+range.toDate:'All recorded activity'} · {range.timezone}</p>
    {Object.values(report.undatedRecords||{}).some(value=>value>0)&&<Notice>Some records have no valid date: {Object.entries(report.undatedRecords).map(([kind,count])=>count+' '+kind).join(', ')}. They are included only in all-time totals; their after-hours classification is unknown.</Notice>}
    <div className="counter-grid"><CounterCard label="CALLS ANSWERED" value={counts.answered} detail={counts.calls+' TOTAL · '+counts.spam+' SPAM'}/>
      <CounterCard label="AFTER-HOURS CALLS" value={afterHours.count} detail={afterHours.unknown+' UNKNOWN · '+afterHours.duringHours+' DURING HOURS'}/>
      {!callsOnly&&<CounterCard label="QUOTES" value={counts.quotes} detail="SAVED IN THIS PERIOD"/>}
      {!starter&&<CounterCard label="BOOKED ON CALENDAR" value={counts.bookings} detail="CONFIRMED IN THIS PERIOD"/>}
      <CounterCard label="TIME OFF THE CLOCK · EST." value={(counts.seconds/3600).toFixed(1)} unit="hrs" detail="STORED NON-SPAM CALL DURATIONS"/>
      <CounterCard label="BILLED MINUTES" value={counts.billedMinutes} detail="STORED BILLING RECORDS"/></div>
    <p>{afterHours.basis}</p>{afterHours.unknown>0&&<Notice>After-hours classification is unknown for {countOf(afterHours.unknown,'call')}. Set your business hours under Settings, Business knowledge to classify them.</Notice>}
    {!callsOnly&&<><h3>Value</h3><p>{report.valueBasis}</p>
    {STAGES.map(kind=><section key={kind} aria-label={kind+' value'}><h4>{kind==='quoted'?'Quoted value':kind==='booked'?'Booked job value':'Invoiced value'}</h4>
      {!values[kind].length?<p>No complete amounts recorded.</p>:<ul>{values[kind].map((group,index)=><li key={index}>{group.currency} ${group.low}{group.high!==group.low?'–$'+group.high:''} · {group.priceUnit} · {group.taxTreatment} · {countOf(group.count,'record')}</li>)}</ul>}
      {Object.entries(report.excludedValues[kind]).map(([reason,count])=><p key={reason}>{labels[reason]||'Other reason'}: {count} excluded from this value.</p>)}
    </section>)}</>}
    <h3>{callsOnly?'Calls by service':'Service funnel'}</h3><p>{callsOnly?'Distinct non-spam calls started in the selected period, by recorded service. Unclassified calls remain visible.':report.funnelBasis}</p>
    {!funnel.length?<Notice>No service activity in this period.</Notice>:callsOnly?<div style={{overflowX:'auto'}}><table><caption>Calls by service</caption><thead><tr><th>Service</th><th>Calls</th></tr></thead><tbody>{funnel.map(row=><tr key={row.service}><th scope="row">{row.service}</th><td>{row.calls}</td></tr>)}</tbody></table></div>:<div style={{overflowX:'auto'}}><table><caption>Calls → quoted → booked jobs → invoiced</caption><thead><tr><th>Service</th><th>Calls</th><th>Quoted</th><th>Booked</th><th>Invoiced</th><th>Calls to quotes</th><th>Quotes to bookings</th><th>Bookings to invoices</th></tr></thead><tbody>{funnel.map(row=><tr key={row.service}><th scope="row">{row.service}</th>{['calls','quoted','booked','invoiced'].map(key=><td key={key}>{row[key]}</td>)}{['callsToQuoted','quotedToBooked','bookedToInvoiced'].map(key=><td key={key}>{row[key]===null?'—':row[key]+'%'}</td>)}</tr>)}</tbody></table></div>}
    {!callsOnly&&!!funnel.length&&<details><summary>Value by service for the call cohort</summary>{funnel.map(row=><section key={row.service}><h4>{row.service}</h4>{['quoted','booked','invoiced'].map(kind=><p key={kind}>{kind}: {row.values?.[kind]?.length?row.values[kind].map(group=>group.currency+' $'+group.low+(group.high!==group.low?'–$'+group.high:'')+' · '+group.priceUnit+' · '+group.taxTreatment).join('; '):'No complete amount recorded'}</p>)}</section>)}</details>}
    {!starter&&<OwnerJobMetrics groups={report.jobMetrics}/>}
    <h3>Follow-up</h3><p>{followUp.open} open · {followUp.overdue} overdue across all periods.</p>
    {followUp.items.map(row=><section key={row.kind+row.recordId}><p>{row.action==='BOOK'?'Book':'Call back'} · {row.dueAt?callTime(row.dueAt,range.timezone):'No deadline set'} · {row.note}</p><Button variant="secondary" onClick={()=>go('/'+row.kind+'?record='+encodeURIComponent(row.recordId))}>Open follow-up</Button></section>)}
    {followUp.open>followUp.items.length&&<Notice>Showing the first {followUp.items.length} open follow-ups. Open Leads{starter?'':' or Quotes'} for the remaining records.</Notice>}
  </>;
}
// After-hours calls are counted against the owner's business hours, set once
// under Settings, Business knowledge.
export function ReportHours({settings}) {
  const business=settings.source==='business'&&settings.weeklyHours;
  return <p className="calendar-muted">{business
    ?<>After-hours calls are counted against your business hours: {businessHoursText(settings.weeklyHours)} Change them under <a href="/settings?section=knowledge" onClick={event=>{event.preventDefault();go('/settings?section=knowledge');}}>Settings, Business knowledge</a>.</>
    :<>Set your business hours under <a href="/settings?section=knowledge" onClick={event=>{event.preventDefault();go('/settings?section=knowledge');}}>Settings, Business knowledge</a> to count after-hours calls.</>}</p>;
}
// planPending: the page is still reading the owner's plan; the report waits so
// a Starter owner never sees the sections Starter leaves out.
export function ReportsPanel({refreshKey=0,starter=false,planPending=false}) {
  const [period,setPeriod]=useState('month'),[fromDate,setFrom]=useState(''),[toDate,setTo]=useState(''),[query,setQuery]=useState('period=month'),[revision,setRevision]=useState(0),[report,setReport]=useState(null),[error,setError]=useState(null);
  useEffect(()=>{let active=true;setReport(null);setError(null);api('/api/reports?'+query).then(value=>{if(!value.counts||!Array.isArray(value.funnel))throw Error('The report could not be read.');if(active)setReport(value);}).catch(next=>{if(active)setError(next);});return()=>{active=false;};},[query,revision,refreshKey]);
  return <section className="dashboard-band" aria-label="Period reports"><h2>Reports</h2><form onSubmit={event=>{event.preventDefault();setQuery(new URLSearchParams({period,...(period==='custom'?{fromDate,toDate}:{})}).toString());setRevision(value=>value+1);}}>
    <Field label="Period"><Select aria-label="Period" value={period} onChange={event=>setPeriod(event.target.value)}>{[['today','Today'],['week','This week'],['month','This month'],['custom','Custom dates'],['all','All time']].map(([value,label])=><option key={value} value={value}>{label}</option>)}</Select></Field>
    {period==='custom'&&<div className="calendar-settings-grid"><Field label="From date"><TextInput required type="date" value={fromDate} onChange={event=>setFrom(event.target.value)}/></Field><Field label="Through date"><TextInput required type="date" value={toDate} onChange={event=>setTo(event.target.value)}/></Field></div>}<Button type="submit">Show report</Button></form>
    {(!report||planPending)&&!error&&<Loading label="LOADING REPORT"/>}<ErrorMessage error={error}/>{report&&!planPending&&<><ReportView report={report} starter={starter}/>{report.canManage&&<ReportHours settings={report.settings}/>}</>}
  </section>;
}
export default function Reports(){const plan=useSessionOwnerPlan();return <AppShell activePath="/reports"><main className="pricebook-page"><PageHeader eyebrow="YOUR BUSINESS" title="Reports"/><ReportsPanel starter={plan==='Starter'} planPending={!plan}/></main></AppShell>;}
