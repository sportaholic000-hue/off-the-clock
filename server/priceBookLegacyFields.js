// Compatibility metadata for existing price-book fields; no quote calculations.
export const SERVICE_TYPES = [
  'ROOFING_REPLACEMENT','ROOFING_REPAIR','FLAT_ROOF_REPLACEMENT','FLAT_ROOF_REPAIR',
  'INTERIOR_PAINTING','EXTERIOR_PAINTING','FLOORING_INSTALL','FLOORING_REPLACEMENT',
  'FENCING_INSTALL','FENCING_REPLACEMENT','SIDING_REPLACEMENT','SIDING_REPAIR',
  'CONCRETE_DRIVEWAY','CONCRETE_PATIO_SLAB','LANDSCAPING_CLEANUP','LANDSCAPING_MULCH',
  'LANDSCAPING_SOD','LANDSCAPING_PLANTING','LANDSCAPING_MOWING','CUSTOM'
];

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

