import {writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {flatRepair,concrete,fixture} from '../engine-independent/fixtures.mjs';
import {offeringFixture} from '../../test/configuredOfferingsFixtures.mjs';

// November 25, 2026 (v49): repairs from Neon's audit of v48. Frozen inputs
// reaching each change in what a quote charges or why it is held (#1 is
// reached by the existing roof flashing-wording inputs). Run once; never edited.
const cases=[];
const add=(id,input)=>cases.push({id:'v49-20261125:'+id,input:structuredClone(input)});
const units=(f,unit,rate)=>{const p=f.ownerPricing.pricing,c=f.customerInputs,m=c.membraneType,r=c.repairType;p.repairPricingUnit={[m]:{[r]:unit}};p.repairUnitPrice={[m]:{[r]:rate}};p.installedLaborPercent={['repairUnitPrice.'+m+'.'+r]:60};return f;};

// #2 Repairs priced per foot or per item, with no affected area.
{const f=units(flatRepair(),'linear_feet',900);f.customerInputs.repairLengthLF=100;f.ownerPricing.pricing.largeRepairMaxSqft=150;delete f.customerInputs.affectedArea;add('flat-seam-100lf-no-area',f);
 const g=structuredClone(f);g.customerInputs.affectedArea=200;add('flat-seam-100lf-area-over-limit',g);}
{const f=flatRepair();f.customerInputs.repairType='pipe_boot';const id=randomUUID();f.ownerPricing.knownOfferings.repairType.pipe_boot=id;f.customerInputs.confirmedFacts.repairType={status:'identified',field:'repairType',value:'pipe_boot',offeringId:id};units(f,'each',8500);f.customerInputs.repairItemCount=3;delete f.customerInputs.affectedArea;add('flat-boots-3-no-area',f);}
// #6 Two wall colors with the ceiling on the same paint product.
{const f=fixture('INTERIOR_PAINTING',{laborPerWallSqftPerCoat:100,materialPerWallSqftPerCoat:30,minimumJob:0,ceilingLaborPerSqftPerCoat:80,ceilingMaterialPerSqftPerCoat:25},
  {areaInputMethod:'wall_sqft',wallAreaSqft:400,doorCount:2,windowCount:2,wallHeight:'standard',wallScopeUniform:true,surfaceCondition:'good',coats:2,ceilingsIncluded:true,ceilingAreaSqft:60,ceilingCoats:2,ceilingSurfaceCondition:'good',trimIncluded:false,wallColorCount:2,wallColorAreas:[{areaSqft:50},{areaSqft:280}]});
 f.ownerPricing.priceBasisByCategory.material='cost';const p=f.ownerPricing.pricing;p.scopeDetails={};p.scopeRates={};
 for(const key of ['paint_wall','paint_ceiling']){p.scopeDetails[key]={description:'[SYNTHETIC] '+key,mode:'package_cost',productKey:'paint',coverage:400,wastePercent:10};p.scopeRates[key]=5000;}
 f.customerInputs.paintProductsConfirmed=true;add('interior-two-colors-shared-ceiling-product',f);}
// #10 Thickened edge with one side against the house.
for(const adj of [false,true]){const f=concrete();Object.assign(f.customerInputs,{chuteAccess:'yes',baseNeeded:false,length:20,width:20,adjoinsExistingConcrete:adj,...(adj?{adjoiningEdgeLF:20}:{})});Object.assign(f.ownerPricing.pricing,{thickenedEdgeExtraDepthInches:4,thickenedEdgeWidthInches:12,concreteWasteFactor:0,isolationJointPricing:'included'});add('patio-thickened-edge-'+(adj?'one-side-adjoining':'free-standing'),f);}
// #12 Closed yard with a gate before a corner: blank, yes and no.
for(const corner of [undefined,true,false]){const f=offeringFixture('FENCING_INSTALL','installed');for(const k of ['linearFeet','cornerCount','gates','lfMethod'])delete f.customerInputs[k];
 f.customerInputs.fenceRuns=[{closed:true,sections:[{lengthLF:30,gateAfter:'walk',...(corner===undefined?{}:{cornerAfterGate:corner})},{lengthLF:50},{lengthLF:34},{lengthLF:50}]}];f.customerInputs.fenceRunCount=1;
 add('closed-yard-gate-corner-'+(corner===undefined?'blank':corner?'yes':'no'),f);}

writeFileSync(new URL('./corpus-additions-20261125-v49.json',import.meta.url),JSON.stringify(cases,null,1)+'\n');
console.log(cases.length+' inputs');
