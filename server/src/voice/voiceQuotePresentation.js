// Customer-safe phone projection. Full written disclosures remain intact and
// separate from the short spoken summary; no price is recalculated or rounded.
export const VOICE_WRITTEN_LIMIT = 65_536;
export const VOICE_SUMMARY_LIMIT = 4_000;
export const VOICE_RESULT_BYTES = 262_144;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, maximum = VOICE_WRITTEN_LIMIT) => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || value.length > maximum) throw new TypeError('Invalid voice disclosure.');
  return value.trim() || undefined;
};
const list = (value, maximum = 30) => {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > maximum) throw new TypeError('Invalid voice qualification list.');
  return value.map(item => text(item, 1000)).filter(Boolean);
};
const money = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;

function optionProjection(option, index) {
  if (!record(option) || !money(option.lowEstimate) || !money(option.highEstimate) || option.lowEstimate > option.highEstimate) throw new TypeError('Invalid voice quote range.');
  const output = { tierName: text(option.tierName, 200) || 'Option ' + (index + 1), lowEstimate: option.lowEstimate, highEstimate: option.highEstimate };
  if (money(option.midEstimate)) output.midEstimate = option.midEstimate;
  for (const key of ['currency', 'taxTreatment', 'priceUnit']) {
    const value = text(option[key], 200);
    if (value) output[key] = value;
  }
  output.skippedAddons = list(option.skippedAddons);
  const written = text(option.writtenDisclosure ?? option.disclaimer);
  if (written) output.writtenDisclosure = option.writtenDisclosure ?? option.disclaimer;
  return output;
}

export function conciseVoiceSummary(result) {
  const options = result.options?.length ? result.options : money(result.lowEstimate) && money(result.highEstimate) ? [result] : [];
  if (!options.length) return text(result.customerMessage, VOICE_SUMMARY_LIMIT) || 'The business needs to check the job details before giving an estimate.';
  const parts = options.map((option, index) => {
    const name = options.length > 1 ? (option.tierName || 'Option ' + (index + 1)) + ': ' : '';
    const range = option.lowEstimate === option.highEstimate ? String(option.lowEstimate) : `${option.lowEstimate} to ${option.highEstimate}`;
    const context = [option.currency || result.currency, option.priceUnit || result.priceUnit, option.taxTreatment || result.taxTreatment].filter(Boolean).join('. ');
    const exclusions = option.skippedAddons?.length ? ' Not included: ' + option.skippedAddons.join('; ') + '.' : '';
    return name + range + (context ? ' ' + context : '') + '.' + exclusions;
  });
  parts.push('This is a preliminary estimate for the described work, not a final whole-job price. Final pricing is confirmed before work starts; changed scope or unforeseen conditions may change it.');
  if (result.resultType === 'PARTIAL_ESTIMATE_READY' || result.additionalWork?.length) parts.push('Separate additional work is excluded and needs its own on-site estimate. A total for all requested work is not available.');
  parts.push('The full written estimate retains the scope qualifications and allowances for each option.');
  const summary = parts.join(' ');
  if (summary.length > VOICE_SUMMARY_LIMIT) throw new TypeError('Voice summary exceeds its bounded contract.');
  return summary;
}

export function projectVoiceQuote(response, quoteHandle, followUps = []) {
  const estimate = response?.resultType === 'PARTIAL_ESTIMATE_READY' ? response.pricedEstimate : response;
  const released = ['INSTANT_ESTIMATE_READY', 'PARTIAL_ESTIMATE_READY'].includes(response?.resultType);
  const output = { status: released ? 'quoted' : 'needs_details', quoteHandle, resultType: response?.resultType || 'ESTIMATE_REQUIRES_REVIEW' };
  if (released) {
    for (const key of ['lowEstimate', 'midEstimate', 'highEstimate']) if (money(estimate?.[key])) output[key] = estimate[key];
    for (const key of ['currency', 'taxTreatment', 'priceUnit']) if (text(estimate?.[key], 200)) output[key] = estimate[key];
    if (Array.isArray(estimate?.options) && estimate.options.length) {
      if (estimate.options.length > 3) throw new TypeError('At most three quote options are supported.');
      output.options = estimate.options.map(optionProjection);
    }
    output.priceDrivers = list(estimate?.priceDrivers);
    output.skippedAddons = list(estimate?.skippedAddons);
  }
  const written = text(estimate?.disclaimer);
  if (written) output.writtenDisclosure = estimate.disclaimer;
  if (text(response?.customerMessage, 2000)) output.customerMessage = response.customerMessage;
  if (text(response?.additionalWorkStatus, 200)) output.additionalWorkStatus = response.additionalWorkStatus;
  if (Array.isArray(response?.additionalWork)) output.additionalWork = list(response.additionalWork.map(item => typeof item === 'string' ? item : item.description));
  if (followUps.length) output.followUps = list(followUps);
  if (record(response?.pricedScope)) {
    const facts = response.pricedScope.facts || [];
    output.pricedScope = [response.pricedScope.service, ...facts.map(fact => `${fact.label}: ${String(fact.value ?? 'Not supplied')}`)].filter(Boolean).slice(0, 30).map(item => text(item, 1000));
  }
  output.voiceSummary = conciseVoiceSummary(output);
  output.disclaimer = output.voiceSummary;
  if (Buffer.byteLength(JSON.stringify(output), 'utf8') > VOICE_RESULT_BYTES) throw new TypeError('Voice result exceeds its transport limit.');
  return output;
}

export function projectVoiceOptions(options) {
  if (!Array.isArray(options) || options.length === 0 || options.length > 3) throw new TypeError('Invalid voice quote options.');
  return options.map(optionProjection);
}
