import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, Check, Mic, Phone, RotateCcw, Sparkles, Volume2 } from 'lucide-react';
import { api, getToken, go, setToken } from './api.js';
import {VerificationNotice} from './accountRecovery.jsx';
import {
  AppShell, Button, ErrorMessage, Field, Loading, Notice, PageHeader,
  PhonePreviewButton, Select, StatusChip, StepActions, Textarea, TextInput, Toggle
} from './ui.jsx';
import StructuredPricingQuestion, {
  describeStructuredValue, validateStructuredValue
} from './interviewStructured.jsx';

const STEPS = [
  { name:'Account' },
  { name:'Business type' },
  { name:'Jurisdiction' },
  { name:'Phone number' },
  { name:'Knowledge base' },
  { name:'Go live' },
  { name:'Price book' },
  { name:'Calendar', optional:true },
  { name:'Voice & greeting' }
];
const PLANS = ['Operator','QuoteDone'];
const TRADE_GROUPS = [
  { label: 'Roofing', types: ['ROOFING_REPLACEMENT','ROOFING_REPAIR','FLAT_ROOF_REPLACEMENT','FLAT_ROOF_REPAIR'] },
  { label: 'Painting', types: ['INTERIOR_PAINTING','EXTERIOR_PAINTING'] },
  { label: 'Flooring', types: ['FLOORING_INSTALL','FLOORING_REPLACEMENT'] },
  { label: 'Fencing', types: ['FENCING_INSTALL','FENCING_REPLACEMENT'] },
  { label: 'Concrete', types: ['CONCRETE_DRIVEWAY','CONCRETE_PATIO_SLAB'] },
  { label: 'Landscaping', types: ['LANDSCAPING_CLEANUP','LANDSCAPING_MULCH','LANDSCAPING_SOD','LANDSCAPING_PLANTING','LANDSCAPING_MOWING'] },
  { label: 'Siding', types: ['SIDING_REPLACEMENT','SIDING_REPAIR'] },
  { label: 'Something else', types: ['CUSTOM'] }
];

function currentStepFromUrl(fallback = 1) {
  const value = Number(new URLSearchParams(window.location.search).get('step'));
  return value >= 1 && value <= 9 ? value : Math.min(9, Math.max(1, fallback));
}

function setStepUrl(step) {
  window.history.replaceState({}, '', `/onboarding?step=${step}`);
}

function StepRail({ step, state, onJump }) {
  // Reference: design-reference/onboarding/index.html step rail.
  // Answering status flips once the number is set and About + Hours have
  // content. Quoting activates per service later; answering never waits on
  // the price book.
  const profile = state?.profile || {};
  const simulated = state?.preview?.telephonySimulated === true;
  const numberReady = simulated || profile.phoneProvisioningStatus === 'provisioned';
  const knowledgeReady = Boolean(profile.knowledgeBase?.about && profile.knowledgeBase?.hours);
  const answering = numberReady && knowledgeReady;

  return (
    <nav className="step-rail" aria-label="Setup progress">
      <span className="eyebrow">Get set up</span>
      <ol className="progress-rail">
        {STEPS.map((entry, index) => {
          const number = index + 1;
          const railState = number < step ? 'done' : number === step ? 'current' : 'upcoming';
          return (
            <li key={entry.name} className={`rail-step ${railState}`}>
              <button
                type="button"
                onClick={() => railState === 'done' && onJump && onJump(number)}
                disabled={railState !== 'done'}
                aria-current={railState === 'current' ? 'step' : undefined}
              >
                <span className="rail-marker mono">
                  {railState === 'done' ? <Check size={12} aria-hidden="true" /> : number}
                </span>
                <span className="rail-copy">
                  <span className="rail-title">{entry.name}</span>
                  {entry.optional && <span className="rail-optional mono">SKIPPABLE</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className={`answering-status${answering ? ' on' : ''}`}>
        <span className="mono answering-label">ANSWERING STATUS</span>
        <div className="answering-state">
          <span className="answering-dot" aria-hidden="true" />
          <span className="answering-text">
            {answering
              ? (simulated ? 'Ready (simulated review only)' : 'Ready to answer')
              : 'Not live yet'}
          </span>
        </div>
        <span className="answering-note">
          Flips on once your number is set and the About and Hours sections have content.
          Quoting turns on per service later. Answering never waits on your price book.
        </span>
      </div>
    </nav>
  );
}

function AuthStep({ onAuthenticated }) {
  const [mode, setMode] = useState(new URLSearchParams(window.location.search).get('mode') === 'login' ? 'login' : 'register');
  const [form, setForm] = useState({ email:'', password:'', firstName:'', businessName:'', plan:'QuoteDone' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = mode === 'register'
        ? await api('/api/auth/register', { method:'POST', auth:false, body:form })
        : await api('/api/auth/login', { method:'POST', auth:false, body:{ email:form.email, password:form.password } });
      setToken(payload.token);
      if (mode === 'login') {
        try {
          const session = await api('/api/dashboard');
          if (session.role === 'staff') { go('/leads'); return; }
        } catch (sessionError) {
          if (sessionError.status !== 403) throw sessionError;
          go('/settings/billing'); return;
        }
      }
      onAuthenticated(payload);
    } catch (nextError) {
      setError(nextError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-layout">
      <div className="auth-brand"><span className="eyebrow">SELF-SERVE SETUP</span><h1>Put your operator on the line.</h1></div>
      <form className="auth-form" onSubmit={submit}>
        <div className="segmented">
          <button type="button" className={mode === 'register' ? 'selected' : ''} onClick={() => setMode('register')}>Create account</button>
          <button type="button" className={mode === 'login' ? 'selected' : ''} onClick={() => setMode('login')}>Sign in</button>
        </div>
        {mode === 'register' && (
          <>
            <Field label="Owner first name"><TextInput value={form.firstName} onChange={event => setForm({ ...form, firstName:event.target.value })} required /></Field>
            <Field label="Business name"><TextInput value={form.businessName} onChange={event => setForm({ ...form, businessName:event.target.value })} required /></Field>
          </>
        )}
        <Field label="Email"><TextInput type="email" value={form.email} onChange={event => setForm({ ...form, email:event.target.value })} required /></Field>
        <Field label="Password"><TextInput type="password" minLength="8" value={form.password} onChange={event => setForm({ ...form, password:event.target.value })} required /></Field>
        {mode === 'register' && (
          <Field label="Plan">
            <div className="choice-grid two">
              {PLANS.map(plan => (
                <button type="button" key={plan} aria-label={plan} aria-pressed={form.plan === plan} className={form.plan === plan ? 'choice selected' : 'choice'} onClick={() => setForm({ ...form, plan })}>{plan}</button>
              ))}
            </div>
          </Field>
        )}
        <ErrorMessage error={error} />
        <Button className="full" type="submit" disabled={busy}>{busy ? 'Working' : mode === 'register' ? 'Start setup' : 'Sign in'}</Button>
        <Button variant="secondary" onClick={() => go('/forgot-password')}>Forgot password?</Button>
      </form>
    </div>
  );
}

function AccountStep({ state, refresh, next }) {
  const [form, setForm] = useState({
    firstName: state.account.firstName || '',
    businessName: state.account.businessName || ''
  });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true); setError(null);
    try {
      await api('/api/onboarding/account', { method:'POST', body:{...form,plan:state.account.plan} });
      await refresh();
      next();
    } catch (nextError) { setError(nextError); }
    finally { setBusy(false); }
  }
  return (
    <section className="step-panel">
      <PageHeader eyebrow="Step 1 of 9" title="Your account" description="This is the name your operator uses when a caller needs you." />
      <div className="form-grid two">
        <Field label="Owner first name"><TextInput value={form.firstName} onChange={event => setForm({ ...form, firstName:event.target.value })} /></Field>
        <Field label="Business name"><TextInput value={form.businessName} onChange={event => setForm({ ...form, businessName:event.target.value })} /></Field>
      </div>
      <div><p>Plan: {state.account.plan}</p><Button variant="secondary" onClick={()=>go('/settings/billing')}>Billing</Button></div>
      <ErrorMessage error={error} />
      <StepActions onNext={save} nextDisabled={busy || !form.firstName || !form.businessName} />
    </section>
  );
}

function BusinessTypeStep({ state, refresh, back, next }) {
  const [selected, setSelected] = useState(state.profile.businessTypes || []);
  const [error, setError] = useState(null);
  const chosenGroups = TRADE_GROUPS.filter(group => group.types.some(type => selected.includes(type))).map(group => group.label);
  function toggle(group) {
    const active = group.types.some(type => selected.includes(type));
    setSelected(active ? selected.filter(type => !group.types.includes(type)) : [...new Set([...selected, ...group.types])]);
  }
  async function save() {
    setError(null);
    try {
      await api('/api/onboarding/business-types', { method:'POST', body:{ businessTypes:selected } });
      await refresh();
      next();
    } catch (nextError) { setError(nextError); }
  }
  return (
    <section className="step-panel">
      <PageHeader eyebrow="Step 2 of 9" title="What work do you do?" description="Select every trade your business handles. Answering works for any service business. QuoteDone pricing is optional." />
      <div className="choice-grid trade-grid">
        {TRADE_GROUPS.map(group => (
          <button key={group.label} type="button" className={chosenGroups.includes(group.label) ? 'choice selected' : 'choice'} onClick={() => toggle(group)}>
            {group.label}
          </button>
        ))}
      </div>
      <ErrorMessage error={error} />
      <StepActions onBack={back} onNext={save} nextDisabled={!selected.length} />
    </section>
  );
}

function JurisdictionStep({ state, refresh, back, next }) {
  const deferred = state.account.plan === 'Operator';
  const [form, setForm] = useState({
    country: state.profile.country || 'US',
    region: state.profile.region || '',
    taxMode: 'TAX_NONE',
    taxPercent: ''
  });
  const [taxChoiceMade, setTaxChoiceMade] = useState(false);
  const [error, setError] = useState(null);
  async function save() {
    if (deferred) return next();
    setError(null);
    try {
      // Preserve the entered decimal spelling until the server validates it.
      await api('/api/business/jurisdiction', { method:'POST', body:{ ...form, taxPercent:form.taxPercent } });
      await refresh();
      next();
    } catch (nextError) { setError(nextError); }
  }
  return (
    <section className="step-panel">
      <PageHeader eyebrow="Step 3 of 9" title="Set your jurisdiction" description={deferred ? 'You can add jurisdiction settings when you turn on QuoteDone.' : 'QuoteDone uses this only to apply the tax mode and rate you confirm.'} />
      {deferred ? (
        <Notice>Operator answering does not need a tax setting.</Notice>
      ) : (
        <>
          <div className="form-grid two">
            <Field label="Country">
              <Select value={form.country} onChange={event => { setForm({ ...form, country:event.target.value, region:'' }); setTaxChoiceMade(false); }}>
                <option value="US">United States</option><option value="CA">Canada</option>
              </Select>
            </Field>
            <Field label={form.country === 'US' ? 'State code' : 'Province code'}>
              <TextInput maxLength="2" value={form.region} onChange={event => setForm({ ...form, region:event.target.value.toUpperCase() })} placeholder={form.country === 'US' ? 'ME' : 'NB'} />
            </Field>
          </div>
          {form.country === 'US' && (
            <fieldset className="tax-question">
              <legend>How do you handle sales tax on customer invoices?</legend>
              {[
                ['TAX_NONE',"I pay sales tax when I buy materials and don't add a tax line to customer invoices."],
                ['TAX_MATERIALS','I charge customers sales tax on the materials portion.'],
                ['TAX_ALL','I charge sales tax on the entire job.']
              ].map(([value,label]) => (
                <label key={value} className={form.taxMode === value && taxChoiceMade ? 'radio-row selected' : 'radio-row'}>
                  <input type="radio" name="taxMode" checked={form.taxMode === value && taxChoiceMade} onChange={() => { setForm({ ...form, taxMode:value }); setTaxChoiceMade(true); }} />
                  <span>{label}</span>
                </label>
              ))}
              {taxChoiceMade && form.taxMode !== 'TAX_NONE' && <Field label="Sales tax rate (%)"><TextInput type="number" min="0" max="100" step="0.01" value={form.taxPercent} onChange={event => setForm({ ...form, taxPercent:event.target.value })} /></Field>}
            </fieldset>
          )}
          {form.country === 'CA' && <Field label="Confirmed combined tax rate (%)"><TextInput type="number" min="0" max="100" step="0.01" value={form.taxPercent} onChange={event => setForm({ ...form, taxPercent:event.target.value, taxMode:'TAX_ALL' })} /></Field>}
        </>
      )}
      <ErrorMessage error={error} />
      <StepActions onBack={back} onNext={save} nextDisabled={!deferred && (!form.region || (form.country === 'US' && !taxChoiceMade) || ((form.country === 'CA' || (taxChoiceMade && form.taxMode !== 'TAX_NONE')) && !(Number(form.taxPercent) > 0)))} />
    </section>
  );
}

function PhoneStep({ state, refresh, back, next }) {
  const [number, setNumber] = useState(state.profile.existingPhoneNumber || '');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [testStatus, setTestStatus] = useState('');
  const connected = state.profile.phoneProvisioningStatus === 'provisioned';
  const simulated = state.preview?.telephonySimulated === true;
  const readyToContinue = connected || simulated;
  async function connect() {
    setBusy(true); setError(null);
    try {
      await api('/api/onboarding/phone/provision', { method:'POST', body:{ existingNumber:number } });
      await refresh();
    } catch (nextError) { setError(new Error('We could not finish connecting this line. Check the number and try again.')); }
    finally { setBusy(false); }
  }
  async function simulate() {
    setBusy(true); setError(null);
    try {
      await api('/api/dev/preview/telephony', { method:'POST', body:{ existingNumber:number } });
      await refresh();
    } catch (nextError) { setError(nextError); }
    finally { setBusy(false); }
  }
  async function test() {
    setTestStatus('CALLING');
    setError(null);
    try {
      const created = await api('/api/onboarding/phone/test', { method:'POST', body:{} });
      for (let attempt = 0; attempt < 20; attempt += 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const call = await api(`/api/onboarding/phone/test/${created.callSid}`);
        if (['in-progress','completed'].includes(call.status)) {
          setTestStatus('LIVE');
          return;
        }
        if (['busy','failed','no-answer','canceled'].includes(call.status)) {
          throw new Error('The test call was not answered');
        }
        setTestStatus(call.status === 'ringing' ? 'RINGING' : 'CALLING');
      }
      setTestStatus('CHECK YOUR PHONE');
    } catch (nextError) {
      setTestStatus('');
      setError(new Error('The test call could not be completed. Try again in a moment.'));
    }
  }
  return (
    <section className="step-panel">
      <PageHeader
        eyebrow="Step 4 of 9"
        title="Plug in your line"
        description={state.preview?.enabled ? 'Use a simulated phone step to inspect the remaining screens. No customer calls are affected.' : 'Keep the number your customers already know. Nothing about it changes for them, except that someone always answers.'}
      />
      <div className="phone-connect">
        <Field label="The number your customers call" help="This is the line on your trucks, your website, and your business cards. It stays exactly the same.">
          <TextInput type="tel" value={number} onChange={event => setNumber(event.target.value)} placeholder="(506) 214-7788" />
        </Field>
        <Button icon={Phone} onClick={connect} disabled={busy || connected}>{connected ? 'Connected' : busy ? 'Connecting' : 'Connect this number'}</Button>
      </div>
      {state.preview?.enabled && (
        <div className="preview-mode-panel">
          <Notice tone="warning" title="Local visual preview only">This simulates the setup screens. It does not provision a number, place a call, change carrier setup, contact a carrier, or make the operator available to customers.</Notice>
          <Button variant="secondary" onClick={simulate} disabled={busy || simulated || !number.trim()}>{simulated ? 'Simulation ready' : 'Use simulated phone step'}</Button>
        </div>
      )}
      {connected && (
        <div className="connection-ready">
          <Notice tone="success" title="Connected. Your line is ready.">Flip the operator on from your dashboard any time.</Notice>
          <div>
            <p className="eyebrow">Hear it answer</p>
            <p>Call your own number right now. You will hear Off The Clock pick up, the same way your customers will.</p>
            <div className="test-call-row"><PhonePreviewButton onClick={test}>{testStatus === 'LIVE' ? 'Call again' : 'Call my number now'}</PhonePreviewButton>{testStatus && <StatusChip status={testStatus} />}</div>
          </div>
        </div>
      )}
      {simulated && (
        <Notice tone="warning" title="SIMULATED FOR VISUAL REVIEW">No telephony connection exists. Continue to inspect the remaining onboarding screens.</Notice>
      )}
      <ErrorMessage error={error} />
      <StepActions onBack={back} onNext={next} nextDisabled={!readyToContinue} />
    </section>
  );
}

function KnowledgeStep({ state, refresh, back, next }) {
  const initial = state.profile.knowledgeBase || {};
  const [form, setForm] = useState({
    about:initial.about || '', hours:initial.hours || '', services:initial.services || '',
    policies:initial.policies || '', faqs:initial.faqs || '',
    neverSay:Array.isArray(initial.neverSay) ? initial.neverSay.join('\n') : '',
    websiteUrl:''
  });
  const [draft, setDraft] = useState(Boolean(initial.draft));
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  function change(field, value) { setForm({ ...form, [field]:value }); }
  async function buildDraft() {
    setBusy(true); setError(null);
    try {
      const result = await api('/api/onboarding/knowledge-base/draft', { method:'POST', body:{ websiteUrl:form.websiteUrl } });
      const kb = result.knowledgeBase;
      setForm({ ...form, ...kb, neverSay:(kb.neverSay || []).join('\n') });
      setDraft(true);
      await refresh();
    } catch (nextError) { setError(nextError); }
    finally { setBusy(false); }
  }
  async function save() {
    setBusy(true); setError(null);
    try {
      await api('/api/onboarding/knowledge-base', { method:'POST', body:form });
      setDraft(false);
      await refresh();
      next();
    } catch (nextError) { setError(nextError); }
    finally { setBusy(false); }
  }
  return (
    <section className="step-panel">
      <PageHeader eyebrow="Step 5 of 9" title="Load your business knowledge" description="Review what your operator can say before it goes live." actions={<StatusChip status={draft ? 'DRAFT' : 'OWNER REVIEW'} />} />
      <div className="draft-tools">
        <Field label="Business website URL"><TextInput type="url" value={form.websiteUrl} onChange={event => change('websiteUrl', event.target.value)} placeholder="https://" /></Field>
        <Button icon={Sparkles} variant="secondary" onClick={buildDraft} disabled={busy}>Draft from my business</Button>
      </div>
      <div className="kb-grid">
        <Field label="About & area"><Textarea rows="5" value={form.about} onChange={event => change('about', event.target.value)} /></Field>
        <Field label="Hours"><Textarea rows="5" value={form.hours} onChange={event => change('hours', event.target.value)} /></Field>
        <Field label="Services"><Textarea rows="5" value={form.services} onChange={event => change('services', event.target.value)} /></Field>
        <Field label="Policies (payment/warranty/cancellation)"><Textarea rows="5" value={form.policies} onChange={event => change('policies', event.target.value)} /></Field>
        <Field label="FAQs"><Textarea rows="5" value={form.faqs} onChange={event => change('faqs', event.target.value)} /></Field>
        <Field label={'"Never say" list'}><Textarea rows="5" value={form.neverSay} onChange={event => change('neverSay', event.target.value)} /></Field>
      </div>
      <ErrorMessage error={error} />
      <StepActions onBack={back} onNext={save} nextLabel="Review and save" nextDisabled={busy || !form.about.trim() || !form.hours.trim()} />
    </section>
  );
}

function GoLiveStep({ state, refresh, back, next }) {
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const operator = state.operator;
  const simulated = operator.simulated === true;
  const enabled = simulated ? operator.simulatedEnabled : operator.enabled;
  const eligible = simulated ? operator.simulatedEligible : operator.eligible;
  const missing = simulated ? operator.simulatedMissing : operator.missing;
  async function toggle(enabled) {
    setBusy(true); setError(null);
    try {
      await api(simulated ? '/api/dev/preview/operator' : '/api/operator/toggle', { method:'POST', body:{ enabled } });
      await refresh();
    } catch (nextError) { setError(nextError); }
    finally { setBusy(false); }
  }
  return (
    <section className="step-panel">
      <PageHeader eyebrow="Step 6 of 9" title={simulated ? 'Review the operator control' : 'Put your operator on the line'} description={simulated ? 'This control is simulated for visual review. No calls are answered or routed.' : 'Answering is ready before pricing. QuoteDone activates separately as each service gets its prices.'} />
      <div className={!simulated && enabled ? 'go-live-control live' : 'go-live-control'}>
        <Toggle
          checked={enabled}
          disabled={busy || (!eligible && !enabled)}
          onChange={toggle}
          label={simulated ? (enabled ? 'SIMULATED ON' : 'SIMULATED OFF') : (enabled ? 'OPERATOR LIVE' : 'OPERATOR OFF')}
          sublabel={simulated ? 'VISUAL REVIEW ONLY · NO CALLS ARE ROUTED' : (enabled ? 'EVERY CALL FROM HERE ON IS COVERED' : 'CALLS RING YOUR PHONE')}
        />
      </div>
      {!eligible && <Notice tone="warning">Still needed: {missing.join(', ')}</Notice>}
      {simulated && <Notice tone="warning">SIMULATED FOR VISUAL REVIEW. Production phone eligibility is unchanged and no telephony action has occurred.</Notice>}
      {!simulated && enabled && <Notice tone="success">OPERATOR LIVE — every call from here on is covered.</Notice>}
      <ErrorMessage error={error} />
      <StepActions onBack={back} onNext={next} />
    </section>
  );
}

function parseInterviewValue(raw, type) {
  if (type === 'boolean') return raw === 'true';
  // Structured fields are edited through StructuredPricingQuestion and are
  // already the exact object the price book expects. They are never serialized
  // to text and never parsed back.
  if (type === 'json') return raw;
  if (type === 'select') return raw;
  const number = Number(raw);
  if (!Number.isFinite(number)) throw new Error('Enter a number before confirming this field');
  return number;
}

function PriceBookStep({ state, metadata, back, next }) {
  const quoteAccess = ['QuoteDone','Scale'].includes(state.account.plan);
  const activeTypes = state.profile.businessTypes || [];
  const available = metadata.filter(service => activeTypes.includes(service.serviceType));
  const [mode, setMode] = useState('browser');
  const [answer,setAnswer] = useState('');
  const [aiBusy,setAiBusy] = useState(false);
  const [aiNotice,setAiNotice] = useState('');
  const [draft, setDraft] = useState(null);
  const [position, setPosition] = useState(0);
  // Scalar/select fields hold a string; structured fields hold the object.
  const [rawValue, setRawValue] = useState('');
  const [readBack, setReadBack] = useState(null);
  const [existingDrafts, setExistingDrafts] = useState(null);
  const [suggestions, setSuggestions] = useState(null);
  const [suggesting,setSuggesting] = useState(false);
  const [error, setError] = useState(null);
  const interviewFields = useMemo(
    () => available.flatMap(service => service.fields.filter(field=>['number','json','select','boolean'].includes(field.type)).map(field => ({ ...field, serviceType:service.serviceType, serviceName:service.name }))),
    [available]
  );
  const current = interviewFields[position];

  useEffect(() => {
    if (!quoteAccess || draft) return;
    api('/api/pricebook/interview')
      .then(result => setExistingDrafts(result.drafts || []))
      .catch(() => setExistingDrafts([]));
  }, [quoteAccess, draft]);

  function editValue(value) {
    setRawValue(value);
    setReadBack(null);
  }

  function positionFor(loaded) {
    if (loaded.currentField) {
      const index = interviewFields.findIndex(field => `${field.serviceType}.${field.field}` === loaded.currentField);
      if (index >= 0) return index;
    }
    const index = interviewFields.findIndex(field => !(loaded.confirmedFields?.[field.serviceType] || []).includes(field.field));
    return index >= 0 ? index : interviewFields.length;
  }

  async function assistAnswer() {
    if (!draft || !current || aiBusy) return;
    setAiBusy(true);setError(null);setAiNotice('');
    try {
      const result=await api('/api/pricebook/interview/'+draft.id+'/assist',{method:'POST',body:{serviceType:current.serviceType,field:current.field,answer}});
      setDraft(result.draft);
      setRawValue(current.type==='json'?result.value:String(result.value));
      setReadBack(null);
      setAiNotice('AI captured this as an unconfirmed draft. Check the value below before saving it.');
    } catch(nextError) {setError(nextError);}
    finally {setAiBusy(false);}
  }

  async function startInterview() {
    setError(null);
    try {
      const result = await api('/api/pricebook/interview', { method:'POST', body:{ mode, serviceTypes:activeTypes } });
      setDraft(result.draft);
      setPosition(0);
      setRawValue(interviewFields[0]?.type === 'json' ? {} : '');
      setReadBack(null);
    } catch (nextError) { setError(nextError); }
  }

  // Restore whatever was already captured for a field, so resuming mid-question
  // brings back a partially completed structured answer instead of a blank.
  function savedValueFor(loadedDraft, index) {
    const field = interviewFields[index];
    if (!field) return '';
    const stored = loadedDraft?.fields?.[field.serviceType]?.[field.field];
    if (field.type === 'json') {
      return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
    }
    if (stored === undefined || stored === null) return '';
    return String(stored);
  }

  async function resumeInterview(draftId) {
    setError(null);
    try {
      const result = await api(`/api/pricebook/interview/${draftId}`);
      const index = positionFor(result.draft);
      setDraft(result.draft);
      setPosition(index);
      setRawValue(savedValueFor(result.draft, index));
      setReadBack(null);
    } catch (nextError) { setError(nextError); }
  }

  function readItBack() {
    if (!current) return;
    setError(null);
    try {
      const value = parseInterviewValue(rawValue, current.type);
      if (current.type === 'json') {
        // Structured answers are confirmed as a human sentence. Raw serialized
        // data is never displayed or spoken.
        const problem = validateStructuredValue(value, current.shapedKeys, current.title || current.label);
        if (problem) throw new Error(problem);
      }
      const spoken = current.type === 'json'
        ? describeStructuredValue(value, current.shapedKeys, current.title || current.label)
        : typeof value === 'number'
          ? `${String(rawValue).split('').join(' ')}, ${value.toLocaleString('en-US')}`
          : current.type === 'select'
            ? current.optionLabels?.[value] || 'Selected pricing option'
            : String(rawValue);
      if (typeof window.speechSynthesis !== 'undefined') {
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(spoken));
      }
      setReadBack({ value, spoken });
    } catch (nextError) { setError(nextError); }
  }

  async function confirmField() {
    if (!draft || !current || !readBack) return;
    setError(null);
    try {
      const value = readBack.value;
      const existingConfirmed = draft.confirmedFields?.[current.serviceType] || [];
      const result = await api(`/api/pricebook/interview/${draft.id}`, {
        method:'PUT',
        body:{
          fields:{ [current.serviceType]:{ [current.field]:value } },
          confirmedFields:{ [current.serviceType]:[...new Set([...existingConfirmed, current.field])] },
          currentField:interviewFields[position + 1] ? `${interviewFields[position + 1].serviceType}.${interviewFields[position + 1].field}` : null
        }
      });
      setDraft(result.draft);
      setAnswer('');setAiNotice('');
      const nextField = interviewFields[position + 1];
      setRawValue(nextField?.type === 'json' ? {} : '');
      setReadBack(null);
      setPosition(Math.min(interviewFields.length, position + 1));
    } catch (nextError) { setError(nextError); }
  }

  async function reviewDraft() {
    try {
      const review = await api(`/api/pricebook/interview/${draft.id}/review`);
      sessionStorage.setItem('otc_pricebook_draft', JSON.stringify(review));
      go('/pricebook');
    } catch (nextError) { setError(nextError); }
  }

  async function suggest() {
    if(suggesting)return;
    setSuggesting(true);setError(null);
    try {
      const industry = TRADE_GROUPS.filter(group => group.types.some(type => activeTypes.includes(type))).map(group => group.label).join(', ');
      const result = await api('/api/pricebook/suggest', { method:'POST', body:{ industry, serviceTypes:activeTypes } });
      setSuggestions(result);
      sessionStorage.setItem('otc_pricebook_suggestions', JSON.stringify(result));
    } catch (nextError) { setError(nextError); }
    finally {setSuggesting(false);}
  }

  if (!quoteAccess) {
    return (
      <section className="step-panel">
        <PageHeader eyebrow="Step 7 of 9" title="Price book" description="QuoteDone pricing is available on QuoteDone and Scale." />
        <Notice>Operator keeps answering, booking, and capturing pricing requests without guessing.</Notice>
        <Button onClick={() => go('/onboarding?step=1')}>Choose QuoteDone</Button>
        <StepActions onBack={back} onNext={next} nextLabel="Skip for now" />
      </section>
    );
  }

  return (
    <section className="step-panel">
      <PageHeader eyebrow="Step 7 of 9" title="Build your price book" description={state.preview?.telephonySimulated ? 'This step is skippable and resumable. Phone controls remain simulated while you inspect pricing.' : 'This step is skippable and resumable. Answering stays live while you finish pricing.'} />
      <div className="path-list">
        <div className="path-row featured">
          <div><span className="eyebrow">1 · FLAGSHIP</span><h2>AI price-book interview</h2><p>Have your AI build your price book with you. {interviewFields.length} pricing {interviewFields.length === 1 ? 'question' : 'questions'} across {available.length} {available.length === 1 ? 'service' : 'services'}.</p></div>
          {!draft && (
            <div className="path-actions">
              <div className="segmented compact">
                <button type="button" className={mode === 'phone' ? 'selected' : ''} onClick={() => setMode('phone')}><Phone size={15} />Phone</button>
                <button type="button" className={mode === 'browser' ? 'selected' : ''} onClick={() => setMode('browser')}><Mic size={15} />Browser</button>
              </div>
              <Button onClick={startInterview}>Start interview</Button>
              {existingDrafts?.length > 0 && (
                <Button variant="secondary" onClick={() => resumeInterview(existingDrafts[0].id)}>Resume saved draft</Button>
              )}
            </div>
          )}
          {draft && current && (
            <div className="interview-field">
              <StatusChip status="DRAFT" />
              <Field label="Describe this price in your own words">
                <Textarea value={answer} disabled={aiBusy} maxLength={4000} onChange={event=>setAnswer(event.target.value)} />
              </Field>
              <Button icon={Sparkles} disabled={aiBusy||!answer.trim()} onClick={assistAnswer}>{aiBusy?'Reading your answer…':'Use AI to capture this answer'}</Button>
              {aiBusy&&<p role="status">AI is working. You can still open the manual editor below.</p>}
              {aiNotice&&<p role="status">{aiNotice}</p>}
              <p className="mono">{position + 1} / {interviewFields.length} · {current.serviceName}</p>
              <Field label={current.label}>
                {current.type === 'select' ? (
                  <Select value={rawValue} onChange={event => editValue(event.target.value)}>
                    <option value="">Choose</option>
                    {(current.options || []).map(option => <option key={option} value={option}>{current.optionLabels?.[option] || 'Pricing option'}</option>)}
                  </Select>
                ) : current.type === 'boolean' ? (
                  <Select value={rawValue} onChange={event => editValue(event.target.value)}><option value="">Choose</option><option value="true">Yes</option><option value="false">No</option></Select>
                ) : current.type === 'json' ? (
                  <StructuredPricingQuestion
                    definition={current}
                    value={typeof rawValue === 'object' && rawValue !== null ? rawValue : {}}
                    onChange={editValue}
                  />
                ) : (
                  <TextInput type="number" step="0.01" value={rawValue} onChange={event => editValue(event.target.value)} />
                )}
              </Field>
              {!readBack && <Button icon={Volume2} onClick={readItBack} disabled={aiBusy || (current.type === 'json' ? !rawValue || Object.keys(rawValue).length === 0 : !rawValue)}>Read it back</Button>}
              {readBack && (
                <div className="readback-confirm">
                  <p className="mono">READ BACK: {readBack.spoken}</p>
                  <div className="test-call-row">
                    <Button icon={Check} disabled={aiBusy} onClick={confirmField}>{current.type === 'json' ? 'Yes, save these prices' : 'Yes, save this number'}</Button>
                    <Button variant="secondary" onClick={() => setReadBack(null)}>No, let me fix it</Button>
                  </div>
                </div>
              )}
            </div>
          )}
          {draft && current && <Button variant="secondary" disabled={aiBusy} onClick={reviewDraft}>Review captured values in editor</Button>}
          {draft && !current && (
            <div className="interview-complete">
              <Notice tone="success">Every captured field is confirmed. The result is still DRAFT until you review and save it in the editor.</Notice>
              <Button onClick={reviewDraft}>Review field by field</Button>
            </div>
          )}
        </div>
        <div className="path-row">
          <div><span className="eyebrow">2</span><h2>Suggest a starter book</h2><p>Generate AI-suggested placeholder prices, then review and confirm each value before going live.</p></div>
          <Button icon={Sparkles} variant="secondary" disabled={suggesting} onClick={suggest}>{suggesting?'Generating draft…':'Suggest a starter book'}</Button>
          {suggesting&&<p role="status">AI is preparing unconfirmed suggestions. The manual editor remains available below.</p>}
        </div>
        {suggestions && (
          <div className="suggestion-results">
            <Notice tone="warning">{suggestions.warning}</Notice>
            {suggestions.suggestions.map(item => <div className="suggestion-row" key={`${item.serviceType}-${item.service}`}><strong>{item.service}</strong><span className="mono">{Object.keys(item.fields || {}).length} DRAFT values · confirm each in the editor</span></div>)}
            <Button onClick={() => go('/pricebook')}>Open in editor</Button>
          </div>
        )}
        <div className="path-row">
          <div><span className="eyebrow">3</span><h2>Manual editor</h2><p>Enter every service price directly and check that each service has what it needs to quote.</p></div>
          <Button icon={BookOpen} variant="secondary" onClick={() => go('/pricebook')}>Open manual editor</Button>
        </div>
      </div>
      <ErrorMessage error={error} />
      <StepActions onBack={back} onNext={next} nextLabel="Skip for now" />
    </section>
  );
}

function CalendarStep({ state, refresh, back, next }) {
  const connected = state.profile.calendar?.status === 'connected';
  const [provider, setProvider] = useState(state.profile.calendar?.provider || 'calendly');
  const [calendlyUrl, setCalendlyUrl] = useState(state.profile.calendar?.calendlyUrl || '');
  const [error, setError] = useState(null);
  async function google() {
    try {
      const result = await api('/api/onboarding/calendar/google/start');
      window.location.assign(result.authorizationUrl);
    } catch (nextError) { setError(nextError); }
  }
  async function save(skipped = false) {
    try {
      await api('/api/onboarding/calendar', { method:'POST', body:{ provider, calendlyUrl, skipped } });
      await refresh();
      next();
    } catch (nextError) { setError(nextError); }
  }
  return (
    <section className="step-panel">
      <PageHeader eyebrow="Step 8 of 9" title="Connect your calendar" description="Until a calendar is connected, your operator collects preferred times and puts them on the lead card." />
      {connected && <Notice tone="success">Calendar connected.</Notice>}
      <div className="calendar-options">
        <div className="integration-row"><div><strong>Google Calendar</strong><span>Connect with Google OAuth</span></div><Button onClick={google}>Connect Google</Button></div>
        <div className="integration-row">
          <div><strong>Calendly</strong><span>Add the scheduling link your business already uses</span></div>
          <div className="inline-form"><TextInput type="url" value={calendlyUrl} onChange={event => setCalendlyUrl(event.target.value)} placeholder="https://calendly.com/..." /><Button variant="secondary" onClick={() => save(false)} disabled={provider !== 'calendly' || !calendlyUrl}>Save</Button></div>
        </div>
      </div>
      <ErrorMessage error={error} />
      <StepActions onBack={back} onNext={connected ? next : () => save(true)} nextLabel={connected ? 'Continue' : 'Skip for now'} />
    </section>
  );
}

function VoiceStep({ state, refresh, back }) {
  const businessName = state.account.businessName;
  const [form, setForm] = useState({
    voiceId:state.profile.voiceId || 'female',
    agentName:state.profile.agentName || 'Nova',
    greeting:state.profile.greeting || `${businessName}, this is Nova. How can I help?`
  });
  const [error, setError] = useState(null);
  function update(field, value) {
    const next = { ...form, [field]:value };
    if (field === 'agentName' && (!state.profile.greeting || form.greeting.includes(form.agentName))) {
      next.greeting = `${businessName}, this is ${value}. How can I help?`;
    }
    setForm(next);
  }
  function preview() {
    if (typeof window.speechSynthesis === 'undefined') return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(form.greeting);
    const voices = window.speechSynthesis.getVoices();
    utterance.voice = voices.find(voice => form.voiceId === 'female' ? /female|samantha|victoria/i.test(voice.name) : /male|daniel|alex/i.test(voice.name)) || voices[0];
    window.speechSynthesis.speak(utterance);
  }
  async function finish() {
    try {
      await api('/api/onboarding/voice', { method:'POST', body:form });
      await refresh();
      go('/dashboard');
    } catch (nextError) { setError(nextError); }
  }
  return (
    <section className="step-panel">
      <PageHeader eyebrow="Step 9 of 9" title="Choose the voice callers meet" description="Your operator always greets callers with your business name and its own name." />
      <div className="choice-grid two">
        <button type="button" className={form.voiceId === 'female' ? 'choice selected' : 'choice'} onClick={() => update('voiceId','female')}>Nova · female voice</button>
        <button type="button" className={form.voiceId === 'male' ? 'choice selected' : 'choice'} onClick={() => update('voiceId','male')}>Miles · male voice</button>
      </div>
      <Field label="Agent name"><TextInput value={form.agentName} onChange={event => update('agentName', event.target.value)} /></Field>
      <Field label="Greeting"><Textarea rows="4" value={form.greeting} onChange={event => update('greeting', event.target.value)} /></Field>
      <Button icon={Volume2} variant="secondary" onClick={preview}>Preview greeting</Button>
      <ErrorMessage error={error} />
      <StepActions onBack={back} onNext={finish} nextLabel="Finish setup" nextDisabled={!form.agentName.trim() || !form.greeting.trim()} />
    </section>
  );
}

export default function Onboarding() {
  const [state, setState] = useState(null);
  const [verificationDelivery, setVerificationDelivery] = useState(null);
  const [metadata, setMetadata] = useState([]);
  const [step, setStep] = useState(currentStepFromUrl(1));
  const [error, setError] = useState(null);

  async function refresh() {
    const [nextState, meta] = await Promise.all([api('/api/onboarding/state'), api('/api/pricebook/meta')]);
    setState(nextState);
    setMetadata(meta.services || []);
    return nextState;
  }

  useEffect(() => {
    if (!getToken()) return;
    refresh().then(nextState => {
      const urlStep = currentStepFromUrl(nextState.profile.onboardingStep || 1);
      setStep(urlStep);
      setStepUrl(urlStep);
    }).catch(nextError => {
      if (nextError.status === 401) setToken(null);
      else setError(nextError);
    });
  }, []);

  function move(nextStep) {
    const bounded = Math.min(9, Math.max(1, nextStep));
    setStep(bounded);
    setStepUrl(bounded);
    window.scrollTo({ top:0, behavior:'smooth' });
  }

  if (!getToken()) return <AuthStep onAuthenticated={payload => {setVerificationDelivery(payload.verificationDelivery || null);return payload.account?.planStatus === 'pending_payment' || window.location.pathname.startsWith('/settings') ? go('/settings/billing') : refresh().then(() => move(2)).catch(setError);}} />;
  if (error) return <AppShell activePath="/onboarding"><main className="billing-page"><ErrorMessage error={error}/><Button onClick={()=>go('/settings/billing')}>Billing</Button></main></AppShell>;
  if (!state) return <Loading label="LOADING ONBOARDING" />;

  const props = { state, refresh, back:() => move(step - 1), next:() => move(step + 1) };
  let content;
  if (step === 1) content = <AccountStep {...props} />;
  if (step === 2) content = <BusinessTypeStep {...props} />;
  if (step === 3) content = <JurisdictionStep {...props} />;
  if (step === 4) content = <PhoneStep {...props} />;
  if (step === 5) content = <KnowledgeStep {...props} />;
  if (step === 6) content = <GoLiveStep {...props} />;
  if (step === 7) content = <PriceBookStep {...props} metadata={metadata} />;
  if (step === 8) content = <CalendarStep {...props} />;
  if (step === 9) content = <VoiceStep {...props} />;
  if ([3,7].includes(step) && state.account.plan === 'QuoteDone' && state.quoteDoneAccess !== true) content = <section className="step-panel"><PageHeader eyebrow="QuoteDone setup" title="Activate your QuoteDone plan" description="Complete checkout and confirm your trial or payment before setting up QuoteDone." /><Button onClick={()=>go('/settings/billing')}>Continue to billing</Button></section>;

  return (
    <AppShell activePath="/onboarding" operator={state.operator}>
      <main className="onboarding-page">
        <StepRail step={step} state={state} onJump={move} />
        <div className="step-body">
          {/* Each step renders its own PageHeader with "Step N of 9", a
              meaningful title and a description. A second generic heading here
              duplicated the step counter and title on all nine steps. */}
          <VerificationNotice initialDelivery={verificationDelivery}/>
          {content}
        </div>
      </main>
    </AppShell>
  );
}
