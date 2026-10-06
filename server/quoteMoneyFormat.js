// Display already-calculated quote amounts, never owner unit rates. A displayed
// group (range or options) shares precision so $172.50 and $200.00 agree.
const valid=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
export function quoteMoneyFormatter(amounts) {
 if(!Array.isArray(amounts)||amounts.some(value=>!valid(value)))throw new TypeError('Invalid quote amount.');
 const digits=amounts.some(value=>!Number.isInteger(value))?2:0;
 const formatter=new Intl.NumberFormat('en-US',{minimumFractionDigits:digits,maximumFractionDigits:2});
 const amount=value=>{if(!valid(value))throw new TypeError('Invalid quote amount.');return '$'+formatter.format(value===0?0:value);};
 const range=(low,high,separator=' – ')=>{
  if(!valid(low)||!valid(high)||low>high)throw new TypeError('Invalid quote range.');
  return low===high?amount(low):amount(low)+separator+amount(high);
 };
 return {amount,range};
}
