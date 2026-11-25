import {writeFileSync} from 'node:fs';
import {offeringFixture} from '../../test/configuredOfferingsFixtures.mjs';

// November 26, 2026 (v50, before release): the overnight fix to installed
// interior painting measured room by room (the owner's ceiling coats are
// used, not asked). Run once; never edited.
const cases=[];
const add=(id,input)=>cases.push({id:'v50b-20261126:'+id,input:structuredClone(input)});
{const f=offeringFixture('INTERIOR_PAINTING','installed'),c=f.customerInputs;
 for(const k of ['wallAreaSqft','ceilingAreaSqft','wallScopeUniform','trimLengthLF'])delete c[k];
 Object.assign(c,{areaInputMethod:'room_dimensions',rooms:[{lengthFeet:20,widthFeet:15,heightFeet:8,doorCount:1,windowCount:2}],ceilingsIncluded:true,ceilingSurfaceCondition:'fair',trimIncluded:false});
 add('installed-interior-rooms-ceilings-no-coats',f);}
writeFileSync(new URL('./corpus-additions-20261126-v50b.json',import.meta.url),JSON.stringify(cases,null,1)+'\n');
console.log(cases.length+' inputs');
