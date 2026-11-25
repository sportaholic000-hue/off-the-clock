import {writeFileSync} from 'node:fs';
import {flatRepair,concrete,fixture} from '../engine-independent/fixtures.mjs';

// November 25, 2026 (v50): repairs from Neon's re-audit of v49. Frozen inputs
// reaching each change in what a quote charges or says (NEW-1 per-foot repair
// with no area is already reached by the v49 inputs). Run once; never edited.
const cases=[];
const add=(id,input)=>cases.push({id:'v50-20261125:'+id,input:structuredClone(input)});
// NEW-1 A per-foot repair with an area given: the driver is the length.
{const f=flatRepair(),p=f.ownerPricing.pricing,c=f.customerInputs,m=c.membraneType,r=c.repairType;p.repairPricingUnit={[m]:{[r]:'linear_feet'}};p.repairUnitPrice={[m]:{[r]:900}};p.installedLaborPercent={['repairUnitPrice.'+m+'.'+r]:60};c.repairLengthLF=100;c.affectedArea=40;add('flat-seam-100lf-area-40',f);}
// NEW-6 One wall color with the ceiling on the same paint product.
{const f=fixture('INTERIOR_PAINTING',{laborPerWallSqftPerCoat:100,materialPerWallSqftPerCoat:30,minimumJob:0,ceilingLaborPerSqftPerCoat:80,ceilingMaterialPerSqftPerCoat:25},
  {areaInputMethod:'wall_sqft',wallAreaSqft:250,doorCount:0,windowCount:0,wallHeight:'standard',wallScopeUniform:true,surfaceCondition:'good',coats:2,ceilingsIncluded:true,ceilingAreaSqft:100,ceilingCoats:2,ceilingSurfaceCondition:'good',trimIncluded:false,wallColorCount:1});
 f.ownerPricing.priceBasisByCategory.material='cost';const p=f.ownerPricing.pricing;p.scopeDetails={};p.scopeRates={};
 for(const key of ['paint_wall','paint_ceiling']){p.scopeDetails[key]={description:'[SYNTHETIC] '+key,mode:'package_cost',productKey:'paint',coverage:400,wastePercent:10};p.scopeRates[key]=5000;}
 f.customerInputs.paintProductsConfirmed=true;add('interior-one-color-shared-ceiling-product',f);}
// NEW-5 Thickened edge against the house: walkway, L-corner, outlines.
const slab=inputs=>{const f=concrete();Object.assign(f.customerInputs,{chuteAccess:'yes',baseNeeded:false},inputs);Object.assign(f.ownerPricing.pricing,{thickenedEdgeExtraDepthInches:4,thickenedEdgeWidthInches:12,concreteWasteFactor:0,isolationJointPricing:'included'});return f;};
const outline=(points,adj)=>{const f=slab({adjoinsExistingConcrete:true,adjoiningEdgeLF:adj});delete f.customerInputs.length;delete f.customerInputs.width;Object.assign(f.customerInputs,{dimensionMethod:'measured_outline',outlinePoints:points});return f;};
add('walkway-20x2-along-wall',slab({length:20,width:2,adjoinsExistingConcrete:true,adjoiningEdgeLF:20}));
add('patio-10x10-l-corner',slab({length:10,width:10,adjoinsExistingConcrete:true,adjoiningEdgeLF:20}));
add('patio-outline-square-one-wall',outline([{x:0,y:0},{x:10,y:0},{x:10,y:10},{x:0,y:10},{x:0,y:0}],10));
add('patio-outline-ell-10lf',outline([{x:0,y:0},{x:10,y:0},{x:10,y:4},{x:4,y:4},{x:4,y:10},{x:0,y:10},{x:0,y:0}],10));

writeFileSync(new URL('./corpus-additions-20261125-v50.json',import.meta.url),JSON.stringify(cases,null,1)+'\n');
console.log(cases.length+' inputs');
