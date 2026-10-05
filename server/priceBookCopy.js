const copy = (label, help) => ({ label, help });

// Approved label ruling: where the authoritative pricing definition is a full
// sentence, render a concise trade-specific control title as the primary label
// and keep the complete authoritative wording immediately beneath as supporting
// copy. titled() preserves the authoritative text VERBATIM in `definition`.
// Units, inclusions, exclusions and pricing meaning are unchanged.
const titled = (title, authoritativeLabel, help) => ({ label: authoritativeLabel, title, help });

export const OWNER_FIELD_COPY = {
  laborPerSquare: copy('Roof installation labor price per roofing square', 'Labor charge for each 100 square feet of roof area before pitch and story adjustments.'),
  materialCostPerSquare: titled('All-in roofing material price per square', 'Your all-in installed material price per square, INCLUDING starter, drip edge, ridge cap, flashing, and vents.', 'Material charge for each waste-adjusted roofing square when accessories are included in the all-in price.'),
  tearOffPerSquare: copy('Roof tear-off price per existing roofing square', 'Removal labor for each roofing square and each existing layer, adjusted for pitch and stories.'),
  underlaymentPerSquare: copy('Underlayment material price per roofing square', 'Material price applied to each waste-adjusted roofing square.'),
  accessoryPricingMode: copy('Roof accessory pricing method', 'Choose whether starter, drip edge, and ridge cap are included in the all-in material price or priced separately.'),
  starterPerLF: copy('Starter strip material price per linear foot', 'Used only with itemized roof accessories and applied to the estimated or measured eave and rake length.'),
  dripEdgePerLF: copy('Drip edge material price per linear foot', 'Used only with itemized roof accessories and applied to the estimated or measured eave and rake length.'),
  ridgeCapPerLF: copy('Ridge cap material price per linear foot', 'Used only with itemized roof accessories and applied to the estimated or measured ridge length.'),
  deckingPerSheet: copy('Decking replacement price per sheet', 'Optional unit price disclosed when rotten or damaged roof decking may need replacement. It becomes a charge only when a sheet count is known.'),
  disposalPerSquare: copy('Disposal price per roofing square', 'Optional disposal charge for each roofing square and each removed layer. When blank, the business-wide disposal charge is used.'),
  allowAssumptionBasedQuotes: copy('Allow size estimates (small/medium/large) instead of exact measurements', 'When enabled, the service may quote from the documented size assumptions when a customer cannot provide exact measurements.'),
  laborHourlyRate: copy('Labor rate per hour', 'Hourly labor charge used for repair work or preparation labor when that scope applies.'),
  largeRepairMaxSqft: copy('Largest area priced as a repair (sq ft)', 'Affected areas larger than this are not priced from your large-repair hours and material allowance; those requests come to you for review.'),
  repairMinimum: copy('Minimum repair visit price', 'Lowest total price for this repair service. Enter $0 when there is no repair minimum.'),
  repairHours: copy('Repair labor hours by repair type and project size', 'Enter the labor hours normally required for each repair type and small, medium, or large affected area.'),
  repairMaterialAllowance: copy('Roof repair material allowance by repair type', 'Material allowance added for each roof repair type before the final site inspection.'),
  laborPerFloorSqft: titled('Wall painting labor price per floor square foot', 'Your labor price per square foot of FLOOR area — walls only, two coats, standard 8-ft ceilings.', 'Base wall-painting labor applied to floor area, then adjusted for wall height and coat count.'),
  materialPerFloorSqft2Coats: titled('Wall paint material price per floor square foot', 'Your paint/material cost per square foot of FLOOR area for two coats on walls.', 'Base wall paint and material price applied to floor area, then adjusted for wall height and coat count.'),
  minimumJob: copy('Minimum job price', 'Lowest total price for this service. Enter $0 when there is no service minimum.'),
  ceilingLaborPerFloorSqft: copy('Ceiling painting labor price per square foot of floor area', 'Labor charge applied when ceilings are included. Ceiling area is treated as equal to the floor area.'),
  trimLaborPerLF: copy('Trim painting labor price per linear foot', 'Labor charge applied to the estimated trim length when trim painting is included.'),
  trimMaterialPerLF: copy('Trim paint material price per linear foot', 'Paint and material charge applied to the estimated trim length when trim painting is included.'),
  trimLinearFeetPerRoom: copy('Typical trim length per room (linear feet)', 'Quantity assumption used to estimate total trim length from the room count.'),
  exteriorLaborPerSqft: copy('Exterior painting labor price per square foot of PAINTABLE WALL area', 'Base labor applied to paintable exterior wall area and adjusted for story count.'),
  materialPerSqftPerCoat: copy('Exterior paint material price per square foot of PAINTABLE WALL area, per coat', 'Paint and material charge multiplied by paintable wall area and the required coat count.'),
  laborPerLinearFoot: copy('Fence installation labor price per linear foot', 'Labor charge for each linear foot of fence, adjusted for fence height and terrain.'),
  materialPerLinearFoot: copy('Fence material price per linear foot', 'Fence-panel and rail material charge for each linear foot, adjusted for fence height.'),
  postSpacing: copy('Post spacing (ft)', 'Typical distance between line posts, used to calculate the number of posts required.'),
  postPrice: copy('Fence post material price per post', 'Material price for each calculated fence post when posts are not included in the per-foot material price.'),
  concretePerPost: titled('Concrete and digging price per post', 'Concrete + digging cost per post at your local frost/set depth.', 'Material and digging charge for every calculated fence post, including corner and gate posts.'),
  postsIncludedInMaterial: copy('Posts already included in material cost?', 'Choose Yes only when the per-linear-foot material price already includes every fence post.'),
  gatePrice: titled('Installed price per gate', "Installed price per gate INCLUDING gate posts' hardware; gate posts themselves are counted below.", 'Material and hardware charge for each gate. The two gate posts remain part of the calculated post count.'),
  removalPerLinearFoot: copy('Existing fence removal labor price per linear foot', 'Removal labor applied when the customer wants the old fence removed, adjusted for terrain.'),
  disposalPerLF: copy('Existing fence disposal price per linear foot', 'Optional disposal charge for each linear foot of old fence removed. When blank, the business-wide disposal charge is used.'),
  concreteCostPerCubicYard: copy('Ready-mix concrete material price per cubic yard', 'Concrete material cost multiplied by calculated slab volume, including the configured waste allowance.'),
  formworkPerLF: copy('Formwork material price per linear foot', 'Forms and related materials for open slab edges, after subtracting measured edges against foundation or existing concrete.'),
  demolitionPerSqft: copy('Concrete demolition labor price per square foot', 'Removal labor applied to the existing concrete area when demolition is included, adjusted for access.'),
  basePrepPerSqft: titled('Base preparation price per square foot', 'Excavation + compacted gravel base + grading, per square foot.', 'Preparation charge applied to the slab area when a new base is required.'),
  wireReinforcementPerSqft: copy('Wire mesh reinforcement material price per square foot', 'Material charge applied when wire mesh reinforcement is selected.'),
  rebarReinforcementPerSqft: copy('Rebar reinforcement material price per square foot', 'Material charge applied when rebar reinforcement is selected.'),
  stampedMaterialPerSqft: copy('Stamped finish material price per square foot', 'Color hardener, release agent, and sealer material charge applied when a stamped finish is selected.'),
  cleanupBaseRatePerSqft: copy('Yard cleanup labor price per square foot', 'Base cleanup labor applied to yard area before debris and slope adjustments.'),
  debrisPricing: copy('Debris labor and disposal pricing by debris level', 'For light, moderate, and heavy debris, enter the labor multiplier and fixed disposal charge used by the quote.'),
  minimumServiceCharge: copy('Minimum service charge', 'Lowest total price for this landscaping service. Enter $0 when there is no minimum.'),
  haulAwayFee: copy('Additional haul-away fixed charge', 'Fixed disposal charge added when the cleanup includes hauling debris away.'),
  mulchMaterialPerYard: copy('Mulch material price per cubic yard by mulch type', 'Material price for each ordered cubic yard, including the configured overage quantity.'),
  mulchInstallLaborPerYard: copy('Mulch installation labor price per cubic yard', 'Labor charge for each calculated cubic yard of mulch installed.'),
  bedPrepLaborPerSqft: copy('Planting-bed preparation labor price per square foot', 'Labor charge applied when beds need weeding or clearing before mulch or planting.'),
  edgingPerLinearFoot: copy('Landscape edging labor price per linear foot', 'Labor charge applied when bed edging or lawn edging is included.'),
  sodMaterialPerSqft: copy('Sod material price per square foot', 'Sod material charge applied to the measured area plus the configured waste allowance.'),
  sodInstallLaborPerSqft: copy('Sod installation labor price per square foot', 'Installation labor applied to the measured sod area, adjusted for slope and access.'),
  groundPrepPerSqft: titled('Ground preparation price per square foot', 'Per sqft to remove existing grass, haul it away, grade/compact, and add topsoil as needed. Prep is often the majority of a sod job — make sure this number covers disposal of the old lawn.', 'Preparation charge applied to the sod area when ground preparation is included.'),
  plantingLaborPerPlant: copy('Plant installation labor price per plant by plant size', 'Labor charge for each plant, selected from the small, medium, large, or mixed rate.'),
  plantMaterialAllowance: copy('Plant material allowance per plant by plant size', 'Plant material allowance multiplied by the plant count for the selected size.'),
  mowingBaseRatePerSqft: copy('Base mowing labor price per square foot', 'Base mowing labor applied to yard area before service-frequency and overgrowth adjustments.'),
  frequencyMultipliers: copy('Mowing service-frequency labor multipliers', 'Adjusts mowing labor for weekly, biweekly, monthly, or one-time service.'),
  overgrowthMultipliers: copy('Grass-condition labor multipliers', 'Adjusts mowing labor for maintained, overgrown, or severely overgrown grass.'),
  baggingSurchargePercent: copy('Clipping bagging and disposal surcharge (%)', 'Optional percentage added to mowing labor when the customer wants clippings bagged and removed.'),
  materialAllowance: copy('Siding repair material allowance by damage level and project size', 'Material allowance for each damage level and small, medium, or large affected area.'),
  trimPerLinearFoot: copy('Siding trim installation price per linear foot', 'Charge applied to measured or estimated trim length when siding trim is included.'),
  membraneCostPerSqft: copy('Flat-roof membrane material price per square foot by membrane type', 'Material charge for each square foot of flat roof using the selected membrane type. Enter rates for identified membranes you offer. Unknown membranes need review; no average fallback is used.'),
  tearOffPerSqft: copy('Flat-roof tear-off labor price per square foot by membrane type', 'Removal labor charge for each square foot and existing layer, adjusted for roof access. Enter rates for identified membranes you offer. Unknown membranes need review; no average fallback is used.'),
  insulationPerSqft: copy('Rigid insulation and coverboard material price per square foot', 'Material charge applied to commercial flat-roof replacement when insulation or coverboard is required.'),
  patchRepairHours: copy('Flat-roof repair labor hours by repair type and project size', 'Enter labor hours for each repair type and small, medium, or large affected area.'),
  patchMaterialAllowance: copy('Flat-roof repair material allowance by repair type and project size', 'Enter the material allowance for each repair type and small, medium, or large affected area.'),
  pondingWaterSurcharge: copy('Ponding-water repair fixed surcharge', 'Optional fixed charge added only when ponding water is reported and this price is configured.'),
  low: copy('Low price for one unit', 'Lower end of the customer estimate before quantity, markup, tax, minimums, and range treatment.'),
  high: copy('High price for one unit', 'Upper end of the customer estimate before quantity, markup, tax, minimums, and range treatment. It must be greater than the low price.'),
  unit: copy('How this custom service is priced', 'Choose whether the low and high prices apply per project, hour, item, square foot, linear foot, or roofing square.'),

  'FLOORING_INSTALL.laborPerSqft': copy('Labor price per square foot by flooring type.', 'Installation labor rate for each supported flooring type, applied to measured floor area and room complexity.'),
  'FLOORING_REPLACEMENT.laborPerSqft': copy('Labor price per square foot by flooring type.', 'Installation labor rate for each supported flooring type, applied to measured floor area and room complexity.'),
  'FLOORING_INSTALL.materialPerSqft': copy('Material price per square foot by flooring type.', 'Material rate for each supported flooring type, applied to floor area plus the configured waste allowance.'),
  'FLOORING_REPLACEMENT.materialPerSqft': copy('Material price per square foot by flooring type.', 'Material rate for each supported flooring type, applied to floor area plus the configured waste allowance.'),
  'FLOORING_INSTALL.removalPerSqft': copy('Existing flooring removal labor price per square foot', 'Removal labor applied to measured floor area when old flooring removal is included.'),
  'FLOORING_REPLACEMENT.removalPerSqft': copy('Existing flooring removal labor price per square foot', 'Removal labor applied to measured floor area when old flooring removal is included.'),
  'FLOORING_INSTALL.disposalPerSqft': copy('Optional disposal price per square foot when removal is included.', 'Overrides the business-wide disposal charge for this flooring service when old flooring is removed.'),
  'FLOORING_REPLACEMENT.disposalPerSqft': copy('Optional disposal price per square foot when removal is included.', 'Overrides the business-wide disposal charge for this flooring service when old flooring is removed.'),
  'FLOORING_INSTALL.perStepPrice': copy('Stair covering labor price per step', 'Labor charge for each stair step when the flooring project includes stairs.'),
  'FLOORING_REPLACEMENT.perStepPrice': copy('Stair covering labor price per step', 'Labor charge for each stair step when the flooring project includes stairs.'),
  'FLOORING_INSTALL.underlaymentPerSqft': copy('Underlayment material price per square foot', 'Material charge applied to waste-adjusted floor area when the selected flooring type requires underlayment.'),
  'FLOORING_REPLACEMENT.underlaymentPerSqft': copy('Underlayment material price per square foot', 'Material charge applied to waste-adjusted floor area when the selected flooring type requires underlayment.'),
  'FLOORING_REPLACEMENT.subfloorAllowancePerSqft': copy('Subfloor repair allowance per square foot', 'Allowance applied to measured floor area when subfloor issues are reported, subject to inspection.'),
  'SIDING_REPLACEMENT.laborPerSqft': copy('Siding installation labor price per square foot by siding type', 'Installation labor rate for each supported siding type, applied to wall area and adjusted for stories.'),
  'SIDING_REPLACEMENT.materialPerSqft': copy('All-in installed material per sqft for this siding type, INCLUDING house wrap, J-channel, corner posts, and starter strip — accessories run 20–30% of vinyl material cost.', 'Material rate for each siding type, applied to wall area plus the configured waste allowance.'),
  'SIDING_REPLACEMENT.removalPerSqft': copy('Existing siding removal labor price per square foot', 'Removal labor applied to wall area when old siding removal is included, adjusted for stories.'),
  'SIDING_REPLACEMENT.disposalPerSqft': copy('Optional disposal price per square foot when removal is included.', 'Overrides the business-wide disposal charge for this siding service when old siding is removed.'),
  'CONCRETE_DRIVEWAY.laborPerSqft': copy('Include forming labor, expansion joints, cure & seal in your per-sqft labor rate.', 'Base driveway labor applied to slab area and adjusted for access and finish.'),
  'CONCRETE_PATIO_SLAB.laborPerSqft': copy('Include forming labor, expansion joints, cure & seal in your per-sqft labor rate.', 'Base patio labor applied to slab area and adjusted for access and finish.'),
  'CONCRETE_DRIVEWAY.disposalPerSqft': copy('Concrete disposal price per demolished square foot', 'Optional disposal charge applied when existing driveway concrete is demolished.'),
  'CONCRETE_PATIO_SLAB.disposalPerSqft': copy('Concrete disposal price per demolished square foot', 'Optional disposal charge applied when existing patio concrete is demolished.'),
  'ROOFING_REPAIR.repairHours': copy('Roof repair labor hours by repair type and project size', 'Enter labor hours for each roof repair type and small, medium, or large affected area.'),
  'SIDING_REPAIR.repairHours': copy('Siding repair labor hours by damage level and project size', 'Enter labor hours for each damage level and small, medium, or large affected area.'),
  'FLAT_ROOF_REPLACEMENT.laborPerSqft': copy('Flat-roof installation labor price per square foot by membrane type', 'Labor rate for each membrane type, applied to roof area and adjusted for access. Enter rates for identified membranes you offer. Unknown membranes need review; no average fallback is used.'),
  'FLAT_ROOF_REPLACEMENT.disposalPerSqft': copy('Flat-roof disposal price per removed square foot', 'Optional disposal charge applied to each square foot and existing layer removed. When blank, the business-wide disposal charge is used.')
};

export const SELECT_OPTION_LABELS = {
  accessoryPricingMode: {
    per_square_allin: 'Accessories included in the all-in material price',
    itemized: 'Price starter, drip edge, and ridge cap separately'
  },
  unit: {
    flat: 'Flat price per project',
    per_sqft: 'Price per square foot',
    per_hour: 'Price per labor hour',
    per_unit: 'Price per item',
    per_LF: 'Price per linear foot',
    per_square: 'Price per roofing square'
  }
};

const CLASS2_COPY = {
  wasteSimple: copy('Simple-roof waste allowance', 'Material quantity added for a simple roof. Enter 0.10 for 10%.'),
  wasteModerate: copy('Moderate-roof waste allowance', 'Material quantity added for a roof with some hips and valleys. Enter 0.13 for 13%.'),
  wasteComplex: copy('Complex-roof waste allowance', 'Material quantity added for a cut-up roof with multiple sections. Enter 0.18 for 18%.'),
  pitchAreaFactor: copy('Roof pitch area factor', 'Converts building footprint area to roof surface area for each pitch category.'),
  overhangFactor: copy('Roof overhang area factor', 'Adds roof area beyond the building footprint when home floor area is used.'),
  pitchMultiplier: copy('Roof pitch labor multiplier', 'Adjusts roofing labor or tear-off work for low, medium, steep, and very steep roofs.'),
  storyMultiplier: copy('Story-count labor multiplier', 'Adjusts labor and any service-specific removal work for one-, two-, and three-story projects.'),
  roomFloorSqft: copy('Estimated floor area by room size', 'Square-foot assumptions used when the customer provides room sizes instead of measured floor area.'),
  coatLaborFactor: copy('Paint coat labor factor', 'Adjusts base painting labor for one, two, or three coats.'),
  coatMaterialFactor: copy('Paint coat material factor', 'Adjusts base paint material quantity for one, two, or three coats.'),
  wallHeightMultiplier: copy('Wall-height labor and material multiplier', 'Adjusts wall labor and material for standard, high, or vaulted walls.'),
  prepHoursPerSqft: copy('Surface preparation hours per square foot', 'Labor-hour allowance for fair or poor surface preparation.'),
  ceilingMaterialFactor: copy('Ceiling paint material factor', 'Material quantity for ceilings relative to the two-coat wall material rate.'),
  paintableAreaMap: copy('Estimated paintable wall area by home size and stories', 'Square-foot assumptions used when exterior wall area is not measured.'),
  wasteFactorByType: copy('Material waste allowance by product type', 'Material quantity added for cuts, breakage, and layout waste for each product type.'),
  patternWasteAdder: copy('Flooring pattern waste addition', 'Extra material quantity added for straight or diagonal/pattern layouts.'),
  roomComplexityMultiplier: copy('Room-size labor multiplier', 'Adjusts flooring labor when the average room is large, medium, or small.'),
  heightMultiplierLabor: copy('Fence-height labor multiplier', 'Adjusts fence labor for 4-foot, 6-foot, and 8-foot installations.'),
  heightMultiplierMaterial: copy('Fence-height material multiplier', 'Adjusts fence material for 4-foot, 6-foot, and 8-foot installations.'),
  terrainMultiplier: copy('Terrain labor multiplier', 'Adjusts fencing labor for flat, moderate, or steep terrain.'),
  concreteWasteFactor: copy('Concrete ordering waste allowance', 'Adds concrete volume for chute loss, uneven subgrade, and ordering tolerance. Enter 0.10 for 10%.'),
  assumedDrivewayWidthFt: copy('Assumed driveway width', 'Width used to estimate driveway length and perimeter when only total area is known.'),
  finishMultiplier: copy('Concrete finish labor multiplier', 'Adjusts labor for broom, smooth, exposed aggregate, or stamped finishes.'),
  accessMultiplier: copy('Project access labor multiplier', 'Adjusts labor for easy, moderate, or difficult access.'),
  slopeMultiplier: copy('Slope labor multiplier', 'Adjusts landscaping labor for flat, moderate, or steep ground.'),
  mulchOverageFactor: copy('Mulch ordering overage factor', 'Adds material for settling and compaction. Enter 1.15 to order 15% extra.'),
  sodWasteFactor: copy('Sod material waste allowance', 'Adds sod material for cuts and fitting. Enter 0.05 for 5%.'),
  sidingAreaMap: copy('Estimated siding wall area by home size and stories', 'Square-foot assumptions used when siding wall area is not measured.'),
  trimRatio: copy('Estimated siding trim length ratio', 'Linear feet of trim estimated per square foot of siding wall area.'),
  'SIDING_REPLACEMENT.storyMultiplier': copy('Siding story labor and removal multiplier', 'Adjusts siding installation and removal for one-, two-, and three-story homes.'),
  'FLAT_ROOF_REPLACEMENT.accessMultiplier': copy('Flat-roof access labor and tear-off multiplier', 'Adjusts installation labor and tear-off work for easy, moderate, or difficult roof access.'),
  'LANDSCAPING_SOD.accessMultiplier': copy('Sod access labor multiplier', 'Adjusts sod installation labor for easy, moderate, or difficult site access.'),
  'CONCRETE_DRIVEWAY.accessMultiplier': copy('Driveway access labor and demolition multiplier', 'Adjusts driveway labor and demolition for easy, moderate, or difficult access.'),
  'CONCRETE_PATIO_SLAB.accessMultiplier': copy('Patio access labor and demolition multiplier', 'Adjusts patio labor and demolition for easy, moderate, or difficult access.')
};

const CLASS2_UNITS = {
  roomFloorSqft: 'sq ft',
  paintableAreaMap: 'sq ft',
  sidingAreaMap: 'sq ft',
  assumedDrivewayWidthFt: 'ft',
  prepHoursPerSqft: 'hours per sq ft',
  trimRatio: 'linear ft per sq ft',
  wasteSimple: 'decimal (0.10 = 10%)',
  wasteModerate: 'decimal (0.13 = 13%)',
  wasteComplex: 'decimal (0.18 = 18%)',
  concreteWasteFactor: 'decimal (0.10 = 10%)',
  sodWasteFactor: 'decimal (0.05 = 5%)',
  patternWasteAdder: 'decimal addition',
  mulchOverageFactor: 'quantity factor',
  default: 'multiplier'
};

export const SHAPED_FIELD_COPY = {
  'FLOORING_INSTALL.laborPerSqft': { keyLabel:'Flooring type', leafUnit:'$ per sq ft' },
  'FLOORING_INSTALL.materialPerSqft': { keyLabel:'Flooring type', leafUnit:'$ per sq ft' },
  'FLOORING_REPLACEMENT.laborPerSqft': { keyLabel:'Flooring type', leafUnit:'$ per sq ft' },
  'FLOORING_REPLACEMENT.materialPerSqft': { keyLabel:'Flooring type', leafUnit:'$ per sq ft' },
  'SIDING_REPLACEMENT.laborPerSqft': { keyLabel:'Siding type', leafUnit:'$ per sq ft' },
  'SIDING_REPLACEMENT.materialPerSqft': { keyLabel:'Siding type', leafUnit:'$ per sq ft' },
  'FLAT_ROOF_REPLACEMENT.laborPerSqft': { keyLabel:'Membrane type', leafUnit:'$ per sq ft' },
  'FLAT_ROOF_REPLACEMENT.membraneCostPerSqft': { keyLabel:'Membrane type', leafUnit:'$ per sq ft' },
  'FLAT_ROOF_REPLACEMENT.tearOffPerSqft': { keyLabel:'Membrane type', leafUnit:'$ per sq ft' },
  'ROOFING_REPAIR.repairHours': { keyLabel:'Roof repair type', leafUnit:'hours', nestedUnit:'hours' },
  'ROOFING_REPAIR.repairMaterialAllowance': { keyLabel:'Roof repair type', leafUnit:'$ allowance per repair' },
  'SIDING_REPAIR.repairHours': { keyLabel:'Damage level', leafUnit:'hours', nestedUnit:'hours' },
  'SIDING_REPAIR.materialAllowance': { keyLabel:'Damage level', leafUnit:'$ allowance per repair', nestedUnit:'$ allowance' },
  'FLAT_ROOF_REPAIR.patchRepairHours': { keyLabel:'Flat-roof repair type', leafUnit:'hours', nestedUnit:'hours' },
  'FLAT_ROOF_REPAIR.patchMaterialAllowance': { keyLabel:'Flat-roof repair type', leafUnit:'$ allowance per repair', nestedUnit:'$ allowance' },
  'LANDSCAPING_CLEANUP.debrisPricing': {
    keyLabel:'Debris level',
    nestedCopy:{
      laborMultiplier:{ label:'Labor multiplier', unit:'multiplier' },
      disposalFlat:{ label:'Flat disposal charge', unit:'$ fixed charge' }
    }
  },
  'LANDSCAPING_MULCH.mulchMaterialPerYard': { keyLabel:'Mulch type', leafUnit:'$ per cubic yard' },
  'LANDSCAPING_PLANTING.plantingLaborPerPlant': { keyLabel:'Plant size', leafUnit:'$ labor per plant' },
  'LANDSCAPING_PLANTING.plantMaterialAllowance': { keyLabel:'Plant size', leafUnit:'$ material per plant' },
  'LANDSCAPING_PLANTING.mulchMaterialPerYard': { keyLabel:'Mulch type', leafUnit:'$ material per cubic yard' },
  'LANDSCAPING_MOWING.frequencyMultipliers': { keyLabel:'Service frequency', leafUnit:'labor multiplier' },
  'LANDSCAPING_MOWING.overgrowthMultipliers': { keyLabel:'Grass condition', leafUnit:'labor multiplier' }
};

export function displayPricingValue(value) {
  const special = {
    fiber_cement:'Fiber cement',
    vinyl_plank:'Vinyl plank',
    diagonal_or_pattern:'Diagonal or patterned',
    exposed_aggregate:'Exposed aggregate',
    very_steep:'Very steep',
    one_time:'One-time service',
    average:'Average or unknown',
    small:'Small',
    medium:'Medium',
    large:'Large',
    xlarge:'Extra large'
  };
  if (special[value]) return special[value];
  const words = String(value).replace(/_/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function ownerFieldCopy(serviceType, field) {
  return OWNER_FIELD_COPY[`${serviceType}.${field}`] || OWNER_FIELD_COPY[field] || copy('Required pricing information', 'Complete this pricing value before the service can quote.');
}

export function class2FieldCopy(serviceType, field) {
  const value = CLASS2_COPY[`${serviceType}.${field}`] || CLASS2_COPY[field];
  return {
    ...(value || copy('Quantity adjustment', 'Adjusts the quantity or labor used for this service.')),
    unit: CLASS2_UNITS[field] || CLASS2_UNITS.default
  };
}

export function shapedFieldCopy(serviceType, field) {
  return SHAPED_FIELD_COPY[`${serviceType}.${field}`] || {};
}
