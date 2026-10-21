const CONTROL_CHAR_RE = /[\u0000-\u001F\u007F]/;
const CANADIAN_FSA_RE = /^[A-Z]\d[A-Z]$/;
const CANADIAN_POSTAL_RE = /^[A-Z]\d[A-Z]\d[A-Z]\d$/;
const US_ZIP3_RE = /^\d{3}$/;
const US_ZIP5_RE = /^\d{5}$/;
const US_CUSTOMER_ZIP_RE = /^\d{5}(?:-\d{4})?$/;

export const POSTAL_CODE_FIELD = Object.freeze({
  name: 'postalCode',
  label: 'Postal or ZIP code',
  unit: null,
  type: 'string',
  minLength: 3,
  maxLength: 16,
  required: true,
  details: ['Enter your Canadian postal code or 5-digit US ZIP code. Street address is only needed if you book.']
});

export function hasTravelZones(defaults) {
  return Array.isArray(defaults?.travelZones) && defaults.travelZones.length > 0;
}

export function normalizePostalCode(raw) {
  if (typeof raw !== 'string') return '';
  return raw.toUpperCase().replace(/\s+/g, '');
}

export function normalizeZoneEntry(raw) {
  if (typeof raw !== 'string') return '';
  return raw.toUpperCase().replace(/\s+/g, '');
}

export function parseZoneCodesInput(codes) {
  if (Array.isArray(codes)) {
    return codes
      .map((entry) => (typeof entry === 'string' ? normalizeZoneEntry(entry) : ''))
      .filter(Boolean);
  }
  if (typeof codes === 'string') {
    return codes
      .split(/[,;\n]+/)
      .map((entry) => normalizeZoneEntry(entry))
      .filter(Boolean);
  }
  return [];
}

export function isValidZoneEntry(rawEntry) {
  const entry = normalizeZoneEntry(rawEntry);
  return (
    CANADIAN_FSA_RE.test(entry)
    || CANADIAN_POSTAL_RE.test(entry)
    || US_ZIP3_RE.test(entry)
    || US_ZIP5_RE.test(entry)
  );
}

export function isValidCustomerPostalCode(rawCode) {
  const code = normalizePostalCode(rawCode);
  if (!code) return false;
  return (
    CANADIAN_POSTAL_RE.test(code)
    || CANADIAN_FSA_RE.test(code)
    || US_CUSTOMER_ZIP_RE.test(code)
  );
}

function isPlainRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidZoneName(value) {
  return (
    typeof value === 'string'
    && value.trim().length > 0
    && value.trim().length <= 80
    && !CONTROL_CHAR_RE.test(value)
    && !/[<>]/.test(value)
  );
}

export function validateTravelZonesEngine(travelZones) {
  const diagnostics = [];
  if (travelZones === undefined) return diagnostics;
  if (!Array.isArray(travelZones)) {
    diagnostics.push({
      type: 'invalid',
      kind: 'business_default',
      path: 'businessDefaults.travelZones',
      message: 'Travel zones must be an array.'
    });
    return diagnostics;
  }

  const seenNames = new Set();
  const seenEntries = new Map();

  for (let index = 0; index < travelZones.length; index += 1) {
    const zone = travelZones[index];
    const basePath = `businessDefaults.travelZones[${index}]`;
    if (!isPlainRecord(zone)) {
      diagnostics.push({
        type: 'invalid',
        kind: 'business_default',
        path: basePath,
        message: `Travel zone ${index + 1} must be an object.`
      });
      continue;
    }

    for (const key of Object.keys(zone)) {
      if (key !== 'name' && key !== 'codes' && key !== 'charge') {
        diagnostics.push({
          type: 'unsupported',
          kind: 'business_default',
          path: `${basePath}.${key}`,
          message: `Unsupported travel zone field ${key}.`
        });
      }
    }

    if (!isValidZoneName(zone.name)) {
      diagnostics.push({
        type: zone.name === undefined || zone.name === '' ? 'missing' : 'invalid',
        kind: 'business_default',
        path: `${basePath}.name`,
        message: `Travel zone ${index + 1} requires a valid zone name.`
      });
    } else {
      const normalizedName = zone.name.trim().toLowerCase();
      if (seenNames.has(normalizedName)) {
        diagnostics.push({
          type: 'invalid',
          kind: 'business_default',
          path: `${basePath}.name`,
          message: `Duplicate travel zone name "${zone.name.trim()}".`
        });
      }
      seenNames.add(normalizedName);
    }

    if (!Number.isSafeInteger(zone.charge) || zone.charge < 0) {
      diagnostics.push({
        type: zone.charge === undefined ? 'missing' : 'invalid',
        kind: 'business_default',
        path: `${basePath}.charge`,
        message: `Travel zone ${index + 1} requires a non-negative travel charge.`
      });
    }

    const entries = parseZoneCodesInput(zone.codes);
    if (!Array.isArray(zone.codes) && typeof zone.codes !== 'string') {
      diagnostics.push({
        type: zone.codes === undefined ? 'missing' : 'invalid',
        kind: 'business_default',
        path: `${basePath}.codes`,
        message: `Travel zone ${index + 1} requires at least one Canadian FSA or US ZIP prefix/code.`
      });
    } else if (entries.length === 0) {
      diagnostics.push({
        type: 'missing',
        kind: 'business_default',
        path: `${basePath}.codes`,
        message: `Travel zone ${index + 1} requires at least one Canadian FSA or US ZIP prefix/code.`
      });
    } else {
      for (let entryIndex = 0; entryIndex < entries.length; entryIndex += 1) {
        const entry = entries[entryIndex];
        if (!isValidZoneEntry(entry)) {
          diagnostics.push({
            type: 'invalid',
            kind: 'business_default',
            path: `${basePath}.codes[${entryIndex}]`,
            message: `Invalid postal or ZIP zone code "${entry}". Use a 3-character Canadian FSA (e.g. E2L), 5-digit US ZIP (e.g. 04101), or 3-digit US ZIP prefix (e.g. 041).`
          });
          continue;
        }
        if (seenEntries.has(entry)) {
          diagnostics.push({
            type: 'invalid',
            kind: 'business_default',
            path: `${basePath}.codes[${entryIndex}]`,
            message: `Postal or ZIP zone code "${entry}" is listed more than once.`
          });
          continue;
        }
        seenEntries.set(entry, index);
      }
    }
  }

  return diagnostics;
}

export function matchTravelZone(rawCode, travelZones) {
  const normalizedCode = normalizePostalCode(rawCode);
  if (!normalizedCode) {
    return {
      status: 'missing',
      normalizedCode: '',
      message: 'Postal or ZIP code is required to price travel for this area.'
    };
  }
  if (!isValidCustomerPostalCode(normalizedCode)) {
    return {
      status: 'invalid',
      normalizedCode,
      message: 'Enter a valid Canadian postal code or 5-digit US ZIP code.'
    };
  }

  const isCanadian = /^[A-Z]/.test(normalizedCode);
  const zip5 = isCanadian ? '' : normalizedCode.slice(0, 5);
  let bestMatch = null;

  if (Array.isArray(travelZones)) {
    for (let zoneIndex = 0; zoneIndex < travelZones.length; zoneIndex += 1) {
      const zone = travelZones[zoneIndex];
      if (!isPlainRecord(zone)) continue;
      const entries = parseZoneCodesInput(zone.codes);
      for (const entry of entries) {
        if (!isValidZoneEntry(entry)) continue;
        let specificity = 0;
        if (isCanadian) {
          if (entry.length === 6 && normalizedCode === entry) {
            specificity = 6;
          } else if (entry.length === 3 && normalizedCode.slice(0, 3) === entry) {
            specificity = 3;
          }
        } else if (entry.length === 5 && zip5 === entry) {
          specificity = 5;
        } else if (entry.length === 3 && zip5.slice(0, 3) === entry) {
          specificity = 3;
        }

        if (specificity > 0 && (!bestMatch || specificity > bestMatch.specificity)) {
          bestMatch = {
            specificity,
            zoneIndex,
            zoneName: typeof zone.name === 'string' ? zone.name.trim() : '',
            charge: zone.charge,
            matchedEntry: entry
          };
        }
      }
    }
  }

  if (bestMatch) {
    return {
      status: 'matched',
      normalizedCode,
      zoneIndex: bestMatch.zoneIndex,
      zoneName: bestMatch.zoneName,
      charge: bestMatch.charge,
      matchedEntry: bestMatch.matchedEntry
    };
  }

  return {
    status: 'outside_zones',
    normalizedCode,
    reviewReason: `Postal or ZIP code ${normalizedCode} is outside configured travel zones.`
  };
}

export function sampleCustomerCodeForZones(travelZones) {
  if (!Array.isArray(travelZones)) return null;
  for (const zone of travelZones) {
    const entries = parseZoneCodesInput(zone?.codes);
    for (const entry of entries) {
      if (CANADIAN_POSTAL_RE.test(entry)) return entry;
      if (CANADIAN_FSA_RE.test(entry)) return `${entry}1A1`;
      if (US_ZIP5_RE.test(entry)) return entry;
      if (US_ZIP3_RE.test(entry)) return `${entry}01`;
    }
  }
  return null;
}
