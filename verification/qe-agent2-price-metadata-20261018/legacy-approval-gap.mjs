// Cross-owner reproduction; not an approved change to the approval endpoint.
// Expected before execution: attempting to approve a persisted legacy
// 100.5-cent each-price should reject without creating an approval receipt.
// The owned precision repair blocks quoting, but the current endpoint still
// returns success and stamps a receipt. Exit 1 records that remaining gap.
import '../../test/pricebookTestEnv.mjs';
import {randomUUID} from 'node:crypto';
import {roofFixture} from './fixtures.mjs';
import {savePricebook,loadPricebook} from '../../server/priceBookService.js';
import {readApplicationBook,approveApplicationService} from '../../server/src/quoteDoneBridge.js';
import {generateQuoteVNext} from '../../server/quote-engine-vnext/index.js';

const results=[];
for(const location of ['base','tier']){
  const owner='qe-agent2-legacy-approval-'+randomUUID(),f=roofFixture();
  f.ownerPricing.origin.ownerId=owner;
  if(location==='base')f.ownerPricing.pricing.pipeJackEach=100.5;
  else f.ownerPricing.tiers=[{name:'[SYNTHETIC] Legacy fractional each',overrides:{pipeJackEach:100.5}}];
  savePricebook(owner,{services:[f.ownerPricing],defaults:{...f.businessDefaults,currency:'CAD'}});
  const before=readApplicationBook(owner);let response,error;
  try{response=approveApplicationService(owner,before.services[0].id,{revision:before.revision,confirmConfiguration:true,confirmLegacySettings:true});}
  catch(problem){error={message:problem.message,statusCode:problem.statusCode};}
  const stored=loadPricebook(owner).services[0];
  const value=location==='base'?stored.pricing.pipeJackEach:stored.tiers[0].overrides.pipeJackEach;
  results.push({location,value,rejected:Boolean(error),error,success:response?.success,receiptCreated:Boolean(stored.quoteDoneApproval),
    statuses:response?.statuses.map(row=>({status:row.status,approvalCurrent:row.approvalCurrent,validationErrors:row.validationErrors})),
    quoteResult:generateQuoteVNext({...f,ownerPricing:stored}).resultType});
}
console.log(JSON.stringify({expected:'reject without an approval receipt; retain 100.5 cents',results},null,2));
if(results.some(row=>!row.rejected||row.receiptCreated||row.value!==100.5))process.exitCode=1;
