const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../profit-math.js');
const row = (rate, quantity='1', label='Cost') => ({rate, quantity, label});
const calc = (price, lines) => M.calculate({price, lines});
// Literal expected values are specified independently, before execution.
test('ordinary price: 2000 - (12.5*40 + 600 + 100 + 50) = 750', () => {
 const r=calc('2000',[row('40','12.5'),row('600'),row('100'),row('50')]);
 assert.equal(r.costCents,125000n); assert.equal(r.leftCents,75000n);
 assert.equal(r.markup,'60.00'); assert.equal(r.margin,'37.50');
});
test('fractional-cent rate: 10000 * .005 dollars = 50 dollars', () => {
 const r=calc('100',[row('0.005','10000')]);
 assert.equal(r.costCents,5000n);assert.equal(r.leftCents,5000n);assert.equal(r.rows[0].rate,'0.005');
});
test('markup above prior limits is displayed: 1300 price, 100 cost = 1200%',()=>{
 const r=calc('1300',[row('100')]);assert.equal(r.markup,'1200.00');assert.equal(r.margin,'92.31');
});
test('high markup is not clamped: .01 cost, 1000000 price',()=>{
 const r=calc('1000000',[row('.01')]);assert.equal(r.markup,'9999999900.00');assert.equal(r.leftCents,99999999n);
});
test('half-cent boundaries do not change stored rate precision',()=>{
 assert.equal(calc('1',[row('.0049')]).costCents,0n);
 assert.equal(calc('1',[row('.0050')]).costCents,1n);
 assert.equal(calc('1',[row('.0051')]).costCents,1n);
});
test('round each cost line once, then sum (two half cents = two cents)',()=>{
 assert.equal(calc('1',[row('.005'),row('.005')]).costCents,2n);
});
test('decimal quantity-times-rate: .1 * .2 dollars = 2 cents',()=>{
 assert.equal(calc('1',[row('.2','.1')]).costCents,2n);
});
test('zero price with positive cost: negative amount; margin undefined',()=>{
 const r=calc('0',[row('50')]);assert.equal(r.leftCents,-5000n);assert.equal(r.margin,null);assert.equal(r.markup,'-100.00');
});
test('zero cost: markup undefined, not infinite or artificially capped',()=>{
 const r=calc('100',[row('0')]);assert.equal(r.markup,null);assert.equal(r.margin,'100.00');
});
test('zero price and zero costs: both percentages undefined',()=>{
 const r=calc('0',[row('0')]);assert.equal(r.leftCents,0n);assert.equal(r.markup,null);assert.equal(r.margin,null);
});
test('loss is not clamped to zero',()=>{
 const r=calc('80',[row('100')]);assert.equal(r.leftCents,-2000n);assert.equal(r.markup,'-20.00');assert.equal(r.margin,'-25.00');
});
test('whole-cent selling amount is not rounded silently',()=>{
 assert.throws(()=>calc('200.005',[row('1')]),/whole cents/);
 assert.equal(calc('200.010',[row('0')]).priceCents,20001n);
});
test('blank price is missing rather than zero',()=>{
 assert.throws(()=>calc('',[row('0')]),/missing/);
});
test('blank cost blocks the result rather than dropping the selected row',()=>{
 assert.throws(()=>calc('100',[row('')]),/missing/);
 assert.throws(()=>calc('100',[row('1','')]),/missing/);
});
test('invalid inputs are rejected without coercion',()=>{
 for(const value of ['-1','NaN','Infinity','1e3','1,000','abc','0x10']) assert.throws(()=>M.decimal(value));
 for(const value of [1,null,undefined,{},NaN]) assert.throws(()=>M.decimal(value));
});
test('display formats signed values and whole cents exactly',()=>{
 assert.equal(M.money(20001n),'200.01');assert.equal(M.money(-1n),'-0.01');
 assert.equal(M.money(123456789n),'1,234,567.89');
});
test('large amounts beyond Number safe integer preserve all cents',()=>{
 const r=calc('90071992547409.93',[row('.01')]);
 assert.equal(r.priceCents,9007199254740993n);assert.equal(r.leftCents,9007199254740992n);
 assert.equal(M.money(r.priceCents),'90,071,992,547,409.93');
});
test('resource budget rejects rather than truncating long input',()=>{
 assert.throws(()=>M.decimal('1'.repeat(257)),/technical budget/);
});
test('no cost rows requires an explicit cost basis',()=>assert.throws(()=>calc('100',[]),/at least one/));
test('mutation-free calculation preserves input strings',()=>{
 const request={price:'100.00',lines:[row('0.0050','10000')]};
 const before=JSON.stringify(request);calc(request.price,request.lines);assert.equal(JSON.stringify(request),before);
});
test('adding a one-cent expense reduces leftover by one cent',()=>{
 for(let i=0;i<100;i++){
  const a=calc('2000',[row(String(i))]);const b=calc('2000',[row(String(i)),row('.01')]);
  assert.equal(b.leftCents,a.leftCents-1n);
 }
});
test('independent integer-cent grid: price minus costs, across losses and profits',()=>{
 for(let p=0n;p<=1000n;p+=17n) for(let c=0n;c<=1200n;c+=23n){
  const text=v=>`${v/100n}.${(v%100n).toString().padStart(2,'0')}`;
  const r=calc(text(p),[row(text(c))]);assert.equal(r.leftCents,p-c);
 }
});
