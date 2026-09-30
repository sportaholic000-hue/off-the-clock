import React, {useEffect, useRef, useState} from 'react';
import {api, go} from './api.js';
import {AppShell, Button, ErrorMessage, Field, Loading, Notice, PageHeader, Select, TextInput} from './ui.jsx';
import {bookingForm, changeFormTimezone, NUMBER_SETTINGS, settingsPayload, WEEKDAYS} from './calendarForm.js';
import './calendar.css';

const STATUS={CONFIRMED:'Confirmed',PENDING_CONFIRMATION:'Pending confirmation',REQUESTED:'Requested time',CANCELLED:'Cancelled',FAILED:'Booking failed'};
const serviceName=value=>String(value||'Appointment').toLowerCase().replaceAll('_',' ').replace(/^./,c=>c.toUpperCase());
function when(value,timezone) {
  return new Intl.DateTimeFormat(undefined,{timeZone:timezone,dateStyle:'medium',timeStyle:'short'}).format(new Date(value));
}

function RecordCard({record,timezone,request=false}) {
  const label=STATUS[record.status]||record.status;
  return <article className="calendar-record" aria-label={`${label}: ${record.customer.name||'Customer'}`}>
    <div className="calendar-record-top"><h3>{record.customer.name||'Customer'}</h3><span className={`calendar-status status-${record.status?.toLowerCase()}`}>{label}</span></div>
    {request?<><p>Waiting for the business to agree a time.</p><ul>{record.preferredWindows.map((window,index)=><li key={index}>{window.date} · {window.timeOfDay}</li>)}</ul></>
      :<><p className="mono">{when(record.startAtUtc,timezone)} — {new Intl.DateTimeFormat(undefined,{timeZone:timezone,timeStyle:'short'}).format(new Date(record.endAtUtc))}</p>
        <p>{serviceName(record.serviceType)} · {record.bookingMode==='site_visit_first'?'Site visit':'Job appointment'}{record.tierChosen?' · '+record.tierChosen:''}</p></>}
    {record.status==='PENDING_CONFIRMATION'&&<p>Calendar confirmation is still pending. This appointment has not been confirmed.</p>}
    <dl className="calendar-details">
      {record.customer.phone&&<><dt>Phone</dt><dd><a href={'tel:'+record.customer.phone}>{record.customer.phone}</a></dd></>}
      {record.customer.email&&<><dt>Email</dt><dd><a href={'mailto:'+record.customer.email}>{record.customer.email}</a></dd></>}
      <dt>Project location</dt><dd>{Object.values(record.location).filter(Boolean).join(', ')||'Not supplied'}</dd>
    </dl>
    {record.note&&<p>{record.note}</p>}
    {record.source&&<Button variant="secondary" onClick={()=>go(`/${record.source.type==='quote'?'quotes':'leads'}?record=${encodeURIComponent(record.source.id)}`)}>Open {record.source.type}</Button>}
  </article>;
}

function AvailabilityForm({configuration,onSaved,onSaving}) {
  const [form,setForm]=useState(()=>bookingForm(configuration));
  const [error,setError]=useState(null),[saving,setSaving]=useState(false);
  const zones=[...new Set([form.timezone,'UTC',...Intl.supportedValuesOf('timeZone')])].filter(Boolean).sort();
  const change=(key,value)=>setForm(current=>({...current,[key]:value}));
  const windowChange=(day,index,key,value)=>setForm(current=>({...current,weeklyAvailability:{...current.weeklyAvailability,
    [day]:current.weeklyAvailability[day].map((window,i)=>i===index?{...window,[key]:value}:window)}}));
  async function save(event){
    event.preventDefault();onSaving();setError(null);setSaving(true);
    try{const result=await api('/api/booking/settings',{method:'PUT',body:settingsPayload(form)});onSaved(result,'Availability saved.');}
    catch(next){setError(next);}finally{setSaving(false);}
  }
  return <form onSubmit={save} aria-label="Booking availability"><fieldset disabled={saving} className="calendar-fieldset">
    <div className="calendar-section-heading"><h2>Working hours</h2><p>Appointments use this timezone. Saved blocked periods keep the same actual times if you change it.</p></div>
    <Field label="Timezone"><Select aria-label="Timezone" required value={form.timezone} onChange={event=>{try{setForm(changeFormTimezone(form,event.target.value));setError(null);}catch(next){setError(next);}}}><option value="">Choose timezone</option>{zones.map(zone=><option key={zone}>{zone}</option>)}</Select></Field>
    <div className="calendar-week">{WEEKDAYS.map(([day,name])=><fieldset className="calendar-day" key={day}><legend>{name}</legend>
      {!form.weeklyAvailability[day].length&&<span className="calendar-muted">Closed</span>}
      {form.weeklyAvailability[day].map((window,index)=><div className="calendar-window" key={index}>
        <Field label={`${name} start ${index+1}`}><TextInput type="time" required value={window.start} onChange={event=>windowChange(day,index,'start',event.target.value)}/></Field>
        <Field label={`${name} end ${index+1}`}><TextInput type="time" required value={window.end} onChange={event=>windowChange(day,index,'end',event.target.value)}/></Field>
        <Button variant="secondary" aria-label={`Remove ${name} hours ${index+1}`} onClick={()=>change('weeklyAvailability',{...form.weeklyAvailability,[day]:form.weeklyAvailability[day].filter((_,i)=>i!==index)})}>Remove</Button>
      </div>)}
      <Button variant="secondary" disabled={form.weeklyAvailability[day].length>=24} onClick={()=>change('weeklyAvailability',{...form.weeklyAvailability,[day]:[...form.weeklyAvailability[day],{start:'',end:''}]})}>Add {name} hours</Button>
    </fieldset>)}</div>
    <h2>Booking availability</h2><div className="calendar-settings-grid">{NUMBER_SETTINGS.map(([key,label,min,max])=><Field key={key} label={label}><TextInput type="number" required step="1" min={min} max={max} value={form[key]} onChange={event=>change(key,event.target.value)}/></Field>)}</div>
    <label className="calendar-checkbox"><input type="checkbox" checked={form.directBookingEnabled} onChange={event=>change('directBookingEnabled',event.target.checked)}/>Allow customers to book available times</label>
    <p className="calendar-muted">A connected calendar, service area and enabled service with a duration are also required.</p>
    <h2>Blackout dates</h2><p className="calendar-muted">Block a period when you cannot take appointments. Enter times in {form.timezone||'your business timezone'}.</p>
    {form.blackouts.map((block,index)=><div key={index} className="calendar-blackout">
      {['start','end'].map(key=><Field key={key} label={`Blocked period ${index+1} ${key}`}><TextInput type="datetime-local" required value={block[key+'Local']} onChange={event=>change('blackouts',form.blackouts.map((row,i)=>i===index?{...row,[key+'Local']:event.target.value}:row))}/></Field>)}
      <Button variant="secondary" aria-label={`Remove blocked period ${index+1}`} onClick={()=>change('blackouts',form.blackouts.filter((_,i)=>i!==index))}>Remove</Button>
    </div>)}
    <Button variant="secondary" onClick={()=>change('blackouts',[...form.blackouts,{startLocal:'',endLocal:''}])}>Add blocked period</Button>
    <ErrorMessage error={error}/><div className="calendar-save"><Button type="submit">{saving?'Saving…':'Save availability'}</Button></div>
  </fieldset></form>;
}

function ServicePolicy({service,onSaved,onSaving}) {
  const [mode,setMode]=useState(service.policy?.bookingMode||''),[duration,setDuration]=useState(service.policy?.durationMinutes??'');
  const [enabled,setEnabled]=useState(service.policy?.enabled===true),[error,setError]=useState(null),[saving,setSaving]=useState(false);
  async function save(event){
    event.preventDefault();onSaving();setSaving(true);setError(null);
    try{
      if(duration!==''&&(!/^\d+$/.test(String(duration))||Number(duration)<1))throw Error('Enter the appointment duration in whole minutes.');
      const result=await api('/api/booking/policies/'+encodeURIComponent(service.serviceId),{method:'PUT',body:{bookingMode:mode,durationMinutes:duration===''?null:Number(duration),enabled}});
      onSaved(result,service.name+' booking settings saved.');
    }catch(next){setError(next);}finally{setSaving(false);}
  }
  return <form className="calendar-policy" onSubmit={save} aria-label={service.name+' booking settings'}><fieldset className="calendar-fieldset" disabled={saving}>
    <h3>{service.name}</h3><div className="calendar-settings-grid">
      <Field label={service.name+' booking type'}><Select aria-label={service.name+' booking type'} required value={mode} onChange={event=>setMode(event.target.value)}><option value="">Choose booking type</option><option value="site_visit_first">Site visit first</option><option value="book_job">Book the job</option></Select></Field>
      <Field label={service.name+' duration (minutes)'} help={mode==='site_visit_first'?'Leave blank to use the existing 45-minute site visit duration.':undefined}><TextInput aria-label={service.name+' duration (minutes)'} type="number" min="1" max="10080" step="1" required={mode==='book_job'} value={duration} onChange={event=>setDuration(event.target.value)}/></Field>
    </div>
    <label className="calendar-checkbox"><input type="checkbox" checked={enabled} onChange={event=>setEnabled(event.target.checked)}/>Offer booking for {service.name}</label>
    <p>{service.capability==='DIRECT'?'Ready for direct booking':service.capability==='EXTERNAL_HANDOFF'?'Uses your Calendly link':service.capability==='NONE'?'Booking disabled':'Preferred-time requests only'}</p>
    {!!service.blockers?.length&&<details><summary>What is needed for direct booking?</summary><ul>{service.blockers.map((block,index)=><li key={index}>{block.message}</li>)}</ul></details>}
    <ErrorMessage error={error}/><Button type="submit">{saving?'Saving…':'Save '+service.name+' booking'}</Button>
  </fieldset></form>;
}

function Connection({connection,onChanged}) {
  const [url,setUrl]=useState(connection?.provider==='calendly'?connection.externalUrl||'':''),[error,setError]=useState(null),[saving,setSaving]=useState(false);
  async function connectGoogle(){
    setSaving(true);setError(null);
    try{const result=await api('/api/onboarding/calendar/google/start');sessionStorage.setItem('otc_calendar_return','calendar');window.location.assign(result.authorizationUrl);}
    catch(next){setError(next);setSaving(false);}
  }
  async function save(selection){
    setSaving(true);setError(null);
    try{await api('/api/onboarding/calendar',{method:'POST',body:selection});await onChanged();}
    catch(next){setError(next);}finally{setSaving(false);}
  }
  return <section className="calendar-connection" aria-label="Calendar connection"><h2>Connect your calendar</h2>
    <p>{connection?.status==='connected'?(connection.provider==='google'?'Google Calendar connected · '+(connection.calendarId==='primary'?'Primary calendar':connection.calendarId):'Calendly link saved'):'No connected calendar'}</p>
    <div className="calendar-provider"><h3>Google Calendar</h3><p>Connect your existing Google account. Busy times on the connected calendar block availability, and confirmed bookings are added to it.</p>
      <Button disabled={saving} onClick={connectGoogle}>{connection?.provider==='google'?'Reconnect Google Calendar':'Connect Google Calendar'}</Button></div>
    <form className="calendar-provider" onSubmit={event=>{event.preventDefault();save({provider:'calendly',calendlyUrl:url,skipped:false});}}>
      <h3>Calendly</h3><p>Send customers to your existing scheduling link. Appointments made there are managed in Calendly and are not synced into this view.</p>
      <Field label="Calendly scheduling link"><TextInput type="url" required value={url} onChange={event=>setUrl(event.target.value)}/></Field>
      <Button type="submit" disabled={saving}>Use Calendly link</Button>
    </form>
    {connection&&<Button variant="secondary" disabled={saving} onClick={()=>save({skipped:true})}>Disconnect calendar</Button>}
    <ErrorMessage error={error}/>
  </section>;
}

export default function Calendar() {
  const [schedule,setSchedule]=useState(null),[configuration,setConfiguration]=useState(null),[fromDate,setFromDate]=useState('');
  const [tab,setTab]=useState('Schedule'),[loading,setLoading]=useState(true),[error,setError]=useState(null),[notice,setNotice]=useState('');
  const [busy,setBusy]=useState(null),[busyError,setBusyError]=useState(null),[busyLoading,setBusyLoading]=useState(false);
  const requestId=useRef(0);
  async function load(date=fromDate) {
    const version=++requestId.current;setLoading(true);setError(null);setBusy(null);setBusyError(null);setBusyLoading(false);
    const query=date?'?fromDate='+encodeURIComponent(date)+'&days=7':'?days=7';
    try{
      const next=await api('/api/calendar/schedule'+query);
      if(requestId.current!==version)return;
      setSchedule(next);setFromDate(next.range.fromDate);
      if(next.canManage){const config=await api('/api/booking/configuration');if(requestId.current!==version)return;setConfiguration(config);}
      setLoading(false);
      if(next.connection?.provider==='google'&&next.connection.status==='connected'){
        setBusyLoading(true);
        try{const response=await api('/api/calendar/busy?fromDate='+encodeURIComponent(next.range.fromDate)+'&days=7');if(requestId.current===version)setBusy(response);}
        catch(nextError){if(requestId.current===version)setBusyError(nextError);}
        finally{if(requestId.current===version)setBusyLoading(false);}
      }
    }catch(nextError){if(requestId.current===version){setSchedule(null);setError(nextError);setLoading(false);}}
  }
  useEffect(()=>{load('');return()=>{requestId.current++;};},[]);
  async function saved(config,message){setConfiguration(config);setNotice(message);await load();}
  const manageable=schedule?.canManage===true;
  return <AppShell activePath="/calendar"><main className="calendar-page">
    <PageHeader eyebrow="YOUR BUSINESS" title="Calendar" description="See bookings and requested times. Set when customers can book." actions={<Button variant="secondary" disabled={loading} onClick={()=>load()}>Refresh calendar</Button>}/>
    {notice&&<div role="status"><Notice tone="success">{notice}</Notice></div>}
    <ErrorMessage error={error}/>
    <div className="calendar-tabs" role="tablist" aria-label="Calendar views">{['Schedule',...(manageable?['Availability','Connection']:[])].map(name=><button key={name} type="button" role="tab" aria-selected={tab===name} onClick={()=>setTab(name)}>{name}</button>)}</div>
    {tab==='Schedule'&&<section aria-label="Schedule"><form className="calendar-range" onSubmit={event=>{event.preventDefault();load();}}><Field label="Week starting"><TextInput type="date" required value={fromDate} onChange={event=>setFromDate(event.target.value)}/></Field><Button type="submit" disabled={loading}>Show week</Button></form>
      {loading?<Loading label="Loading calendar"/>:schedule&&<>
        <p className="calendar-muted">{schedule.range.fromDate} to {schedule.range.endDate} (end date excluded) · {schedule.timezone}</p>
        <div className="calendar-summary"><span><strong>{schedule.appointments.filter(row=>row.status==='CONFIRMED').length}</strong> confirmed</span><span><strong>{schedule.appointments.filter(row=>row.status==='PENDING_CONFIRMATION').length}</strong> pending confirmation</span><span><strong>{schedule.requests.length}</strong> requested times</span></div>
        <p className="calendar-muted">Bookings made through Off The Clock AI appear here. Other events on your connected Google calendar appear as busy times below.</p>
        <div className="calendar-agenda"><section><h2>Appointments</h2>{!schedule.appointments.length&&<Notice>No appointments in this week.</Notice>}{schedule.appointments.map(row=><RecordCard key={row.id} record={row} timezone={schedule.timezone}/>)}</section>
          <section><h2>Requested times</h2>{!schedule.requests.length&&<Notice>No requested times in this week.</Notice>}{schedule.requests.map(row=><RecordCard key={row.id} record={row} timezone={schedule.timezone} request/>)}</section></div>
        <section className="calendar-busy"><h2>Connected calendar busy times</h2>
          {!schedule.connection||schedule.connection.status!=='connected'?<Notice>Connect your existing calendar to check its busy times.</Notice>:schedule.connection.provider==='calendly'?<Notice>Bookings through your Calendly link are managed in Calendly.</Notice>:<>
            {busyLoading&&<Loading label="Checking Google Calendar"/>}<ErrorMessage error={busyError}/>
            {busyError&&<p>Busy times could not be checked. This does not mean the calendar is free.</p>}
            {busy&&<><p className="calendar-muted">Checked {when(busy.checkedAt,schedule.timezone)}. These periods may include appointments listed above.</p>{!busy.intervals.length?<p>No busy periods returned for this week.</p>:<ul>{busy.intervals.map((row,index)=><li key={index}>{when(row.startAtUtc,schedule.timezone)} — {when(row.endAtUtc,schedule.timezone)}</li>)}</ul>}</>}
          </>}
        </section>
      </>}
    </section>}
    {tab==='Availability'&&manageable&&configuration&&<section aria-label="Availability settings"><AvailabilityForm key={configuration.settings?.revision||'new'} configuration={configuration} onSaved={saved} onSaving={()=>setNotice('')}/>
      <section className="calendar-service-policies"><h2>Service durations</h2><p>Choose whether each service books a site visit or the job itself.</p>
        {!configuration.services.length&&<Notice>Add a service in your price book to configure its booking options.</Notice>}
        {configuration.services.map(service=><ServicePolicy key={service.serviceId+':'+(service.policy?.revision||'new')} service={service} onSaved={saved} onSaving={()=>setNotice('')}/>)}</section></section>}
    {tab==='Connection'&&manageable&&<Connection key={JSON.stringify(schedule.connection)} connection={schedule.connection} onChanged={()=>load()}/>}
  </main></AppShell>;
}
