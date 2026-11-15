import {installedPriceDefinitions} from '../../server/installedPriceConfiguration.js';
import {mergePricingForValidationVNext} from '../../server/quote-engine-vnext/pricingMerge.js';
import {servicePricing} from './pricebookEditing.js';

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);

// The busy-season surcharge this service charges: its own settings, else the business's.
export function effectiveSurcharge(service, defaults = {}) {
  const percent = service?.peakSurchargePercent !== undefined ? service.peakSurchargePercent : defaults?.peakSurchargePercent;
  const months = service?.peakMonths !== undefined ? service.peakMonths : defaults?.peakMonths;
  return typeof percent === 'number' && percent > 0 && Array.isArray(months) && months.length > 0 ? percent : null;
}

// Installed prices, on the base service or a price option after inheritance, that
// have no labor portion entered and so carry no surcharge. An entered 0 is the
// owner's answer and is not listed.
export function installedPricesWithoutLaborPortion(service) {
  if (!record(service)) return [];
  const base = servicePricing(service) || {};
  const rows = [], seen = new Set();
  const collect = (pricing, option) => {
    for (const [path, label] of Object.entries(installedPriceDefinitions(service.serviceType, pricing))) {
      if (record(pricing.installedLaborPercent) && Object.hasOwn(pricing.installedLaborPercent, path)) continue;
      const text = option ? `${label} (${option})` : label;
      if (!seen.has(text)) { seen.add(text); rows.push(text); }
    }
  };
  collect(base, null);
  for (const tier of Array.isArray(service.tiers) ? service.tiers : []) {
    if (!record(tier)) continue;
    collect(mergePricingForValidationVNext(base, record(tier.overrides) ? tier.overrides : {}), typeof tier.name === 'string' && tier.name.trim() ? tier.name.trim() : 'Price option');
  }
  return rows;
}

export function surchargeLaborNotice(service, defaults) {
  const percent = effectiveSurcharge(service, defaults);
  if (percent === null || service?.serviceType === 'CUSTOM') return null;
  const prices = installedPricesWithoutLaborPortion(service);
  return prices.length ? {percent, prices} : null;
}
