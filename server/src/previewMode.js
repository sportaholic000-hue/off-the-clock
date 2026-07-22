const TELEPHONY_PREVIEW = 'simulated_preview';
const OPERATOR_PREVIEW_ON = 'simulated_preview_on';
const OPERATOR_PREVIEW_OFF = 'simulated_preview_off';

export function localPreviewEnabled(env = process.env) {
  return env.NODE_ENV !== 'production' && env.LOCAL_PREVIEW_MODE === 'true';
}

function previewKnowledgeMissing(profile) {
  const missing = [];
  if (!String(profile.knowledgeBase?.about || '').trim()) missing.push('About & area');
  if (!String(profile.knowledgeBase?.hours || '').trim()) missing.push('Hours');
  return missing;
}

export function previewPhonePatch(profile, existingNumber) {
  const digits = String(existingNumber || '').replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) {
    const error = new Error('Enter a valid business phone number for the visual preview');
    error.statusCode = 400;
    throw error;
  }
  return {
    existingPhoneNumber: String(existingNumber).trim(),
    twilioNumber: null,
    twilioNumberSid: null,
    phoneProvisioningStatus: TELEPHONY_PREVIEW,
    carrierSetupStatus: OPERATOR_PREVIEW_OFF,
    operatorEnabled: 0,
    onboardingStep: Math.max(5, profile.onboardingStep || 1)
  };
}

export function previewOperatorPatch(profile, enabled) {
  if (profile.phoneProvisioningStatus !== TELEPHONY_PREVIEW) {
    const error = new Error('Start the simulated phone preview before reviewing this control');
    error.statusCode = 409;
    throw error;
  }
  const missing = previewKnowledgeMissing(profile);
  if (enabled && missing.length) {
    const error = new Error(`Complete ${missing.join(' and ')} before reviewing the simulated on state`);
    error.statusCode = 409;
    throw error;
  }
  return {
    operatorEnabled: 0,
    carrierSetupStatus: enabled ? OPERATOR_PREVIEW_ON : OPERATOR_PREVIEW_OFF,
    onboardingStep: enabled ? Math.max(7, profile.onboardingStep || 1) : profile.onboardingStep
  };
}

export function decoratePreviewState(state, env = process.env) {
  if (!localPreviewEnabled(env)) return state;
  const telephonySimulated = state.profile.phoneProvisioningStatus === TELEPHONY_PREVIEW;
  const simulatedMissing = [
    ...(telephonySimulated ? [] : ['Simulated phone connection']),
    ...previewKnowledgeMissing(state.profile)
  ];
  const operatorSimulated = telephonySimulated && state.profile.carrierSetupStatus === OPERATOR_PREVIEW_ON;
  return {
    ...state,
    preview: { enabled:true, telephonySimulated, operatorSimulated },
    operator: {
      ...state.operator,
      simulated: telephonySimulated,
      simulatedEnabled: operatorSimulated,
      simulatedEligible: simulatedMissing.length === 0,
      simulatedMissing
    }
  };
}

// Seeded demonstration activity for the local visual-review mode ONLY.
// Gated by localPreviewEnabled(): NODE_ENV must not be production AND
// LOCAL_PREVIEW_MODE must be exactly 'true'. Every consumer must render this
// behind an explicit simulated marker. It never reflects, alters or implies
// genuine operator activity — previewOperatorPatch always writes
// operatorEnabled: 0, so no simulated state can place a real operator live.
export function previewDashboardActivity(env = process.env) {
  if (!localPreviewEnabled(env)) return null;
  return {
    simulated: true,
    label: 'SIMULATED PREVIEW DATA',
    counters: {
      callsAnswered: { value: 14, unit: 'today', detail: '61 THIS WEEK · 5 AFTER-HOURS' },
      quotesDelivered: { value: '$23,400', detail: '6 TODAY · 19 THIS WEEK' },
      bookedOnCalendar: { value: '$11,280', detail: '4 APPOINTMENTS THIS WEEK' },
      timeOffTheClock: { value: '≈ 9.2', unit: 'hrs / wk', detail: 'BASED ON CALLS HANDLED FOR YOU' }
    },
    liveCall: {
      duration: '0:41',
      summary: 'Incoming from (506) 555-0164 · quoting a 140 ft cedar fence'
    },
    feed: [
      { time: '21:12 · 3:24', summary: 'Gate repair quote · $285 delivered · booked Thursday 9am', chip: 'QUOTED + BOOKED', tone: 'live' },
      { time: '20:48 · 1:58', summary: 'Custom ironwork · flagged to you, full details captured', chip: 'NEEDS YOUR PRICE', tone: 'need' },
      { time: '19:03 · 2:41', summary: 'Chain link, 80 ft · quoted from your rates', chip: 'QUOTED', tone: 'live' }
    ],
    priorityAction: {
      eyebrow: 'QUOTE REQUESTS WAITING ON YOUR PRICING',
      detail: 'Custom ironwork fence · slope over 20°. Captured in full, waiting on you.',
      count: 2
    },
    minutes: { used: 642, included: 1200, label: '642 / 1,200 MIN' },
    spamBlocked: '23 SPAM CALLS BLOCKED · 41 MIN SAVED'
  };
}
