const round = Math.round;

export const SERVICE_TYPES = [
  'ROOFING_REPLACEMENT','ROOFING_REPAIR','FLAT_ROOF_REPLACEMENT','FLAT_ROOF_REPAIR',
  'INTERIOR_PAINTING','EXTERIOR_PAINTING','FLOORING_INSTALL','FLOORING_REPLACEMENT',
  'FENCING_INSTALL','FENCING_REPLACEMENT','SIDING_REPLACEMENT','SIDING_REPAIR',
  'CONCRETE_DRIVEWAY','CONCRETE_PATIO_SLAB','LANDSCAPING_CLEANUP','LANDSCAPING_MULCH',
  'LANDSCAPING_SOD','LANDSCAPING_PLANTING','LANDSCAPING_MOWING','CUSTOM'
];

// Class 2 physical defaults. Owners can override these in their stored pricing.
const D = {
  wasteSimple: 0.10, wasteModerate: 0.13, wasteComplex: 0.18,
  pitchAreaFactor: { low: 1.05, medium: 1.12, steep: 1.23, very_steep: 1.40 },
  overhangFactor: 1.08,
  pitchMultiplier: { low: 1, medium: 1.15, steep: 1.25, very_steep: 1.40 },
  storyMultiplier: { 1: 1, 2: 1.10, 3: 1.20 },
  roomFloorSqft: { small: 120, medium: 200, large: 320 },
  coatLaborFactor: { 1: 0.70, 2: 1, 3: 1.30 },
  coatMaterialFactor: { 1: 0.50, 2: 1, 3: 1.50 },
  wallHeightMultiplier: { standard: 1, high: 1.10, vaulted: 1.25 },
  paintableAreaMap: { 1: { small: 900, medium: 1400, large: 2000, xlarge: 2800 }, 2: { small: 1400, medium: 2200, large: 3100, xlarge: 4200 } },
  prepHoursPerSqft: { fair: 0.008, poor: 0.02 },
  flooringWaste: { hardwood: 0.10, laminate: 0.08, vinyl_plank: 0.08, carpet: 0.10, tile: 0.12 },
  patternWasteAdder: { straight: 0, diagonal_or_pattern: 0.07 },
  heightMultiplierLabor: { 4: 0.85, 6: 1, 8: 1.20 },
  heightMultiplierMaterial: { 4: 0.80, 6: 1, 8: 1.35 },
  terrainMultiplier: { flat: 1, moderate: 1.15, steep: 1.30 },
  concreteWasteFactor: 0.10,
  assumedDrivewayWidthFt: 11,
  finishMultiplier: { broom: 1, smooth: 1.05, exposed_aggregate: 1.20, stamped: 1.50 },
  accessMultiplier: { easy: 1, moderate: 1.10, difficult: 1.25 },
  slopeMultiplier: { flat: 1, moderate: 1.15, steep: 1.35 },
  mulchOverageFactor: 1.15,
  sodWasteFactor: 0.05,
  trimRatio: 0.15
};
D.paintableAreaMap[3] = Object.fromEntries(Object.entries(D.paintableAreaMap[2]).map(([k, v]) => [k, v * 1.4]));

function v(p, key, fallback) {
  if (p[key] !== undefined && p[key] !== null) return p[key];
  return fallback;
}
function keyed(value, key, fallback = 0) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return Number(value[key] ?? fallback);
  return Number(value ?? fallback);
}
function line(name, category, amountCents, taxable) {
  if (!Number.isFinite(amountCents) || amountCents <= 0) return null;
  return { name, category, amountCents: round(amountCents), taxable: taxable ?? (category === 'material' || category === 'addon'), ownerVisible: true, customerVisible: false };
}
function add(out, item) { if (item) out.lineItems.push(item); }
function sizeAssumption(ctx, allowed, message) {
  if (!allowed) throw review('Exact measurements required. Please provide actual square footage or linear footage for an accurate quote.');
  ctx.estimationUsed = true;
  ctx.appliedRules.push(message || 'Size estimated from customer description');
}
function review(reason) { const e = new Error(reason); e.reviewReason = reason; return e; }
function commonFlats(out, p, defaults, quantity = {}) {
  const d = quantity.disposalCents ?? defaults.disposalFee;
  add(out, line('Travel', 'travel', defaults.travelFee, false));
  add(out, line('Disposal', 'disposal', d, false));
  add(out, line('Permit', 'permit', defaults.permitFee, false));
  add(out, line('Overhead', 'overhead', defaults.overheadFixed, false));
}
function cat(area, small, med) { if (typeof area === 'string') return area; return area < small ? 'small' : area <= med ? 'medium' : 'large'; }

export function getRequiredFields(serviceType, c = {}) {
  const map = {
    ROOFING_REPLACEMENT: ['roofSizeInput','roofSizeMethod','roofType','pitch','stories','existingLayers','roofComplexity','serviceScope'],
    ROOFING_REPAIR: ['repairType','affectedArea','roofType','pitch','stories','leakPresent'],
    INTERIOR_PAINTING: ['areaInputMethod','wallHeight','surfaceCondition','coats','ceilingsIncluded','trimIncluded'],
    EXTERIOR_PAINTING: ['areaInputMethod','stories','surfaceCondition','coats'],
    FLOORING_INSTALL: ['sqft','sqftMethod','newFlooringType','existingFloorType','removalNeeded','roomCount','layoutPattern','stairSteps'],
    FLOORING_REPLACEMENT: ['sqft','sqftMethod','newFlooringType','existingFloorType','removalNeeded','roomCount','layoutPattern','stairSteps','subfloorIssues'],
    FENCING_INSTALL: ['linearFeet','lfMethod','fenceType','fenceHeight','gateCount','cornerCount','terrainSlope'],
    FENCING_REPLACEMENT: ['linearFeet','lfMethod','fenceType','fenceHeight','gateCount','cornerCount','terrainSlope','oldFenceRemoval'],
    CONCRETE_DRIVEWAY: ['dimensionMethod','thickness','finishType','demolitionNeeded','reinforcement','accessDifficulty','baseNeeded'],
    CONCRETE_PATIO_SLAB: ['dimensionMethod','thickness','finishType','reinforcement','accessDifficulty','baseNeeded'],
    LANDSCAPING_CLEANUP: ['yardSize','debrisLevel','slope','haulAway'],
    LANDSCAPING_MULCH: ['inputMethod','mulchArea','mulchDepth','mulchType','bedCondition','edgingNeeded'],
    LANDSCAPING_SOD: ['sodSqft','sqftMethod','groundPrepNeeded','slope','accessDifficulty'],
    LANDSCAPING_PLANTING: ['plantCount','plantSize','bedCondition','mulchNeeded'],
    LANDSCAPING_MOWING: ['yardSqft','sqftMethod','serviceFrequency','grassCondition','bagClippings','edgingIncluded'],
    SIDING_REPLACEMENT: ['areaInputMethod','sidingType','stories','oldSidingRemoval','trimIncluded'],
    SIDING_REPAIR: ['affectedArea','sidingType','damageLevel','stories'],
    FLAT_ROOF_REPLACEMENT: ['roofSqft','sqftMethod','membraneType','existingLayers','accessDifficulty','serviceScope','buildingType'],
    FLAT_ROOF_REPAIR: ['repairType','affectedArea','membraneType','leakPresent','pondingWater'],
    CUSTOM: ['service','unit']
  };
  const fields = [...(map[serviceType] || [])];
  if (serviceType === 'ROOFING_REPLACEMENT' && c.serviceScope === 'partial') fields.push('partialPercent');
  if (serviceType === 'INTERIOR_PAINTING') {
    if (c.areaInputMethod === 'sqft') fields.push('floorAreaSqft');
    if (c.areaInputMethod === 'rooms' || c.trimIncluded) fields.push('roomCount');
  }
  if (serviceType === 'EXTERIOR_PAINTING') fields.push(c.areaInputMethod === 'sqft' ? 'exteriorAreaSqft' : 'homeSizeCategory');
  if (serviceType.startsWith('CONCRETE_')) {
    if (c.dimensionMethod === 'exact') fields.push('length','width');
    if (c.dimensionMethod === 'area_only') fields.push('areaSqft');
  }
  if (serviceType === 'LANDSCAPING_MULCH') {
    if (c.edgingNeeded) fields.push('edgeLF');
    if (c.inputMethod === 'yards' && c.bedCondition !== 'clean') fields.push('bedSqft');
  }
  if (serviceType === 'LANDSCAPING_PLANTING') {
    if (c.bedCondition !== 'clean') fields.push('bedSqft');
    if (c.mulchNeeded) fields.push('mulchYards','mulchType');
  }
  if (serviceType === 'SIDING_REPLACEMENT') fields.push(c.areaInputMethod === 'sqft' ? 'sidingAreaSqft' : 'homeSize');
  return fields;
}

export function getRequiredOwnerFields(serviceType, c = {}) {
  const f = {
    ROOFING_REPLACEMENT: ['laborPerSquare','materialCostPerSquare','tearOffPerSquare','underlaymentPerSquare'],
    ROOFING_REPAIR: ['laborHourlyRate','repairMinimum','repairHours','repairMaterialAllowance'],
    INTERIOR_PAINTING: ['laborPerFloorSqft','materialPerFloorSqft2Coats','minimumJob'],
    EXTERIOR_PAINTING: ['exteriorLaborPerSqft','materialPerSqftPerCoat','minimumJob'],
    FLOORING_INSTALL: ['laborPerSqft','materialPerSqft','minimumJob'],
    FLOORING_REPLACEMENT: ['laborPerSqft','materialPerSqft','minimumJob'],
    FENCING_INSTALL: ['laborPerLinearFoot','materialPerLinearFoot','postSpacing','postPrice','concretePerPost','postsIncludedInMaterial','gatePrice','minimumJob'],
    FENCING_REPLACEMENT: ['laborPerLinearFoot','materialPerLinearFoot','postSpacing','postPrice','concretePerPost','postsIncludedInMaterial','gatePrice','minimumJob'],
    CONCRETE_DRIVEWAY: ['laborPerSqft','concreteCostPerCubicYard','formworkPerLF','minimumJob'],
    CONCRETE_PATIO_SLAB: ['laborPerSqft','concreteCostPerCubicYard','formworkPerLF','minimumJob'],
    LANDSCAPING_CLEANUP: ['cleanupBaseRatePerSqft','debrisPricing','minimumServiceCharge'],
    LANDSCAPING_MULCH: ['mulchMaterialPerYard','mulchInstallLaborPerYard','minimumServiceCharge'],
    LANDSCAPING_SOD: ['sodMaterialPerSqft','sodInstallLaborPerSqft','minimumServiceCharge'],
    LANDSCAPING_PLANTING: ['plantingLaborPerPlant','plantMaterialAllowance','minimumServiceCharge'],
    LANDSCAPING_MOWING: ['mowingBaseRatePerSqft','minimumServiceCharge','frequencyMultipliers','overgrowthMultipliers'],
    SIDING_REPLACEMENT: ['laborPerSqft','materialPerSqft','minimumJob'],
    SIDING_REPAIR: ['laborHourlyRate','repairMinimum','repairHours','materialAllowance'],
    FLAT_ROOF_REPLACEMENT: ['laborPerSqft','membraneCostPerSqft','tearOffPerSqft','minimumJob'],
    FLAT_ROOF_REPAIR: ['laborHourlyRate','repairMinimum','patchRepairHours','patchMaterialAllowance'],
    CUSTOM: ['low','high','unit']
  }[serviceType] || [];
  const out = [...f];
  if (serviceType === 'ROOFING_REPLACEMENT' && c.accessoryPricingMode === 'itemized') out.push('starterPerLF','dripEdgePerLF','ridgeCapPerLF');
  if (serviceType === 'INTERIOR_PAINTING') { if (c.surfaceCondition !== 'good') out.push('laborHourlyRate'); if (c.ceilingsIncluded) out.push('ceilingLaborPerFloorSqft'); if (c.trimIncluded) out.push('trimLaborPerLF','trimMaterialPerLF','trimLinearFeetPerRoom'); }
  if (serviceType === 'EXTERIOR_PAINTING' && c.surfaceCondition !== 'good') out.push('laborHourlyRate');
  if (serviceType.startsWith('FLOORING_')) { if (c.removalNeeded) out.push('removalPerSqft'); if (Number(c.stairSteps) > 0) out.push('perStepPrice'); if (['hardwood','laminate','carpet'].includes(c.newFlooringType) || c.underlaymentApplies) out.push('underlaymentPerSqft'); if (serviceType === 'FLOORING_REPLACEMENT' && c.subfloorIssues) out.push('subfloorAllowancePerSqft'); }
  if (serviceType === 'FENCING_REPLACEMENT' && c.oldFenceRemoval) out.push('removalPerLinearFoot');
  if (serviceType.startsWith('CONCRETE_')) { if (c.demolitionNeeded) out.push('demolitionPerSqft'); if (c.baseNeeded) out.push('basePrepPerSqft'); if (c.reinforcement === 'wire_mesh') out.push('wireReinforcementPerSqft'); if (c.reinforcement === 'rebar') out.push('rebarReinforcementPerSqft'); if (c.finishType === 'stamped') out.push('stampedMaterialPerSqft'); }
  if (serviceType === 'LANDSCAPING_CLEANUP' && c.haulAway) out.push('haulAwayFee');
  if (serviceType === 'LANDSCAPING_MULCH') { if (c.bedCondition !== 'clean') out.push('bedPrepLaborPerSqft'); if (c.edgingNeeded) out.push('edgingPerLinearFoot'); }
  if (serviceType === 'LANDSCAPING_SOD' && c.groundPrepNeeded) out.push('groundPrepPerSqft');
  if (serviceType === 'LANDSCAPING_PLANTING') { if (c.bedCondition !== 'clean') out.push('bedPrepLaborPerSqft'); if (c.mulchNeeded) out.push('mulchMaterialPerYard','mulchInstallLaborPerYard'); }
  if (serviceType === 'SIDING_REPLACEMENT') { if (c.oldSidingRemoval) out.push('removalPerSqft'); if (c.trimIncluded) out.push('trimPerLinearFoot'); }
  if (serviceType === 'FLAT_ROOF_REPLACEMENT' && c.buildingType === 'commercial') out.push('insulationPerSqft');
  return [...new Set(out)];
}

function areaFromSize(method, exact, sizes, ctx, allowed) {
  if (method === 'exact') return Number(exact);
  sizeAssumption(ctx, allowed);
  return sizes[exact] ?? sizes.medium;
}

export function calculateService(serviceType, c, p, defaults, ctx) {
  const out = { lineItems: [], laborSubtotal: 0, derived: {} };
  const allow = p.allowAssumptionBasedQuotes;
  try {
    if (serviceType === 'ROOFING_REPLACEMENT') {
      let roofAreaSqft;
      if (c.roofSizeMethod === 'roof_measured') roofAreaSqft = Number(c.roofSizeInput);
      else if (c.roofSizeMethod === 'home_floor_area') { roofAreaSqft = Number(c.roofSizeInput) / Number(c.stories) * v(p,'pitchAreaFactor_'+c.pitch,D.pitchAreaFactor[c.pitch]) * v(p,'overhangFactor',D.overhangFactor); ctx.estimationUsed = true; ctx.appliedRules.push('Roof area derived from home size, stories, and pitch - verified at inspection'); }
      else { sizeAssumption(ctx, allow); roofAreaSqft = { small:1200, medium:2000, large:3000 }[c.roofSizeInput] ?? 2000; }
      if (c.serviceScope === 'partial') roofAreaSqft *= Number(c.partialPercent) / 100;
      const roofSquares = roofAreaSqft / 100;
      const waste = v(p, 'waste'+String(c.roofComplexity)[0].toUpperCase()+String(c.roofComplexity).slice(1), { simple:D.wasteSimple, moderate:D.wasteModerate, complex:D.wasteComplex }[c.roofComplexity]);
      const materialSquares = roofSquares * (1 + waste);
      const layers = c.existingLayers === '3+' ? 3 : Number(c.existingLayers);
      const pitchM = v(p,'pitchMultiplier_'+c.pitch,D.pitchMultiplier[c.pitch]);
      const storyM = v(p,'storyMultiplier_'+c.stories,D.storyMultiplier[c.stories]);
      add(out, line('Roofing labor', 'labor', roofSquares * p.laborPerSquare * pitchM * storyM, false));
      add(out, line('Field materials', 'material', materialSquares * p.materialCostPerSquare, true));
      add(out, line('Tear-off', 'removal', roofSquares * layers * p.tearOffPerSquare * pitchM * storyM, false));
      add(out, line('Underlayment', 'material', materialSquares * p.underlaymentPerSquare, true));
      if (p.accessoryPricingMode === 'itemized') { const footprint = roofAreaSqft / v(p,'pitchAreaFactor_'+c.pitch,D.pitchAreaFactor[c.pitch]); const eaves = round(4 * Math.sqrt(footprint) * 1.10); const ridge = round(Math.sqrt(footprint) * 1.2); ctx.estimationUsed = true; ctx.appliedRules.push('Accessory lengths estimated from roof size'); add(out,line('Starter', 'material', eaves*p.starterPerLF,true)); add(out,line('Drip edge','material',eaves*p.dripEdgePerLF,true)); add(out,line('Ridge cap','material',ridge*p.ridgeCapPerLF,true)); }
      if (p.deckingPerSheet) ctx.priceDrivers.push(`Decking replacement, if needed, billed at $${(p.deckingPerSheet/100).toFixed(2)}/sheet`);
      out.derived = { roofAreaSqft, roofSquares, materialSquares };
      commonFlats(out,p,defaults,{ disposalCents: p.disposalPerSquare ? roofSquares*layers*p.disposalPerSquare : undefined });
    } else if (serviceType === 'ROOFING_REPAIR') {
      if (c.repairType === 'unknown') throw review('Leak source is unknown. An in-person inspection is needed before we can estimate this repair accurately.');
      if (c.leakPresent) ctx.urgencyFlags.push('Active leak reported - customer flagged as urgent');
      const size = cat(Number(c.affectedArea),50,200); const hours = keyed(p.repairHours?.[c.repairType], size); const mat = keyed(p.repairMaterialAllowance, c.repairType); const m = D.pitchMultiplier[c.pitch]*D.storyMultiplier[c.stories]; add(out,line('Repair labor','labor',hours*m*p.laborHourlyRate,false)); add(out,line('Repair materials','material',mat,true)); commonFlats(out,p,defaults);
    } else if (serviceType === 'INTERIOR_PAINTING') {
      let floorArea = c.areaInputMethod === 'sqft' ? Number(c.floorAreaSqft) : Number(c.roomCount) * keyed(v(p,'roomFloorSqft',D.roomFloorSqft),'medium',D.roomFloorSqft.medium); if (c.areaInputMethod === 'rooms') { ctx.estimationUsed = true; ctx.appliedRules.push('Room sizes estimated from room count'); }
      const height = keyed(D.wallHeightMultiplier,c.wallHeight,1); const coats = Number(c.coats); add(out,line('Wall labor','labor',floorArea*p.laborPerFloorSqft*height*keyed(D.coatLaborFactor,coats,1),false)); add(out,line('Wall paint/materials','material',floorArea*p.materialPerFloorSqft2Coats*height*keyed(D.coatMaterialFactor,coats,1),true)); if (c.surfaceCondition !== 'good') add(out,line('Wall prep','prep',floorArea*(c.surfaceCondition==='poor'?0.035:0.015)*p.laborHourlyRate,false)); if (c.ceilingsIncluded) { add(out,line('Ceiling labor','labor',floorArea*p.ceilingLaborPerFloorSqft,false)); add(out,line('Ceiling materials','material',floorArea*p.materialPerFloorSqft2Coats*0.5*keyed(D.coatMaterialFactor,coats,1),true)); } if (c.trimIncluded) { const lf = Number(c.roomCount)*p.trimLinearFeetPerRoom; add(out,line('Trim labor','labor',lf*p.trimLaborPerLF,false)); add(out,line('Trim materials','material',lf*p.trimMaterialPerLF,true)); } commonFlats(out,p,defaults);
    } else if (serviceType === 'EXTERIOR_PAINTING') {
      let area = c.areaInputMethod === 'sqft' ? Number(c.exteriorAreaSqft) : keyed(D.paintableAreaMap[c.stories], c.homeSizeCategory); if (c.areaInputMethod !== 'sqft') { sizeAssumption(ctx, allow); } const sm = D.storyMultiplier[c.stories]; add(out,line('Exterior labor','labor',area*p.exteriorLaborPerSqft*sm,false)); if (c.surfaceCondition !== 'good') add(out,line('Exterior prep','prep',area*D.prepHoursPerSqft[c.surfaceCondition]*p.laborHourlyRate,false)); const coats = Number(c.coats)+(c.surfaceCondition==='poor'?1:0); if (c.surfaceCondition==='poor') ctx.appliedRules.push('Primer coat added for surface condition'); add(out,line('Exterior materials','material',area*p.materialPerSqftPerCoat*coats,true)); commonFlats(out,p,defaults);
    } else if (serviceType.startsWith('FLOORING_')) {
      let sqft = c.sqftMethod === 'exact' ? Number(c.sqft) : ({small:300,medium:600,large:1200}[c.sqft] ?? 600); if (c.sqftMethod !== 'exact') sizeAssumption(ctx, allow); const waste = keyed(D.flooringWaste,c.newFlooringType,0.1)+keyed(D.patternWasteAdder,c.layoutPattern,0); const avg=sqft/Number(c.roomCount); const cm=avg>=300?1:avg>=150?1.1:1.2; add(out,line('Flooring labor','labor',sqft*p.laborPerSqft*cm,false)); add(out,line('Flooring materials','material',sqft*(1+waste)*p.materialPerSqft,true)); if (c.removalNeeded) add(out,line('Existing flooring removal','removal',sqft*p.removalPerSqft,false)); if (['hardwood','laminate','carpet'].includes(c.newFlooringType) || c.underlaymentApplies) add(out,line('Underlayment','material',sqft*(1+waste)*p.underlaymentPerSqft,true)); if (Number(c.stairSteps)>0) add(out,line('Stair installation','labor',Number(c.stairSteps)*p.perStepPrice,false)); if (serviceType==='FLOORING_REPLACEMENT' && c.subfloorIssues) { add(out,line('Subfloor allowance','prep',sqft*p.subfloorAllowancePerSqft,false)); ctx.appliedRules.push('Subfloor allowance included - final price confirmed after inspection'); } commonFlats(out,p,defaults,{disposalCents:p.disposalPerSqft&&c.removalNeeded?sqft*p.disposalPerSqft:undefined});
    } else if (serviceType.startsWith('FENCING_')) {
      let lf = c.lfMethod === 'exact' ? Number(c.linearFeet) : ({small:100,medium:180,large:280}[c.linearFeet] ?? 180); if (c.lfMethod !== 'exact') sizeAssumption(ctx, allow); const postCount=Math.ceil(lf/p.postSpacing)+1+Number(c.cornerCount)+2*Number(c.gateCount); const hl=keyed(D.heightMultiplierLabor,Number(c.fenceHeight),1); const hm=keyed(D.heightMultiplierMaterial,Number(c.fenceHeight),1); const tm=keyed(D.terrainMultiplier,c.terrainSlope,1); add(out,line('Fence labor','labor',lf*p.laborPerLinearFoot*hl*tm,false)); add(out,line('Fence materials','material',lf*p.materialPerLinearFoot*hm,true)); if (!p.postsIncludedInMaterial) add(out,line('Posts','material',postCount*p.postPrice,true)); add(out,line('Concrete footings','material',postCount*p.concretePerPost,true)); add(out,line('Gates','material',Number(c.gateCount)*p.gatePrice,true)); if (serviceType==='FENCING_REPLACEMENT'&&c.oldFenceRemoval) add(out,line('Old fence removal','removal',lf*p.removalPerLinearFoot*tm,false)); commonFlats(out,p,defaults,{disposalCents:p.disposalPerLF&&c.oldFenceRemoval?lf*p.disposalPerLF:undefined}); out.derived={postCount,linearFeet:lf};
    } else if (serviceType.startsWith('CONCRETE_')) {
      let area, perim; if (c.dimensionMethod==='exact') { area=Number(c.length)*Number(c.width); perim=2*(Number(c.length)+Number(c.width)); } else if (c.dimensionMethod==='area_only') { area=Number(c.areaSqft); if (serviceType==='CONCRETE_DRIVEWAY') { const w=v(p,'assumedDrivewayWidthFt',D.assumedDrivewayWidthFt); perim=2*(area/w+w); } else perim=4*Math.sqrt(area); ctx.estimationUsed=true; ctx.appliedRules.push('Concrete dimensions estimated from area'); } else { area={small:serviceType==='CONCRETE_DRIVEWAY'?400:200,medium:serviceType==='CONCRETE_DRIVEWAY'?800:400,large:serviceType==='CONCRETE_DRIVEWAY'?1600:800}[c.areaSqft||c.size||'medium']; sizeAssumption(ctx,allow); perim=serviceType==='CONCRETE_DRIVEWAY'?2*(area/D.assumedDrivewayWidthFt+D.assumedDrivewayWidthFt):4*Math.sqrt(area); } const yards=area*(Number(c.thickness)/12)/27*v(p,'concreteWasteFactor',D.concreteWasteFactor); const access=keyed(D.accessMultiplier,c.accessDifficulty,1); const finish=keyed(D.finishMultiplier,c.finishType,1); add(out,line('Concrete labor','labor',area*p.laborPerSqft*access + area*p.laborPerSqft*(finish-1),false)); add(out,line('Concrete','material',yards*p.concreteCostPerCubicYard,true)); add(out,line('Formwork','material',perim*p.formworkPerLF,true)); if (c.baseNeeded) add(out,line('Base prep','prep',area*p.basePrepPerSqft,false)); if (c.demolitionNeeded) add(out,line('Demolition','removal',area*p.demolitionPerSqft*access,false)); if (c.reinforcement==='wire_mesh') add(out,line('Wire mesh reinforcement','material',area*p.wireReinforcementPerSqft,true)); if (c.reinforcement==='rebar') add(out,line('Rebar reinforcement','material',area*p.rebarReinforcementPerSqft,true)); if (c.finishType==='stamped') add(out,line('Stamped materials','material',area*p.stampedMaterialPerSqft,true)); commonFlats(out,p,defaults,{disposalCents:p.disposalPerSqft&&c.demolitionNeeded?area*p.disposalPerSqft:undefined}); out.derived={areaSqft:area,perimeterLF:perim,cubicYards:yards};
    } else if (serviceType === 'LANDSCAPING_CLEANUP') {
      const yard=typeof c.yardSize==='number'?c.yardSize:({small:1500,medium:3500,large:6000}[c.yardSize]??3500); if (typeof c.yardSize!=='number') sizeAssumption(ctx,allow); const dp=p.debrisPricing[c.debrisLevel]; add(out,line('Cleanup labor','labor',yard*p.cleanupBaseRatePerSqft*dp.laborMultiplier*keyed(D.slopeMultiplier,c.slope,1),false)); add(out,line('Debris disposal','disposal',dp.disposalFlat,false)); if (c.haulAway) add(out,line('Haul away','disposal',p.haulAwayFee,false)); commonFlats(out,p,defaults);
    } else if (serviceType === 'LANDSCAPING_MULCH') {
      const yards=c.inputMethod==='sqft'?(Number(c.mulchArea)*(Number(c.mulchDepth)/12)/27):Number(c.mulchArea); const prep=c.inputMethod==='sqft'?Number(c.mulchArea):Number(c.bedSqft); const order=yards*v(p,'mulchOverageFactor',D.mulchOverageFactor); if (c.bedCondition!=='clean') add(out,line('Bed prep','prep',prep*p.bedPrepLaborPerSqft*(c.bedCondition==='needs_weeding'?0.5:1),false)); add(out,line('Mulch material','material',order*keyed(p.mulchMaterialPerYard,c.mulchType),true)); add(out,line('Mulch install labor','labor',yards*p.mulchInstallLaborPerYard,false)); if (c.edgingNeeded) add(out,line('Bed edging','prep',Number(c.edgeLF)*p.edgingPerLinearFoot,false)); commonFlats(out,p,defaults);
    } else if (serviceType === 'LANDSCAPING_SOD') {
      const sqft=c.sqftMethod==='exact'?Number(c.sodSqft):({small:500,medium:1500,large:3500}[c.sodSqft]??1500); if (c.sqftMethod!=='exact') sizeAssumption(ctx,allow); add(out,line('Sod material','material',sqft*(1+v(p,'sodWasteFactor',D.sodWasteFactor))*p.sodMaterialPerSqft,true)); add(out,line('Sod install labor','labor',sqft*p.sodInstallLaborPerSqft*keyed(D.slopeMultiplier,c.slope,1)*keyed(D.accessMultiplier,c.accessDifficulty,1),false)); if (c.groundPrepNeeded) add(out,line('Ground prep','prep',sqft*p.groundPrepPerSqft,false)); commonFlats(out,p,defaults);
    } else if (serviceType === 'LANDSCAPING_PLANTING') {
      add(out,line('Planting labor','labor',Number(c.plantCount)*keyed(p.plantingLaborPerPlant,c.plantSize),false)); add(out,line('Plant allowance','material',Number(c.plantCount)*keyed(p.plantMaterialAllowance,c.plantSize),true)); if (c.bedCondition!=='clean') add(out,line('Bed prep','prep',Number(c.bedSqft)*p.bedPrepLaborPerSqft,false)); if (c.mulchNeeded) { add(out,line('Mulch material','material',Number(c.mulchYards)*v(p,'mulchOverageFactor',D.mulchOverageFactor)*keyed(p.mulchMaterialPerYard,c.mulchType),true)); add(out,line('Mulch install labor','labor',Number(c.mulchYards)*p.mulchInstallLaborPerYard,false)); } commonFlats(out,p,defaults);
    } else if (serviceType === 'LANDSCAPING_MOWING') {
      const sqft=c.sqftMethod==='exact'?Number(c.yardSqft):({small:2000,medium:5000,large:10000,xlarge:21780}[c.yardSqft]??5000); if (c.sqftMethod!=='exact') sizeAssumption(ctx,allow); const labor=round(sqft*p.mowingBaseRatePerSqft*keyed(p.frequencyMultipliers,c.serviceFrequency,1)*keyed(p.overgrowthMultipliers,c.grassCondition,1)); add(out,line('Mowing labor','labor',labor,false)); if (c.bagClippings && p.baggingSurchargePercent) add(out,line('Clipping bagging & disposal','disposal',labor*p.baggingSurchargePercent/100,false)); if (c.edgingIncluded && p.edgingPerLinearFoot) { const per=round(Math.sqrt(sqft)*4); ctx.estimationUsed=true; ctx.appliedRules.push('Edging estimated from yard size'); add(out,line('Perimeter edging','addon',per*p.edgingPerLinearFoot,false)); } commonFlats(out,p,defaults);
    } else if (serviceType === 'SIDING_REPLACEMENT') {
      const area=c.areaInputMethod==='sqft'?Number(c.sidingAreaSqft):keyed(D.paintableAreaMap[c.stories],c.homeSize); if (c.areaInputMethod!=='sqft') sizeAssumption(ctx,allow); const sm=D.storyMultiplier[c.stories]; add(out,line('Siding labor','labor',area*keyed(p.laborPerSqft,c.sidingType)*sm,false)); add(out,line('Siding material','material',area*(1+keyed(D.flooringWaste,c.sidingType,0.10))*keyed(p.materialPerSqft,c.sidingType),true)); if (c.oldSidingRemoval) add(out,line('Old siding removal','removal',area*p.removalPerSqft*sm,false)); if (c.trimIncluded) { const trim=c.trimLF?Number(c.trimLF):round(area*v(p,'trimRatio',D.trimRatio)); if (!c.trimLF) { ctx.estimationUsed=true; ctx.appliedRules.push('Trim estimated from wall area - confirmed at site visit'); } add(out,line('Trim','material',trim*p.trimPerLinearFoot,true)); } commonFlats(out,p,defaults,{disposalCents:p.disposalPerSqft&&c.oldSidingRemoval?area*p.disposalPerSqft:undefined});
    } else if (serviceType === 'SIDING_REPAIR') {
      const size=cat(Number(c.affectedArea),20,80); add(out,line('Siding repair labor','labor',keyed(p.repairHours?.[c.damageLevel],size)*p.laborHourlyRate*D.storyMultiplier[c.stories],false)); add(out,line('Siding repair materials','material',keyed(p.materialAllowance?.[c.damageLevel],size),true)); commonFlats(out,p,defaults);
    } else if (serviceType === 'FLAT_ROOF_REPLACEMENT') {
      const sqft=c.sqftMethod==='exact'?Number(c.roofSqft):({small:500,medium:1500,large:3000}[c.roofSqft]??1500); if (c.sqftMethod!=='exact') sizeAssumption(ctx,allow); const roofSqft=c.serviceScope==='partial'?sqft*Number(c.partialPercent)/100:sqft; const key=c.membraneType==='unknown'?'average':c.membraneType; if(c.membraneType==='unknown'){ctx.estimationUsed=true;ctx.priceDrivers.push('Membrane type unconfirmed - average membrane pricing used');} const layers=c.existingLayers==='unknown'?1:Number(c.existingLayers); if(c.existingLayers==='unknown'){ctx.estimationUsed=true;ctx.appliedRules.push('Layer count unconfirmed - estimated 1 layer');ctx.priceDrivers.push('Assumes 1 existing layer - additional layers add tear-off cost');} const access=keyed(D.accessMultiplier,c.accessDifficulty,1); add(out,line('Flat roof labor','labor',roofSqft*keyed(p.laborPerSqft,key)*access,false)); add(out,line('Membrane','material',roofSqft*keyed(p.membraneCostPerSqft,key),true)); if(c.buildingType==='commercial') add(out,line('Insulation','material',roofSqft*p.insulationPerSqft,true)); add(out,line('Tear-off','removal',roofSqft*layers*keyed(p.tearOffPerSqft,key)*access,false)); commonFlats(out,p,defaults,{disposalCents:p.disposalPerSqft?roofSqft*layers*p.disposalPerSqft:undefined});
    } else if (serviceType === 'FLAT_ROOF_REPAIR') {
      if (c.repairType==='unknown_leak') throw review('Flat roof leak source requires inspection before we can estimate accurately.'); if(c.leakPresent)ctx.urgencyFlags.push('Active leak reported - customer flagged as urgent'); const size=cat(Number(c.affectedArea),20,80); add(out,line('Flat roof repair labor','labor',keyed(p.patchRepairHours?.[c.repairType],size)*p.laborHourlyRate,false)); add(out,line('Flat roof repair materials','material',keyed(p.patchMaterialAllowance?.[c.repairType],size),true)); if(c.pondingWater&&p.pondingWaterSurcharge)add(out,line('Ponding water surcharge','addon',p.pondingWaterSurcharge,true)); commonFlats(out,p,defaults);
    } else if (serviceType === 'CUSTOM') {
      const qty = Number(c.quantity || 1); const mid = ((Number(p.low)+Number(p.high))/2)*qty; add(out,line(c.service || 'Custom service','labor',mid,false)); commonFlats(out,p,defaults);
    }
  } catch (e) { if (e.reviewReason) throw e; throw e; }
  out.laborSubtotal = out.lineItems.filter(i => i.category === 'labor').reduce((s,i)=>s+i.amountCents,0);
  return out;
}

export function matchServiceFromPricebook(description, services = []) {
  const text = String(description || '').toLowerCase();
  const exact = services.find(s => String(s.service || '').toLowerCase() === text);
  if (exact) return { matchStatus: 'exact_match', service: exact };
  const words = text.split(/\W+/).filter(w => w.length > 3);
  const scored = services.map(s => ({ service: s, score: words.filter(w => String(s.service || '').toLowerCase().includes(w)).length })).sort((a,b)=>b.score-a.score);
  if (!scored[0] || scored[0].score === 0) return { matchStatus: 'no_match' };
  return { matchStatus: scored[0].score >= 2 ? 'strong_match' : 'needs_confirmation', service: scored[0].service };
}
