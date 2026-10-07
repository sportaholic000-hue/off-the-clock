import React, {useEffect, useRef, useState} from 'react';
import {api, getToken, getSessionKey, go} from './api.js';
import {AppShell, Button, Field, Loading, Notice, PageHeader, Select} from './ui.jsx';
import {billingState, billingStorageKey, readBillingJobs, billingDestination, billingFailure, definiteBillingRejection, canContinueSetup, billingRecoveryMessage} from './billingTransport.js';

const PLANS = ['Operator','QuoteDone'];
const STATUS_LABELS = {active:'Active',trialing:'Trial',pending_subscription:'Subscription pending',pending_payment:'Payment pending',past_due:'Payment overdue',payment_failed:'Payment failed',suspended:'Suspended',canceled:'Canceled'};

export default function Billing() {
  const [session] = useState(getToken);
  const [state,setState] = useState(null),[storageKey,setStorageKey] = useState(null);
  const [jobs,setJobs] = useState({}),[plan,setPlan] = useState(''),[interval,setInterval] = useState('');
  const [lifecycle,setLifecycle]=useState(null);
  const [busy,setBusy] = useState('status'),[error,setError] = useState('');
  const currentJobs = useRef({}), inFlight = useRef(false), mounted = useRef(true);
  const sameSession = () => mounted.current && getSessionKey() === getSessionKey(session);

  function saveJobs(next,key=storageKey) {
    if (!key) throw new Error('Billing request storage is not ready.');
    sessionStorage.setItem(key,JSON.stringify({version:1,...next}));
    currentJobs.current=next;setJobs(next);
  }

  async function refresh() {
    if (inFlight.current) return;
    inFlight.current=true;setBusy('status');setError('');
    try {
      const [response,key,events] = await Promise.all([api('/api/billing/status'),billingStorageKey(session),api('/api/billing/lifecycle')]);
      if (!sameSession()) return;
      const next=billingState(response),saved=readBillingJobs(sessionStorage,key);
      // Returning from a portal is not evidence of any subscription change.
      // Its acknowledged request can finish; account state comes from the GET.
      if (saved.portal?.state === 'opened') delete saved.portal;
      if (saved.checkout && (next.checkoutState === 'EXPIRED' || (next.checkoutState === 'NONE' && canContinueSetup(next) && !next.canCheckout))) delete saved.checkout;
      setStorageKey(key);saveJobs(saved,key);setState(next);setLifecycle(events);
      if (saved.checkout) {setPlan(saved.checkout.body.plan);setInterval(saved.checkout.body.billingInterval);}
      else {setPlan(PLANS.includes(next.plan)?next.plan:'');setInterval(next.billingInterval||'monthly');}
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

  async function lifecycleAction(action) {
    if(inFlight.current||!sameSession())return;
    inFlight.current=true;setBusy(action);setError('');
    try {await api('/api/billing/'+action,{method:'POST',body:{}});}
    catch(err){if(sameSession())setError(err.code==='BILLING_NEW_SUBSCRIPTION_REQUIRED'?'Start a new subscription below to reactivate retained data.':'The change is awaiting confirmation. Refresh or retry; your request is saved.');}
    finally{inFlight.current=false;if(sameSession()){setBusy('');await refresh();}}
  }
  async function exportRecords(kind) {
    try {const blob=await api('/api/billing/export/'+kind,{format:'blob'});if(!sameSession())return;
      const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=kind+'.csv';a.click();URL.revokeObjectURL(url);
    }catch{setError('Records could not be exported. Check the retention date and refresh.');}
  }
  const deepAction=new URLSearchParams(window.location.search).get('billingAction');
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
          {state.serviceEndsAt?<p>Service ends {state.serviceEndsAt}. No partial refunds.</p>:null}
          {state.cancelAtPeriodEnd?<p>Cancellation is scheduled for the end of the current billing period.</p>:null}
          {state.annualPaidThroughAt?<p>Annual service is paid through {state.annualPaidThroughAt.slice(0,10)}. Cancellation keeps service until that date; no partial refunds. Included minutes reset monthly, and extra minutes are billed monthly at $0.35/min.</p>:null}
          {billingRecoveryMessage(state)?<Notice tone="error">{billingRecoveryMessage(state)}</Notice>:null}
          {canContinueSetup(state)?<Button onClick={()=>go('/onboarding?step=2')}>Continue setup</Button>:billingRecoveryMessage(state)?null:<p>Complete checkout with a payment method to start your selected plan’s 14-day trial. Refresh after checkout to confirm activation.</p>}
        </section>
        {!state.billingEnabled?<Notice>Billing is not configured yet.</Notice>:!state.providerAvailable?<Notice>Billing is temporarily unavailable. Your account status is shown above.</Notice>:null}
        {state.billingEnabled&&(state.canCheckout||checkout)?<section className="billing-panel" aria-label="Start subscription">
          <h2>{checkout?'Continue checkout':'Start subscription'}</h2>
          <form onSubmit={event=>{event.preventDefault();open('checkout');}}>
            <fieldset className="billing-fields" disabled={!!busy||!!checkout||!state.providerAvailable}>
              <Field label="Plan"><Select aria-label="Plan" value={plan} onChange={event=>setPlan(event.target.value)} required><option value="">Choose a plan</option>{PLANS.map(item=><option key={item} value={item}>{item}</option>)}</Select></Field>
              <Field label="Billing interval"><Select aria-label="Billing interval" value={interval} onChange={event=>setInterval(event.target.value)} required><option value="">Choose an interval</option><option value="monthly">Monthly</option><option value="annual">Annual</option></Select></Field>
            </fieldset>
            <p>Your selected plan starts with a 14-day trial and a card on file. The first payment is at trial end: Operator $119 monthly or $1,190 for 12 months; QuoteDone $279 monthly or $2,790 for 12 months. Annual plans receive monthly minutes and monthly overage bills.</p>
            {checkout?<p>Your {checkout.body.plan} {checkout.body.billingInterval} request is saved. Retry uses the same request.</p>:null}
            <Button type="submit" disabled={!!busy||!state.providerAvailable||(!checkout&&(!plan||!interval))}>{busy==='checkout'?'Opening checkout':checkout?'Resume checkout':'Continue to checkout'}</Button>
          </form>
        </section>:null}
        {state.billingEnabled&&(state.canManageBilling||portal)?<section className="billing-panel" aria-label="Manage subscription">
          <h2>Manage subscription</h2><p>Manage payment details or change your plan in the billing portal.</p>
          <Button disabled={!!busy||!state.providerAvailable} onClick={()=>open('portal')}>{busy==='portal'?'Opening billing':portal?'Retry opening billing':'Manage billing'}</Button>
        </section>:null}
        {state.billingEnabled?<section className="billing-panel" aria-label="Plan lifecycle">
          <h2>Plan lifecycle</h2>
          {deepAction==='cancel'?<p>Cancel before your next charge using Cancel plan below.</p>:null}
          {deepAction==='change'?<Button disabled={!!busy||!state.canManageBilling} onClick={()=>open('portal')}>Change plan</Button>:null}
          {!state.serviceEndsAt&&state.canManageBilling?<Button disabled={!!busy||!state.providerAvailable} onClick={()=>lifecycleAction('cancel')}>Cancel plan</Button>:null}
          {state.serviceEndsAt&&Date.parse(state.serviceEndsAt)>Date.now()?<Button disabled={!!busy||!state.providerAvailable} onClick={()=>lifecycleAction('reactivate')}>Reactivate</Button>:null}
          {lifecycle?.cancellation&&lifecycle.cancellation.state!=='RESTORED'?<>
            <p>Phone release: {lifecycle.cancellation.phoneReleaseAt}. Export deadline: {lifecycle.cancellation.exportUntilAt}.</p>
            {lifecycle.cancellation.lastError?<Notice tone="error">A lifecycle action is pending confirmation. Refresh to check progress.</Notice>:null}
            {lifecycle.cancellation.forwardingOffAt?<p>Forwarding shutdown confirmed.</p>:state.serviceEndsAt&&Date.parse(state.serviceEndsAt)<=Date.now()?<p>Carrier forwarding shutdown is pending confirmation. Turn off forwarding on your business line.</p>:null}
          </>:null}
          {['leads','quotes','calls'].map(kind=><Button key={kind} variant="secondary" disabled={!!busy||!!(lifecycle?.cancellation&&lifecycle.cancellation.state!=='RESTORED'&&Date.parse(lifecycle.cancellation.exportUntilAt)<=Date.now())} onClick={()=>exportRecords(kind)}>Export {kind} (CSV)</Button>)}
        </section>:null}
        <section className="billing-panel" aria-label="Billing notices"><h2>Billing notices</h2>
          {!lifecycle?.notices?.length?<p>No billing notices yet.</p>:lifecycle.notices.map(item=><article key={item.id}><p>{item.message}</p><small>Email: {item.emailStatus||'PENDING'}{item.deliveryError?' — confirmation pending':''}</small></article>)}
        </section>
      </>:null}
      <Button variant="secondary" disabled={!!busy} onClick={refresh}>{busy==='status'?'Refreshing billing status':'Refresh billing status'}</Button>
    </main>
  </AppShell>;
}
