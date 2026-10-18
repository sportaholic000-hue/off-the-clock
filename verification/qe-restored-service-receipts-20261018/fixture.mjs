import assert from 'node:assert/strict';
import {httpFixture} from '../../test/leadCaptureRepair20261006HttpFixture.mjs';
import {flooring} from '../engine-independent/fixtures.mjs';
import {convertApplicationBook} from '../../server/src/quoteDoneBridge.js';

export const group='flooring_patterns_20261017';
// Explicit list independent of the implementation constant: a missing entry
// in production must fail these tests, not silently disappear from coverage.
export const protectedFields=['origin','quoteDoneApproval','confirmedFields','approvedValues','zeroPricePolicy','startingValueState','startingValueAdoptions','dependentLineState'];
export async function read(f){const r=await f.request('/api/pricebook/synthetic-a');assert.equal(r.status,200,JSON.stringify(r.body));return r.body;}
export async function save(f,book){return f.request('/api/pricebook/save','synthetic-a',{method:'POST',body:book});}
export async function approve(f,book,extra={}){
  const r=await f.request('/api/pricebook/services/'+book.services[0].id+'/approve','synthetic-a',{method:'POST',body:{revision:book.revision,confirmConfiguration:true,confirmLegacySettings:true,...extra}});
  assert.equal(r.status,200,JSON.stringify(r.body));return read(f);
}
export async function setup(t,{adopted=true}={}){
  const f=await httpFixture(t),initial=await read(f),input=flooring('vinyl_plank',700);
  const service=structuredClone(input.ownerPricing);
  for(const field of [...protectedFields,'id'])delete service[field];
  service.service='[SYNTHETIC] Receipt recovery flooring';
  service.tiers=[{name:'[SYNTHETIC] Upgraded labor',overrides:{laborPerSqft:{vinyl_plank:450}}}];
  const draft=convertApplicationBook({services:[service],defaults:{...input.businessDefaults,currency:'CAD'}},'toDollars');
  const saved=await save(f,{...initial,...draft});assert.equal(saved.status,200,JSON.stringify(saved.body));
  let book=await read(f);assert.equal(book.services[0].startingValueAdoptions[group].mode,'new');
  book=await approve(f,book);
  if(adopted)book=await approve(f,book,{adoptStartingValueGroup:group});
  return {...f,original:book};
}
export const editLocal=book=>{const local=structuredClone(book);local.services[0].pricing.laborPerSqft.vinyl_plank=4.25;return local;};
export async function deleteRemote(f,book){const remote=structuredClone(book);remote.services=[];const r=await save(f,remote);assert.equal(r.status,200,JSON.stringify(r.body));return read(f);}
export function editable(service){
  // Save assigns fresh price timestamps to a new service, including its options.
  // Compare all owner configuration, excluding only these known server paths.
  const result=structuredClone(Object.fromEntries(Object.entries(service).filter(([key])=>![...protectedFields,'id','__clientTempId','createdAt','updatedAt','priceMetadata'].includes(key))));
  for(const tier of result.tiers||[])delete tier.priceMetadata;
  return result;
}
