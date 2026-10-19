// Independent outcomes; this module never calls a calculator.
import {cases as originalCases} from '../qe-agent1-activation-parity-review-20261019/cases.mjs';
import {randomUUID} from 'node:crypto';
export function cases(){
 const base=originalCases().find(c=>c.id==='ROOFING_REPLACEMENT--base'),out=[];
 const add=(id,change,ready=true,cents=391000,extra={})=>{const row=structuredClone(base);row.id=id;row.variant=id;row.note='Handwritten EXPECTED.md; no calculator oracle';change(row.input);row.expected={catalog:true,approval:true,ready,...(ready?{cents}:{}),...extra};out.push(row);};
 const policies=[
  ['missing-unknown',p=>delete p.unknownPitchBand,true,539000,null],
  ['missing-install',p=>delete p.pitchInstallationAdderOverTwelve,false,null,451800],
  ['missing-removal',p=>delete p.pitchRemovalAdderOverTwelve,false,null,451800],
  ['missing-both',p=>{delete p.pitchInstallationAdderOverTwelve;delete p.pitchRemovalAdderOverTwelve;},false,null,451800],
  ['complete-positive',()=>{},true,539000,451800],
  ['explicit-zero',p=>{p.pitchInstallationAdderOverTwelve=0;p.pitchRemovalAdderOverTwelve=0;},true,391000,451800],
  ['unknown-complete-over12',p=>p.unknownPitchBand='over_twelve',true,539000,539000],
  ['unknown-incomplete-over12',p=>{p.unknownPitchBand='over_twelve';delete p.pitchRemovalAdderOverTwelve;},false,null,null]
 ];
 for(const [name,edit,overReady,overCents,unknownCents] of policies){
  for(const [scope,ready,cents,select] of [
   ['low',true,391000,()=>{}],
   ['over12',overReady,overCents,c=>c.pitchBand='over_twelve'],
   ['mixed-zero',true,391000,c=>{c.pitchMethod='area_by_pitch';delete c.pitchBand;c.pitchAreaUpTo6Sqft=1000;c.pitchAreaOver12Sqft=0;}],
   ['mixed-positive',overReady,overCents===391000?391000:465000,c=>{c.pitchMethod='area_by_pitch';delete c.pitchBand;c.pitchAreaUpTo6Sqft=500;c.pitchAreaOver12Sqft=500;}],
   ['unknown',unknownCents!==null,unknownCents,c=>{c.pitchMethod='not_sure';delete c.pitchBand;}]
  ])add(name+'--'+scope,f=>{edit(f.ownerPricing.pricing);select(f.customerInputs);},ready,cents);
 }
 for(const [band,cents] of [['up_to_six',391000],['seven_to_nine',451800],['ten_to_twelve',485800]])add('unknown-band-'+band,f=>{f.ownerPricing.pricing.unknownPitchBand=band;f.customerInputs.pitchMethod='not_sure';delete f.customerInputs.pitchBand;},true,cents);
 for(const scope of ['low','over12','unknown'])add('tier-completion--'+scope,f=>{
  delete f.ownerPricing.pricing.pitchRemovalAdderOverTwelve;f.ownerPricing.pricing.unknownPitchBand='over_twelve';
  f.ownerPricing.tiers=[{name:'Inherited incomplete steep',overrides:{}},{name:'Explicit complete steep',overrides:{pitchRemovalAdderOverTwelve:.6}}];
  if(scope==='over12')f.customerInputs.pitchBand='over_twelve';
  if(scope==='unknown'){f.customerInputs.pitchMethod='not_sure';delete f.customerInputs.pitchBand;}
 },true,scope==='low'?391000:539000,{options:scope==='low'?2:1});
 for(const scope of ['low','over12'])add('tier-explicit-zero--'+scope,f=>{
  delete f.ownerPricing.pricing.unknownPitchBand;delete f.ownerPricing.pricing.pitchRemovalAdderOverTwelve;
  f.ownerPricing.tiers=[{name:'Inherited incomplete steep',overrides:{}},{name:'Explicit zero steep',overrides:{pitchInstallationAdderOverTwelve:0,pitchRemovalAdderOverTwelve:0}}];if(scope==='over12')f.customerInputs.pitchBand='over_twelve';
 },true,391000,{options:scope==='low'?2:1});
 for(const n of [2,11])for(const policy of ['missing-unknown','missing-removal','unknown-incomplete-over12'])for(const selected of ['complete','incomplete'])add('catalog-'+n+'-'+policy+'--'+selected,f=>{
  const p=f.ownerPricing.pricing;policies.find(r=>r[0]===policy)[1](p);
  for(let i=1;i<n;i++){
   const key='synthetic_roof_'+i;p.laborPerSquare[key]=20000;p.tearOffPerSquare[key]=6000;
   // Every sibling has labor/removal but lacks material and underlayment.
   for(const field of ['replacementRoofType','existingRoofType'])f.ownerPricing.knownOfferings[field][key]=randomUUID();
  }
  if(selected==='incomplete'){f.customerInputs.replacementRoofType='synthetic_roof_'+(n-1);f.customerInputs.confirmedFacts.replacementRoofType={status:'identified',field:'replacementRoofType',value:f.customerInputs.replacementRoofType,offeringId:f.ownerPricing.knownOfferings.replacementRoofType[f.customerInputs.replacementRoofType]};}
 },selected==='complete');
 add('historical-missing-measurement',f=>delete f.customerInputs.roofSizeInput,false);
 return out;
}
