// Phone-only rectangle area. The server multiplies the caller's confirmed
// decimal dimensions without binary floating point or inferred dimensions.
const DECIMAL=/^(?:0|[1-9]\d{0,6})(?:\.\d{1,6})?$/;
export function calculateVoiceArea({length,width,customerConfirmed}={}){
  if(customerConfirmed!==true||typeof length!=='string'||typeof width!=='string'||!DECIMAL.test(length)||!DECIMAL.test(width))throw TypeError('Confirmed decimal dimensions are required.');
  const coefficient=text=>{const [integer,fraction='']=text.split('.');return {value:BigInt(integer+fraction),scale:fraction.length};};
  const a=coefficient(length),b=coefficient(width),product=a.value*b.value;
  if(product===0n)throw TypeError('Area must be positive.');
  const scale=a.scale+b.scale,padded=product.toString().padStart(scale+1,'0');
  const areaSqft=scale?(padded.slice(0,-scale)+'.'+padded.slice(-scale)).replace(/\.?0+$/,''):padded;
  if(Number(areaSqft)>10_000_000)throw TypeError('Area exceeds the voice measurement limit.');
  return {status:'calculated',areaSqft};
}
