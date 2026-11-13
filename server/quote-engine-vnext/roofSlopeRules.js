// Minimum roof slopes and low-slope methods for steep-slope roof coverings.
// The owner states the building code his roofs follow and the type of each
// roofing product; a product's name never decides anything.
//
// United States, IRC 2021 section R905:
//   asphalt shingles R905.2.2 2/12; from 2/12 up to 4/12 two underlayment
//     layers (R905.1.1), or one layer of self-adhered underlayment (ARMA)
//   clay and concrete tile R905.3.2 2.5/12; two underlayment layers up to 4/12
//   metal roof shingles R905.4.2, wood shingles R905.7.2, wood shakes R905.8.2 3/12
//   slate R905.6.2 4/12
//   metal roof panels R905.10.2: standing seam 1/4:12; lapped seams 3/12,
//     or 1/2:12 with applied lap sealant
// Canada, NBC Table 9.26.3.1 (rise per 12 = 12 / run):
//   asphalt shingles 1 in 3 (4/12); 1 in 6 (2/12) with the low-slope
//     application of Subsection 9.26.8 (triple coverage, cemented courses)
//   cedar shakes 1 in 3 (4/12); wood shingles 1 in 4 (3/12)
//   sheet metal shingles and profiled metal 1 in 4 (3/12); profiled metal
//     designed for low slopes follows the manufacturer (9.26.3.1(3))
//   clay tile and slate 1 in 2 (6/12); concrete tile follows CSA A220 and the
//     manufacturer
// A manufacturer minimum higher than the code governs.
export const LOW_SLOPE_BREAK = 4;
export const ROOF_BUILDING_CODES = ['nbc', 'irc'];
export const ROOF_BUILDING_CODE_LABELS = {
  nbc: 'Canada: National Building Code (and provincial codes based on it)',
  irc: 'United States: International Residential Code'
};
export const ROOF_PRODUCT_CLASSES = ['asphalt_shingle', 'clay_tile', 'concrete_tile', 'metal_shingle', 'wood_shingle', 'wood_shake', 'slate', 'standing_seam_metal', 'lapped_metal_panel', 'lapped_metal_panel_sealed', 'other'];
export const ROOF_PRODUCT_CLASS_LABELS = {
  asphalt_shingle: 'Asphalt shingles',
  clay_tile: 'Clay tile',
  concrete_tile: 'Concrete tile',
  metal_shingle: 'Metal shingles or stone-coated steel',
  wood_shingle: 'Wood shingles',
  wood_shake: 'Wood shakes',
  slate: 'Slate',
  standing_seam_metal: 'Standing-seam metal panels',
  lapped_metal_panel: 'Exposed-fastener metal panels',
  lapped_metal_panel_sealed: 'Exposed-fastener metal panels with lap sealant',
  other: 'Other (enter the manufacturer minimum slope)'
};
// min: code minimum rise per 12 (null: the manufacturer minimum is required).
// lowSlope: the method from the minimum up to 4/12, when one applies.
// manufacturerMayLower: the code lets a low-slope metal system follow the manufacturer.
const CODE_RULES = {
  irc: {
    asphalt_shingle: {min: 2, lowSlope: 'asphalt'},
    clay_tile: {min: 2.5, lowSlope: 'tile'},
    concrete_tile: {min: 2.5, lowSlope: 'tile'},
    metal_shingle: {min: 3}, wood_shingle: {min: 3}, wood_shake: {min: 3}, slate: {min: 4},
    standing_seam_metal: {min: 0.25}, lapped_metal_panel: {min: 3}, lapped_metal_panel_sealed: {min: 0.5},
    other: {min: null}
  },
  nbc: {
    asphalt_shingle: {min: 2, lowSlope: 'asphalt'},
    clay_tile: {min: 6}, concrete_tile: {min: null, lowSlope: 'tile'},
    metal_shingle: {min: 3}, wood_shingle: {min: 3}, wood_shake: {min: 4}, slate: {min: 6},
    standing_seam_metal: {min: 3, manufacturerMayLower: true}, lapped_metal_panel: {min: 3, manufacturerMayLower: true}, lapped_metal_panel_sealed: {min: 3, manufacturerMayLower: true},
    other: {min: null}
  }
};
const finiteSlope = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 24;
// Every product needs the manufacturer's minimum slope from its installation
// instructions: IRC R905.1 applies roof coverings by this section and the
// manufacturer's installation instructions, and a product can require more
// than its code family (McElroy Meridian standing seam: 3/12).
export function roofManufacturerSlopeRequired(p, product) {
  const code = p?.roofBuildingCode, cls = p?.roofProductClass?.[product];
  return Boolean(CODE_RULES[code]?.[cls]);
}
// The code minimum for a product type, or null when the manufacturer sets it.
export function roofCodeMinimumSlope(code, cls) {
  const base = CODE_RULES[code]?.[cls];
  return base ? base.min : undefined;
}
// The rule for one product, or null until the owner has classified it and
// entered its manufacturer minimum.
export function roofSlopeRule(p, product) {
  const code = p?.roofBuildingCode, cls = p?.roofProductClass?.[product], base = CODE_RULES[code]?.[cls];
  if (!base) return null;
  const maker = p?.roofProductMinSlope?.[product], hasMaker = finiteSlope(maker) && maker > 0;
  if (!hasMaker) return null;
  let min = base.min;
  if (min === null) min = maker;
  else min = base.manufacturerMayLower ? maker : Math.max(min, maker);
  return {code, cls, min, lowSlope: base.lowSlope && min < LOW_SLOPE_BREAK ? base.lowSlope : null, subject: SLOPE_SUBJECTS[cls]};
}
const SLOPE_SUBJECTS = {
  asphalt_shingle: 'Asphalt shingles are', clay_tile: 'Clay tile is', concrete_tile: 'Concrete tile is',
  metal_shingle: 'Metal shingles and stone-coated steel are', wood_shingle: 'Wood shingles are', wood_shake: 'Wood shakes are',
  slate: 'Slate is', standing_seam_metal: 'Standing-seam metal panels are', lapped_metal_panel: 'Exposed-fastener metal panels are',
  lapped_metal_panel_sealed: 'Exposed-fastener metal panels with lap sealant are', other: 'This roofing product is'
};
const formatSlope = value => String(value) + '/12';
// Rise ranges for each customer pitch answer: [lowest, highest].
const BANDS = {
  under_four: [0, LOW_SLOPE_BREAK], up_to_six: [4, 6], seven_to_nine: [6, 9], ten_to_twelve: [9, 12], over_twelve: [12, Infinity],
  low: [0, LOW_SLOPE_BREAK], medium: [4, 6], steep: [6, 9], very_steep: [9, Infinity]
};
// The pitch bands present on the roof being quoted.
export function roofPitchBands(c, p) {
  if (c.pitch !== undefined && c.pitchMethod === undefined) return [c.pitch];
  if (c.pitchMethod === 'area_by_pitch') return [['pitchAreaUnder4Sqft', 'under_four'], ['pitchAreaUpTo6Sqft', 'up_to_six'], ['pitchArea7To9Sqft', 'seven_to_nine'], ['pitchArea10To12Sqft', 'ten_to_twelve'], ['pitchAreaOver12Sqft', 'over_twelve']].filter(([field]) => typeof c[field] === 'number' && c[field] > 0).map(([, band]) => band);
  if (c.pitchMethod === 'not_sure') return p.unknownPitchBand ? [p.unknownPitchBand] : [];
  return c.pitchBand ? [c.pitchBand] : [];
}
// The customer's pitch answers. A rise up to 6 is the walkable band; a rise
// under 4 may also be answered as the low-slope band.
export const PITCH_BANDS = ['under_four', 'up_to_six', 'seven_to_nine', 'ten_to_twelve', 'over_twelve'];
export const PITCH_AREA_BY_BAND = { under_four: 'pitchAreaUnder4Sqft', up_to_six: 'pitchAreaUpTo6Sqft', seven_to_nine: 'pitchArea7To9Sqft', ten_to_twelve: 'pitchArea10To12Sqft', over_twelve: 'pitchAreaOver12Sqft' };
export const PITCH_AREA_FIELDS = Object.values(PITCH_AREA_BY_BAND);
export const riseBand = rise => rise <= 6 ? 'up_to_six' : rise <= 9 ? 'seven_to_nine' : rise <= 12 ? 'ten_to_twelve' : 'over_twelve';
// Not sure with a band or a measured rise is priced as one pitch for the whole
// roof: the answer given is better evidence than the business's assumed band.
// A band and a rise that disagree are then refused as for whole roof. Not sure
// with roof areas by pitch, and no band or rise, is priced as area by pitch.
export function roofPitchInputs(c) {
  if (c?.pitchMethod !== 'not_sure') return c;
  const band = PITCH_BANDS.includes(c.pitchBand) ? c.pitchBand : undefined;
  const rise = Number.isFinite(c.pitchRisePer12) ? c.pitchRisePer12 : undefined;
  if (band === undefined && rise === undefined) {
    const areas = PITCH_AREA_FIELDS.some(field => Number.isFinite(c[field]) && c[field] > 0);
    return areas && c.pitchBand === undefined && c.pitchRisePer12 === undefined ? { ...c, pitchMethod: 'area_by_pitch' } : c;
  }
  return { ...c, pitchMethod: 'whole_roof', pitchBand: band ?? (rise < LOW_SLOPE_BREAK ? 'under_four' : riseBand(rise)) };
}
export function roofKnownRise(c) {
  return c.pitchMethod === 'whole_roof' && Number.isFinite(c.pitchRisePer12) ? c.pitchRisePer12 : undefined;
}
export const LOW_SLOPE_UNKNOWN_MESSAGE = 'Part or all of this roof is below 4/12. Low-slope roofs need extra underlayment or a different roof system, so the business will inspect before quoting.';
// Review message when this product cannot be quoted on this roof, or null.
export function roofSlopeReviewMessage(c, p) {
  const rule = roofSlopeRule(p, c.replacementRoofType);
  if (!rule) return null;
  const rise = roofKnownRise(c);
  const tooLow = `${rule.subject} installed only on roofs of ${formatSlope(rule.min)} or steeper.`;
  if (rise !== undefined) {
    if (rise < rule.min) return `${tooLow} A ${formatSlope(rise)} roof needs a low-slope roof system; the business will inspect before quoting.`;
    if (rule.lowSlope === 'tile' && rule.code === 'nbc' && rise < LOW_SLOPE_BREAK) return `Concrete tile below 4/12 follows the manufacturer's low-slope method; the business will confirm it before quoting.`;
    return null;
  }
  // A rise given with another pitch method is still the customer's measured
  // slope: below the product minimum, or below 4/12 where a low-slope method
  // applies, the areas or band given cannot price the roof.
  if (Number.isFinite(c.pitchRisePer12)) {
    if (c.pitchRisePer12 < rule.min) return `${tooLow} A ${formatSlope(c.pitchRisePer12)} roof needs a low-slope roof system; the business will inspect before quoting.`;
    if (rule.lowSlope && c.pitchRisePer12 < LOW_SLOPE_BREAK) return LOW_SLOPE_UNKNOWN_MESSAGE;
  }
  // A whole roof under 4/12 with the rise not yet answered is asked for it.
  if (c.pitchMethod === 'whole_roof' && c.pitchBand === 'under_four' && c.pitchRisePer12 === undefined) return null;
  for (const band of roofPitchBands(c, p)) {
    const [low, high] = BANDS[band] || [];
    if (low === undefined) continue;
    if (high <= rule.min && !(high === rule.min && band !== 'under_four' && band !== 'low')) return `${tooLow} The business will inspect this roof before quoting.`;
    // Below 4/12 the slope must be known exactly: the minimum and the
    // low-slope method both depend on it.
    if (band === 'under_four' || band === 'low') return LOW_SLOPE_UNKNOWN_MESSAGE;
    if (low < rule.min) return `${tooLow} The business will confirm this roof's slope before quoting.`;
  }
  return null;
}
// The low-slope method that applies to a known rise, or null.
export function roofLowSlopeMethod(c, p) {
  const rule = roofSlopeRule(p, c.replacementRoofType), rise = roofKnownRise(c);
  if (!rule?.lowSlope || rise === undefined || rise < rule.min || rise >= LOW_SLOPE_BREAK) return null;
  if (rule.lowSlope === 'tile') return rule.code === 'irc' ? 'double_underlayment' : null;
  // NBC 9.26.8's cemented triple coverage is IKO's method for 3-tab shingles
  // only (bulletin R-55), so it is one of the owner's choices, never assumed.
  // Under either code the owner chooses before a low-slope roof is priced.
  return lowSlopeMethodsFor(rule.code).includes(p.lowSlopeAssembly) ? p.lowSlopeAssembly : 'undecided';
}
// The low-slope methods an owner can choose under each code. The cemented
// application is the Canadian code's (NBC 9.26.8) and is not offered under the IRC.
export const LOW_SLOPE_METHODS = Object.freeze(['double_underlayment', 'self_adhered_underlayment', 'nbc_low_slope_application']);
export const LOW_SLOPE_METHOD_LABELS = Object.freeze({
  double_underlayment: 'Two layers of underlayment',
  self_adhered_underlayment: 'One layer of self-adhered underlayment',
  nbc_low_slope_application: 'Cemented low-slope application (NBC 9.26.8), for 3-tab shingles only'
});
export function lowSlopeMethodsFor(code) {
  return code === 'nbc' ? LOW_SLOPE_METHODS : LOW_SLOPE_METHODS.filter(method => method !== 'nbc_low_slope_application');
}
// NBC 9.26.5.1(2): no eave protection on a 9.26.8 low-slope roof or on a
// slope of 1 in 1.5 (8/12) or more. The other exceptions are site facts.
export function roofEaveProtectionExempt(c, p) {
  const rule = roofSlopeRule(p, c.replacementRoofType);
  if (rule?.code !== 'nbc') return false;
  if (roofLowSlopeMethod(c, p) === 'nbc_low_slope_application') return true;
  const rise = roofKnownRise(c);
  if (rise !== undefined) return rise >= 8;
  const bands = roofPitchBands(c, p);
  return bands.length > 0 && bands.every(band => ['ten_to_twelve', 'over_twelve'].includes(band));
}
export const ROOF_SLOPE_FIELD_COPY = {
  roofBuildingCode: {label: 'Building code your roofs follow', help: 'Minimum roof slopes and low-slope methods differ between Canada and the United States.'},
  roofProductClass: {label: 'Roofing product type', help: 'Sets the code minimum slope for each product. A product below its minimum slope goes to you for review.'},
  roofProductMinSlope: {label: 'Manufacturer minimum slope (rise per 12)', help: 'From each product\'s installation instructions; required for every product. Codes apply roofing by the manufacturer\'s instructions, and some products need more than the code (for example a standing-seam panel rated for 3/12). When it is higher than the code minimum, it governs; under the National Building Code a low-slope metal system follows the manufacturer.'},
  lowSlopeAssembly: {label: 'Asphalt shingles from 2/12 to under 4/12', help: 'How you install shingles on a low slope: two layers of underlayment (IRC R905.1.1), or one layer of self-adhered underlayment over the whole roof (ARMA). Under the Canadian code (NBC) you can also choose the cemented low-slope application (NBC 9.26.8), which IKO limits to 3-tab shingles. A shingle roof from 2/12 to under 4/12 is not priced until you choose.'},
  selfAdheredUnderlaymentPerSquare: {label: 'Installed self-adhered underlayment price per roofing square (labor and material)', help: 'Replaces your regular underlayment on a 2/12 to 4/12 shingle roof when you use one layer of self-adhered underlayment. Enter its labor and materials portions under Installed prices.'},
  nbcLowSlopeShingleFactor: {label: 'Low-slope shingle quantity factor', help: 'NBC 9.26.8 needs 3 thicknesses of shingle over the whole roof on slopes from 1 in 6 to 1 in 3. Enter how many times your normal shingle quantity that takes with your shingle and its exposure. It applies to the shingles alone, not to starter, drip edge, ridge cap, flashing or vents.'},
  nbcLowSlopeShingleMaterialPerSquare: {label: 'Shingle material price per square, shingles only', help: 'Your price for one square of field shingles alone, without starter, drip edge, ridge cap, flashing or vents. The extra shingles for the low-slope application are priced at this rate, so accessories in your field-material price are not multiplied.'},
  nbcLowSlopeCementPerSquare: {label: 'Low-slope cement price per roofing square', help: 'Cement for the starter band, every course and the tabs (NBC 9.26.8).'},
  nbcLowSlopeLaborPerSquare: {label: 'Low-slope application labor addition per roofing square', help: 'Extra labor for the cemented low-slope application (NBC 9.26.8), added to your roofing labor.'},
  eaveProtectionRequired: {label: 'Eave protection required on every shingle roof', help: 'NBC 9.26.5.1 requires eave protection from the roof edge 900 mm up the slope, to 300 mm inside the wall, except in mild regions and a few other cases. IRC R905.1.2 requires an ice barrier where ice dams have occurred. Yes sends a quote with no ice and water barrier measured to you for review.'}
};
export const ROOF_SLOPE_MONEY_FIELDS = ['selfAdheredUnderlaymentPerSquare', 'nbcLowSlopeShingleMaterialPerSquare', 'nbcLowSlopeCementPerSquare', 'nbcLowSlopeLaborPerSquare'];
export const ROOF_SLOPE_FIELDS = ['roofBuildingCode', 'roofProductClass', 'roofProductMinSlope', 'lowSlopeAssembly', 'nbcLowSlopeShingleFactor', 'eaveProtectionRequired', ...ROOF_SLOPE_MONEY_FIELDS];
