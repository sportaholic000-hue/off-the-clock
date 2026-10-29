import {normalizePostalCode,isValidCustomerPostalCode,parseZoneCodesInput,isValidZoneEntry} from './travelZones.js';

const CA = {
  ON: [13], NB: [15], NL: [15], PE: [15], NS: [14],
  AB: [5], NT: [5], NU: [5], YT: [5],
  BC: [5, true], SK: [5, true], MB: [5, true], QC: [14.975, true]
};
const US_ZERO_TAX_PREFILLS = new Set(['OR','MT','NH','DE']);
const pstNote = 'Your province has PST or QST in addition to GST. The prefilled rate is GST alone, or GST plus QST in Quebec. PST on contractor work varies by province and job type, so confirm your combined rate with your accountant.';
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
// a job outside every zone uses the business rate.
export const PROVINCE_BY_LETTER = Object.freeze({A:'NL',B:'NS',C:'PE',E:'NB',G:'QC',H:'QC',J:'QC',K:'ON',L:'ON',M:'ON',N:'ON',P:'ON',R:'MB',S:'SK',T:'AB',V:'BC',X:'NT_NU',Y:'YT'});
export const PROVINCE_NAMES = Object.freeze({NL:'Newfoundland and Labrador',NS:'Nova Scotia',PE:'Prince Edward Island',NB:'New Brunswick',QC:'Quebec',ON:'Ontario',MB:'Manitoba',SK:'Saskatchewan',AB:'Alberta',BC:'British Columbia',NT_NU:'the Northwest Territories or Nunavut',YT:'Yukon'});
export const FIXED_PROVINCE_RATES = Object.freeze({NL:15,NS:14,PE:15,NB:15,ON:13,AB:5,NT_NU:5,YT:5});
export const OWNER_RATE_PROVINCES = Object.freeze(['QC','BC','MB','SK']);

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const percent = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;

export function taxByJobLocationActive(defaults) {
  return defaults?.taxByJobLocation === true && ['TAX_ALL', 'TAX_MATERIALS'].includes(defaults?.taxMode);
}

const OUTSIDE_COUNTRY = {CAD:'Jobs outside Canada are priced by the business directly.', USD:'Jobs outside the United States are priced by the business directly.'};

export function jobTaxPercent(rawCode, defaults = {}) {
  const code = normalizePostalCode(rawCode);
  if (!code) return {status:'missing', message:'A postal or ZIP code is needed for the sales tax on this job.'};
  if (!isValidCustomerPostalCode(code)) return {status:'invalid', message:'Enter a valid Canadian postal code or 5-digit US ZIP code.'};
  const canadian = /^[A-Z]/.test(code);
  if ((defaults.currency === 'CAD' && !canadian) || (defaults.currency === 'USD' && canadian)) return {status:'outside_country', message:OUTSIDE_COUNTRY[defaults.currency]};
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
      if (!isValidZoneEntry(entry) || /^[A-Z]/.test(entry)) continue;
      const specificity = entry.length === 5 && entry === zip5 ? 5 : entry.length === 3 && zip5.startsWith(entry) ? 3 : 0;
      if (specificity && (!best || specificity > best.specificity)) best = {specificity, zone};
    }
  }
  if (best) return {status:'ok', percent:best.zone.percent, place:typeof best.zone.name === 'string' ? best.zone.name.trim() : zip5, zone:true};
  return {status:'ok', percent:defaults.taxPercent, place:null, fallback:true};
}

// An activation or customer-path check needs some job location.
export function sampleTaxLocationCode(defaults = {}) {
  for (const zone of Array.isArray(defaults.taxZones) ? defaults.taxZones : []) {
    for (const entry of parseZoneCodesInput(zone?.codes)) {
      if (/^\d{5}$/.test(entry)) return entry;
      if (/^\d{3}$/.test(entry)) return entry + '01';
    }
  }
  return defaults.currency === 'USD' ? '10001' : 'K1A0B1';
}

export function taxLocationDiagnostics(defaults = {}) {
  const out = [], bad = (path, message) => out.push({type:'invalid', kind:'business_default', path, message});
  if (defaults.taxByJobLocation !== undefined && typeof defaults.taxByJobLocation !== 'boolean') bad('taxByJobLocation', 'Answer yes or no: does sales tax follow the job location?');
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
      if (!entries.length) bad(`${path}.codes`, 'List at least one 5-digit ZIP code or 3-digit ZIP prefix.');
      entries.forEach((entry, i) => {
        if (!/^\d{3}$|^\d{5}$/.test(entry)) bad(`${path}.codes[${i}]`, `Use a 5-digit ZIP code or 3-digit ZIP prefix, not "${entry}".`);
        else if (seen.has(entry)) bad(`${path}.codes[${i}]`, `${entry} is already in another tax zone.`);
        else seen.add(entry);
      });
    });
  }
  return out;
}
