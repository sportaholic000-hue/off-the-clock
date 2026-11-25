// Neon re-audit of v49, NEW-9 (November 25, 2026): v49 #2 stopped requiring
// an area for repairs priced per foot or per item, but the phone prompt still
// said "Always collect affected area", so a caller with 3 pipe boots or a 100 ft
// seam was pushed to invent square feet. Expected, written before the fix:
// - the compiled prompt no longer says "Always collect affected area";
// - it says to ask only for the measurement the repair is priced by, and not
//   to ask for an area on per-foot or per-item repairs;
// - the length and item-count questions are still named;
// - on the phone, a 100 ft seam reseal at $9.00/ft with no area quotes $900.
import '../pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compileVoiceSystemInstruction} from '../../server/src/voice/voicePromptCompiler.js';
import {flatRepair} from '../../verification/engine-independent/fixtures.mjs';
import {quoteEmailFixture} from '../quoteEmailFixture.mjs';
import {publish} from '../quoteDeliveryBatch20261015Fixture.mjs';

const guideText=readFileSync(new URL('../../server/src/voice/receptionistGuide.md',import.meta.url),'utf8');
test('NEW-9: repair prompt no longer demands an area for per-foot or per-item repairs',()=>{
  for(const type of ['ROOFING_REPAIR','FLAT_ROOF_REPAIR','SIDING_REPAIR']){
    const text=JSON.stringify(compileVoiceSystemInstruction({guideText,business:{businessName:'[SYNTHETIC] Roofs',agentName:'Sam'},services:[{serviceType:type,serviceLabel:type,active:true,status:'QUOTING LIVE',offerings:[]}]}));
    assert.doesNotMatch(text,/Always collect affected area/,type);
    assert.match(text,/Do not ask for an area on a repair priced by length or per item/,type);
    assert.match(text,/Repair length in linear feet/,type);assert.match(text,/Repair item count/,type);
  }
});
test('NEW-9: on the phone, a per-foot repair with no area is quoted',async t=>{
  const f=flatRepair(),p=f.ownerPricing.pricing,c=f.customerInputs,m=c.membraneType,r=c.repairType;
  p.repairPricingUnit={[m]:{[r]:'linear_feet'}};p.repairUnitPrice={[m]:{[r]:900}};p.installedLaborPercent={['repairUnitPrice.'+m+'.'+r]:60};c.repairLengthLF=100;delete c.affectedArea;
  const h=quoteEmailFixture(t);publish(h.c.ownerId,f);
  const match=await h.tool('matchService',{query:f.ownerPricing.service});assert.equal(match.status,'matched');
  const inputs=structuredClone(c);delete inputs.confirmedFacts;
  const v=await h.tool('getQuote',{serviceHandle:match.serviceHandle,customerInputs:inputs,customerConfirmed:true,productConfirmations:{repairType:true,membraneType:true},additionalWork:[]});
  assert.equal(v.status,'quoted',JSON.stringify(v).slice(0,600));assert.equal(v.midEstimate,900);
  assert.doesNotMatch(JSON.stringify(v),/undefined/);
});
