const test=require('node:test');const assert=require('node:assert/strict');const M=require('../profit-math.js');
const one=(cost)=>[{label:'Entered cost',quantity:'1',rate:cost}];
function target(cost,markup){return M.forMarkup({markup,lines:one(cost)});}
test('target 60% on $1250 gives exactly $2000, not a target gross-margin price',()=>{const r=target('1250','60');assert.equal(r.priceCents,200000n);assert.equal(r.leftCents,75000n);assert.equal(r.markup,'60.00');assert.equal(r.margin,'37.50');assert.equal(r.roundedUp,false);assert.equal(r.targetMet,true);});
test('owner markups below at and above former commercial thresholds',()=>{for(const [m,cents] of [['0',10000n],['99.99',19999n],['100',20000n],['100.01',20001n],['150',25000n],['999.99',109999n],['1000',110000n],['1000.01',110001n],['1200',130000n],['1000000',100010000n]])assert.equal(target('100',m).priceCents,cents,m);});
test('positive sub-cent target adjustment cannot undershoot markup',()=>{const r=target('0.01','50');assert.equal(r.priceCents,2n);assert.equal(r.leftCents,1n);assert.equal(r.roundedUp,true);assert.equal(r.markup,'100.00');});
test('adjacent decimal target values across a one-cent price boundary',()=>{assert.equal(target('0.03','33.33333').priceCents,4n);assert.equal(target('0.03','33.333333').priceCents,4n);assert.equal(target('0.03','33.333334').priceCents,5n);assert.equal(target('0.10','0.001').priceCents,11n);});
test('fractional-cent cost rate is preserved before targeting markup',()=>{const r=M.forMarkup({markup:'150',lines:[{label:'Measured job',quantity:'10000',rate:'0.005'}]});assert.equal(r.costCents,5000n);assert.equal(r.priceCents,12500n);assert.equal(r.rows[0].rate,'0.005');});
test('target prices and exports retain cents above Number safe integer',()=>{const r=target('90071992547409.91','100');assert.equal(r.costCents,9007199254740991n);assert.equal(r.priceCents,18014398509481982n);assert.equal(M.money(r.priceCents),'180,143,985,094,819.82');});
test('zero cost is not a fabricated achieved markup',()=>{const r=target('0','1200');assert.equal(r.priceCents,0n);assert.equal(r.markup,null);assert.equal(r.margin,null);assert.equal(r.targetMet,null);});
test('missing target and missing or invalid costs never silently default',()=>{for(const m of ['', ' ', '-1','Infinity','NaN','1e6',null,undefined])assert.throws(()=>target('100',m));for(const c of ['', '-1','bad'])assert.throws(()=>target(c,'60'));assert.throws(()=>M.forMarkup({markup:'60',lines:[]}));});
test('technical input budget is rejection, never truncation or a percentage clamp',()=>{const valid='1'+'0'.repeat(253);assert.equal(target('0.01',valid).targetMet,true);assert.throws(()=>target('100','1'.repeat(257)),/technical budget/);});
test('line-first rounding is consistent with the existing check-price mode',()=>{const lines=[{label:'A',quantity:'1',rate:'.005'},{label:'B',quantity:'1',rate:'.005'}];assert.equal(M.calculate({price:'.04',lines}).costCents,2n);assert.equal(M.forMarkup({markup:'100',lines}).priceCents,4n);});
test('target operation does not mutate costs or raw percentage',()=>{const input={markup:'1200.000',lines:[{label:'A',quantity:'01.00',rate:'0.005'}]};const copy=structuredClone(input);M.forMarkup(input);assert.deepEqual(input,copy);});
test('independent exact rational grid proves markup reached and price minimal',()=>{
 let cases=0;
 for(const cents of [1n,2n,3n,19n,49n,99n,100n,501n,10001n,20001n,125000n,9007199254740991n])for(const bps of [0n,1n,5n,999n,1000n,333333n,5000n,10000n,10001n,99999n,100000n,120000n,100000001n]){
  const dollar=(cents/100n)+'.'+String(cents%100n).padStart(2,'0');
  const pct=(bps/100n)+'.'+String(bps%100n).padStart(2,'0');const r=target(dollar,pct);
  // Oracle inequality, not the module's division or rounding function.
  const requiredNumerator=cents*(10000n+bps);
  assert.ok(r.priceCents*10000n>=requiredNumerator);
  assert.ok((r.priceCents-1n)*10000n<requiredNumerator);
  assert.equal(r.costCents,cents);cases++;
 }
 assert.equal(cases,156);
});
