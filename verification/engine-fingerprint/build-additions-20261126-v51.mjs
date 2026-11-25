import {writeFileSync} from 'node:fs';
import {concrete} from '../engine-independent/fixtures.mjs';

// November 26, 2026 (v51): repairs from Neon's audit of v50 that change what
// a quote charges (V50-4 thickened edge). Run once; never edited.
const cases=[];
const add=(id,input)=>cases.push({id:'v51-20261126:'+id,input:structuredClone(input)});
const slab=inputs=>{const f=concrete();Object.assign(f.customerInputs,{chuteAccess:'yes',baseNeeded:false},inputs);Object.assign(f.ownerPricing.pricing,{thickenedEdgeExtraDepthInches:4,thickenedEdgeWidthInches:12,concreteWasteFactor:0,isolationJointPricing:'included'});return f;};
{const f=slab({adjoinsExistingConcrete:true,adjoiningEdgeLF:10.3});delete f.customerInputs.length;delete f.customerInputs.width;
 Object.assign(f.customerInputs,{dimensionMethod:'measured_outline',outlinePoints:[{x:0,y:0},{x:10.1,y:0},{x:10.1,y:8},{x:20.4,y:8},{x:20.4,y:18},{x:0,y:18},{x:0,y:0}]});add('decimal-ell-10.3lf-wall',f);}
add('walkway-20x2-15lf-wall',slab({length:20,width:2,adjoinsExistingConcrete:true,adjoiningEdgeLF:15}));
add('infill-20x2-all-sides',slab({length:20,width:2,adjoinsExistingConcrete:true,adjoiningEdgeLF:44}));
writeFileSync(new URL('./corpus-additions-20261126-v51.json',import.meta.url),JSON.stringify(cases,null,1)+'\n');
console.log(cases.length+' inputs');
