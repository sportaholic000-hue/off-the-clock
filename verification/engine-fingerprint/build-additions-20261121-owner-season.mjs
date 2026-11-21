import {writeFileSync} from 'node:fs';
import {roof, paint} from '../qe-agent1-core-accuracy-20261018/fixtures.mjs';
import {custom} from '../engine-independent/fixtures.mjs';

function busySeason(fixture) {
  Object.assign(fixture.ownerPricing, {peakMonths: [7], peakSurchargePercent: 10});
  fixture.customerInputs.workMonth = 'july';
  fixture.currentMonth = 7;
  fixture.businessDefaults.markupPercent = 50;
  return fixture;
}

const pitched = busySeason(roof({roofSizeInput: 2400, pitchBand: 'up_to_six'}, {laborPerSquare: {asphalt_shingle: 15000}}));
for (const category of Object.keys(pitched.businessDefaults.markupApplies)) pitched.businessDefaults.markupApplies[category] = category === 'labor';
delete pitched.ownerPricing.priceBasisByCategory.surcharge;
delete pitched.ownerPricing.taxabilityByCategory.surcharge;
delete pitched.businessDefaults.markupApplies.surcharge;

const painting = busySeason(paint());
painting.customerInputs.trimSurfaceCondition = 'fair';
for (const category of Object.keys(painting.businessDefaults.markupApplies)) painting.businessDefaults.markupApplies[category] = category === 'prep';

const historical = busySeason(custom());
historical.ownerPricing.pricing.customChargeClassification = 'surcharge';
historical.ownerPricing.priceBasisByCategory.surcharge = 'cost';
historical.businessDefaults.markupApplies.surcharge = true;

const cases = [['roof-24-squares', pitched], ['painting-prep', painting], ['legacy-custom', historical]]
  .map(([id, input]) => ({id: 'owner-season-20261121:' + id, input}));
writeFileSync(new URL('./corpus-additions-20261121-owner-season.json', import.meta.url), JSON.stringify(cases, null, 2) + '\n');
