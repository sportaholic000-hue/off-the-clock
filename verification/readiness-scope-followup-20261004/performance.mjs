// Cold public application-status reproduction against a selected checkout.
// node verification/readiness-scope-followup-20261004/performance.mjs /path/to/checkout
import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root=path.resolve(process.argv[2]||'.');
const {flatRoof}=await import(pathToFileURL(path.join(root,'verification/engine-independent/fixtures.mjs')));
const {bookQuoteStatuses}=await import(pathToFileURL(path.join(root,'server/src/quoteDoneBridge.js')));
for(const reason of ['unconfigured-zero-prices','missing-all-registration','only-final-pair-live']){
 const f=flatRoof(),p=f.ownerPricing.pricing,n=80;
 for(const field of ['laborPerSqft','membraneCostPerSqft','tearOffPerSqft'])p[field]=Object.fromEntries(Array.from({length:n},(_,i)=>['product_'+i,reason==='unconfigured-zero-prices'&&field==='membraneCostPerSqft'?0:500]));
 f.ownerPricing.knownOfferings=Object.fromEntries(['membraneType','replacementMembraneType'].map(field=>[field,Object.fromEntries(Array.from({length:n},(_,i)=>['product_'+i,randomUUID()]))]));
 if(reason==='missing-all-registration')f.ownerPricing.knownOfferings={};
 if(reason==='only-final-pair-live')for(let i=0;i<n-1;i++){delete p.membraneCostPerSqft['product_'+i];delete f.ownerPricing.knownOfferings.membraneType['product_'+i];}
 const book={services:[f.ownerPricing],defaults:{currency:'CAD',...f.businessDefaults}},t=performance.now(),timer=new Promise(resolve=>setTimeout(()=>resolve(performance.now()-t),20));
 const status=bookQuoteStatuses(book)[0],elapsedMs=performance.now()-t;
 console.log(JSON.stringify({reason,productsPerAxis:n,elapsedMs,timerDelayMs:await timer,status:status.status,approvalCurrent:status.approvalCurrent}));
}
