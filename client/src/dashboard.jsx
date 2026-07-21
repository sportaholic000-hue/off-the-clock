import React, { useEffect, useState } from 'react';
import { BookOpen, ChevronRight, Power, Settings } from 'lucide-react';
import { api, go } from './api.js';
import { AppShell, Button, ErrorMessage, Loading, Notice, PageHeader, StatusChip, Toggle } from './ui.jsx';

export default function Dashboard() {
  const [dashboard, setDashboard] = useState(null);
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const [dash, onboarding] = await Promise.all([api('/api/dashboard'), api('/api/onboarding/state')]);
    setDashboard(dash);
    setState(onboarding);
  }

  useEffect(() => { load().catch(setError); }, []);

  async function toggle(enabled) {
    setBusy(true); setError(null);
    try {
      const path = dashboard.operator.simulated ? '/api/dev/preview/operator' : '/api/operator/toggle';
      await api(path, { method:'POST', body:{ enabled } });
      await load();
    } catch (nextError) { setError(nextError); }
    finally { setBusy(false); }
  }

  if (error && !dashboard) return <div className="center-state"><ErrorMessage error={error} /></div>;
  if (!dashboard || !state) return <Loading label="LOADING DASHBOARD" />;

  return (
    <AppShell activePath="/dashboard" operator={dashboard.operator}>
      <main className="dashboard-page">
        <PageHeader eyebrow="DASHBOARD" title={state.account.businessName} description="Operator control and QuoteDone readiness." />
        <section className={!dashboard.operator.simulated && dashboard.operator.enabled ? 'master-operator live' : 'master-operator'}>
          <Toggle
            checked={dashboard.operator.simulated ? dashboard.operator.simulatedEnabled : dashboard.operator.enabled}
            disabled={busy || (dashboard.operator.simulated
              ? (!dashboard.operator.simulatedEligible && !dashboard.operator.simulatedEnabled)
              : (!dashboard.operator.eligible && !dashboard.operator.enabled))}
            onChange={toggle}
            label={dashboard.operator.simulated
              ? (dashboard.operator.simulatedEnabled ? 'SIMULATED ON' : 'SIMULATED OFF')
              : (dashboard.operator.enabled ? 'OPERATOR LIVE' : 'OPERATOR OFF')}
            sublabel={dashboard.operator.simulated ? 'VISUAL REVIEW ONLY | NO CALLS ARE ROUTED' : (dashboard.operator.enabled ? 'EVERY CALL FROM HERE ON IS COVERED' : 'CALLS RING YOUR PHONE')}
          />
          <Power size={28} aria-hidden="true" />
        </section>
        {dashboard.operator.simulated && <Notice tone="warning">SIMULATED FOR VISUAL REVIEW. No number is provisioned, no carrier setup changes, and no calls are handled.</Notice>}
        {!dashboard.operator.simulated && !dashboard.operator.eligible && <Notice tone="warning">Complete {dashboard.operator.missing.join(', ')} before the operator can go live.</Notice>}
        <div className="dashboard-bands">
          <section className="dashboard-band">
            <div className="band-heading"><div><p className="eyebrow">QUOTEDONE STATUS</p><h2>Services</h2></div><Button icon={BookOpen} variant="secondary" onClick={() => go('/pricebook')}>Open price book</Button></div>
            {dashboard.pricebookStatuses.length ? (
              <div className="status-table">
                {dashboard.pricebookStatuses.map(service => (
                  <button key={service.serviceType} type="button" onClick={() => go('/pricebook')}>
                    <span><strong>{service.service}</strong></span>
                    <StatusChip status={service.status} />
                    {service.missingOwnerLabels?.length > 0 && <small>{service.missingOwnerLabels.join('; ')}</small>}
                    <ChevronRight size={16} />
                  </button>
                ))}
              </div>
            ) : <Notice>Pricing is not configured. Answering can still run.</Notice>}
          </section>
          <section className="dashboard-band">
            <div className="band-heading"><div><p className="eyebrow">SETUP</p><h2>Onboarding</h2></div><Button icon={Settings} variant="secondary" onClick={() => go(`/onboarding?step=${Math.min(9,state.profile.onboardingStep || 1)}`)}>Resume setup</Button></div>
            <div className="setup-facts">
              <div><span>Business line</span><strong>{state.preview?.telephonySimulated ? 'SIMULATED FOR REVIEW' : state.profile.phoneProvisioningStatus === 'provisioned' ? 'CONNECTED' : 'NOT CONNECTED'}</strong></div>
              <div><span>Knowledge base</span><strong>{state.profile.knowledgeBase.about && state.profile.knowledgeBase.hours ? 'CORE READY' : 'NEEDS ABOUT + HOURS'}</strong></div>
              <div><span>Calendar</span><strong>{String(state.profile.calendar.status || 'not_connected').replaceAll('_',' ').toUpperCase()}</strong></div>
              <div><span>Voice</span><strong>{state.profile.agentName || 'NOT SET'}</strong></div>
            </div>
          </section>
        </div>
        <ErrorMessage error={error} />
      </main>
    </AppShell>
  );
}
