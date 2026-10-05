import './pricebookTestEnv.mjs';
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {measuredScopeCases} from './measuredScopeFixtures.mjs';
import {confirmedFixtureInputs} from './quoteEngineVNextFixtures.mjs';
import * as bridge from '../server/src/quoteDoneBridge.js';
import {loadPricebook,savePricebook} from '../server/priceBookService.js';

const scope=id=>structuredClone(measuredScopeCases().find(row=>row.id===id).input);
function saved(f){
 const owner='synthetic-oct5-'+randomUUID(),service=structuredClone(f.ownerPricing);delete service.origin;
 const draft=bridge.convertApplicationBook({services:[service],defaults:{...f.businessDefaults,currency:'USD',quoteTimeZone:'UTC'}},'toDollars');
 bridge.saveApplicationBook(owner,{...bridge.readApplicationBook(owner),...draft});
 bridge.approveApplicationService(owner,service.id,{revision:bridge.bookRevision(loadPricebook(owner)),confirmConfiguration:true,confirmLegacySettings:true});
 return loadPricebook(owner);
}
const calculate=(book,inputs)=>bridge.calculateApplicationQuote(book,book.services[0],{customerInputs:inputs,requestId:randomUUID()},{ownerId:book.ownerId,preparingIntake:true,now:new Date('2026-10-05T12:00:00Z')});
const total=q=>q.internalResult.options[0].calculationRecord.scenarios.mid.finalTotalCents;
for(const type of ['FLOORING_INSTALL','FLOORING_REPLACEMENT'])for(const mode of ['installed','itemized'])for(const tier of [false,true])for(const alias of ['floor_overlay__2','floor_overlay__named'])test('QP-01 only named overlay '+[type,mode,tier,alias].join(' '),()=>{
 const f=scope('overlay-'+mode),p=f.ownerPricing.pricing;f.serviceType=f.ownerPricing.serviceType=type;
 if(type==='FLOORING_REPLACEMENT')f.customerInputs.subfloorIssues=false;
 p.scopeDetails[alias]=p.scopeDetails.floor_overlay;delete p.scopeDetails.floor_overlay;
 p.scopeRates=Object.fromEntries(Object.entries(p.scopeRates).map(([key,v])=>[key.replace('floor_overlay_',alias+'_'),v]));
 if(tier){f.ownerPricing.tiers=[{name:'Best',overrides:{scopeDetails:p.scopeDetails,scopeRates:p.scopeRates}}];delete p.scopeDetails;delete p.scopeRates;}
 const book=saved(f),status=bridge.applicationStatus(book.services[0],book);assert.equal(status.status,'QUOTING LIVE');assert.equal(status.approvalCurrent,true);
 const q=calculate(book,f.customerInputs);assert.equal(q.internalResult.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(q.internalResult));
 // 66000 labor +112000 tile +40000 installed, or +30000 itemized overlay.
 assert.equal(total(q),mode==='installed'?218000:208000);
 const mismatch=confirmedFixtureInputs({...f.customerInputs,existingFloorType:'carpet'});
 assert.equal(calculate(book,mismatch).internalResult.resultType,'ESTIMATE_REQUIRES_REVIEW');
});

const temporary=mkdtempSync(join(resolve('.'),'oct5-preview-test-'));let previewFields;
before(async()=>{const file=join(temporary,'editor.mjs');await build({entryPoints:['client/src/offeringEditor.jsx'],bundle:true,platform:'node',format:'esm',packages:'external',outfile:file,logLevel:'silent'});previewFields=(await import(pathToFileURL(file))).offeringPreviewFields;});
after(()=>rmSync(temporary,{recursive:true,force:true}));
for(const product of ['hardwood','laminate','carpet'])test('QP-02 owner preview includes tier-only '+product+' underlayment',()=>{
 const f=scope('floor-'+product+'-installed'),p=f.ownerPricing.pricing;
 f.ownerPricing.tiers=[{name:'Best',overrides:{scopeDetails:p.scopeDetails,scopeRates:p.scopeRates}}];delete p.scopeDetails;delete p.scopeRates;
 const book=saved(f),raw=book.services[0],display=bridge.readApplicationBook(book.ownerId).services[0],meta=bridge.applicationMetadata().services.find(s=>s.serviceType===f.serviceType);
 const fields=previewFields(meta,display),publicFields=bridge.applicationServiceDefinition(raw).customerFields;
 assert.ok(fields.some(x=>x.name==='underlaymentScopeConfirmed'),'Owner measurement controls must display the required tier confirmation');
 assert.deepEqual(fields,publicFields,'Both forms use the same effective tier contract');
 const inputs={...f.customerInputs};delete inputs.underlaymentScopeConfirmed;
 assert.equal(bridge.previewApplicationQuote(book.ownerId,{revision:bridge.bookRevision(book),serviceId:raw.id,customerInputs:inputs}).resultType,'ESTIMATE_REQUIRES_REVIEW');
 inputs.underlaymentScopeConfirmed=true;
 const quote=bridge.previewApplicationQuote(book.ownerId,{revision:bridge.bookRevision(book),serviceId:raw.id,customerInputs:inputs});assert.equal(quote.resultType,'INSTANT_ESTIMATE_READY');
 assert.equal(quote.midEstimate,product==='laminate'?1940:1960);
});
test('QP-04 October 4 approval is stale after stair removal arithmetic; reapproval restores $2711',()=>{
 const f=scope('stairs-itemized');f.ownerPricing.peakMonths=[10];f.ownerPricing.peakSurchargePercent=10;
 const book=saved(f),raw=book.services[0];raw.quoteDoneApproval.engineVersion='quote-engine-vnext-audit-decisions-20261004-v4';savePricebook(book.ownerId,book);
 const stale=loadPricebook(book.ownerId);assert.equal(bridge.applicationStatus(stale.services[0],stale).approvalCurrent,false);
 assert.equal(calculate(stale,f.customerInputs).internalResult.resultType,'ESTIMATE_REQUIRES_REVIEW');
 bridge.approveApplicationService(book.ownerId,raw.id,{revision:bridge.bookRevision(stale),confirmConfiguration:true,confirmLegacySettings:true});
 const approved=loadPricebook(book.ownerId);assert.equal(bridge.applicationStatus(approved.services[0],approved).approvalCurrent,true);
 // 260500 base +10%*(66000 floor +30000 stair installation +10000 stair removal).
 assert.equal(total(calculate(approved,f.customerInputs)),271100);
});
