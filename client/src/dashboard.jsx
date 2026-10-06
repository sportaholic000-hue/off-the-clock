import {OwnerAlerts} from './ownerAlerts.jsx';
import OwnerIntegrations from './ownerIntegrations.jsx';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, ChevronRight, PhoneCall, Settings } from 'lucide-react';
import {CallFeed} from './calls.jsx';
import { api, go, getSessionKey } from './api.js';
import {startLeadCaptureFeed} from './leadCaptureRepair20261006Feed.js';
import { AppShell, Button, ErrorMessage, Loading, Notice, StatusChip } from './ui.jsx';
import { CounterCard, SimulatedBanner } from './reference.jsx';

// Composition follows the committed Fable dashboard references:
//   design-reference/dashboard/index.html      — operator OFF / not-live /
//                                                setup-incomplete states
//   design-reference/dashboard-live/index.html — operator ON / live states
// Real product data only. Seeded demonstration activity appears solely when
// the server returns previewActivity, which is gated by localPreviewEnabled()
// and always carries the simulated marker.

function operatorView(operator) {
  if (operator.simulated) {
    return {
      live: operator.simulatedEnabled,
      simulated: true,
      title: operator.simulatedEnabled ? 'OPERATOR LIVE (SIMULATED)' : 'OPERATOR OFF (SIMULATED)',
      sub: 'SIMULATED FOR VISUAL REVIEW | NO CALLS ARE ROUTED',
      checked: operator.simulatedEnabled,
      blocked: !operator.simulatedEligible && !operator.simulatedEnabled,
      missing: operator.simulatedMissing || []
    };
  }
  return {
    live: operator.enabled,
    simulated: false,
    title: operator.enabled ? 'OPERATOR LIVE' : 'OPERATOR OFF',
    sub: operator.enabled ? 'EVERY CALL FROM HERE ON IS COVERED' : 'CALLS RING YOUR PHONE',
    checked: operator.enabled,
    blocked: !operator.eligible && !operator.enabled,
    missing: operator.missing || []
  };
}

export default function Dashboard() {
  const [dashboard, setDashboard] = useState(null);
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [feedError,setFeedError]=useState(null);
  const feed=useRef(null),generation=useRef(0),mounted=useRef(false);

  async function load() {
    const version=++generation.current,identity=getSessionKey();
    feed.current?.stop();feed.current=null;
    const [dash, onboarding] = await Promise.all([api('/api/dashboard'), api('/api/onboarding/state')]);
    if(!mounted.current||version!==generation.current||identity!==getSessionKey())return;
    setDashboard(dash);
    setState(onboarding);
    setFeedError(null);
    feed.current=startLeadCaptureFeed({read:()=>api('/api/leads/activity'),session:getSessionKey,
      onData:activity=>{if(mounted.current&&version===generation.current){setDashboard(current=>current?{...current,callActivity:activity}:current);setFeedError(null);}},
      onError:nextError=>{if(mounted.current&&version===generation.current)setFeedError(nextError);},
      onSessionChange:()=>{generation.current++;setDashboard(null);setState(null);setError(new Error('The signed-in account changed. Reload the dashboard.'));}});
  }

  useEffect(() => { mounted.current=true;load().catch(nextError=>{if(mounted.current)setError(nextError);});
    return()=>{mounted.current=false;generation.current++;feed.current?.stop();};}, []);

  async function refresh(){setBusy(true);try{await load();}catch(nextError){if(mounted.current)setFeedError(nextError);}finally{if(mounted.current)setBusy(false);}}

  async function toggle(enabled) {
    setBusy(true); setError(null);
    try {
      const path = dashboard.operator.simulated ? '/api/dev/preview/operator' : '/api/operator/toggle';
      await api(path, { method:'POST', body:{ enabled } });
      await load();
    } catch (nextError) { setError(nextError); }
    finally { setBusy(false); }
  }

  // One row per missing requirement — never a semicolon-joined paragraph.
  // Grouped by service, not a flat field list. A multi-trade owner has one
  // row per blocked service instead of one row per missing field across every
  // service, which previously produced a hundred-plus row wall above the rest
  // of the dashboard.
  const MAX_SERVICE_GROUPS = 4;   // bounded rows on the dashboard
  const MAX_EXAMPLES = 2;         // named requirements shown per service

  const blockerGroups = useMemo(() => {
    if (!dashboard) return [];
    return (dashboard.pricebookStatuses || [])
      .filter(service => (service.missingOwnerFields || []).length > 0)
      .map(service => {
        const fields = service.missingOwnerFields || [];
        const labels = service.missingOwnerLabels || [];
        return {
          serviceType: service.serviceType,
          service: service.service,
          total: fields.length,
          // First requirement deep-links straight to the affected control.
          firstField: fields[0],
          examples: fields.slice(0, MAX_EXAMPLES).map((field, index) => ({
            field,
            label: labels[index] || field
          })),
          remaining: Math.max(0, fields.length - MAX_EXAMPLES)
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [dashboard]);

  const shownGroups = blockerGroups.slice(0, MAX_SERVICE_GROUPS);
  const hiddenGroups = blockerGroups.slice(MAX_SERVICE_GROUPS);
  // Truthful counts for everything not shown on this screen.
  const hiddenServiceCount = hiddenGroups.length;
  const hiddenFieldCount = hiddenGroups.reduce((sum, group) => sum + group.total, 0);
  const totalMissing = blockerGroups.reduce((sum, group) => sum + group.total, 0);

  if (error && !dashboard) return <AppShell activePath="/dashboard"><main className="billing-page"><ErrorMessage error={error}/><Button onClick={()=>go('/settings/billing')}>Billing</Button></main></AppShell>;
  if (!dashboard || !state) return <Loading label="LOADING DASHBOARD" />;

  const view = operatorView(dashboard.operator);
  const activity = dashboard.callActivity?.total>0 ? null : dashboard.previewActivity || null;
  const storedActivity=dashboard.callActivity;
  const showStored=storedActivity&&(storedActivity.total>0||!activity);
  const statuses = dashboard.pricebookStatuses || [];
  const ready = statuses.filter(service => service.status === 'QUOTING LIVE');
  const needs = statuses.filter(service => service.status !== 'QUOTING LIVE');

  return (
    <AppShell activePath="/dashboard" operator={dashboard.operator}>
      <main className="dashboard-page">
        {dashboard.callActivity?.notifications&&<OwnerAlerts alerts={dashboard.callActivity.notifications} configured={dashboard.callActivity.emailAlertsConfigured} onRefresh={refresh}/>}
        {feedError&&<Notice title="Call feed updates unavailable">Showing the last saved snapshot. {feedError.message}</Notice>}
        <Button variant="secondary" disabled={busy} onClick={refresh}>Refresh</Button>

        {/* HERO: operator state. Reference top-bar master toggle. */}
        <section className={`operator-hero${view.live ? ' live' : ''}${view.simulated ? ' simulated' : ''}`}>
          <button
            type="button"
            role="switch"
            aria-checked={view.checked}
            className="operator-switch"
            disabled={busy || view.blocked}
            onClick={() => toggle(!view.checked)}
          >
            <span className="operator-track"><span className="operator-knob" /></span>
            <span className="operator-copy">
              <strong className="mono">{view.title}</strong>
              <small className="mono">{view.sub}</small>
            </span>
          </button>
          <div className="operator-side">
            {activity && (
              <div className="minutes-meter">
                <div className="minutes-head">
                  <span className="chip chip-plan mono">{activity.label}</span>
                  <span className="mono minutes-count">{activity.minutes.label}</span>
                </div>
                <span className="minutes-track">
                  <span
                    className="minutes-fill"
                    style={{ width: `${Math.round((activity.minutes.used / activity.minutes.included) * 100)}%` }}
                  />
                </span>
              </div>
            )}
            <span className="mono operator-note">
              {view.simulated ? 'SIMULATED · REAL OPERATOR REMAINS OFF' : view.live ? 'HANDLING CALLS NOW' : 'NOT HANDLING CALLS'}
            </span>
          </div>
        </section>

        {view.simulated && (
          <SimulatedBanner>
            SIMULATED FOR VISUAL REVIEW. No number is provisioned, NO CALLS ARE ROUTED,
            production eligibility is unchanged, and the real operator remains off.
          </SimulatedBanner>
        )}

        {!view.live && !view.simulated && (
          <div className="off-banner">
            <span className="off-dot" aria-hidden="true" />
            <span>Operator is off. Calls to your line ring your phone. Whoever answers is on it.</span>
          </div>
        )}

        {view.blocked && view.missing.length > 0 && (
          <Notice tone="warning">
            Finish {view.missing.join(' and ')} before the operator can{view.simulated ? ' be reviewed' : ' go live'}.
          </Notice>
        )}

        {/* HIGHEST-PRIORITY ACTION */}
        {needs.length > 0 ? (
          <button type="button" className="priority-action" onClick={() => go('/pricebook')}>
            <span className="priority-copy">
              <span className="mono priority-eyebrow">SERVICES WAITING ON YOUR PRICING</span>
              <span className="priority-detail">
                {needs.length === 1
                  ? `${needs[0].service} cannot quote until its required prices are set.`
                  : `${needs.length} services cannot quote until their required prices are set.`}
              </span>
            </span>
            <span className="priority-tail">
              <span className="mono priority-count">{needs.length}</span>
              <span className="mono priority-cta">SET PRICES ▸</span>
            </span>
          </button>
        ) : activity?.priorityAction ? (
          <button type="button" className="priority-action" onClick={() => go('/pricebook')}>
            <span className="priority-copy">
              <span className="mono priority-eyebrow">{activity.priorityAction.eyebrow}</span>
              <span className="priority-detail">{activity.priorityAction.detail}</span>
            </span>
            <span className="priority-tail">
              <span className="mono priority-count">{activity.priorityAction.count}</span>
              <span className="mono priority-cta">REVIEW ▸</span>
            </span>
          </button>
        ) : statuses.length > 0 ? (
          <div className="priority-action settled">
            <span className="priority-copy">
              <span className="mono priority-eyebrow">NOTHING WAITING ON YOU</span>
              <span className="priority-detail">Every service you have set up is ready to quote.</span>
            </span>
          </div>
        ) : null}

        {/* COUNTERS */}
        <div className="counter-grid">
          {showStored ? (
            <>
              <CounterCard label="CALLS ANSWERED" value={storedActivity.counts.answered} detail="ALL STORED CALLS · SPAM EXCLUDED" />
              <CounterCard label="QUOTES" value={storedActivity.counts.quotes} detail="ALL SAVED QUOTES" accent />
              <CounterCard label="BOOKED ON CALENDAR" value={storedActivity.counts.bookings} detail="ALL CONFIRMED APPOINTMENTS" accent />
              <CounterCard label="TIME OFF THE CLOCK · EST." value={'≈ '+(storedActivity.counts.seconds/3600).toFixed(1)} unit="hrs" detail="SUM OF STORED NON-SPAM CALL DURATIONS" />
            </>
          ) : activity ? (
            <>
              <CounterCard label="CALLS ANSWERED" value={activity.counters.callsAnswered.value}
                unit={activity.counters.callsAnswered.unit} detail={activity.counters.callsAnswered.detail} />
              <CounterCard label="QUOTES DELIVERED" value={activity.counters.quotesDelivered.value}
                detail={activity.counters.quotesDelivered.detail} accent />
              <CounterCard label="BOOKED ON CALENDAR" value={activity.counters.bookedOnCalendar.value}
                detail={activity.counters.bookedOnCalendar.detail} accent />
              <CounterCard label="TIME OFF THE CLOCK · EST." value={activity.counters.timeOffTheClock.value}
                unit={activity.counters.timeOffTheClock.unit} detail={activity.counters.timeOffTheClock.detail} />
            </>
          ) : (
            <>
              <CounterCard label="CALLS ANSWERED" value="—" detail="NO CALLS HANDLED YET" empty />
              <CounterCard label="QUOTES DELIVERED" value="—" detail="NO QUOTES DELIVERED YET" empty />
              <CounterCard label="READY TO QUOTE" value={ready.length}
                unit={ready.length === 1 ? 'service' : 'services'}
                detail={ready.length ? 'THESE CAN QUOTE ON A CALL' : 'NO SERVICE IS LIVE YET'} accent={ready.length > 0} />
              <CounterCard label="NEEDS PRICING" value={needs.length}
                unit={needs.length === 1 ? 'service' : 'services'}
                detail={needs.length ? 'BLOCKED UNTIL PRICED' : 'NOTHING BLOCKED'} empty={needs.length === 0} />
            </>
          )}
        </div>

        {/* MISSING PRICES — grouped by service and bounded. One row per blocked
            service, not one row per missing field across every service. */}
        {blockerGroups.length > 0 && (
          <section className="dashboard-band">
            <div className="band-heading">
              <div>
                <p className="eyebrow">NEEDS PRICING</p>
                <h2>
                  {blockerGroups.length === 1
                    ? `${totalMissing} ${totalMissing === 1 ? 'price needed' : 'prices needed'}`
                    : `${totalMissing} prices needed across ${blockerGroups.length} services`}
                </h2>
              </div>
              <Button icon={BookOpen} variant="secondary" onClick={() => go('/pricebook')}>Open price book</Button>
            </div>

            <ul className="blocker-groups">
              {shownGroups.map(group => (
                <li key={group.serviceType}>
                  <button
                    type="button"
                    className="blocker-group"
                    onClick={() => go(`/pricebook?service=${encodeURIComponent(group.serviceType)}&field=${encodeURIComponent(group.firstField)}`)}
                  >
                    <span className="blocker-group-main">
                      <span className="blocker-group-name">{group.service}</span>
                      <span className="blocker-group-examples">
                        {group.examples.map(example => example.label).join(' · ')}
                        {group.remaining > 0 && ` · +${group.remaining} more`}
                      </span>
                    </span>
                    <span className="blocker-group-tail">
                      <span className="chip chip-need">
                        {group.total} {group.total === 1 ? 'price' : 'prices'}
                      </span>
                      <ChevronRight size={16} aria-hidden="true" />
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            {hiddenServiceCount > 0 && (
              <button type="button" className="blocker-more" onClick={() => go('/pricebook')}>
                {hiddenServiceCount} {hiddenServiceCount === 1 ? 'other service needs' : 'other services need'}
                {' '}pricing ({hiddenFieldCount} more {hiddenFieldCount === 1 ? 'price' : 'prices'}) — open the price book
                <ChevronRight size={14} aria-hidden="true" />
              </button>
            )}
          </section>
        )}

        {/* SERVICE ACTIVATION SUMMARY */}
        <section className="dashboard-band">
          <div className="band-heading">
            <div>
              <p className="eyebrow">QUOTEDONE STATUS</p>
              <h2>Services</h2>
            </div>
            <span className="mono band-count">
              {ready.length} ready · {needs.length} need pricing
            </span>
          </div>
          {statuses.length ? (
            <div className="service-rows">
              {statuses.map(service => (
                <button key={service.serviceType} type="button" className="service-row"
                  onClick={() => go(`/pricebook?service=${encodeURIComponent(service.serviceType)}`)}>
                  <span className="service-name">{service.service}</span>
                  <span className="service-tail">
                    <span className="mono service-summary">
                      {service.status === 'QUOTING LIVE'
                        ? 'Ready to quote'
                        : `${service.missingOwnerFields.length} ${service.missingOwnerFields.length === 1 ? 'price needed' : 'prices needed'}`}
                    </span>
                    <StatusChip status={service.status} />
                    <ChevronRight size={16} aria-hidden="true" />
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <Notice>No services are set up yet. Answering can still run without pricing.</Notice>
          )}
        </section>

        {/* CALL ACTIVITY */}
        <section className="dashboard-band">
          <div className="band-heading">
            <div>
              <p className="eyebrow">ACTIVITY</p>
              <h2>Call feed</h2>
            </div>
            <Button variant="secondary" onClick={()=>go('/calls')}>Calls</Button>
          </div>
          {showStored&&storedActivity.calls.length ? <CallFeed calls={storedActivity.calls}/> : activity&&!showStored ? (
            <div className="feed-rows">
              {activity.liveCall && view.checked && (
                <div className="feed-row live">
                  <span className="feed-pulse" aria-hidden="true" />
                  <span className="feed-copy">
                    <span className="mono feed-time live-time">LIVE NOW · {activity.liveCall.duration}</span>
                    <span className="feed-summary">{activity.liveCall.summary}</span>
                  </span>
                  <span className="chip chip-live">SIMULATED</span>
                </div>
              )}
              {activity.feed.map(entry => (
                <div key={entry.time} className="feed-row">
                  <span className="feed-copy">
                    <span className="mono feed-time">{entry.time}</span>
                    <span className="feed-summary">{entry.summary}</span>
                  </span>
                  <span className={`chip ${entry.tone === 'live' ? 'chip-live' : 'chip-need'}`}>{entry.chip}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-feed">
              <PhoneCall size={20} aria-hidden="true" />
              <p><strong>No calls yet.</strong></p>
              <p className="empty-detail">
                {view.live
                  ? 'Your operator is on. Answered calls will appear here.'
                  : 'Turn the operator on to start handling calls.'}
              </p>
            </div>
          )}
        </section>

        {/* SETUP CONTINUATION */}
        <section className="dashboard-band">
          <div className="band-heading">
            <div>
              <p className="eyebrow">SETUP</p>
              <h2>Where to continue</h2>
            </div>
            <Button icon={Settings} variant="secondary"
              onClick={() => go(`/onboarding?step=${Math.min(9, state.profile.onboardingStep || 1)}`)}>
              Resume setup
            </Button>
          </div>
          <div className="setup-facts">
            <div><span>Business line</span><strong>{state.preview?.telephonySimulated ? 'SIMULATED FOR REVIEW' : state.profile.phoneProvisioningStatus === 'provisioned' ? 'CONNECTED' : 'NOT CONNECTED'}</strong></div>
            <div><span>Knowledge base</span><strong>{state.profile.knowledgeBase.about && state.profile.knowledgeBase.hours ? 'CORE READY' : 'NEEDS ABOUT + HOURS'}</strong></div>
            <div><span>Calendar</span><strong>{String(state.profile.calendar.status || 'not_connected').replaceAll('_',' ').toUpperCase()}</strong></div>
            <div><span>Voice</span><strong>{state.profile.agentName || 'NOT SET'}</strong></div>
          </div>
        </section>

        {dashboard.role === 'owner' && <OwnerIntegrations />}
        <ErrorMessage error={error} />
      </main>
    </AppShell>
  );
}
