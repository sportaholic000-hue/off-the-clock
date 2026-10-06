// Storage shape checks are deliberately separate from pricing readiness.
// An incomplete draft is valid storage; arrays/null in object containers are not.
const record = value => value !== null && typeof value === 'object' &&
  !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));

export function validPricebookServiceId(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function pricebookStructureIssue(book) {
  if (!record(book)) return 'the file is not a price book';
  if (!Array.isArray(book.services)) return 'the service list is missing or malformed';
  if (!record(book.defaults)) return 'the business settings are missing or malformed';
  for (let index = 0; index < book.services.length; index++) {
    const service = book.services[index], label = `service ${index + 1}`;
    if (!record(service)) return `${label} is not an object`;
    if (service.pricing !== undefined && !record(service.pricing)) return `${label} pricing is not an object`;
    if (service.tiers === undefined) continue;
    if (!Array.isArray(service.tiers)) return `${label} tiers are not a list`;
    for (let tierIndex = 0; tierIndex < service.tiers.length; tierIndex++) {
      const tier = service.tiers[tierIndex];
      if (!record(tier)) return `${label} tier ${tierIndex + 1} is not an object`;
      if (tier.overrides !== undefined && !record(tier.overrides)) return `${label} tier ${tierIndex + 1} overrides are not an object`;
    }
  }
  return null;
}
