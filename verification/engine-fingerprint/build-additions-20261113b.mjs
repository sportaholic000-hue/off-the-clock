// One-time build of corpus-additions-20261113b.json (engine v32): inputs for
// items 1 to 3 of the audit of 61fd41fb. Item 2 is the book the real editor now
// produces; item 3 is the book real conflict recovery now produces. Each result
// is worked by hand in test/qeReviewV32_20261113.spec.mjs. Run once; the output
// file is never edited.
// Usage: node --import ./test/pricebookTestEnv.mjs verification/engine-fingerprint/build-additions-20261113b.mjs
import {writeFileSync} from 'node:fs';
import * as E from '../../client/src/pricebookEditing.js';
import {reconcilePricebook} from '../../client/src/pricebookConflict.js';
import {applicationMetadata} from '../../server/src/quoteDoneBridge.js';
import {flooring,custom} from '../engine-independent/fixtures.mjs';
import {startBook,engineService,JOB} from '../../test/carpetTableFixture.mjs';
const rows=[];const add=(id,input)=>rows.push({id,input:structuredClone(input)});
// Item 1: tile, tax by job location.
function taxJob(defaults,code){
  const f=flooring('tile',200);
  Object.assign(f.businessDefaults,{taxMode:'TAX_ALL',taxPercent:5,taxByJobLocation:true,taxZones:[{name:'Manhattan',codes:'100',percent:8.875}],...defaults});
  f.ownerPricing.taxabilityByCategory={...f.ownerPricing.taxabilityByCategory,labor:true,material:true};f.customerInputs.postalCode=code;return f;
}
add('v32:item1-usd-business-toronto-job',taxJob({currency:'USD'},'M5V 2T6'));
add('v32:item1-ca-business-us-zip-business-rate',taxJob({currency:'CAD',businessCountry:'CA',taxOutsideZones:'business_rate'},'98101'));
add('v32:item1-ca-business-usd-book-toronto-job',taxJob({currency:'USD',businessCountry:'CA'},'M5V 2T6'));
// Item 2: base $3/$5 per sq ft, option in sq yd; the option renamed, then base labor raised to $4.
{
  const s=startBook({storage:'pricing',base:'square_foot',option:'different',prices:'inherited',inexact:false});
  const renamed={...s,tiers:E.keepTierCarpetRatesInUnit(s,s.tiers.map(t=>({...t,name:t.name+' renamed'})))};
  const raised=E.editServiceField(renamed,'laborPerSqft',{...E.serviceFieldValue(renamed,'laborPerSqft'),carpet:4});
  add('v32:item2-renamed-yard-option-follows-base',{...JOB,ownerPricing:engineService(raised)});
}
// Item 3: a custom service; A changes the unit to per hour, B the flat price to $250; the saved version kept.
{
  const f=custom(),start=f.ownerPricing,A=E.editServiceField(start,'unit','per_hour'),B=E.editServiceField(start,'price',25000);
  const book=s=>({services:[s],defaults:{},revision:1}),metadata=applicationMetadata().services;
  const first=reconcilePricebook(book(start),book(A),book(B),{},metadata);
  const kept=reconcilePricebook(book(start),book(A),book(B),{[first.conflicts[0].key]:'remote'},metadata).draft.services[0];
  add('v32:item3-custom-kept-saved',{...f,ownerPricing:kept});
}
writeFileSync(new URL('./corpus-additions-20261113b.json',import.meta.url),JSON.stringify(rows,null,1)+'\n');
console.log(rows.length+' inputs written');
