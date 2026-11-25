// Neon audit of v50, V50-6 (November 26, 2026): for a repair priced per foot
// or per item, the website form and the phone question list still showed the
// affected-area questions (v49 NEW-9 fixed only the phone prompt). Expected,
// written before the fix (flat roof repair, EPDM seam):
// - per foot: affected-area method, area, length and width are not shown;
//   "Repair length" is shown; same in the phone question list;
// - per item: the same, with "Repair item count" shown;
// - priced by area: the area questions are shown as before;
// - an area the caller volunteers is still kept (shown with its answer) and
//   checked against the largest-repair limit (unchanged engine rule).
import '../pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {flatRepair} from '../../verification/engine-independent/fixtures.mjs';
import {customerQuoteFields} from '../../server/customerQuoteFields.js';
import {customerFieldVisible} from '../../server/scopeConfiguration.js';
import {voiceQuestionContract} from '../../server/src/voice/voiceQuoteContract.js';
import {savedDisplayFixture} from '../quoteDisplayFixtures20261006.mjs';

const AREA=['repairAreaMethod','affectedArea','repairLengthFt','repairWidthFt'];
function service(unit){const f=flatRepair(),p=f.ownerPricing.pricing,c=f.customerInputs,m=c.membraneType,r=c.repairType;
  if(unit){p.repairPricingUnit={[m]:{[r]:unit}};p.repairUnitPrice={[m]:{[r]:900}};p.installedLaborPercent={['repairUnitPrice.'+m+'.'+r]:60};}return f;}
const shown=(f,inputs)=>customerQuoteFields({...f.ownerPricing,serviceType:f.serviceType},f.ownerPricing.pricing).filter(x=>!x.evidenceOnly&&customerFieldVisible(x,inputs)).map(x=>x.name);
const sel=f=>({membraneType:f.customerInputs.membraneType,repairType:f.customerInputs.repairType});
for(const [unit,own] of [['linear_feet','repairLengthLF'],['each','repairItemCount']])test('V50-6: priced '+unit+': no area questions on the website or the phone',()=>{
  const f=service(unit),web=shown(f,sel(f));
  for(const name of AREA)assert.ok(!web.includes(name),name+' shown');assert.ok(web.includes(own));
  const a=savedDisplayFixture(f),phone=voiceQuestionContract(a.service,a.definition,sel(f)).fields.map(x=>x.field);
  for(const name of AREA)assert.ok(!phone.includes(name),name+' asked by phone');assert.ok(phone.includes(own));
  assert.ok(shown(f,{...sel(f),affectedArea:40}).includes('affectedArea'),'a volunteered area is kept');
});
test('V50-6: priced by area: area questions as before',()=>{
  const f=service(null),web=shown(f,sel(f));
  for(const name of ['repairAreaMethod','affectedArea'])assert.ok(web.includes(name),name);
});
