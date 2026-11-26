import {normalizePostalCode,isValidCustomerPostalCode} from '../travelZones.js';
import {businessCountryOf} from '../taxJurisdiction.js';
import {existingFloorSubstrate,scopeEntriesFor} from '../scopeConfiguration.js';
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
// a qualified person to inspect for hazardous materials before renovation or
// demolition, whatever the building's age; asbestos has been found in
// buildings built as recently as 2018.
// By default the customer is asked and older buildings go to review; an owner
// may instead quote removal with testing and abatement excluded.
export const PAINTING_AGE_TYPES = Object.freeze(['INTERIOR_PAINTING', 'EXTERIOR_PAINTING']);
export const REMOVAL_AGE_TYPES = Object.freeze(['FLOORING_INSTALL', 'FLOORING_REPLACEMENT', 'SIDING_REPLACEMENT']);
export const BUILDING_AGES = Object.freeze(['before_1978', '1978_to_1990', '1991_or_later', 'not_sure']);
// Earlier answer keys, read with exactly the meaning of the key they name and
// never written for a new answer.
export const BUILDING_AGE_ALIASES = Object.freeze({ '1978_to_1989': '1978_to_1990', '1990_or_later': '1991_or_later' });
const ageOf = c => BUILDING_AGE_ALIASES[c?.buildingAge] ?? c?.buildingAge;
export const LEAD_SAFE_PAINTING = Object.freeze(['review_before_1978', 'review_before_1990', 'included']);
export const OLDER_MATERIAL_REMOVAL = Object.freeze(['review_before_1990', 'exclude']);

export const BUILDING_AGE_FIELD = Object.freeze({
  label: 'When was the building built?', type: 'enum', unit: null, values: BUILDING_AGES, aliases: BUILDING_AGE_ALIASES,
  // Health Canada places homes built through 1990 in the may-contain-lead range
  // and after 1990 outside it, so 1990 belongs with the older answer. An answer
  // saved under an earlier key reads with the same label.
  optionLabels: { before_1978: 'Before 1978', '1978_to_1990': '1978 to 1990', '1991_or_later': '1991 or later', not_sure: 'Not sure', '1978_to_1989': '1978 to 1990', '1990_or_later': '1991 or later' },
  details: ['Older buildings can have lead paint or asbestos, which changes how the work is done.']
});

export const BUILDING_AGE_OWNER_COPY = Object.freeze({
  leadSafePainting: {
    label: 'Homes that may have lead paint',
    help: 'In the United States, painting that disturbs paint in a home built before 1978 must be done by an EPA lead-safe certified firm using lead-safe work practices (EPA Renovation, Repair and Painting rule). Health Canada says homes built before 1960 probably have lead paint and paint from 1960 to 1990 may contain lead. Blank asks customers when the home was built and sends older homes, or customers who are not sure, to you for review: built in 1990 or earlier for a home in Canada, before 1978 for one in the United States. The job’s postal or ZIP code decides the country; without one, your business country does.',
    optionLabels: {
      review_before_1978: 'Ask the year built; review homes built before 1978',
      review_before_1990: 'Ask the year built; review homes built in 1990 or earlier',
      included: 'My prices cover lead-safe work; do not ask'
    }
  },
  olderMaterialRemoval: {
    label: 'Removal in older buildings',
    help: 'Old flooring and siding can contain asbestos or lead paint. OSHA treats vinyl and asphalt flooring installed in 1980 or earlier as containing asbestos unless tested, and WorkSafeBC requires a qualified person to inspect for hazardous materials before renovation or demolition, whatever the building\'s age; asbestos has been found in buildings built as recently as 2018. Blank asks customers when the building was built and sends removal in buildings built in 1990 or earlier, or when they are not sure, to you for review. Choose the exclusion only if your removal price is for material without asbestos or lead paint and the quote should say testing and abatement are extra.',
    optionLabels: {
      review_before_1990: 'Ask the year built; review removal in buildings built in 1990 or earlier',
      exclude: 'Quote removal; testing and abatement are not included'
    }
  }
});

// Existing materials whose removal cannot disturb asbestos in the material
// itself (verdicts on two audits, item 1). OSHA 29 CFR 1926.1101 presumes
// asphalt and vinyl flooring installed in 1980 or earlier contains asbestos,
// and the US CPSC names vinyl floor tiles, sheet-vinyl backing and the
// adhesives. Carpet, laminate, floating floors and wood on a framed subfloor
// are not on those lists. Tile stays held (old grout, bedding and mastic can
// contain asbestos), as do wood glued or laid on concrete and any floor whose
// material is not known.
const CLEARED_FLOORS = Object.freeze(['carpet', 'laminate', 'cushioned_or_floating']);
export function removalMaterialCleared(type, c = {}, p = {}) {
  // Siding: the owner's material for the removal offering the customer's
  // existing siding matches. The US CPSC lists asbestos-cement siding; vinyl
  // and metal are not on that list. Unset or any other material keeps the hold.
  if (type === 'SIDING_REPLACEMENT') {
    const offers = scopeEntriesFor(p, 'siding_removal').map(([, d]) => d)
      .filter(d => d.existingSidingType === c?.existingSidingType && (c?.sidingRemovalStories === undefined || d.stories === c.sidingRemovalStories));
    return offers.length > 0 && offers.every(d => ['vinyl', 'metal'].includes(d.existingSidingMaterial));
  }
  if (!REMOVAL_AGE_TYPES.includes(type)) return false;
  const substrate = existingFloorSubstrate(c?.existingFloorType, p);
  return CLEARED_FLOORS.includes(substrate) || (substrate === 'wood' && c?.woodFloorAssembly === 'joists');
}
const removalSelected = (type, c) => type === 'SIDING_REPLACEMENT' ? c?.oldSidingRemoval === true : c?.removalNeeded === true;
const removalVisibleWhen = type => [[[type === 'SIDING_REPLACEMENT' ? 'oldSidingRemoval' : 'removalNeeded', 'eq', true]]];

export function buildingAgeAsked(type, c, p = {}) {
  if (PAINTING_AGE_TYPES.includes(type)) return p.leadSafePainting !== 'included';
  if (REMOVAL_AGE_TYPES.includes(type)) return p.olderMaterialRemoval !== 'exclude' && removalSelected(type, c);
  return false;
}

export function buildingAgeReview(type, c, p = {}) {
  if (!buildingAgeAsked(type, c, p) || c.buildingAge === undefined) return null;
  const before1990 = ['before_1978', '1978_to_1990', 'not_sure'].includes(ageOf(c));
  if (PAINTING_AGE_TYPES.includes(type)) {
    const older = p.leadSafePainting === 'review_before_1990' ? before1990 : ['before_1978', 'not_sure'].includes(ageOf(c));
    return older ? 'Paint in an older home can contain lead, which calls for lead-safe work. The business will confirm the price.' : null;
  }
  return before1990 && !removalMaterialCleared(type, c, p) ? `${type === 'SIDING_REPLACEMENT' ? 'Siding' : 'Flooring'} in a building built in 1990 or earlier can contain asbestos, so it is checked before removal. The business will confirm the price.` : null;
}

// Blank painting policy for a home in Canada: Health Canada's 1990 line. The
// job's postal or ZIP code decides where the home is; without one, the
// business country saved at onboarding. Neither known: null (unknown).
export function paintingJobInCanada(c = {}, defaults = {}) {
  const code = normalizePostalCode(c?.postalCode);
  if (code && isValidCustomerPostalCode(code)) return /^[A-Z]/.test(code);
  const country = businessCountryOf(defaults);
  return country === null ? null : country === 'CA';
}
// The answers whose screening differs between Canada and the United States: a
// home built 1978 to 1990 under the blank policy (reviewed in Canada) or under
// "review before 1978" (quoted with the lead exclusion in Canada).
const countryDecidesLead = (type, c, p) => PAINTING_AGE_TYPES.includes(type) && ageOf(c) === '1978_to_1990' && (p.leadSafePainting === undefined || p.leadSafePainting === 'review_before_1978');
export const PAINTING_COUNTRY_REVIEW = 'Lead-paint screening for this home depends on its country. Without a postal or ZIP code or a saved business country, the business will confirm the price.';
export function paintingCountryReview(type, c, p = {}, defaults = {}) {
  return countryDecidesLead(type, c, p) && paintingJobInCanada(c, defaults) === null ? PAINTING_COUNTRY_REVIEW : null;
}
export function canadianPaintingAgeReview(type, c, p = {}, defaults = {}) {
  if (!PAINTING_AGE_TYPES.includes(type) || p.leadSafePainting !== undefined || paintingJobInCanada(c, defaults) !== true) return null;
  return ageOf(c) === '1978_to_1990' ? 'Paint in an older home can contain lead, which calls for lead-safe work. The business will confirm the price.' : null;
}

// The owner chose to review only homes built before 1978. Health Canada says paint
// from 1960 to 1990 may contain lead, so a Canadian home built 1978 to 1990 is
// quoted with its lead-safe scope stated as excluded and confirmed before work.
export const CANADIAN_LEAD_EXCLUSION = 'Lead paint has not been ruled out in this home. This price excludes any additional lead-safe preparation, containment and cleanup the affected surfaces require. That scope and its price must be confirmed before paint is disturbed.';
export function canadianPaintingAgeDisclosure(type, c, p = {}, defaults = {}) {
  if (!PAINTING_AGE_TYPES.includes(type) || p.leadSafePainting !== 'review_before_1978' || ageOf(c) !== '1978_to_1990' || paintingJobInCanada(c, defaults) !== true) return null;
  return CANADIAN_LEAD_EXCLUSION;
}
// Removal quoted without testing says so: always under the exclusion policy,
// and under the review policy for a building built in 1991 or later (testing
// is still not included there).
export function buildingAgeDisclosure(type, c, p = {}) {
  if (!REMOVAL_AGE_TYPES.includes(type) || !removalSelected(type, c)) return null;
  if (p.olderMaterialRemoval !== 'exclude' && ageOf(c) !== '1991_or_later' && !removalMaterialCleared(type, c, p)) return null;
  return `Removal does not include testing for or removing asbestos or lead paint. Older ${type === 'SIDING_REPLACEMENT' ? 'siding' : 'flooring'} can contain them; if found, that work is priced separately.`;
}

// Adds the question to the customer contract wherever it can be asked.
// Roof tear-off is quoted without testing for asbestos or lead paint. No question, no review.
export const ROOF_REMOVAL_EXCLUSION = 'Removal does not include testing for or removing asbestos or lead paint. Older roofing can contain them; if found, that work is priced separately.';
const ROOF_TEAR_OFF = /^tearOffPerSq(?:uare|ft)\./;
export function roofRemovalDisclosure(type, lineItems = []) {
  if (!['ROOFING_REPLACEMENT', 'FLAT_ROOF_REPLACEMENT'].includes(type)) return null;
  return lineItems.some(line => ROOF_TEAR_OFF.test(line?.calculation?.ratePath || '') && Number(line.calculation?.quantity ?? line.quantity) > 0) ? ROOF_REMOVAL_EXCLUSION : null;
}

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
