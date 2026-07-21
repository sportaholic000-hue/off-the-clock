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
