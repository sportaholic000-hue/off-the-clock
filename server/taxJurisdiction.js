import {hasTravelZones,isValidCustomerPostalCode,matchTravelZone,normalizePostalCode,parseZoneCodesInput,sampleCustomerCodesForZones} from './travelZones.js';

// Saskatchewan: contractors collect 6% PST on the total charge for services to
// real property (PST-12), so the prefill is GST 5% plus PST 6%.
const CA = {
  ON: [13], NB: [15], NL: [15], PE: [15], NS: [14],
  AB: [5], NT: [5], NU: [5], YT: [5],
  BC: [5, true], SK: [11, true], MB: [5, true], QC: [14.975, true]
};
const US_ZERO_TAX_PREFILLS = new Set(['OR','MT','NH','DE']);
const pstNote = 'Your province has PST or QST in addition to GST. The prefilled rate is GST alone, GST plus QST in Quebec, or GST plus PST in Saskatchewan. PST on contractor work varies by province and job type, so confirm your combined rate with your accountant.';
const usNote = 'How do you handle sales tax on customer invoices? Owner confirmation is required; Off The Clock does not provide tax advice.';

export function resolveJurisdiction(country, region) {
  const c = String(country || '').toUpperCase();
  const r = String(region || '').toUpperCase();
  if (c === 'CA') {
    const found = CA[r];
    if (!found) return { taxMode: null, taxPercent: null, locked: false, needsOwnerConfirmation: true, note: pstNote };
    return { taxMode: 'TAX_ALL', taxPercent: found[0], locked: false, needsOwnerConfirmation: Boolean(found[1]), note: found[1] ? pstNote : null };
  }
  if (c === 'US') {
    // Alaska has no state sales tax, but that does not determine the owner's
    // local invoice treatment. Require their explicit mode/rate through the
    // existing confirmation flow; do not select or migrate a rate for them.
    if (US_ZERO_TAX_PREFILLS.has(r)) return { taxMode: 'TAX_NONE', taxPercent: 0, locked: false, needsOwnerConfirmation: false, note: null };
    return { taxMode: null, taxPercent: null, locked: false, needsOwnerConfirmation: true, note: usNote };
  }
  return { taxMode: null, taxPercent: null, locked: false, needsOwnerConfirmation: true, note: 'Unsupported jurisdiction. Owner confirmation required.' };
}

// Sales tax by job location. CRA: a service in relation to real property is
// supplied in the province where the property is, so the job's postal code
// fixes the GST/HST rate. HST: Ontario 13%, Nova Scotia 14%, New Brunswick,
// Newfoundland and Labrador and Prince Edward Island 15%; GST 5% in Alberta and
// the territories. Quebec (QST) and British Columbia, Manitoba and
// Saskatchewan (PST) add a provincial tax that depends on the business's
// provincial registration and the job, so the owner states the combined rate
// charged there. In the United States the owner sets rate zones by ZIP code;
// a job outside every zone goes to review unless the owner chose to use the
// business rate there. WA DOR: 5-digit ZIP codes do not accurately correspond
// with tax rates or taxing jurisdictions; the address or the ZIP+4 code is most
// accurate. Zones therefore also take ZIP+4 codes, and the most specific entry
// that matches the customer's code wins: ZIP+4, then 5-digit, then 3-digit.
export const PROVINCE_BY_LETTER = Object.freeze({A:'NL',B:'NS',C:'PE',E:'NB',G:'QC',H:'QC',J:'QC',K:'ON',L:'ON',M:'ON',N:'ON',P:'ON',R:'MB',S:'SK',T:'AB',V:'BC',X:'NT_NU',Y:'YT'});
export const PROVINCE_NAMES = Object.freeze({NL:'Newfoundland and Labrador',NS:'Nova Scotia',PE:'Prince Edward Island',NB:'New Brunswick',QC:'Quebec',ON:'Ontario',MB:'Manitoba',SK:'Saskatchewan',AB:'Alberta',BC:'British Columbia',NT_NU:'the Northwest Territories or Nunavut',YT:'Yukon'});
export const FIXED_PROVINCE_RATES = Object.freeze({NL:15,NS:14,PE:15,NB:15,ON:13,AB:5,NT_NU:5,YT:5});
export const OWNER_RATE_PROVINCES = Object.freeze(['QC','BC','MB','SK']);
// Province and territory codes as saved at onboarding.
export const CANADIAN_PROVINCES = Object.freeze(['AB','BC','MB','NB','NL','NS','NT','NU','ON','PE','QC','SK','YT']);
const postalProvince = code => code === 'NT' || code === 'NU' ? 'NT_NU' : code;

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const percent = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;

// A tax zone entry: a 3-digit ZIP prefix, a 5-digit ZIP code or a ZIP+4 code.
const TAX_ZONE_ENTRY = /^\d{3}$|^\d{5}(?:-\d{4})?$/;

export function taxByJobLocationActive(defaults) {
  return defaults?.taxByJobLocation === true && ['TAX_ALL', 'TAX_MATERIALS'].includes(defaults?.taxMode);
}

const OUTSIDE_COUNTRY = {CA:'Jobs outside Canada are priced by the business directly.', US:'Jobs outside the United States are priced by the business directly.'};

export function jobTaxPercent(rawCode, defaults = {}, serviceRate = null) {
  const code = normalizePostalCode(rawCode);
  if (!code) return {status:'missing', message:'A postal or ZIP code is needed for the sales tax on this job.'};
  if (!isValidCustomerPostalCode(code)) return {status:'invalid', message:'Enter a valid Canadian postal code or 5-digit or 9-digit US ZIP code.'};
  // A valid code names the job's country. A job outside the business's own
  // country (saved at onboarding) goes to the business. Without a saved country
  // the comparison cannot be made, so the job goes to the business too.
  const canadian = /^[A-Z]/.test(code), business = knownBusinessCountry(defaults);
  if (!business) return {status:'business_country_missing', path:'businessDefaults.businessCountry', message:BUSINESS_COUNTRY_TAX_MESSAGE};
  if ((canadian ? 'CA' : 'US') !== business) return {status:'outside_country', message:OUTSIDE_COUNTRY[business]};
  if (canadian) {
    const province = PROVINCE_BY_LETTER[code[0]];
    if (FIXED_PROVINCE_RATES[province] !== undefined) return {status:'ok', percent:FIXED_PROVINCE_RATES[province], place:PROVINCE_NAMES[province], province};
    const owner = defaults.provinceTaxPercent?.[province];
    if (!percent(owner)) return {status:'owner_rate_missing', province, path:'businessDefaults.provinceTaxPercent.'+province, message:`Set the tax rate you charge on jobs in ${PROVINCE_NAMES[province]} before quoting there.`};
    return {status:'ok', percent:owner, place:PROVINCE_NAMES[province], province};
  }
  const zip5 = code.slice(0, 5);
  let best = null;
  for (const zone of Array.isArray(defaults.taxZones) ? defaults.taxZones : []) {
    if (!record(zone)) continue;
    for (const entry of parseZoneCodesInput(zone.codes)) {
      if (!TAX_ZONE_ENTRY.test(entry)) continue;
      const specificity = entry.length === 10 && entry === code ? 9 : entry.length === 5 && entry === zip5 ? 5 : entry.length === 3 && zip5.startsWith(entry) ? 3 : 0;
      if (specificity && (!best || specificity > best.specificity)) best = {specificity, zone};
    }
  }
  const found = best ? {status:'ok', percent:best.zone.percent, place:typeof best.zone.name === 'string' ? best.zone.name.trim() : zip5, zone:true}
    : defaults.taxOutsideZones !== 'business_rate' ? {status:'outside_zones', message:'This job is outside the areas the business has set tax rates for; the business will confirm the tax.'}
    : {status:'ok', percent:defaults.taxPercent, place:null, fallback:true};
  // A 5-digit ZIP that holds a ZIP+4 zone at another effective rate than the
  // one the 5-digit code gets (a 3-digit or 5-digit zone, or the business or
  // service rate outside the zones) cannot be taxed from the 5 digits: the
  // customer is asked for the ZIP+4 code. A 0% service rate is 0% everywhere.
  if (code.length === 5 && found.status === 'ok' && serviceRate !== 0) {
    const effectiveFallback = serviceRateAppliesAt(found, defaults, serviceRate) ? serviceRate : found.percent;
    if (zip4ZoneRates(zip5, defaults).some(rate => rate !== effectiveFallback)) return {status:'zip4_needed', message:ZIP4_NEEDED_MESSAGE, fallback:found};
  }
  // A 5-digit ZIP outside every zone that still holds ZIP+4 zones may be in
  // one of them: ask for the ZIP+4 before sending the job to the owner (Neon
  // audit of v51, V51-2).
  if (code.length === 5 && found.status === 'outside_zones' && serviceRate !== 0 && zip4ZoneRates(zip5, defaults).length) return {status:'zip4_needed', message:ZIP4_NEEDED_MESSAGE, fallback:found};
  return found;
}
export const ZIP4_NEEDED_MESSAGE = 'Sales tax differs within this ZIP code. Enter your full 9-digit ZIP+4 code.';
function zip4ZoneRates(zip5, defaults) {
  const rates = [];
  for (const zone of Array.isArray(defaults.taxZones) ? defaults.taxZones : []) {
    if (!record(zone)) continue;
    for (const entry of parseZoneCodesInput(zone.codes)) if (TAX_ZONE_ENTRY.test(entry) && entry.length === 10 && entry.startsWith(zip5 + '-')) rates.push(zone.percent);
  }
  return rates;
}

// A Canadian job in another province than the one the business saved at
// onboarding is taxed at that province's rate even when tax does not follow the
// job location: the CRA rate there, or the owner's rate for Quebec, British
// Columbia, Manitoba or Saskatchewan (review when none is set). Returns null
// when this does not apply: no saved province, no known valid Canadian postal
// code, a job in the business's own province, or no sales tax charged.
export function otherProvinceJobTax(rawCode, defaults = {}) {
  if (!['TAX_ALL', 'TAX_MATERIALS'].includes(defaults.taxMode) || businessCountryOf(defaults) !== 'CA' || !CANADIAN_PROVINCES.includes(defaults.businessProvince)) return null;
  const code = normalizePostalCode(rawCode);
  if (!code || !/^[A-Z]/.test(code) || !isValidCustomerPostalCode(code)) return null;
  const province = PROVINCE_BY_LETTER[code[0]];
  if (!province || province === postalProvince(defaults.businessProvince)) return null;
  if (FIXED_PROVINCE_RATES[province] !== undefined) return {status:'ok', percent:FIXED_PROVINCE_RATES[province], place:PROVINCE_NAMES[province], province};
  const owner = defaults.provinceTaxPercent?.[province];
  if (!percent(owner)) return {status:'owner_rate_missing', province, path:'businessDefaults.provinceTaxPercent.'+province, message:`Set the tax rate you charge on jobs in ${PROVINCE_NAMES[province]} before quoting there.`};
  return {status:'ok', percent:owner, place:PROVINCE_NAMES[province], province};
}

// A valid postal or ZIP code in the other country than the business's saved
// one, on a quote that charges tax: the job is priced with no tax and the
// customer is told the business confirms the tax there (the same under both
// job-location settings). Null when the code or the business country is
// unknown, or no tax is charged.
const OUTSIDE_COUNTRY_TAX_NOTE = {CA:'This location is outside Canada, so no tax is included; the business will confirm the tax for this location.', US:'This location is outside the United States, so no tax is included; the business will confirm the tax for this location.'};
export function outsideCountryJob(rawCode, defaults = {}) {
  if (!['TAX_ALL', 'TAX_MATERIALS'].includes(defaults.taxMode)) return null;
  const code = normalizePostalCode(rawCode), business = knownBusinessCountry(defaults);
  if (!code || !business || !isValidCustomerPostalCode(code)) return null;
  const country = /^[A-Z]/.test(code) ? 'CA' : 'US';
  return country === business ? null : {country, note:OUTSIDE_COUNTRY_TAX_NOTE[business]};
}

// A service's own tax rate. Blank (missing, null or empty) uses the business
// rate. It replaces the business rate, and the owner's rate for the business's
// own province, wherever they would be used; a job in another province keeps
// that province's rate and a job in a ZIP tax zone keeps the zone's rate.
export const serviceTaxRateBlank = value => value === undefined || value === null || value === '';
export function serviceTaxRateIssue(service = {}) {
  const value = service?.taxPercent;
  return serviceTaxRateBlank(value) || percent(value) ? null : {path:'taxPercent', message:'Enter the tax rate for this service from 0 to 100 percent, or leave it blank to use your business tax rate.'};
}
// Whether a located job's rate is one the service rate replaces: the business
// rate used outside every zone, or the rate of the business's own province.
export function serviceRateReplaces(located, defaults = {}) {
  if (located?.fallback) return true;
  return Boolean(located?.province) && CANADIAN_PROVINCES.includes(defaults.businessProvince) && located.province === postalProvince(defaults.businessProvince);
}
// Whether a service's own rate (null: none) is the rate charged at a located
// job. A rate of 0 means no tax on that service wherever the job is: another
// province, a ZIP tax zone, or outside the zones. Any other service rate
// replaces only the business's own rate.
export function serviceRateAppliesAt(located, defaults = {}, serviceRate = null) {
  if (serviceRate === null) return false;
  if (serviceRate === 0) return true;
  return serviceRateReplaces(located, defaults);
}
// The tax rate a quote charges at a postal or ZIP code, worked out as the
// engine does for a service whose own rate is serviceRate (null: none). A
// booking address keeps a quote only where this rate is the quoted rate.
// {status:'ok', percent} or the status that would hold the quote.
export function quotedTaxRateAt(rawCode, defaults = {}, serviceRate = null) {
  if (!['TAX_ALL', 'TAX_MATERIALS'].includes(defaults.taxMode) || outsideCountryJob(rawCode, defaults)) return {status:'ok', percent:0};
  if (taxByJobLocationActive(defaults)) {
    const located = jobTaxPercent(rawCode, defaults, serviceRate), own = serviceRateAppliesAt(located, defaults, serviceRate);
    if (own && ['ok', 'owner_rate_missing', ...(serviceRate === 0 ? ['outside_zones', 'zip4_needed'] : [])].includes(located.status)) return {status:'ok', percent:serviceRate};
    return located.status === 'ok' ? {status:'ok', percent:located.percent} : located;
  }
  if (serviceRate === 0) return {status:'ok', percent:0};
  const located = otherProvinceJobTax(rawCode, defaults);
  if (located) return located.status === 'ok' ? {status:'ok', percent:located.percent} : located;
  return {status:'ok', percent:serviceRate !== null ? serviceRate : defaults.taxPercent};
}
// Saskatchewan PST-12 (Services to Real Property, revised July 2024) lists lawn
// and yard care, mowing included, as exempt from PST when it is not billed with
// taxable real property services; GST (5%) still applies. Offered on the mowing
// service for the owner to confirm, like the province prefill above.
export function serviceTaxPrefill(country, region, serviceType) {
  if (String(country || '').toUpperCase() !== 'CA' || String(region || '').toUpperCase() !== 'SK' || serviceType !== 'LANDSCAPING_MOWING') return null;
  return {taxPercent:5, needsOwnerConfirmation:true, note:'Saskatchewan does not charge PST on lawn mowing that is not billed with taxable work, so mowing usually carries 5% GST only. Confirm the rate for this service with your accountant.'};
}

// The business country saved at onboarding, or null. The currency of the
// prices never stands in for it (November 18, 2026).
export function knownBusinessCountry(defaults = {}) {
  return businessCountryOf(defaults);
}

// The business's country when no job location is known: the country saved at
// onboarding (businessCountry), else null. A decision that depends on it goes
// to review rather than assume a country.
export function businessCountryOf(defaults = {}) {
  return ['CA', 'US'].includes(defaults.businessCountry) ? defaults.businessCountry : null;
}
export const BUSINESS_COUNTRY_TAX_MESSAGE = 'The business country is not set, so the sales tax on this job cannot be checked. The business will confirm the tax.';

// A real postal code in each province or territory saved at onboarding, so a
// Canadian business's sample job is in its own province (November 22, 2026).
const SAMPLE_PROVINCE_CODES = Object.freeze({
  NL:'A1C5M2', NS:'B3J3K5', PE:'C1A4P3', NB:'E1C4M3', QC:'H2Y1C6', ON:'K1A0B1', MB:'R3C0V8',
  SK:'S4P3Y2', AB:'T5J0N3', BC:'V6B1A1', NT:'X1A2L9', NU:'X0A0H0', YT:'Y1A2C6'
});

// An activation or customer-path check needs some job location.
// The sample job location is in the business's own country: a ZIP from its
// tax zones for a United States business; for a Canadian business, a code in
// the province saved at onboarding (Ottawa when no province is saved).
export function sampleTaxLocationCodes(defaults = {}, serviceRate = null) {
  const country = businessCountryOf(defaults);
  // A 5-digit sample inside a ZIP that holds a ZIP+4 zone at another rate
  // would only ask for the ZIP+4 code, so such a sample is passed over.
  if (country === 'US') {
    const out = [];
    for (const zone of Array.isArray(defaults.taxZones) ? defaults.taxZones : []) {
      for (const entry of parseZoneCodesInput(zone?.codes)) {
        const candidate = /^\d{5}(?:-\d{4})?$/.test(entry) ? entry : /^\d{3}$/.test(entry) ? entry + '01' : null;
        if (candidate && jobTaxPercent(candidate, {...defaults, businessCountry:'US'}, serviceRate).status !== 'zip4_needed') out.push(candidate);
      }
    }
    out.push('10001');
    return out;
  }
  return [SAMPLE_PROVINCE_CODES[defaults.businessProvince] ?? 'K1A0B1'];
}

export function sampleTaxLocationCode(defaults = {}, serviceRate = null) {
  return sampleTaxLocationCodes(defaults, serviceRate)[0];
}

// A sample job location for activation and customer-path checks that satisfies
// both travel zones (when the service can charge travel) and job-location tax
// (skipping 5-digit codes split by a ZIP+4 tax zone).
export function sampleActivationPostalCode(defaults = {}, { travelRequired = false, serviceRate = null } = {}) {
  const needsTravel = travelRequired && hasTravelZones(defaults);
  const needsTax = taxByJobLocationActive(defaults);
  if (!needsTravel && !needsTax) return undefined;
  if (!needsTravel) return sampleTaxLocationCode(defaults, serviceRate);
  const travelSamples = sampleCustomerCodesForZones(defaults.travelZones, knownBusinessCountry(defaults));
  if (!needsTax) return travelSamples[0] ?? undefined;
  const candidates = [...travelSamples, ...sampleTaxLocationCodes(defaults, serviceRate)];
  const joint = candidates.find(code => {
    if (matchTravelZone(code, defaults.travelZones).status !== 'matched') return false;
    const taxStatus = jobTaxPercent(code, defaults, serviceRate).status;
    return taxStatus !== 'zip4_needed' && taxStatus !== 'outside_zones';
  });
  return joint ?? travelSamples[0] ?? undefined;
}

export function taxLocationDiagnostics(defaults = {}) {
  const out = [], bad = (path, message) => out.push({type:'invalid', kind:'business_default', path, message});
  if (defaults.taxByJobLocation !== undefined && typeof defaults.taxByJobLocation !== 'boolean') bad('taxByJobLocation', 'Answer yes or no: does sales tax follow the job location?');
  if (defaults.taxOutsideZones !== undefined && !['business_rate', 'review'].includes(defaults.taxOutsideZones)) bad('taxOutsideZones', 'Choose how jobs outside your tax zones are handled.');
  if (defaults.provinceTaxPercent !== undefined) {
    if (!record(defaults.provinceTaxPercent)) bad('provinceTaxPercent', 'Enter tax rates by province.');
    else for (const [province, value] of Object.entries(defaults.provinceTaxPercent)) {
      if (!OWNER_RATE_PROVINCES.includes(province)) bad('provinceTaxPercent.' + province, 'Only Quebec, British Columbia, Manitoba and Saskatchewan rates are entered; the others follow CRA.');
      else if (!percent(value)) bad('provinceTaxPercent.' + province, 'Enter a tax rate from 0 to 100 percent.');
    }
  }
  if (defaults.taxZones !== undefined) {
    const seen = new Set();
    if (!Array.isArray(defaults.taxZones)) bad('taxZones', 'Tax zones must be a list.');
    else defaults.taxZones.forEach((zone, index) => {
      const path = `taxZones[${index}]`;
      if (!record(zone)) { bad(path, 'Each tax zone needs a name, ZIP codes and a rate.'); return; }
      for (const key of Object.keys(zone)) if (!['name', 'codes', 'percent'].includes(key)) bad(`${path}.${key}`, 'Unsupported tax zone setting.');
      if (typeof zone.name !== 'string' || !zone.name.trim() || zone.name.length > 80) bad(`${path}.name`, 'Name each tax zone.');
      if (!percent(zone.percent)) bad(`${path}.percent`, 'Enter a tax rate from 0 to 100 percent.');
      const entries = parseZoneCodesInput(zone.codes);
      if (!entries.length) bad(`${path}.codes`, 'List at least one ZIP+4 code, 5-digit ZIP code or 3-digit ZIP prefix.');
      entries.forEach((entry, i) => {
        if (!TAX_ZONE_ENTRY.test(entry)) bad(`${path}.codes[${i}]`, `Use a ZIP+4 code, 5-digit ZIP code or 3-digit ZIP prefix, not "${entry}".`);
        else if (seen.has(entry)) bad(`${path}.codes[${i}]`, `${entry} is already in another tax zone.`);
        else seen.add(entry);
      });
    });
  }
  return out;
}
