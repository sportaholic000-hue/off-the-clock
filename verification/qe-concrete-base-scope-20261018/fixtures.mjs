import {concreteFixture} from '../../test/quoteConcreteLandscape20261016Fixture.mjs';
import {includedFixture} from '../../test/quoteEngineVNextFixtures.mjs';

export const BASE='1857b7779b83b70f7753b41b72c3677270cd4ffc';
export const types=['CONCRETE_DRIVEWAY','CONCRETE_PATIO_SLAB'];
export const expected={none:763000,legacy:868000,blank:868000,gravel:803000,grading:835000,both:875000,zero_gravel:763000,zero_grading:763000,zero_both:763000,invalid_gravel:null,invalid_grading:null,options:{'Gravel only':803000,'Both components':875000,'Labor only':835000},financial:1232760,fees:885000,minimum:1000000};
export function fixtureFor(type,kind){
  const f=concreteFixture(20,30);f.serviceType=type;f.ownerPricing.serviceType=type;f.ownerPricing.origin.serviceType=type;f.ownerPricing.service='[SYNTHETIC] '+type;
  f.customerInputs.baseNeeded=kind!=='none';const p=f.ownerPricing.pricing;
  if(kind==='blank'){p.baseGravelPerCubicYard='';p.baseExcavationGradingPerSqft=null;}
  if(!['legacy','blank'].includes(kind))Object.assign(p,{baseDepthInches:4,baseCompactionAllowance:.2});
  if(['gravel','both','none','options','financial','fees','minimum'].includes(kind))p.baseGravelPerCubicYard=4500;
  if(['grading','both','none','financial','fees','minimum'].includes(kind))p.baseExcavationGradingPerSqft=120;
  const zeros={};
  if(['zero_gravel','zero_both','invalid_gravel'].includes(kind)){p.baseGravelPerCubicYard=0;zeros.baseGravelPerCubicYard='concreteCostPerCubicYard';}
  if(['zero_grading','zero_both','invalid_grading'].includes(kind)){p.baseExcavationGradingPerSqft=0;zeros.baseExcavationGradingPerSqft='laborPerSqft';}
  if(kind.startsWith('zero_'))f.ownerPricing=includedFixture(f.ownerPricing,zeros);
  if(kind==='options')f.ownerPricing.tiers=[{name:'Gravel only',overrides:{}},{name:'Both components',overrides:{baseExcavationGradingPerSqft:120}},{name:'Labor only',overrides:{baseGravelPerCubicYard:null,baseExcavationGradingPerSqft:120}}];
  if(kind==='financial'){f.customerInputs.accessDifficulty='difficult';Object.assign(f.businessDefaults,{markupPercent:20,taxMode:'TAX_MATERIALS',taxPercent:10});}
  if(kind==='fees'){f.ownerPricing.feeRules.travel='always';f.businessDefaults.travelFee=10000;}
  if(kind==='minimum')p.minimumJob=1000000;
  return f;
}
export function numericalOutput(value,path='',out={}){
  if(typeof value==='number'||(typeof value==='string'&&/\.(numerator|denominator)$/.test(path)))out[path]=value;
  else if(value&&typeof value==='object')for(const [key,child] of Object.entries(value))numericalOutput(child,path?path+'.'+key:key,out);
  return out;
}
export const moneyText=value=>JSON.stringify(value).match(/\$[\d,]+(?:\.\d{2})?/g)||[];
export const finalCents=option=>option.calculationRecord.scenarios.mid.finalTotalCents;
