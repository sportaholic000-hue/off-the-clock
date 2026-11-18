import {installedPriceDefinitions,installedLaborFactorPath} from '../../server/installedPriceConfiguration.js';
import {mergePricingForValidationVNext} from '../../server/quote-engine-vnext/pricingMerge.js';
import {servicePricing} from './pricebookEditing.js';
import {humanPricingKey} from './pricebookFormatting.js';
import {roofProductLowSlopeMethod,roofProductThreeTab} from '../../server/quote-engine-vnext/roofSlopeRules.js';
import {keyLabel} from '../../server/productNames.js';

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

// The customer answer that adjusts installed-price labor, by service. The same
// conditions readiness checks (laborAdjustmentCoverage in priceBook.js).
const LABOR_CONDITIONS = {
  FENCING_INSTALL: ['terrainSlope', ['flat', 'moderate', 'steep']],
  FENCING_REPLACEMENT: ['terrainSlope', ['flat', 'moderate', 'steep']],
  INTERIOR_PAINTING: ['wallHeight', ['standard', 'high', 'vaulted']],
  EXTERIOR_PAINTING: ['stories', [1, 2, 3]],
  SIDING_REPLACEMENT: ['stories', [1, 2, 3]],
  FLAT_ROOF_REPLACEMENT: ['accessDifficulty', ['easy', 'moderate', 'difficult']],
  ROOFING_REPLACEMENT: ['stories', [1, 2, 3]],
  CONCRETE_DRIVEWAY: ['accessDifficulty', ['easy', 'moderate', 'difficult']],
  CONCRETE_PATIO_SLAB: ['accessDifficulty', ['easy', 'moderate', 'difficult']]
};
const at = (object, path) => path.split('.').reduce((value, key) => value?.[key], object);
// Installed prices whose labor is adjusted by a customer answer (factor not 1)
// with no labor portion entered, on the base service or a price option after
// inheritance. Those jobs go to review; other jobs quote. An entered 0 is an answer.
export function laborPortionReviewRows(service, meta) {
  const condition = LABOR_CONDITIONS[service?.serviceType];
  if (!condition || !record(service)) return [];
  const [field, values] = condition;
  const customerField = (meta?.customerFields || []).find(item => (item.name || item.field) === field);
  const fieldLabel = customerField?.label || humanPricingKey(field);
  const answerLabel = value => customerField?.optionLabels?.[value] || humanPricingKey(String(value));
  const base = servicePricing(service) || {};
  // A service with price options quotes each option; one without quotes the base.
  const tiers = Array.isArray(service.tiers) ? service.tiers.filter(record) : [];
  const variants = tiers.length ? tiers.map(tier => [mergePricingForValidationVNext(base, record(tier.overrides) ? tier.overrides : {}), typeof tier.name === 'string' && tier.name.trim() ? tier.name.trim() : 'Price option']) : [[base, null]];
  const rows = [], seen = new Set();
  for (const [pricing, option] of variants) {
    for (const [path, label] of Object.entries(installedPriceDefinitions(service.serviceType, pricing))) {
      if (record(pricing.installedLaborPercent) && Object.hasOwn(pricing.installedLaborPercent, path)) continue;
      const answers = values.filter(value => {
        const factorPath = installedLaborFactorPath(service.serviceType, {[field]: value}, path), factor = factorPath ? at(pricing, factorPath) : undefined;
        return typeof factor === 'number' && factor !== 1;
      });
      if (!answers.length) continue;
      const text = `${option ? `${label} (${option})` : label}: ${fieldLabel} ${answers.map(answerLabel).join(', ')}`;
      if (!seen.has(text)) { seen.add(text); rows.push(text); }
    }
  }
  return rows;
}

// Asphalt shingle products on the cemented low-slope method (NBC 9.26.8) that
// are not marked 3-tab. Their roofs from 2/12 to under 4/12 go to the owner for
// review (roofLowSlopeMethod: 'three_tab_unconfirmed'). Read as the engine
// quotes: each price option after inheritance from the base prices when the
// service has options (engine.js quotes only the options then), else the base
// prices; a saved service-wide choice stands for every asphalt product. Only
// under the NBC: under the IRC the cemented method is not offered, so a 3-tab
// answer would not change where those roofs go. Listed by owner name, once each.
export function cementedWithoutThreeTabProducts(service) {
  if (!record(service) || service.serviceType !== 'ROOFING_REPLACEMENT') return [];
  const base = servicePricing(service) || {};
  const tiers = Array.isArray(service.tiers) ? service.tiers.filter(record) : [];
  const variants = tiers.length ? tiers.map(tier => mergePricingForValidationVNext(base, record(tier.overrides) ? tier.overrides : {})) : [base];
  const names = [];
  for (const pricing of variants) {
    if (pricing?.roofBuildingCode !== 'nbc' || !record(pricing.roofProductClass)) continue;
    for (const [product, productClass] of Object.entries(pricing.roofProductClass)) {
      if (productClass !== 'asphalt_shingle') continue;
      if (roofProductLowSlopeMethod(pricing, product) !== 'nbc_low_slope_application' || roofProductThreeTab(pricing, product) === true) continue;
      const name = keyLabel(product);
      if (!names.includes(name)) names.push(name);
    }
  }
  return names;
}
