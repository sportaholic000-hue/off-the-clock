import React from 'react';
import {Button, Field, TextInput} from './ui.jsx';
import {BUSINESS_HOURS_DAYS, BUSINESS_HOURS_DAY_NAMES, BUSINESS_HOURS_MAX_WINDOWS, emptyBusinessHours} from '../../server/src/businessHours.js';
import './calendar.css';

export function hoursForForm(saved) {
  const base=emptyBusinessHours();
  for(const day of BUSINESS_HOURS_DAYS)base[day]=(saved?.[day]||[]).map(window=>({start:window.start,end:window.end}));
  return base;
}

// One week of opening hours. An empty day is closed. Monday's hours can be
// copied to the other weekdays in one press.
export function WeeklyHoursEditor({value, onChange, idPrefix='hours', disabled=false, maxWindows=BUSINESS_HOURS_MAX_WINDOWS}) {
  const setDay=(day,windows)=>onChange({...value,[day]:windows});
  const edit=(day,index,key,text)=>setDay(day,value[day].map((window,i)=>i===index?{...window,[key]:text}:window));
  const copyMonday=()=>onChange({...value,...Object.fromEntries(['tue','wed','thu','fri'].map(day=>[day,value.mon.map(window=>({...window}))]))});
  return <div className="calendar-week">
    {BUSINESS_HOURS_DAYS.map(day=>{const name=BUSINESS_HOURS_DAY_NAMES[day];return <fieldset className="calendar-day" key={day} disabled={disabled}><legend>{name}</legend>
      {!value[day].length&&<span className="calendar-muted">Closed</span>}
      {value[day].map((window,index)=><div className="calendar-window" key={index}>
        <Field label={`${name} opens ${index+1}`}><TextInput id={`${idPrefix}-${day}-${index}-start`} type="time" required value={window.start} onChange={event=>edit(day,index,'start',event.target.value)}/></Field>
        <Field label={`${name} closes ${index+1}`}><TextInput id={`${idPrefix}-${day}-${index}-end`} type="time" required value={window.end} onChange={event=>edit(day,index,'end',event.target.value)}/></Field>
        <Button variant="secondary" aria-label={`Remove ${name} hours ${index+1}`} onClick={()=>setDay(day,value[day].filter((_,i)=>i!==index))}>Remove</Button>
      </div>)}
      <Button variant="secondary" disabled={value[day].length>=maxWindows} onClick={()=>setDay(day,[...value[day],{start:'',end:''}])}>Add {name} hours</Button>
      {day==='mon'&&value.mon.length>0&&<Button variant="secondary" onClick={copyMonday}>Copy Monday to Tuesday–Friday</Button>}
    </fieldset>;})}
  </div>;
}
