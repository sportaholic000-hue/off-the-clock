import {installedPriceDefinitions,installedLaborFactorPath} from '../../server/installedPriceConfiguration.js';
import {mergePricingForValidationVNext} from '../../server/quote-engine-vnext/pricingMerge.js';
import {servicePricing} from './pricebookEditing.js';
import {humanPricingKey} from './pricebookFormatting.js';
import {roofProductLowSlopeMethod,roofProductThreeTab} from '../../server/quote-engine-vnext/roofSlopeRules.js';
import {fenceCatalog,fenceHasRows,fenceHeightRows} from '../../server/quote-engine-vnext/fencePricing.js';
import {formatFenceHeight} from '../../server/quote-engine-vnext/configuredOfferings.js';
import {combinedPrepUsed,combinedPrepLaborGap,laborShareSet} from '../../server/quote-engine-vnext/concreteLandscapePricing.js';
import {keyLabel} from '../../server/productNames.js';

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);

// Expand catalog fences (fenceOfferings) and height-row layouts into the
// resolved pricing variants that quotes actually price, without throwing on
// half-edited rows in the price-book editor.
function fenceRowVariants(base, serviceTiers) {
  const catalog = fenceCatalog(base);
  const offers = catalog ? Object.entries(base.fenceOfferings) : [[base.offeringDetails?.fenceType ?? null, base]];
  const variants = [];
  for (const [type, offer] of offers) {
    if (!record(offer)) continue;
    const rawTiers = catalog ? offer.tiers : serviceTiers;
    const tiers = Array.isArray(rawTiers) ? rawTiers.filter(record) : [];
    const tierList = tiers.length ? tiers : [{name: null, overrides: {}}];
    for (const tier of tierList) {
      const effective = mergePricingForValidationVNext(offer, record(tier.overrides) ? tier.overrides : {});
      const tierLabel = typeof tier.name === 'string' && tier.name.trim() ? tier.name.trim() : null;
      for (const [rowKey, row] of Object.entries(fenceHeightRows(effective))) {
        if (!record(row)) continue;
        const {tiers: _t, heightRows: _h, ...settings} = effective;
        const pricing = {
          ...base,
          ...settings,
          offeringDetails: {...(record(effective.offeringDetails) ? effective.offeringDetails : {}), fenceHeight: row.exactHeight ?? row.maximumHeight},
          offeringRates: record(row.offeringRates) ? {...row.offeringRates} : {},
          postSpacingLF: row.postSpacingLF,
          installedLaborPercent: {...(record(effective.installedLaborPercent) ? effective.installedLaborPercent : {}), ...(record(row.installedLaborPercent) ? row.installedLaborPercent : {})},
          installedMaterialsPercent: {...(record(effective.installedMaterialsPercent) ? effective.installedMaterialsPercent : {}), ...(record(row.installedMaterialsPercent) ? row.installedMaterialsPercent : {})}
        };
        const heightLabel = Object.hasOwn(row, 'exactHeight') && typeof row.exactHeight === 'number' && Number.isFinite(row.exactHeight) && row.exactHeight > 0
          ? formatFenceHeight(row.exactHeight)
          : typeof row.minimumHeight === 'number' && Number.isFinite(row.minimumHeight) && typeof row.maximumHeight === 'number' && Number.isFinite(row.maximumHeight) && row.maximumHeight > 0
            ? 'over ' + formatFenceHeight(row.minimumHeight) + ' up to ' + formatFenceHeight(row.maximumHeight)
            : keyLabel(rowKey);
        const option = [catalog ? keyLabel(type) : null, tierLabel, heightLabel].filter(Boolean).join(' · ') || null;
        variants.push([pricing, option]);
      }
    }
  }
  return variants;
}

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
    // Combined concrete base preparation and sod ground preparation also take
    // busy-season surcharges only on their entered labor share.
    if (service.serviceType?.startsWith('CONCRETE_') && combinedPrepUsed(service.serviceType, {baseNeeded: true}, pricing) && typeof pricing.basePrepPerSqft === 'number' && pricing.basePrepPerSqft > 0 && !laborShareSet(pricing.basePrepLaborPercent)) {
      const text = option ? `Base preparation (${option})` : 'Base preparation';
      if (!seen.has(text)) { seen.add(text); rows.push(text); }
    }
    if (service.serviceType === 'LANDSCAPING_SOD' && combinedPrepUsed('LANDSCAPING_SOD', {groundPrepNeeded: true, existingLawnToRemove: true}, pricing) && typeof pricing.groundPrepPerSqft === 'number' && pricing.groundPrepPerSqft > 0 && !laborShareSet(pricing.groundPrepLaborPercent)) {
      const text = option ? `Ground preparation (${option})` : 'Ground preparation';
      if (!seen.has(text)) { seen.add(text); rows.push(text); }
    }
  };
  if (service.serviceType?.startsWith('FENCING_') && fenceHasRows(base)) {
    for (const [pricing, option] of fenceRowVariants(base, service.tiers)) collect(pricing, option);
    return rows;
  }
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
  if (!record(service)) return [];
  const base = servicePricing(service) || {};
  // A service with price options quotes each option; one without quotes the base.
  const tiers = Array.isArray(service.tiers) ? service.tiers.filter(record) : [];
  const variants = service.serviceType?.startsWith('FENCING_') && fenceHasRows(base)
    ? fenceRowVariants(base, service.tiers)
    : tiers.length ? tiers.map(tier => [mergePricingForValidationVNext(base, record(tier.overrides) ? tier.overrides : {}), typeof tier.name === 'string' && tier.name.trim() ? tier.name.trim() : 'Price option']) : [[base, null]];
  const rows = [], seen = new Set();
  const fieldMeta = name => {
    const item = (meta?.customerFields || []).find(f => (f.name || f.field) === name);
    return {
      label: item?.label || humanPricingKey(name),
      answer: value => item?.optionLabels?.[value] || humanPricingKey(String(value))
    };
  };
  if (service.serviceType === 'LANDSCAPING_SOD') {
    const slopeMeta = fieldMeta('slope'), accessMeta = fieldMeta('accessDifficulty');
    const slopes = ['flat', 'moderate', 'steep'], accesses = ['easy', 'moderate', 'difficult'];
    for (const [pricing, option] of variants) {
      const gapPairs = [];
      for (const slope of slopes) for (const accessDifficulty of accesses) {
        if (combinedPrepLaborGap('LANDSCAPING_SOD', {groundPrepNeeded: true, existingLawnToRemove: true, slope, accessDifficulty}, pricing)) {
          gapPairs.push([slope, accessDifficulty]);
        }
      }
      if (!gapPairs.length) continue;
      const badSlopes = slopes.filter(s => typeof pricing.slopeMultiplier?.[s] === 'number' && pricing.slopeMultiplier[s] !== 1);
      const badAccess = accesses.filter(a => typeof pricing.accessMultiplier?.[a] === 'number' && pricing.accessMultiplier[a] !== 1);
      const parts = [];
      if (badSlopes.length) parts.push(`${slopeMeta.label} ${badSlopes.map(slopeMeta.answer).join(', ')}`);
      if (badAccess.length) parts.push(`${accessMeta.label} ${badAccess.map(accessMeta.answer).join(', ')}`);
      const detail = parts.length ? parts.join('; ') : gapPairs.map(([s, a]) => `${slopeMeta.answer(s)} / ${accessMeta.answer(a)}`).join(', ');
      const text = `${option ? `Ground preparation (${option})` : 'Ground preparation'}: ${detail}`;
      if (!seen.has(text)) { seen.add(text); rows.push(text); }
    }
    return rows;
  }
  const condition = LABOR_CONDITIONS[service.serviceType];
  if (!condition) return [];
  const [field, values] = condition;
  const {label: fieldLabel, answer: answerLabel} = fieldMeta(field);
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
    if (service.serviceType.startsWith('CONCRETE_')) {
      const answers = values.filter(value => combinedPrepLaborGap(service.serviceType, {baseNeeded: true, accessDifficulty: value}, pricing) !== null);
      if (answers.length) {
        const text = `${option ? `Base preparation (${option})` : 'Base preparation'}: ${fieldLabel} ${answers.map(answerLabel).join(', ')}`;
        if (!seen.has(text)) { seen.add(text); rows.push(text); }
      }
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
