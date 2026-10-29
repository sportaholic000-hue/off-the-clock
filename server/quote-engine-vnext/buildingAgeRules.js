// The year a building was built decides whether lead paint or asbestos can be
// in the work.
//
// Painting. United States: work that disturbs paint in a home built before
// 1978 must be done by an EPA lead-safe certified firm using lead-safe work
// practices (EPA Renovation, Repair and Painting rule, 40 CFR 745). Canada:
// Health Canada says a home built before 1960 probably has lead paint, and
// paint from 1960 to 1990 may contain lead.
//
// Removal. OSHA treats asphalt and vinyl flooring installed in 1980 or earlier
// as asbestos-containing unless tested (29 CFR 1926.1101). WorkSafeBC requires
// a hazardous-materials survey before renovating a building built before 1990.
// Removal prices in the price book never include testing or abatement.
export const PAINTING_AGE_TYPES = Object.freeze(['INTERIOR_PAINTING', 'EXTERIOR_PAINTING']);
export const REMOVAL_AGE_TYPES = Object.freeze(['FLOORING_INSTALL', 'FLOORING_REPLACEMENT', 'SIDING_REPLACEMENT']);
export const BUILDING_AGES = Object.freeze(['before_1978', '1978_to_1989', '1990_or_later', 'not_sure']);
export const LEAD_SAFE_PAINTING = Object.freeze(['review_before_1978', 'review_before_1990', 'included']);
export const OLDER_MATERIAL_REMOVAL = Object.freeze(['exclude', 'review_before_1990']);

export const BUILDING_AGE_FIELD = Object.freeze({
  label: 'When was the building built?', type: 'enum', unit: null, values: BUILDING_AGES,
  optionLabels: { before_1978: 'Before 1978', '1978_to_1989': '1978 to 1989', '1990_or_later': '1990 or later', not_sure: 'Not sure' },
  details: ['Older buildings can have lead paint or asbestos, which changes how the work is done.']
});

export const BUILDING_AGE_OWNER_COPY = Object.freeze({
  leadSafePainting: {
    label: 'Homes that may have lead paint',
    help: 'In the United States, painting that disturbs paint in a home built before 1978 must be done by an EPA lead-safe certified firm using lead-safe work practices (EPA Renovation, Repair and Painting rule). Health Canada says homes built before 1960 probably have lead paint and paint from 1960 to 1990 may contain lead. Blank asks customers when the home was built and sends homes built before 1978, or when they are not sure, to you for review.',
    optionLabels: {
      review_before_1978: 'Ask the year built; review homes built before 1978',
      review_before_1990: 'Ask the year built; review homes built before 1990',
      included: 'My prices cover lead-safe work; do not ask'
    }
  },
  olderMaterialRemoval: {
    label: 'Removal in older buildings',
    help: 'Old flooring and siding can contain asbestos or lead paint. OSHA treats vinyl and asphalt flooring installed in 1980 or earlier as containing asbestos unless tested, and WorkSafeBC requires a hazardous-materials survey before renovating a building built before 1990. Blank quotes removal and states that testing and abatement are not included.',
    optionLabels: {
      exclude: 'Quote removal; testing and abatement are not included',
      review_before_1990: 'Ask the year built; review removal in buildings built before 1990'
    }
  }
});

const removalSelected = (type, c) => type === 'SIDING_REPLACEMENT' ? c?.oldSidingRemoval === true : c?.removalNeeded === true;
const removalVisibleWhen = type => [[[type === 'SIDING_REPLACEMENT' ? 'oldSidingRemoval' : 'removalNeeded', 'eq', true]]];

export function buildingAgeAsked(type, c, p = {}) {
  if (PAINTING_AGE_TYPES.includes(type)) return p.leadSafePainting !== 'included';
  if (REMOVAL_AGE_TYPES.includes(type)) return p.olderMaterialRemoval === 'review_before_1990' && removalSelected(type, c);
  return false;
}

export function buildingAgeReview(type, c, p = {}) {
  if (!buildingAgeAsked(type, c, p) || c.buildingAge === undefined) return null;
  const before1990 = ['before_1978', '1978_to_1989', 'not_sure'].includes(c.buildingAge);
  if (PAINTING_AGE_TYPES.includes(type)) {
    const older = p.leadSafePainting === 'review_before_1990' ? before1990 : ['before_1978', 'not_sure'].includes(c.buildingAge);
    return older ? 'Paint in an older home can contain lead, which calls for lead-safe work. The business will confirm the price.' : null;
  }
  return before1990 ? `${type === 'SIDING_REPLACEMENT' ? 'Siding' : 'Flooring'} in a building built before 1990 can contain asbestos, so it is checked before removal. The business will confirm the price.` : null;
}

export function buildingAgeDisclosure(type, c, p = {}) {
  if (!REMOVAL_AGE_TYPES.includes(type) || !removalSelected(type, c) || p.olderMaterialRemoval === 'review_before_1990') return null;
  return `Removal does not include testing for or removing asbestos or lead paint. Older ${type === 'SIDING_REPLACEMENT' ? 'siding' : 'flooring'} can contain them; if found, that work is priced separately.`;
}

// Adds the question to the customer contract wherever it can be asked.
export function buildingAgeContract(type, contract, p = {}) {
  const painting = PAINTING_AGE_TYPES.includes(type), removal = REMOVAL_AGE_TYPES.includes(type);
  if (!painting && !removal) return contract;
  const shown = painting ? p.leadSafePainting !== 'included' : p.olderMaterialRemoval === 'review_before_1990';
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
