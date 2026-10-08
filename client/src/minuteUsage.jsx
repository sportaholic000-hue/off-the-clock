import React from 'react';
import {Notice} from './ui.jsx';

export function minuteMoney(cents){return Number.isSafeInteger(cents)&&cents>=0?'$'+(cents/100).toLocaleString('en-CA',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';}
export default function MinuteUsage({usage}){
  if(!usage)return null;
  const known=usage.status==='PAID'||usage.status==='TRIAL';
  return <section className="billing-panel minute-usage" aria-label="Voice minute usage" aria-live="polite">
    <h2>{usage.status==='TRIAL'?'Trial minutes':'Minutes this billing month'}</h2>
    {known?<>
      <p>{usage.periodStartAt.slice(0,10)} to {usage.periodEndAt.slice(0,10)} · {usage.includedMinutes.toLocaleString('en-CA')} included minutes</p>
      <dl className="minute-usage-totals">
        <div><dt>Minutes used</dt><dd>{usage.minutesUsed.toLocaleString('en-CA')}</dd></div>
        <div><dt>Minutes left</dt><dd>{usage.minutesLeft.toLocaleString('en-CA')}</dd></div>
        <div><dt>Overage so far</dt><dd>{minuteMoney(usage.overageCents)}</dd></div>
        <div><dt>Charged so far</dt><dd>{minuteMoney(usage.chargedCents)}</dd></div>
        <div><dt>Not yet charged</dt><dd>{minuteMoney(usage.unchargedCents)}</dd></div>
      </dl>
      {usage.status==='PAID'?<p>Extra minutes are $0.35/min, charged to your card each time they reach $25, with any remainder charged at the end of the billing month.</p>:<p>Trial minutes are not billed as overage.</p>}
      {usage.unconfirmedCalls>0?<p>Some call durations are awaiting provider confirmation. Only confirmed minutes count toward overage charges.</p>:null}
      {(usage.warnings||[]).map(warning=><Notice key={warning.id} tone="warning">{warning.message}{['PENDING','SENDING','ACCEPTED','REVIEW','BOUNCED'].includes(warning.emailStatus)?' Email delivery is pending or needs attention; this dashboard warning is saved.':null}</Notice>)}
      {usage.upgradeMessage?<Notice>{usage.upgradeMessage}</Notice>:null}
    </>:<p>{usage.message||'Minute usage is waiting for verified billing-period information.'}</p>}
    {(usage.pendingCharges||[]).map(charge=><Notice key={charge.id||charge.periodId} tone="warning">{charge.startAt.slice(0,10)} to {charge.endAt.slice(0,10)}: {minuteMoney(charge.amountCents)}. {charge.message}</Notice>)}
  </section>;
}
