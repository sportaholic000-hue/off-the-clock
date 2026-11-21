// An existing lawn keeps the combined ground-preparation package until removal
// and grading both have their own prices; imported topsoil with its own price
// is a separate line either way. Expected totals were worked by hand first.
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateQuoteVNext} from '../server/quote-engine-vnext/index.js';
import {sodPreparationNotice} from '../server/quote-engine-vnext/concreteLandscapePricing.js';
import {fixture} from '../verification/engine-independent/fixtures.mjs';

// 1,000 sq ft. Sod: 1,050 sq ft with 5% waste -> 3 pallets of 450 = 1,350 x $0.55 = $742.50.
// Installation 1,000 x $0.60 = $600.00. Package 1,000 x $1.50 = $1,500.00.
// Removal 1,000 x $0.75 = $750.00. Grading 1,000 x $0.60 = $600.00.
// Topsoil 1,000 x (4 - 2) in / 324 x 1.10 = 6.7901 yd3 x $40 = $271.60.
const BASE={sodMaterialPerSqft:55,sodInstallLaborPerSqft:60,minimumServiceCharge:0,sodPalletSizeSqft:450,partialPackagePricing:'whole_packages',topsoilTargetDepthInches:4,topsoilTypicalImportDepthInches:2};
const COMBINED={groundPrepPerSqft:150,groundPrepLaborPercent:70};
const REMOVAL={sodRemovalPerSqft:75},GRADING={sodGradingPerSqft:60},TOPSOIL={topsoilPerCubicYard:4000};
const job=(pricing,customer={})=>fixture('LANDSCAPING_SOD',{...BASE,...pricing},{sodSqft:1000,sqftMethod:'exact',groundPrepNeeded:true,existingLawnToRemove:true,slope:'flat',accessDifficulty:'easy',...(pricing.topsoilPerCubicYard?{usableTopsoilDepthInches:2}:{}),...customer});
const quote=f=>generateQuoteVNext(f);
const mid=f=>{const q=quote(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify([q.reviewReason,q.missingCustomerFields,q.missingOwnerFields]));return q.options[0].calculationRecord.scenarios.mid;};
const total=f=>mid(f).finalTotalCents;
const names=f=>mid(f).lineItems.map(line=>line.name);
const PACKAGE=284250,TOPSOIL_LINE=27160;
const PACKAGE_LINES=['Sod material','Sod installation labor','Ground preparation'];

test('V41: an existing lawn keeps the package until removal and grading both have prices',()=>{
  assert.equal(total(job(COMBINED)),PACKAGE);
  for (const extra of [GRADING,REMOVAL]) {
    assert.equal(total(job({...COMBINED,...extra})),PACKAGE,JSON.stringify(extra));
    assert.deepEqual(names(job({...COMBINED,...extra})),PACKAGE_LINES);
  }
});

test('V41: a topsoil price adds its own line to the package and drops nothing',()=>{
  for (const extra of [TOPSOIL,{...GRADING,...TOPSOIL},{...REMOVAL,...TOPSOIL}]) {
    const f=job({...COMBINED,...extra});
    assert.equal(total(f),PACKAGE+TOPSOIL_LINE,JSON.stringify(extra)); // 3,114.10
    assert.deepEqual(names(f),[...PACKAGE_LINES,'Imported topsoil']);
    const topsoil=mid(f).lineItems.find(line=>line.name==='Imported topsoil');
    assert.equal(topsoil.amountCents,TOPSOIL_LINE);
    assert.equal(topsoil.category,'material');
  }
  // Enough topsoil already: no line, package unchanged.
  assert.equal(total(job({...COMBINED,...TOPSOIL},{usableTopsoilDepthInches:4})),PACKAGE);
  // Not sure: the typical 2 in allowance, the same 6.7901 yd3.
  assert.equal(total(job({...COMBINED,...TOPSOIL},{usableTopsoilDepthInches:'unknown'})),PACKAGE+TOPSOIL_LINE);
});

test('V41: the topsoil depth and its settings are still required with the package',()=>{
  const f=job({...COMBINED,...TOPSOIL});delete f.customerInputs.usableTopsoilDepthInches;
  assert.deepEqual(quote(f).missingCustomerFields,['usableTopsoilDepthInches']);
  const noTarget=job({...COMBINED,...TOPSOIL,topsoilTargetDepthInches:undefined});
  assert.ok(quote(noTarget).missingOwnerFields.includes('topsoilTargetDepthInches'));
  const noTypical=job({...COMBINED,...TOPSOIL,topsoilTypicalImportDepthInches:undefined},{usableTopsoilDepthInches:'unknown'});
  assert.ok(quote(noTypical).missingOwnerFields.includes('topsoilTypicalImportDepthInches'));
});

test('V41: removal and grading together itemize the lawn, as before',()=>{
  const both=job({...COMBINED,...REMOVAL,...GRADING});
  assert.equal(total(both),269250); // 742.50 + 600 + 750 + 600
  assert.deepEqual(names(both),['Sod material','Sod installation labor','Old-lawn removal with disposal','Sod grading']);
  const all=job({...COMBINED,...REMOVAL,...GRADING,...TOPSOIL});
  assert.equal(total(all),296410); // + 271.60
});

test('V41: without a combined price, and on bare ground, nothing changes',()=>{
  assert.equal(total(job({...GRADING})),194250); // 742.50 + 600 + 600
  assert.equal(total(job({...TOPSOIL})),161410); // 742.50 + 600 + 271.60
  const bare={existingLawnToRemove:false};
  assert.equal(total(job({...COMBINED,...GRADING},bare)),194250);
  assert.equal(total(job({...COMBINED,...GRADING,...TOPSOIL},bare)),221410); // 742.50 + 600 + 600 + 271.60
  assert.deepEqual(quote(job(COMBINED,bare)).missingOwnerFields,['sodGradingPerSqft']);
});

test('V41: slope and access adjust the package labor share and leave topsoil alone',()=>{
  const f=job({...COMBINED,...TOPSOIL},{slope:'steep',accessDifficulty:'difficult'});
  const lines=mid(f).lineItems,factor=lines.find(line=>line.name==='Sod installation labor').amountCents/60000;
  assert.ok(factor>1);
  assert.equal(lines.find(line=>line.name==='Ground preparation').amountCents,Math.round(150000*(1+0.7*(factor-1))));
  assert.equal(lines.find(line=>line.name==='Imported topsoil').amountCents,TOPSOIL_LINE);
});

test('V41: the owner notice names the method that applies',()=>{
  const use='Existing lawns use your combined Ground preparation price';
  assert.equal(sodPreparationNotice({...COMBINED}),null);
  assert.equal(sodPreparationNotice({...COMBINED,...GRADING}),use+'. Bare ground uses your grading price; imported topsoil is extra.');
  assert.equal(sodPreparationNotice({...COMBINED,...TOPSOIL}),use+', with imported topsoil charged on its own line. Bare ground uses your topsoil price; grading is left for the site visit until it has its own price.');
  assert.equal(sodPreparationNotice({...COMBINED,...GRADING,...TOPSOIL}),use+', with imported topsoil charged on its own line. Bare ground uses your grading and topsoil prices.');
  assert.equal(sodPreparationNotice({...COMBINED,...REMOVAL}),use+'. Your old-lawn removal price is not used until grading also has its own price.');
  assert.equal(sodPreparationNotice({...COMBINED,...REMOVAL,...GRADING}),'Your combined Ground preparation price is not used while a separate preparation price is set. Quotes leave imported topsoil out and estimate it at the site visit until it has a separate price.');
  assert.equal(sodPreparationNotice({...COMBINED,...REMOVAL,...GRADING,...TOPSOIL}),'Your combined Ground preparation price is not used while a separate preparation price is set.');
});
