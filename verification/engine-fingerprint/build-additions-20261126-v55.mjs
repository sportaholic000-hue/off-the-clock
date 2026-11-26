import {writeFileSync} from 'node:fs';
import {flooring} from '../engine-independent/fixtures.mjs';
import {confirmedFixtureInputs} from '../../test/quoteEngineVNextFixtures.mjs';
import {measuredScopeCases} from '../../test/measuredScopeFixtures.mjs';

// November 26, 2026 (v55): verdicts on two audits — removal in older buildings
// by existing material. Run once; never edited.
const cases=[];
const add=(id,input)=>cases.push({id:'v55-20261126:'+id,input:structuredClone(input)});
const floor=(existing,age)=>{const f=flooring('tile',200),p=f.ownerPricing.pricing;p.removalPerSqft={[existing]:100};delete p.olderMaterialRemoval;
  const {confirmedFacts,...rest}=f.customerInputs;f.customerInputs=confirmedFixtureInputs({...rest,existingFloorType:existing,removalNeeded:true,removalAreaSqft:250,buildingAge:age});return f;};
add('flooring-carpet-removal-before-1978',floor('carpet','before_1978'));
add('flooring-laminate-removal-not-sure',floor('laminate','not_sure'));
add('flooring-vinyl-removal-before-1978',floor('vinyl','before_1978'));
add('flooring-tile-removal-1978-to-1990',floor('tile','1978_to_1990'));
const siding=(material,age)=>{const f=structuredClone(measuredScopeCases().find(c=>c.id==='siding-removal-itemized').input),p=f.ownerPricing.pricing;delete p.olderMaterialRemoval;
  if(material)p.scopeDetails.siding_removal.existingSidingMaterial=material;f.customerInputs.buildingAge=age;return f;};
add('siding-vinyl-removal-before-1978',siding('vinyl','before_1978'));
add('siding-unset-material-removal-before-1978',siding(undefined,'before_1978'));
add('siding-fiber-cement-removal-not-sure',siding('fiber_or_asbestos_cement','not_sure'));
writeFileSync(new URL('./corpus-additions-20261126-v55.json',import.meta.url),JSON.stringify(cases,null,1)+'\n');
console.log(cases.length+' inputs');
