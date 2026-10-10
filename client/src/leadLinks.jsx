import React from 'react';
import {Button} from './ui.jsx';
import {go} from './api.js';

export function LeadLinks({row}) {
  return <>
    {row.linkedQuoteId&&<Button variant="secondary" onClick={()=>go('/quotes?record='+encodeURIComponent(row.linkedQuoteId))}>Quotes</Button>}
    {!!row.bookings?.length&&<section aria-label="Bookings"><h3>Bookings</h3>{row.bookings.map(booking=>{
      const date=new Intl.DateTimeFormat('en-CA',{timeZone:booking.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(booking.startAtUtc));
      return <p key={booking.id}>{booking.status} · {new Date(booking.startAtUtc).toLocaleString(undefined,{timeZone:booking.timezone})} ({booking.timezone}){' '}
        <Button variant="secondary" onClick={()=>go('/calendar?fromDate='+date)}>Calendar</Button>
      </p>;
    })}</section>}
  </>;
}
