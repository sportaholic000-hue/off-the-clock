import React, {useEffect, useRef, useState} from 'react';
import {api, getSessionKey} from './api.js';
import {AppShell, ErrorMessage, Loading, settingsSection} from './ui.jsx';
import Billing from './billing.jsx';
import {KnowledgeStep, VoiceStep} from './onboarding.jsx';

// Settings: Receptionist, Business knowledge and Billing. The section tabs come
// from AppShell on every /settings page, including the billing page itself.
// Each section is the same component used in setup, not a copy.
export default function Settings() {
  const section = settingsSection();
  if (section === 'billing') return <Billing />;
  return <OwnerSettings section={section} />;
}

function OwnerSettings({section}) {
  const [state, setState] = useState(null), [error, setError] = useState(null);
  const mounted = useRef(true), identity = useRef(getSessionKey());
  async function refresh() {
    const next = await api('/api/onboarding/state');
    if (mounted.current && identity.current === getSessionKey()) setState(next);
    return next;
  }
  useEffect(() => {
    mounted.current = true;
    refresh().catch(next => {if (mounted.current) setError(next);});
    return () => {mounted.current = false;};
  }, []);
  return <AppShell activePath="/settings" plan={state?.account?.plan} operator={state?.operator}>
    <main className="pricebook-page settings-page">
      {!state ? (error ? <ErrorMessage error={error} /> : <Loading label="LOADING SETTINGS" />)
        : section === 'knowledge' ? <KnowledgeStep state={state} refresh={refresh} inSettings />
          : <VoiceStep state={state} refresh={refresh} inSettings />}
    </main>
  </AppShell>;
}
