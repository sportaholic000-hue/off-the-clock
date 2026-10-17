// Owner-report arithmetic is expressed in hundredths of the displayed unit.
// Keep monetary and percentage inputs exact; the bounded fast path only returns
// when every value inside its proof interval has the same final rounded result.
// Exact balanced rational addition resolves the rare boundary case.
const FAST_SCALE=1_000_000_000_000n;
const absolute=value=>value<0n?-value:value;
const gcd=(left,right)=>{
  left=absolute(left);
  right=absolute(right);
  while(right){const next=left%right;left=right;right=next;}
  return left;
};

export function metricFraction(numerator,denominator=1n){
  if(typeof numerator!=='bigint'||typeof denominator!=='bigint'||denominator===0n)throw new TypeError('Metric fractions require BigInt values and a nonzero denominator.');
  if(denominator<0n){numerator=-numerator;denominator=-denominator;}
  if(numerator===0n)return {n:0n,d:1n};
  const divisor=gcd(numerator,denominator);
  return {n:numerator/divisor,d:denominator/divisor};
}

const roundedInteger=(numerator,denominator)=>{
  const magnitude=(absolute(numerator)*2n+denominator)/(2n*denominator);
  return numerator<0n?-magnitude:magnitude;
};
const formatHundredths=value=>`${value<0n?'-':''}${absolute(value)/100n}.${(absolute(value)%100n).toString().padStart(2,'0')}`;

export function roundedMetricValue(numerator,denominator=1n){
  return formatHundredths(roundedInteger(numerator,denominator));
}

// The exact value is in [lower/denominator, upper/denominator). Verify that
// this entire interval belongs to the candidate's half-away-from-zero cell.
const intervalRoundsTo=(lower,upper,denominator,candidate)=>{
  const twiceLower=2n*lower,twiceUpper=2n*upper;
  const lowerBoundary=(2n*candidate-1n)*denominator;
  const upperBoundary=(2n*candidate+1n)*denominator;
  if(candidate>0n)return twiceLower>=lowerBoundary&&twiceUpper<=upperBoundary;
  if(candidate<0n)return twiceLower>lowerBoundary&&twiceUpper<=upperBoundary;
  return twiceLower>-denominator&&twiceUpper<=denominator;
};

const floorQuotient=(numerator,denominator)=>{
  let quotient=numerator/denominator,remainder=numerator%denominator;
  if(remainder<0n){quotient--;remainder+=denominator;}
  return {quotient,remainder};
};

// Inputs are reduced first. Using the denominator GCD forms the LCM directly
// and avoids the unnecessarily large intermediate product in the old adder.
const addExact=(left,right)=>{
  if(left.n===0n)return right;
  if(right.n===0n)return left;
  const shared=gcd(left.d,right.d);
  const leftScale=right.d/shared,rightScale=left.d/shared;
  const numerator=left.n*leftScale+right.n*rightScale;
  if(numerator===0n)return {n:0n,d:1n};
  const reduction=gcd(numerator,shared);
  return {n:numerator/reduction,d:(left.d/reduction)*leftScale};
};

const exactRoundedMean=(whole,ratios,count,scale)=>{
  let level=ratios.map(({n,d})=>metricFraction(n*scale,d));
  if(whole!==0n)level.push({n:whole*scale,d:1n});
  if(!level.length)return '0.00';
  while(level.length>1){
    const next=[];
    for(let index=0;index<level.length;index+=2)next.push(index+1<level.length?addExact(level[index],level[index+1]):level[index]);
    level=next;
  }
  return roundedMetricValue(level[0].n,level[0].d*BigInt(count));
};

function roundedMean(whole,ratios,count,scale){
  const countBigInt=BigInt(count),denominator=FAST_SCALE*countBigInt;
  let lower=whole*scale*FAST_SCALE,nonzeroRemainders=0n;
  for(const {n,d} of ratios){
    const {quotient,remainder}=floorQuotient(n*scale*FAST_SCALE,d);
    lower+=quotient;
    if(remainder!==0n)nonzeroRemainders++;
  }
  if(nonzeroRemainders===0n)return roundedMetricValue(lower,denominator);
  const upper=lower+nonzeroRemainders;
  const candidate=roundedInteger(lower,denominator);
  if(intervalRoundsTo(lower,upper,denominator,candidate))return formatHundredths(candidate);
  return exactRoundedMean(whole,ratios,count,scale);
}

export function createMetricMean(){
  let whole=0n,count=0;
  const numeratorsByDenominator=new Map();
  return {
    add(value){
      count++;
      if(typeof value==='bigint'){whole+=value;return;}
      const reduced=metricFraction(value.n,value.d);
      if(reduced.d===1n){whole+=reduced.n;return;}
      numeratorsByDenominator.set(reduced.d,(numeratorsByDenominator.get(reduced.d)||0n)+reduced.n);
    },
    value(scale=1n){
      if(!count)return {count:0,value:null};
      const ratios=[];
      for(const [denominator,numerator] of numeratorsByDenominator){
        if(numerator!==0n)ratios.push(metricFraction(numerator,denominator));
      }
      return {count,value:roundedMean(whole,ratios,count,scale)};
    }
  };
}
