// The year a building was built decides whether lead paint or asbestos can be
// in the work.
//
// Painting. United States: work that disturbs paint in a home built before
// 1978 must be done by an EPA lead-safe certified firm using lead-safe work
// practices (EPA Renovation, Repair and Painting rule, 40 CFR 745). Canada:
// Health Canada says a home built before 1960 probably has lead paint, paint
// from 1960 to 1990 may contain lead, and houses built after 1990 should not.
//
// Removal. OSHA treats asphalt and vinyl flooring installed in 1980 or earlier
// as asbestos-containing unless tested (29 CFR 1926.1101). WorkSafeBC requires
// a hazardous-materials survey before renovating a building built before 1990.
// The question has one 1990 line (Health Canada's lead range ends in 1990), so
// removal screening also covers buildings from 1990. By default the customer is
// asked and older buildings go to review; an owner may instead quote removal
// with testing and abatement excluded.
export const PAINTING_AGE_TYPES = Object.freeze(['INTERIOR_PAINTING', 'EXTERIOR_PAINTING']);
export const REMOVAL_AGE_TYPES = Object.freeze(['FLOORING_INSTALL', 'FLOORING_REPLACEMENT', 'SIDING_REPLACEMENT']);
export const BUILDING_AGES = Object.freeze(['before_1978', '1978_to_1990', '1991_or_later', 'not_sure']);
export const LEAD_SAFE_PAINTING = Object.freeze(['review_before_1978', 'review_before_1990', 'included']);
export const OLDER_MATERIAL_REMOVAL = Object.freeze(['review_before_1990', 'exclude']);

export const BUILDING_AGE_FIELD = Object.freeze({
  label: 'When was the building built?', type: 'enum', unit: null, values: BUILDING_AGES,
  optionLabels: { before_1978: 'Before 1978', '1978_to_1990': '1978 to 1990', '1991_or_later': '1991 or later', not_sure: 'Not sure' },
  details: ['Older buildings can have lead paint or asbestos, which changes how the work is done.']
});

export const BUILDING_AGE_OWNER_COPY = Object.freeze({
  leadSafePainting: {
    label: 'Homes that may have lead paint',
    help: 'In the United States, painting that disturbs paint in a home built before 1978 must be done by an EPA lead-safe certified firm using lead-safe work practices (EPA Renovation, Repair and Painting rule). Health Canada says homes built before 1960 probably have lead paint and paint from 1960 to 1990 may contain lead. Blank asks customers when the home was built and sends older homes, or customers who are not sure, to you for review: 1990 or earlier for a business pricing in Canadian dollars, before 1978 for one pricing in US dollars.',
    optionLabels: {
      review_before_1978: 'Ask the year built; review homes built before 1978',
      review_before_1990: 'Ask the year built; review homes built in 1990 or earlier',
      included: 'My prices cover lead-safe work; do not ask'
    }
  },
  olderMaterialRemoval: {
    label: 'Removal in older buildings',
    help: 'Old flooring and siding can contain asbestos or lead paint. OSHA treats vinyl and asphalt flooring installed in 1980 or earlier as containing asbestos unless tested, and WorkSafeBC requires a hazardous-materials survey before renovating a building built before 1990. Blank asks customers when the building was built and sends removal in buildings built in 1990 or earlier, or when they are not sure, to you for review. Choose the exclusion only if your removal price is for material without asbestos or lead paint and the quote should say testing and abatement are extra.',
    optionLabels: {
      review_before_1990: 'Ask the year built; review removal in buildings built in 1990 or earlier',
      exclude: 'Quote removal; testing and abatement are not included'
    }
  }
});

const removalSelected = (type, c) => type === 'SIDING_REPLACEMENT' ? c?.oldSidingRemoval === true : c?.removalNeeded === true;
const removalVisibleWhen = type => [[[type === 'SIDING_REPLACEMENT' ? 'oldSidingRemoval' : 'removalNeeded', 'eq', true]]];

export function buildingAgeAsked(type, c, p = {}) {
  if (PAINTING_AGE_TYPES.includes(type)) return p.leadSafePainting !== 'included';
  if (REMOVAL_AGE_TYPES.includes(type)) return p.olderMaterialRemoval !== 'exclude' && removalSelected(type, c);
  return false;
}

export function buildingAgeReview(type, c, p = {}) {
  if (!buildingAgeAsked(type, c, p) || c.buildingAge === undefined) return null;
  const by1990 = ['before_1978', '1978_to_1990', 'not_sure'].includes(c.buildingAge);
  if (PAINTING_AGE_TYPES.includes(type)) {
    const older = p.leadSafePainting === 'review_before_1990' ? by1990 : ['before_1978', 'not_sure'].includes(c.buildingAge);
    return older ? 'Paint in an older home can contain lead, which calls for lead-safe work. The business will confirm the price.' : null;
  }
  return by1990 ? `${type === 'SIDING_REPLACEMENT' ? 'Siding' : 'Flooring'} in a building built in 1990 or earlier can contain asbestos, so it is checked before removal. The business will confirm the price.` : null;
}

// Blank painting policy for a Canadian business: Health Canada's 1990 line.
// The customer contract has no business country, so the engine applies it.
export function canadianPaintingAgeReview(type, c, p = {}, defaults = {}) {
  if (!PAINTING_AGE_TYPES.includes(type) || p.leadSafePainting !== undefined || defaults.currency === 'USD') return null;
  return c?.buildingAge === '1978_to_1990' ? 'Paint in an older home can contain lead, which calls for lead-safe work. The business will confirm the price.' : null;
}

export function buildingAgeDisclosure(type, c, p = {}) {
  if (!REMOVAL_AGE_TYPES.includes(type) || !removalSelected(type, c) || p.olderMaterialRemoval !== 'exclude') return null;
  return `Removal does not include testing for or removing asbestos or lead paint. Older ${type === 'SIDING_REPLACEMENT' ? 'siding' : 'flooring'} can contain them; if found, that work is priced separately.`;
}

// Adds the question to the customer contract wherever it can be asked.
export function buildingAgeContract(type, contract, p = {}) {
  const painting = PAINTING_AGE_TYPES.includes(type), removal = REMOVAL_AGE_TYPES.includes(type);
  if (!painting && !removal) return contract;
  const shown = painting ? p.leadSafePainting !== 'included' : p.olderMaterialRemoval !== 'exclude';
  const field = { ...BUILDING_AGE_FIELD, ...(removal ? { visibleWhen: removalVisibleWhen(type) } : {}), ...(!shown ? { evidenceOnly: true } : {}) };
  return {
    ...contract,
    fields: { ...contract.fields, buildingAge: field },
    required: (c, ...rest) => [...(contract.required?.(c, ...rest) || []), ...(buildingAgeAsked(type, c, p) ? ['buildingAge'] : [])],
    inspection: (c, ...rest) => contract.inspection?.(c, ...rest) || buildingAgeReview(type, c, p)
  };
}

export function buildingAgeOwnerDiagnostics(type, p = {}) {
  const out = [];
  if (p.leadSafePainting !== undefined && (!PAINTING_AGE_TYPES.includes(type) || !LEAD_SAFE_PAINTING.includes(p.leadSafePainting)))
    out.push({ type: 'invalid', kind: 'service_rule', path: 'leadSafePainting', message: 'Choose how painting quotes for homes that may have lead paint are handled.' });
  if (p.olderMaterialRemoval !== undefined && (!REMOVAL_AGE_TYPES.includes(type) || !OLDER_MATERIAL_REMOVAL.includes(p.olderMaterialRemoval)))
    out.push({ type: 'invalid', kind: 'service_rule', path: 'olderMaterialRemoval', message: 'Choose how removal in older buildings is quoted.' });
  return out;
}
