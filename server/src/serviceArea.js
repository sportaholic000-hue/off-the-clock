const MAX_CITIES = 100;
const COUNTRY = /^[A-Z]{2}$/;

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, allowed, label) {
  if (!record(value)) throw new TypeError(`${label} must be an object.`);
  const extras = Object.keys(value).filter(key => !allowed.includes(key));
  if (extras.length) throw new TypeError(`${label} contains unsupported fields: ${extras.join(', ')}.`);
}

function displayText(value, label, maxLength = 100) {
  if (typeof value !== 'string') throw new TypeError(`${label} must be text.`);
  const clean = value.normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (!clean || clean.length > maxLength || /[\u0000-\u001F\u007F]/.test(clean)) {
    throw new TypeError(`${label} is invalid.`);
  }
  return clean;
}

function matchText(value) {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

function normalizeCity(value, index) {
  exactKeys(value, ['city', 'region', 'country'], `Service-area city ${index + 1}`);
  const city = displayText(value.city, `Service-area city ${index + 1} name`);
  const region = displayText(value.region, `Service-area city ${index + 1} region`, 64);
  const country = displayText(value.country, `Service-area city ${index + 1} country`, 2).toUpperCase();
  if (!COUNTRY.test(country)) throw new TypeError('Service-area country must be a two-letter country code.');
  return { city, region, country };
}

export function normalizeServiceArea(value) {
  exactKeys(value, ['mode', 'cities'], 'Service area');
  if (!['all', 'cities'].includes(value.mode)) {
    throw new TypeError('Service area mode must be all or cities.');
  }
  if (value.mode === 'all') {
    if (value.cities !== undefined && (!Array.isArray(value.cities) || value.cities.length)) {
      throw new TypeError('An all-areas policy cannot include a city list.');
    }
    return { mode: 'all', cities: [] };
  }
  if (!Array.isArray(value.cities) || value.cities.length < 1 || value.cities.length > MAX_CITIES) {
    throw new TypeError(`Choose between 1 and ${MAX_CITIES} service-area cities.`);
  }
  const cities = value.cities.map(normalizeCity);
  const seen = new Set();
  for (const entry of cities) {
    const key = `${matchText(entry.city)}\0${matchText(entry.region)}\0${entry.country}`;
    if (seen.has(key)) throw new TypeError('Service-area cities must be unique.');
    seen.add(key);
  }
  return { mode: 'cities', cities };
}

export function serviceAreaFromKnowledgeBase(value) {
  let knowledgeBase = value;
  if (typeof value === 'string') {
    try { knowledgeBase = JSON.parse(value); } catch { return null; }
  }
  if (!record(knowledgeBase) || knowledgeBase.serviceArea === undefined || knowledgeBase.serviceArea === null) {
    return null;
  }
  try { return normalizeServiceArea(knowledgeBase.serviceArea); }
  catch { return null; }
}

export function isServiceAreaConfigured(value) {
  try {
    normalizeServiceArea(value);
    return true;
  } catch {
    return false;
  }
}

export function serviceAreaDecision(policy, location) {
  let normalized;
  try { normalized = normalizeServiceArea(policy); }
  catch {
    return { eligible: false, reason: 'SERVICE_AREA_UNCONFIGURED' };
  }
  if (normalized.mode === 'all') return { eligible: true, reason: 'IN_AREA' };
  if (!record(location)) return { eligible: false, reason: 'ADDRESS_REQUIRED' };
  let city;
  let region;
  let country;
  try {
    city = displayText(location.city, 'Project city');
    region = displayText(location.region, 'Project region', 64);
    country = displayText(location.country, 'Project country', 2).toUpperCase();
  } catch {
    return { eligible: false, reason: 'ADDRESS_REQUIRED' };
  }
  if (!COUNTRY.test(country)) return { eligible: false, reason: 'ADDRESS_REQUIRED' };
  const eligible = normalized.cities.some(entry =>
    matchText(entry.city) === matchText(city) &&
    matchText(entry.region) === matchText(region) &&
    entry.country === country
  );
  return { eligible, reason: eligible ? 'IN_AREA' : 'OUT_OF_AREA' };
}
