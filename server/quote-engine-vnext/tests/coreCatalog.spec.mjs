import test from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {randomUUID} from 'node:crypto';
import {roof,select} from './coreFixtures.mjs';
import {generateQuoteVNext,vNextServiceStatus} from '../index.js';
import {bookQuoteStatuses} from '../../src/quoteDoneBridge.js';
// Handwritten money control: $500 labor+$1000 material+$200 removal+$10
// installed underlayment+$1 materials-only tax = $1711 (CORE_FIXES_20261005.md).
for(const path of ['full','quick','public'])test('core 9: 320 missing-share products via '+path,async()=>{
 const f=roof(320,{shares:false});Object.assign(f.businessDefaults,{taxMode:'TAX_MATERIALS',taxPercent:10});
 const book={ownerId:'synthetic-shares-'+randomUUID(),services:[f.ownerPricing],defaults:{...f.businessDefaults,currency:'USD'}},before=JSON.stringify(book);
 const start=performance.now(),timer=new Promise(resolve=>setTimeout(()=>resolve(performance.now()-start),20));
 const s=path==='public'?bookQuoteStatuses(book)[0]:vNextServiceStatus(f.ownerPricing,f.businessDefaults,{firstLiveProduct:path==='quick'}),elapsed=performance.now()-start,delay=await timer;
 assert.equal(s.status,'NEEDS PRICING');assert.ok(s.missingOwnerFields.some(p=>p.startsWith('installedMaterialsPercent.')));
 assert.ok(s.productCoverage.length<=640);assert.ok(elapsed<1500&&delay<1500,`Blocked for ${elapsed}/${delay} ms`);assert.equal(JSON.stringify(book),before);
 console.log(JSON.stringify({path,products:320,elapsedMs:elapsed,timerDelayMs:delay,rows:s.productCoverage.length}));
});
for(const index of [0,319])test('core 9: complete share sibling '+index+' still quotes $1711',()=>{
 const f=roof(320,{shares:false});Object.assign(f.businessDefaults,{taxMode:'TAX_MATERIALS',taxPercent:10});
 f.ownerPricing.pricing.installedMaterialsPercent={['underlaymentPerSquare.product_'+index]:100};
 assert.equal(vNextServiceStatus(f.ownerPricing,f.businessDefaults,{firstLiveProduct:true}).status,'QUOTING LIVE');
 const q=generateQuoteVNext(select(f,'product_'+index,'product_0'));assert.equal(q.resultType,'INSTANT_ESTIMATE_READY');assert.equal(q.midEstimate,1711);
 assert.equal(generateQuoteVNext(select(f,'product_'+(index===0?319:0),'product_0')).resultType,'ESTIMATE_REQUIRES_REVIEW');
});
test('core 7/9: missing shared disposal choice is pruned using the real roof replacement rules',()=>{
 const f=roof(80);f.ownerPricing.feeRules.disposal='owner_selected';
 const start=performance.now(),s=vNextServiceStatus(f.ownerPricing,f.businessDefaults,{ownerFeeSelections:{},firstLiveProduct:true});
 assert.equal(s.status,'NEEDS PRICING');assert.ok(s.invalidOwnerFields.includes('feeSelections.owner.disposal'));assert.ok(performance.now()-start<1500);
 // An explicit zero per-quantity disposal replaces the common fee. The
 // ordinary $1710 roof total is unchanged and no owner choice is invented.
 f.ownerPricing.pricing.disposalPerSquare=0;
 assert.equal(vNextServiceStatus(f.ownerPricing,f.businessDefaults,{ownerFeeSelections:{},firstLiveProduct:true}).status,'QUOTING LIVE');
 const q=generateQuoteVNext({...f,feeSelections:{owner:{},customer:{}}});assert.equal(q.resultType,'INSTANT_ESTIMATE_READY');assert.equal(q.midEstimate,1710);
});
