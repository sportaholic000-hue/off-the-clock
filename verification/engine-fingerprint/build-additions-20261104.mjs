// One-time build of corpus-additions-20261104.json: inputs for the November 4,
// 2026 fixes (excluded control joints, flat-roof details without their own
// price). Run once; the output file is never edited.
// Usage: node --import ./test/pricebookTestEnv.mjs verification/engine-fingerprint/build-additions-20261104.mjs
import {writeFileSync} from 'node:fs';
import {concrete,flatRoof} from '../engine-independent/fixtures.mjs';
const rows=[];const add=(id,input)=>rows.push({id,input:structuredClone(input)});
{const f=concrete();f.ownerPricing.pricing.controlJointPricing='excluded';delete f.ownerPricing.pricing.sawCutPerLF;add('audit-20261104:joints-excluded-unpriced',f);}
{const f=concrete();f.ownerPricing.pricing.controlJointPricing='included';add('audit-20261104:joints-included',f);}
{const f=flatRoof();f.ownerPricing.pricing.flatRoofItemBasis.flatRoofEdgeMetalPerLF='included_in_base';f.customerInputs.edgeMetalLF=50;add('audit-20261104:flat-roof-included-detail-quantity',f);}
{const f=flatRoof();f.customerInputs.edgeMetalLF=50;add('audit-20261104:flat-roof-on-site-detail-quantity',f);}
writeFileSync(new URL('./corpus-additions-20261104.json',import.meta.url),JSON.stringify(rows));
console.log(rows.length+' inputs');
