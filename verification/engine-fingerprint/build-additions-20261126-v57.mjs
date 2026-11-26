import {writeFileSync} from 'node:fs';
import {flatRepair,flooring,mowing} from '../engine-independent/fixtures.mjs';
import {offeringFixture} from '../../test/configuredOfferingsFixtures.mjs';
import {confirmedFixtureInputs} from '../../test/quoteEngineVNextFixtures.mjs';
import {concreteFixture} from '../../test/quoteConcreteLandscape20261016Fixture.mjs';
import {measuredScopeCases} from '../../test/measuredScopeFixtures.mjs';
import {roofFixture} from '../qe-agent2-price-metadata-20261018/fixtures.mjs';

// November 26, 2026 (v57): the v56 audit (V56-1 to V56-3) and the verdicts
// audit backlog (purchase quantities). Run once; never edited. The carpet
// cut-plan search is pinned by test/backlog-v57/carpetCutPlanSearch.spec.mjs.
const cases=[];
const add=(id,input)=>cases.push({id:'v57-20261126:'+id,input:structuredClone(input)});
{const f=flatRepair(),p=f.ownerPricing.pricing,c=f.customerInputs;
  p.repairPricingUnit={epdm:{seam_patch:'linear_feet',patch:'square_feet'}};p.repairUnitPrice={epdm:{seam_patch:900,patch:1500}};
  p.installedLaborPercent={'repairUnitPrice.epdm.seam_patch':60,'repairUnitPrice.epdm.patch':60};delete p.patchRepairHours;delete p.patchMaterialAllowance;delete p.largeRepairMaxSqft;
  const inputs=confirmedFixtureInputs({...c,repairLengthLF:20});delete inputs.affectedArea;f.customerInputs=inputs;add('flat-repair-per-foot-beside-incomplete-area-row',f);}
{const f=flooring('vinyl_plank',200),p=f.ownerPricing.pricing;p.removalPerSqft={hardwood:100};delete p.olderMaterialRemoval;
  const {confirmedFacts,...rest}=f.customerInputs;
  f.customerInputs=confirmedFixtureInputs({...rest,existingFloorType:'hardwood',removalNeeded:true,removalAreaSqft:250,buildingAge:'before_1978',floorConstructionKnown:'yes',woodFloorAssembly:'joists'});
  add('flooring-hardwood-on-joists-removal-pre-1978',f);}
{const f=mowing();f.ownerPricing.feeRules={...f.ownerPricing.feeRules,travel:'always'};f.ownerPricing.taxPercent=0;
  f.businessDefaults={...f.businessDefaults,businessCountry:'CA',businessProvince:'ON',currency:'CAD',taxMode:'TAX_ALL',taxPercent:13,travelZones:[{name:'Gatineau',codes:['J8X'],charge:5000},{name:'Ottawa Core',codes:['K1A','K1P'],charge:0}]};
  f.customerInputs={...f.customerInputs,postalCode:'J8X 2K1'};add('mowing-zero-tax-gatineau',f);}
{const f=concreteFixture();Object.assign(f.ownerPricing.pricing,{baseDepthInches:4,baseCompactionAllowance:0.2,baseGravelPerCubicYard:5000,baseExcavationGradingPerSqft:100,baseGravelOrderIncrementCubicYards:1});
  f.customerInputs.baseNeeded=true;add('concrete-gravel-increment-1',f);}
{const f=structuredClone(measuredScopeCases().find(r=>r.id==='commercial-itemized').input);
  Object.assign(f.customerInputs,{roofSqft:100,insulationAreaSqft:100,coverboardAreaSqft:100,accessDifficulty:'easy'});Object.assign(f.ownerPricing.pricing,{insulationBoardSqft:32,coverboardBoardSqft:32});
  add('flat-roof-whole-boards-32',f);}
{const f=roofFixture();Object.assign(f.customerInputs,{starterLengthLF:180,dripEdgeLengthLF:180,ridgeCapLengthLF:50});
  Object.assign(f.ownerPricing.pricing,{starterPerLF:100,dripEdgePerLF:200,ridgeCapPerLF:300,starterBundleLF:105,dripEdgePieceLF:10,ridgeCapBundleLF:33});add('roof-accessory-packages',f);}
{const f=offeringFixture('FENCING_INSTALL','itemized');f.ownerPricing.pricing.offeringDetails.infillRollLF=50;add('fence-infill-rolls-50',f);}
writeFileSync(new URL('./corpus-additions-20261126-v57.json',import.meta.url),JSON.stringify(cases,null,1)+'\n');
console.log(cases.length+' inputs');
