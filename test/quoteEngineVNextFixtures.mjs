// Explicit synthetic fixture records. These helpers never run in the engine.
import { createHash, randomUUID } from 'node:crypto';
import { MEASUREMENT_CONTRACTS } from '../server/quote-engine-vnext/contracts.js';
const known = {
 existingRoofType:['asphalt_shingle','metal','standing_seam','cedar_shake'],
 replacementRoofType:['asphalt_shingle','metal','standing_seam','cedar_shake'],
 repairType:['shingle_patch','seam_patch','patch','named_patch'],
 roofType:['asphalt_shingle','epdm'],
 membraneType:['epdm','tpo','pvc','modified_bitumen'],
 replacementMembraneType:['epdm','tpo','pvc','modified_bitumen'],
 existingFloorType:['vinyl','carpet','tile','hardwood','laminate','vinyl_plank'],
 fenceType:['wood'],mulchType:['brown','red','standard'],damageLevel:['minor']
};
function offeringId(field,value) {
 const h=createHash('sha256').update('VNext synthetic known offering: '+field+':'+value).digest('hex');
 return h.slice(0,8)+'-'+h.slice(8,12)+'-4'+h.slice(13,16)+'-8'+h.slice(17,20)+'-'+h.slice(20,32);
}
export function fixtureIdentity(source='MANUAL', id=randomUUID()) {
 return {id,source,origin:{serviceId:id,source,ownerId:'internal-fixture-owner',operationId:'fixture-created',createdAt:'2026-09-09T12:00:00.000Z'}};
}
export function fixtureOfferings(type) {
 return Object.fromEntries(Object.keys(MEASUREMENT_CONTRACTS[type].fields).filter(field=>known[field]).map(field=>[field,Object.fromEntries(known[field].map(value=>[value,offeringId(field,value)]))]));
}
export function confirmedFixtureInputs(inputs) {
 const facts=Object.fromEntries(Object.keys(inputs).filter(field=>known[field]?.includes(inputs[field])).map(field=>[field,{status:'identified',offeringId:offeringId(field,inputs[field])}]));
 return {...inputs,...(Object.keys(facts).length?{confirmedFacts:facts}:{})};
}
export function freeFixture(service, overrides={}) {
 return {...service,zeroPricePolicy:{serviceId:service.id,ownerId:service.origin.ownerId,operationId:'fixture-free-approval',approvedAt:'2026-09-09T12:00:00.000Z',freeCompleteService:true,freeTiers:[],includedPrices:{},...overrides}};
}

export function includedFixture(service,includedPrices) {
 return freeFixture(service,{freeCompleteService:false,includedPrices});
}
