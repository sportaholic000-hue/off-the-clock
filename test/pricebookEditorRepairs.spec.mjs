import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {changeFeeRule,removeOwnerFeeSelection,outdatedOwnerFeeSelections,previewFeeContext,reconcilePreviewFees,approvalMatchesDraft,mergeSavedApproval} from '../client/src/pricebookEditing.js';
import {writePricebookTransfer,consumePricebookTransfer,clearPricebookTransfersForSessionChange} from '../client/src/pricebookDrafts.js';
import {validateStructuredValue,describeStructuredValue,parseInterviewScalar} from '../client/src/interviewStructuredValue.js';

test('F04 fee changes discard only incompatible owner answers, including false',()=>{
 for(const answer of [true,false]){
  const service={pricing:{rate:0.0051},feeRules:{travel:'owner_selected',permit:'owner_selected'},ownerFeeSelections:{travel:answer,permit:false}};
  const unchanged=changeFeeRule(service,'travel','owner_selected');assert.equal(unchanged.ownerFeeSelections.travel,answer);
  for(const mode of ['not_applicable','always','customer_selected','']){
   const changed=changeFeeRule(service,'travel',mode);assert.equal(Object.hasOwn(changed.ownerFeeSelections,'travel'),false);assert.equal(changed.ownerFeeSelections.permit,false);assert.deepEqual(changed.pricing,service.pricing);
  }
  assert.equal(service.ownerFeeSelections.travel,answer);
 }
});
test('F04 stale drafts stay visible until the owner corrects them',()=>{
 const service={feeRules:{travel:'not_applicable',permit:'owner_selected'},ownerFeeSelections:{travel:false,permit:false}};
 assert.deepEqual(outdatedOwnerFeeSelections(service),['travel']);assert.equal(service.ownerFeeSelections.travel,false);
 assert.deepEqual(removeOwnerFeeSelection(service,'travel').ownerFeeSelections,{permit:false});
});
test('F05 preview answers are scoped to service and fee rules',()=>{
 const a=previewFeeContext('a',{travel:'customer_selected',permit:'not_applicable'});
 assert.equal(a,previewFeeContext('a',{permit:'not_applicable',travel:'customer_selected'}));
 assert.notEqual(a,previewFeeContext('b',{travel:'customer_selected',permit:'not_applicable'}));
 assert.notEqual(a,previewFeeContext('a',{travel:'owner_selected',permit:'not_applicable'}));
});
function books(){
 const before={revision:'1',defaults:{travelFee:10},services:[{id:'a',pricing:{rate:1},tiers:[{name:'alternate',overrides:{rate:0.0051}}]},{id:'b',pricing:{rate:2}}]};
 const after=structuredClone(before);after.revision='2';after.services[1].quoteDoneApproval={contentDigest:'saved-b'};
 return {before,after};
}
test('F07 approving B preserves unsaved A, tiers, defaults and added services',()=>{
 const {before,after}=books(),draft=structuredClone(before);draft.services[0].pricing.rate='1.0000000000000001';draft.services[0].tiers[0].overrides.rate=0;draft.services.push({service:'unsaved',pricing:{rate:0.0051}});
 const actual=mergeSavedApproval(draft,before,after,'b','2');assert.deepEqual(actual.services[0],draft.services[0]);assert.deepEqual(actual.services[2],draft.services[2]);assert.deepEqual(actual.services[1],after.services[1]);assert.equal(actual.revision,'2');assert.equal(draft.revision,'1');
});
test('F07 changing reviewed values invalidates confirmation without erasing the draft',()=>{
 const {before,after}=books(),draft=structuredClone(before),review={book:before,service:before.services[1]};
 assert.equal(approvalMatchesDraft(draft,review),true);draft.services[1].pricing.rate=3;assert.equal(approvalMatchesDraft(draft,review),false);
 const merged=mergeSavedApproval(draft,before,after,'b','2');assert.equal(merged.services[1].pricing.rate,3);assert.equal(merged.services[1].quoteDoneApproval,undefined);
 draft.services[1]=structuredClone(before.services[1]);draft.defaults.travelFee=0;assert.equal(approvalMatchesDraft(draft,review),false);
});
test('F07 newer remote revisions cannot silently replace unsaved editor content',()=>{
 const {before,after}=books(),draft=structuredClone(before);draft.services[0].pricing.rate=7;
 assert.throws(()=>mergeSavedApproval(draft,before,{...after,revision:'3'},'b','2'),/changed|revision/i);
 const changed=structuredClone(after);changed.services[0].pricing.rate=9;assert.throws(()=>mergeSavedApproval(draft,before,changed,'b','2'),/changed|revision/i);
 assert.deepEqual(draft.services[0].pricing,{rate:7});
});
const memory=()=>{const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};};
const token=(sub,role='owner',sid='a')=>'header.'+Buffer.from(JSON.stringify({sub,role,sid})).toString('base64url')+'.signature';
test('F08 both transfers recover only for the bound authenticated owner',()=>{
 for(const kind of ['draft','suggestions']){
  const storage=memory(),payload=kind==='draft'?{services:[{pricing:{rate:0},confirmedFields:{}}]}:{suggestions:[{fields:{rate:0.0051}}]};
  writePricebookTransfer(kind,'a',payload,storage);assert.deepEqual(consumePricebookTransfer(kind,'a',storage),{value:payload,notice:null});assert.equal(storage.getItem('otc_pricebook_'+kind),null);
  writePricebookTransfer(kind,'a',payload,storage);const rejected=consumePricebookTransfer(kind,'b',storage);assert.equal(rejected.value,null);assert.match(rejected.notice,/owner|account/i);
 }
});
test('F08 legacy malformed and unbound values are rejected without assigning an owner',()=>{
 for(const raw of ['{',JSON.stringify({services:[]}),JSON.stringify({version:1,ownerId:'a',payload:{services:[]}})]){
  const storage=memory();storage.setItem('otc_pricebook_draft',raw);assert.equal(consumePricebookTransfer('draft','b',storage).value,null);assert.equal(storage.getItem('otc_pricebook_draft'),null);
 }
});
test('F08 only price-book transfers clear on logout/account changes, same-owner refresh retains',()=>{
 const storage=memory();storage.setItem('unrelated','keep');
 for(const next of [null,token('b'),token('a','staff')]){
  writePricebookTransfer('draft','a',{services:[]},storage);writePricebookTransfer('suggestions','a',{suggestions:[]},storage);
  clearPricebookTransfersForSessionChange(token('a'),next,storage);assert.equal(storage.getItem('otc_pricebook_draft'),null);assert.equal(storage.getItem('otc_pricebook_suggestions'),null);assert.equal(storage.getItem('unrelated'),'keep');
 }
 writePricebookTransfer('draft','a',{services:[]},storage);clearPricebookTransfersForSessionChange(token('a','owner','old'),token('a','owner','new'),storage);assert.ok(storage.getItem('otc_pricebook_draft'));
});
test('F11 current repair tree wins over legacy two-level hints and preserves zero',()=>{
 const d={tree:{depth:3,leafKeys:['small','medium','large']},shapedKeys:{nested:['small','medium','large']}},v={asphalt_shingle:{leak_patch:{small:0,medium:1.2345,large:3}}};
 assert.equal(validateStructuredValue(v,d.shapedKeys,'Repair hours',d),null);const text=describeStructuredValue(v,d.shapedKeys,'Repair hours',d);assert.match(text,/1\.2345/);assert.match(text,/0/);assert.doesNotMatch(text,/\[object Object\]/);
 assert.match(validateStructuredValue({asphalt_shingle:{small:1,medium:2,large:3}},d.shapedKeys,'Repair hours',d),/map|row|group/i);
 assert.match(validateStructuredValue({asphalt_shingle:{leak_patch:{small:0,medium:1}}},d.shapedKeys,'Repair hours',d),/large/i);
});
test('F11 enum and boolean maps retain exact keys, false, and unanswered distinctions',()=>{
 const b={tree:{leafType:'boolean'}},e={tree:{leafType:'enum',options:['cost','installed_area_sell_price']}};
 assert.equal(validateStructuredValue({wood:false},null,'Posts',b),null);assert.match(describeStructuredValue({wood:false},null,'Posts',b),/No/);
 assert.notEqual(validateStructuredValue({wood:''},null,'Posts',b),null);assert.notEqual(validateStructuredValue({wood:0},null,'Posts',b),null);
 assert.equal(validateStructuredValue({asphalt_shingle:'cost'},null,'Basis',e),null);assert.notEqual(validateStructuredValue({asphalt_shingle:'not-a-basis'},null,'Basis',e),null);
});
test('F13 scalar rejects lossy input, blank and invalid fixed amounts, retains unit precision',()=>{
 assert.throws(()=>parseInterviewScalar('1.0000000000000001',{type:'number',moneyKind:'unit_rate'}),/exact|precision|represented|decimal/i);
 assert.throws(()=>parseInterviewScalar('',{type:'number'}),/enter|number/i);
 assert.throws(()=>parseInterviewScalar('0.0051',{type:'number',moneyKind:'fixed_amount'}),/cent/i);
 assert.equal(parseInterviewScalar('0.0051',{type:'number',moneyKind:'unit_rate'}),0.0051);
 assert.equal(parseInterviewScalar('0',{type:'number',moneyKind:'unit_rate'}),0);
 assert.equal(parseInterviewScalar('false',{type:'boolean'}),false);
 assert.throws(()=>parseInterviewScalar('',{type:'boolean'}),/choose/i);
});
test('F13 all map depths reject unrepresentable raw text before readback',()=>{
 for(const depth of [1,2,3]){
  const nest=v=>depth===1?{exact_key:v}:depth===2?{exact_key:{small:v}}:{exact_key:{repair:{small:v}}};
  const d={tree:{depth},moneyKind:'unit_rate'};
  assert.notEqual(validateStructuredValue(nest('1.0000000000000001'),null,'Rate',d),null);
  assert.equal(validateStructuredValue(nest(0.0051),null,'Rate',d),null);
  assert.equal(validateStructuredValue(nest(0),null,'Rate',d),null);
 }
});

test('F05 changing one fee retains compatible No answers and cannot revive removed answers',()=>{
 const rules={travel:'customer_selected',permit:'customer_selected'},state={...reconcilePreviewFees({values:{}},'a',rules),values:{travel:true,permit:false}};
 const changed=reconcilePreviewFees(state,'a',{...rules,travel:'not_applicable'});assert.deepEqual(changed.values,{permit:false});
 const restored=reconcilePreviewFees(changed,'a',rules);assert.deepEqual(restored.values,{permit:false});
 assert.deepEqual(reconcilePreviewFees(restored,'b',rules).values,{});
});
