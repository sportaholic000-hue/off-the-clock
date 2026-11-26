// The owner approval a saved service carries stays current across engine
// versions until a code change alters what that service type quotes.
// New-issues audit of v53: stamping approvals with ENGINE_VERSION paused every
// approved service at every business on every engine change, including
// changes that move no price for that service.
//
// Bump a service type's number when its frozen-job results change (prices,
// ranges, line items, items left for the site visit or review reasons). The
// gate (test/approvalVersions20261125.spec.mjs) compares each type's results
// with verification/engine-fingerprint/approval-history.json and fails when
// they changed without a bump, so saved approvals never silently authorize
// new formulas.
export const APPROVAL_VERSIONS = Object.freeze({
  ROOFING_REPLACEMENT: 1,
  ROOFING_REPAIR: 1,
  FLAT_ROOF_REPLACEMENT: 1,
  FLAT_ROOF_REPAIR: 1,
  INTERIOR_PAINTING: 1,
  EXTERIOR_PAINTING: 1,
  FLOORING_INSTALL: 2, // v55: removal in older buildings quotes for materials that cannot contain asbestos
  FLOORING_REPLACEMENT: 2, // v55: removal in older buildings quotes for materials that cannot contain asbestos
  FENCING_INSTALL: 1,
  FENCING_REPLACEMENT: 1,
  SIDING_REPLACEMENT: 2, // v55: removal in older buildings quotes for materials that cannot contain asbestos
  SIDING_REPAIR: 1,
  CONCRETE_DRIVEWAY: 1,
  CONCRETE_PATIO_SLAB: 1,
  LANDSCAPING_CLEANUP: 1,
  LANDSCAPING_MULCH: 1,
  LANDSCAPING_SOD: 1,
  LANDSCAPING_PLANTING: 1,
  LANDSCAPING_MOWING: 1,
  CUSTOM: 1
});

export function approvalVersionFor(serviceType) {
  return Object.hasOwn(APPROVAL_VERSIONS, serviceType) ? APPROVAL_VERSIONS[serviceType] : undefined;
}

// A receipt stamped with an approval version is current while its service
// type's version is unchanged. A receipt from before approval versions (none
// stamped) is current only on the engine version it was approved under.
export function approvalReceiptCurrent(receipt, serviceType, engineVersion) {
  if (!receipt || typeof receipt !== 'object') return false;
  const current = approvalVersionFor(serviceType);
  if (Object.hasOwn(receipt, 'approvalVersion')) return current !== undefined && receipt.approvalVersion === current;
  return receipt.engineVersion === engineVersion;
}
