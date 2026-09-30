import React, {useEffect, useRef, useState} from 'react';
import {api, getToken, go} from './api.js';
import {AppShell, Button, Field, Loading, Notice, PageHeader, Select} from './ui.jsx';
import {billingState, billingStorageKey, readBillingJobs, billingDestination, billingFailure, definiteBillingRejection} from './billingTransport.js';

const PLANS = ['Operator','QuoteDone','Scale'];
const STATUS_LABELS = {active:'Active',trialing:'Trial',pending_subscription:'Subscription pending',pending_payment:'Payment pending',past_due:'Payment overdue',payment_failed:'Payment failed',suspended:'Suspended',canceled:'Canceled'};

export default function Billing() {
  const [session] = useState(getToken);
  const [state,setState] = useState(null),[storageKey,setStorageKey] = useState(null);
  const [jobs,setJobs] = useState({}),[plan,setPlan] = useState(''),[interval,setInterval] = useState('');
  const [busy,setBusy] = useState('status'),[error,setError] = useState('');
  const currentJobs = useRef({}), inFlight = useRef(false), mounted = useRef(true);
  const sameSession = () => mounted.current && getToken() === session;

  function saveJobs(next,key=storageKey) {
    if (!key) throw new Error('Billing request storage is not ready.');
    sessionStorage.setItem(key,JSON.stringify({version:1,...next}));
    currentJobs.current=next;setJobs(next);
  }

  async function refresh() {
    if (inFlight.current) return;
    inFlight.current=true;setBusy('status');setError('');
    try {
      const [response,key] = await Promise.all([api('/api/billing/status'),billingStorageKey(session)]);
      if (!sameSession()) return;
      const next=billingState(response),saved=readBillingJobs(sessionStorage,key);
      // Returning from a portal is not evidence of any subscription change.
      // Its acknowledged request can finish; account state comes from the GET.
      if (saved.portal?.state === 'opened') delete saved.portal;
      if (saved.checkout && (next.checkoutState === 'EXPIRED' || (next.checkoutState === 'NONE' && next.planStatus === 'active' && !next.canCheckout))) delete saved.checkout;
      setStorageKey(key);saveJobs(saved,key);setState(next);
      if (saved.checkout) {setPlan(saved.checkout.body.plan);setInterval(saved.checkout.body.billingInterval);}
    } catch (err) {if(sameSession()){setState(null);setError(err.status?billingFailure(err):'Billing status could not be loaded. Please refresh it.');}}
    finally {inFlight.current=false;if(sameSession())setBusy('');}
  }

  useEffect(() => {
    mounted.current=true;refresh();
    return () => {mounted.current=false;};
  },[session]);

  async function open(kind) {
    if (inFlight.current || !sameSession() || !state?.providerAvailable) return;
    const prior=currentJobs.current[kind];
    if (!prior && !(kind==='checkout'?state.canCheckout:state.canManageBilling)) return;
    if (kind==='checkout' && !prior && (!plan || !interval)) return;
    const job=prior || {kind,key:crypto.randomUUID(),state:'pending',body:kind==='checkout'?{plan,billingInterval:interval}:{}};
    inFlight.current=true;setBusy(kind);setError('');
    try {
      // Save before requesting a provider session; an uncertain retry is exact.
      saveJobs({...currentJobs.current,[kind]:job});
      const response=await api('/api/billing/'+kind,{method:'POST',body:job.body,idempotencyKey:job.key});
      if (!sameSession()) return;
      const url=billingDestination(response?.url);
      if (!url) throw new Error('Unconfirmed billing destination.');
      saveJobs({...currentJobs.current,[kind]:{...job,state:'opened'}});
      window.location.assign(url);
    } catch (err) {
      if (!sameSession()) return;
      if (definiteBillingRejection(err)) {
        const next={...currentJobs.current};delete next[kind];
        try {saveJobs(next);} catch { /* keep the original request for recovery */ }
      }
      setError(billingFailure(err,{pending:!!currentJobs.current[kind]}));
    } finally {inFlight.current=false;if(sameSession())setBusy('');}
  }

  const checkout=jobs.checkout,portal=jobs.portal;
  return <AppShell activePath="/settings">
    <main className="billing-page">
      <PageHeader eyebrow="Settings" title="Billing" description="Choose a subscription or manage your existing billing." />
      <nav className="billing-settings-nav" aria-label="Account settings">
        <Button variant="secondary" onClick={()=>go('/onboarding?step=1')}>Your account</Button>
        <Button variant="secondary" onClick={()=>go('/onboarding?step=8')}>Calendar</Button>
        <Button variant="secondary" onClick={()=>go('/onboarding?step=9')}>Voice &amp; greeting</Button>
      </nav>
      {busy==='status'&&!state?<Loading label="Loading billing"/>:null}
      {error?<div role="alert"><Notice tone="error">{error}</Notice></div>:null}
      {state?<>
        <section className="billing-panel" aria-label="Current subscription">
          <h2>Current subscription</h2>
          <dl><dt>Plan</dt><dd>{state.plan}</dd><dt>Status</dt><dd>{STATUS_LABELS[state.planStatus]||'Status unavailable'}</dd>
            {state.billingInterval?<><dt>Billing interval</dt><dd>{state.billingInterval==='annual'?'Annual':'Monthly'}</dd></>:null}</dl>
          {state.cancelAtPeriodEnd?<p>Cancellation is scheduled for the end of the current billing period.</p>:null}
          <p>Completing checkout or returning from billing does not confirm activation. Refresh to see the latest account status.</p>
        </section>
        {!state.billingEnabled?<Notice>Billing is not configured yet.</Notice>:!state.providerAvailable?<Notice>Billing is temporarily unavailable. Your account status is shown above.</Notice>:null}
        {state.billingEnabled&&(state.canCheckout||checkout)?<section className="billing-panel" aria-label="Start subscription">
          <h2>{checkout?'Continue checkout':'Start subscription'}</h2>
          <form onSubmit={event=>{event.preventDefault();open('checkout');}}>
            <fieldset className="billing-fields" disabled={!!busy||!!checkout||!state.providerAvailable}>
              <Field label="Plan"><Select aria-label="Plan" value={plan} onChange={event=>setPlan(event.target.value)} required><option value="">Choose a plan</option>{PLANS.map(item=><option key={item} value={item}>{item}</option>)}</Select></Field>
              <Field label="Billing interval"><Select aria-label="Billing interval" value={interval} onChange={event=>setInterval(event.target.value)} required><option value="">Choose an interval</option><option value="monthly">Monthly</option><option value="annual">Annual</option></Select></Field>
            </fieldset>
            <p>You will review the configured price and payment details at checkout.</p>
            {checkout?<p>Your {checkout.body.plan} {checkout.body.billingInterval} request is saved. Retry uses the same request.</p>:null}
            <Button type="submit" disabled={!!busy||!state.providerAvailable||(!checkout&&(!plan||!interval))}>{busy==='checkout'?'Opening checkout':checkout?'Resume checkout':'Continue to checkout'}</Button>
          </form>
        </section>:null}
        {state.billingEnabled&&(state.canManageBilling||portal)?<section className="billing-panel" aria-label="Manage subscription">
          <h2>Manage subscription</h2><p>Manage payment details, your plan, or cancellation in the billing portal.</p>
          <Button disabled={!!busy||!state.providerAvailable} onClick={()=>open('portal')}>{busy==='portal'?'Opening billing':portal?'Retry opening billing':'Manage billing'}</Button>
        </section>:null}
      </>:null}
      <Button variant="secondary" disabled={!!busy} onClick={refresh}>{busy==='status'?'Refreshing billing status':'Refresh billing status'}</Button>
    </main>
  </AppShell>;
}