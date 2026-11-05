import React, {useEffect, useRef, useState} from 'react';
import {api} from './api.js';
import {AppShell, Button, ErrorMessage, Loading, Notice, PageHeader} from './ui.jsx';
import {ReceptionistFields, answeringBody, initialAnswering, updateAnswering} from './receptionistFields.jsx';

// Owner page for how the receptionist answers, on every plan, any time.
// Saves through the same route as onboarding step 9.
export default function Receptionist() {
  const [state, setState] = useState(null), [form, setForm] = useState(null);
  const [error, setError] = useState(null), [busy, setBusy] = useState(false), [saved, setSaved] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    api('/api/onboarding/state').then(next => {if (!mounted.current) return;setState(next);setForm(initialAnswering(next));})
      .catch(next => {if (mounted.current) setError(next);});
    return () => {mounted.current = false;};
  }, []);
  const businessName = state?.account?.businessName;
  function update(field, value) {setSaved(false);setForm(current => updateAnswering(current, field, value, businessName));}
  async function save() {
    setBusy(true);setError(null);setSaved(false);
    try {
      const result = await api('/api/onboarding/voice', {method: 'POST', body: answeringBody(form)});
      if (!mounted.current) return;
      const next = {...state, profile: {...state.profile, ...(result?.profile || {})}};
      setState(next);setForm(initialAnswering(next));setSaved(true);
    } catch (next) {if (mounted.current) setError(next);}
    finally {if (mounted.current) setBusy(false);}
  }
  return <AppShell activePath="/receptionist" plan={state?.account?.plan}><main className="pricebook-page receptionist-page">
    <PageHeader eyebrow="YOUR BUSINESS" title="Receptionist" description="How your receptionist answers calls." />
    {!form ? (error ? <ErrorMessage error={error} /> : <Loading label="LOADING RECEPTIONIST" />) : <section className="editor-section receptionist-settings">
      <ReceptionistFields form={form} onChange={update} />
      <ErrorMessage error={error} />
      {saved && <Notice tone="success">Receptionist settings saved.</Notice>}
      <div><Button onClick={save} disabled={busy || !form.greeting.trim()}>{busy ? 'Saving' : 'Save'}</Button></div>
    </section>}
  </main></AppShell>;
}
