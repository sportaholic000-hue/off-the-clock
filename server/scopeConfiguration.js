// Shared owner/customer form definitions. No prices or quantities are inferred.
export const SCOPE_TYPES=['ROOFING_REPLACEMENT','FLAT_ROOF_REPLACEMENT','FLOORING_INSTALL','FLOORING_REPLACEMENT','SIDING_REPLACEMENT','CONCRETE_DRIVEWAY','CONCRETE_PATIO_SLAB','INTERIOR_PAINTING','EXTERIOR_PAINTING'];
export const SCOPE_FIELDS=['scopeDetails','scopeRates'];
export const scopeRatePath=p=>typeof p==='string'&&p.startsWith('scopeRates.');
const categories=['labor','material','removal','prep','addon','equipment','travel','disposal','permit','overhead','surcharge'];
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v),own=(v,k)=>Object.hasOwn(v||{},k);
const text=v=>typeof v==='string'&&v.trim().length>0&&v.length<=2000;
const finite=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=Number.MAX_SAFE_INTEGER;
const slug=v=>typeof v==='string'&&/^[a-z][a-z0-9_]*$/.test(v);
const bool=label=>({type:'boolean',label}),string=label=>({type:'string',label}),number=(label,unit,min=0)=>({type:'number',label,unit,min}),choice=(label,values)=>({type:'enum',label,values});
export const MULTI_SCOPE_KEYS=['stairs','floor_overlay','siding_removal','demolition'];
export const scopeBaseKey=key=>MULTI_SCOPE_KEYS.find(base=>key===base||key.startsWith(base+'__'))||key;
export const scopeEntriesFor=(p,base)=>Object.entries(record(p.scopeDetails)?p.scopeDetails:{}).filter(([key,d])=>scopeBaseKey(key)===base&&record(d));
const modes=choice('Pricing method',['installed','itemized']);
const common={description:string('Included work and product specification')};
const category=choice('Installed price charge category',categories);
const product={...common,mode:choice('Underlayment price meaning',['installed_area_sell_price','package_cost']),productKey:string('Product and variant purchase group'),coverage:number('Coverage per purchased package','square feet',Number.MIN_VALUE),wastePercent:number('Ordering waste allowance','percent')};
const purchase={...product,mode:choice('Material price meaning',['package_cost'])};
const area=(label,min=0.1)=>({type:'number',label,unit:'square feet',min,max:10_000_000});
const confirm=label=>({type:'boolean',label,unit:null});
const cnumber=(label,unit,min=0.1)=>({type:'number',label,unit,min,max:1_000_000});
const cchoice=(label,values)=>({type:'enum',label,values,unit:null});
const cslug=label=>({type:'slug',label,unit:null});
const rule=(label,fields,confirmation,customerFields={})=>({label,fields,confirmation,customerFields});
const costing=(type,p,rules)=>['INTERIOR_PAINTING','EXTERIOR_PAINTING'].includes(type)&&p.offeringMode!=='installed'&&rules.priceBasisByCategory?.material==='cost';
const floorUnderlay=(c,p)=>['hardwood','laminate','carpet'].includes(c.newFlooringType)||c.newFlooringType==='vinyl_plank'&&(p.vinylPlankUnderlaymentRule==='always_included'||p.vinylPlankUnderlaymentRule==='customer_selectable_addon'&&c.underlaymentSelected===true||p.vinylPlankUnderlaymentRule==='subfloor_condition'&&c.subfloorCondition==='requires_underlayment');

export function scopeDefinitions(type,p={}){
 const out={};
 if(type.startsWith('FLOORING_')){
  for(const f of ['hardwood','laminate','carpet','vinyl_plank'])out['floor_underlayment_'+f]=rule(f.replaceAll('_',' ')+' underlayment',{...product,mode:choice('Underlayment price meaning',['installed_area_sell_price','package_cost','included_in_floor_price'])},'underlaymentScopeConfirmed');
  out.stairs=rule('Complete stair work',{...common,mode:modes,category,flooringType:choice('Stair flooring type',['hardwood','laminate','carpet','vinyl_plank','tile']),maximumWidthLF:number('Maximum tread width included','feet',Number.MIN_VALUE),minimumWidthLF:{...number('Covers treads wider than (optional lower limit)','feet',0),optional:true},underlaymentIncluded:bool('Stair underlayment included'),removalIncluded:bool('Existing stair covering removal included'),disposalIncluded:bool('Stair debris disposal included')},'stairScopeConfirmed',{
   stairWidthLF:cnumber('Measured stair tread width','feet'),stairRemovalNeeded:confirm('Existing stair covering removal requested'),stairDisposalNeeded:confirm('Stair debris disposal requested'),floorAreaExcludesStairs:confirm('The measured flooring area excludes the separately priced stairs')});
  out.floor_overlay=rule('Additional preparation for flooring over an existing floor',{...common,mode:modes,category,existingFloorType:{...string('Existing flooring type covered'),slug:true},newFlooringType:choice('New flooring type covered',['hardwood','laminate','carpet','vinyl_plank','tile']),basePriceExcludesPreparation:bool('Base flooring prices exclude this additional preparation')},'overlayScopeConfirmed');
 }
 if(type==='ROOFING_REPLACEMENT')for(const key of new Set([...Object.keys(p.underlaymentPriceBasis||{}),...Object.keys(p.materialCostPerSquare||{})]))if(slug(key))out['roof_underlayment_'+key]=rule(key.replaceAll('_',' ')+' roof underlayment',purchase,'roofUnderlaymentScopeConfirmed');
 if(type==='SIDING_REPLACEMENT'){
  out.siding_removal=rule('Existing siding removal',{...common,mode:modes,category,existingSidingType:string('Existing siding type covered'),stories:choice('Stories covered by the removal price',[1,2,3]),disposalIncluded:bool('Siding disposal included')},'sidingRemovalScopeConfirmed',{existingSidingType:cslug('Existing siding type to remove'),sidingRemovalAreaSqft:area('Measured existing siding removal area'),sidingRemovalStories:cchoice('Stories of the existing siding removal',[1,2,3])});
  out.siding_trim=rule('Siding trim installation',{...common,mode:modes,category,basePriceExcludesTrim:bool('Base siding prices exclude this separately priced trim')},'sidingTrimScopeConfirmed');
 }
 if(type.startsWith('CONCRETE_')){
  out.demolition=rule('Existing slab demolition',{...common,mode:modes,category,maximumThickness:number('Maximum existing slab thickness included','inches',Number.MIN_VALUE),minimumThickness:{...number('Covers slabs thicker than (optional lower limit)','inches',0),optional:true},reinforcement:choice('Existing reinforcement covered',['none','wire_mesh','rebar']),accessDifficulty:choice('Demolition access covered',['easy','moderate','difficult']),accessMatch:{...choice('Demolition access matching',['exact','up_to']),optional:true},disposalIncluded:bool('Demolition debris disposal included')},'demolitionScopeConfirmed',{demolitionThickness:cnumber('Measured existing slab thickness','inches'),demolitionReinforcement:cchoice('Existing slab reinforcement',['none','wire_mesh','rebar']),demolitionAccessDifficulty:cchoice('Existing slab demolition access',['easy','moderate','difficult'])});
  out.exposed_aggregate=rule('Additional exposed-aggregate finishing',{...common,mode:modes,category,basePriceExcludesFinish:bool('The base labor and concrete prices exclude these additional finishing charges')},'exposedAggregateScopeConfirmed');
 }
 if(type==='FLAT_ROOF_REPLACEMENT')out.insulation=rule('Roof insulation and coverboard',{...common,mode:modes,category,insulationSystem:string('Insulation system and thickness'),coverboardSystem:string('Coverboard system and thickness'),baseRoofLaborExcludesInstallation:bool('Base roof labor excludes separately priced insulation and coverboard installation')},'insulationScopeConfirmed',{insulationAreaSqft:area('Measured insulation area'),coverboardAreaSqft:area('Measured coverboard area')});
 if(['INTERIOR_PAINTING','EXTERIOR_PAINTING'].includes(type))for(const [key,label]of Object.entries({paint_wall:'Wall finish materials',paint_primer:'Wall primer materials',paint_prep:'Preparation materials',paint_ceiling:'Ceiling finish materials',paint_ceiling_primer:'Ceiling primer materials',paint_trim:'Complete trim coating materials'}))out[key]=rule(label,purchase,'paintProductsConfirmed');
 for(const key of Object.keys(p.scopeDetails||{})){const base=scopeBaseKey(key);if(base!==key&&slug(key)&&own(out,base))out[key]={...out[base],baseKey:base};}
 return out;
}

export function scopeKeysForRequest(type,c,p={},rules={}){
 const keys=[];
 if(type.startsWith('FLOORING_')){
  const k='floor_underlayment_'+c.newFlooringType;
  if(floorUnderlay(c,p)&&(c.newFlooringType!=='vinyl_plank'||p.underlaymentPriceBasis==='cost'||own(p.scopeDetails,k)))keys.push(k);
  if(c.stairSteps>0)keys.push('stairs');
  if(c.removalNeeded===false&&c.existingFloorType!=='none')keys.push('floor_overlay');
 }
 if(type==='ROOFING_REPLACEMENT'&&p.underlaymentPriceBasis?.[c.replacementRoofType]==='cost')keys.push('roof_underlayment_'+c.replacementRoofType);
 if(type==='SIDING_REPLACEMENT'){if(c.oldSidingRemoval)keys.push('siding_removal');if(c.trimIncluded)keys.push('siding_trim');}
 if(type.startsWith('CONCRETE_')){if(c.demolitionNeeded)keys.push('demolition');if(c.finishType==='exposed_aggregate')keys.push('exposed_aggregate');}
 if(type==='FLAT_ROOF_REPLACEMENT'&&(c.insulationNeeded===true||c.coverboardNeeded===true))keys.push('insulation');
 if(costing(type,p,rules)){
  keys.push('paint_wall');const d=p.offeringDetails||{};
  if(p.offeringMode==='itemized'){
   if(d.primerCoats>0)keys.push('paint_primer');keys.push('paint_prep');
   if(c.ceilingsIncluded){keys.push('paint_ceiling');if(d.ceilingPrimerCoats>0)keys.push('paint_ceiling_primer');}
  }else{if(c.ceilingsIncluded)keys.push('paint_ceiling');if(c.trimIncluded)keys.push('paint_trim');}
 }
 return keys.flatMap(base=>{if(!MULTI_SCOPE_KEYS.includes(base))return [base];const matched=scopeEntriesFor(p,base).filter(([key,d])=>scopeMatchesRequest(key,d,c));return matched.length?matched.map(([key])=>key):[base];});
}

export function scopeRateDefinitions(type,p={},allModes=false){
 const out={},catalog=scopeDefinitions(type,p);
 for(const [key,d]of Object.entries(record(p.scopeDetails)?p.scopeDetails:{})){
  if(!own(catalog,key)||!record(d))continue;
  const add=(rateKey,label,category,unit,priceBasis,kind='unit_rate')=>out[rateKey]={scopeKey:key,label,category,unit,...(priceBasis?{priceBasis}:{}),moneyKind:base==='stairs'?'fixed_amount':kind,...(key==='insulation'?{layer:rateKey.split('_')[0]}:{})};
  const base=scopeBaseKey(key),label=catalog[key].label;
  if(key.startsWith('floor_underlayment_')&&d.mode==='included_in_floor_price'&&!allModes)continue;
  if(key.includes('underlayment')||key.startsWith('paint_')){add(key,label,'material',d.mode==='package_cost'?'purchased packages':key==='paint_trim'?'linear feet':'installed square feet',d.mode==='package_cost'?'cost':'sell_price',d.mode==='package_cost'?'fixed_amount':'unit_rate');continue;}
  const installed=d.mode==='installed',basis=installed?'sell_price':undefined;
  if(key==='insulation'){
   for(const layer of ['insulation','coverboard']){
    if(installed||allModes)add(layer+'_installed',layer+' installed price',d.category,layer+' square feet','sell_price');
    if(!installed||allModes)for(const cat of ['labor','material'])add(layer+'_'+cat,layer+' '+cat,cat,layer+' square feet');
   }
   continue;
  }
  const unit=base==='stairs'?'confirmed steps':key==='siding_trim'?'measured trim linear feet':'measured square feet';
  if(installed||allModes)add(key+'_installed',label+' complete installed price',d.category,unit,'sell_price');
  if(!installed||allModes){
   const components=base==='stairs'?['labor','material',...(d.underlaymentIncluded||allModes?['underlayment']:[]),...(d.removalIncluded||allModes?['removal']:[]),...(d.disposalIncluded||allModes?['disposal']:[])]:base==='siding_removal'||base==='demolition'?['removal',...(d.disposalIncluded||allModes?['disposal']:[])]:base==='floor_overlay'?['prep','material']:['labor','material'];
   for(const cat of components)add(key+'_'+cat,label+' '+(cat==='removal'?(base==='stairs'?'removal labor':['siding_removal','demolition'].includes(base)?'labor':cat):cat),cat==='underlayment'?'material':cat,unit,basis);
  }
 }
 return out;
}

function scopeConditions(type,key,p,rules){
 key=scopeBaseKey(key);
 if(key.startsWith('floor_underlayment_')){
  const f=key.slice('floor_underlayment_'.length),base=[['newFlooringType','eq',f]];
  if(f!=='vinyl_plank'||p.vinylPlankUnderlaymentRule==='always_included')return [base];
  if(p.vinylPlankUnderlaymentRule==='customer_selectable_addon')return [[...base,['underlaymentSelected','eq',true]]];
  if(p.vinylPlankUnderlaymentRule==='subfloor_condition')return [[...base,['subfloorCondition','eq','requires_underlayment']]];
  return [];
 }
 if(key.startsWith('roof_underlayment_')){const f=key.slice('roof_underlayment_'.length);return p.underlaymentPriceBasis?.[f]==='cost'?[[['replacementRoofType','eq',f]]]:[];}
 if(key==='stairs')return [[['stairSteps','gt',0]]];
 if(key==='floor_overlay')return [[['removalNeeded','eq',false],['existingFloorType','ne','none']]];
 if(key==='siding_removal')return [[['oldSidingRemoval','eq',true]]];
 if(key==='siding_trim')return [[['trimIncluded','eq',true]]];
 if(key==='demolition')return [[['demolitionNeeded','eq',true]]];
 if(key==='exposed_aggregate')return [[['finishType','eq','exposed_aggregate']]];
 if(key==='insulation')return [[['insulationNeeded','eq',true]],[['coverboardNeeded','eq',true]]];
 if(key.startsWith('paint_'))return costing(type,p,rules)?[[]]:[];
 return [];
}
// Retain a supplied value on screen even after scope changes, so the customer
// can explicitly correct it. Visibility never deletes submitted facts.
const matchesConditions=(conditions,values)=>!conditions||conditions.some(all=>all.every(([key,op,value])=>values[key]!==undefined&&(op==='eq'?values[key]===value:op==='ne'?values[key]!==value:op==='in'?value.includes(values[key]):op==='lte'?typeof values[key]==='number'&&values[key]<=value:typeof values[key]==='number'&&values[key]>value)));
export function customerFieldVisible(field,values={}){
 return own(values,field.name)||matchesConditions(field.visibleWhen,values);
}
// Labels and product details follow the measured selection. A shared Yes/No
// field must never acquire the last product's wording merely due to map order.
export function customerFieldForInputs(field,values={}){
 const selected=(field.presentationVariants||[]).filter(v=>matchesConditions(v.visibleWhen,values));
 if(!selected.length)return field;
 const labels=[...new Set(selected.map(v=>v.label))],details=[...new Set(selected.flatMap(v=>(v.details||[]).map(detail=>v.tierName?v.tierName+': '+detail:detail)))];
 return {...field,label:labels.join('; '),...(details.length?{details}:{})};
}
export function clearChangedScopeConfirmations(fields,before,after){
 const next={...after};
 for(const field of fields)if(field.type==='boolean'&&field.presentationVariants?.some(v=>v.details?.length)&&own(before,field.name)&&own(after,field.name)){
  const oldView=customerFieldForInputs(field,before),newView=customerFieldForInputs(field,after);
  const wasApplicable=field.presentationVariants.some(v=>matchesConditions(v.visibleWhen,before)),isApplicable=field.presentationVariants.some(v=>matchesConditions(v.visibleWhen,after));
  if(wasApplicable!==isApplicable||JSON.stringify([oldView.label,oldView.details])!==JSON.stringify([newView.label,newView.details]))delete next[field.name];
 }
 return next;
}
export function mergeCustomerFieldDefinitions(variants){
 const out={};
 for(const {tierName,fields} of variants)for(const [name,field] of Object.entries(fields)){
  const prior=out[name],presentations=(field.presentationVariants||[{label:field.label,details:field.details,visibleWhen:field.visibleWhen}]).map(v=>({...v,...(tierName?{tierName}:{})}));
  out[name]={...(prior||field),presentationVariants:[...(prior?.presentationVariants||[]),...presentations]};
  if(prior){
   if(field.values)out[name].values=[...new Set([...(prior.values||[]),...field.values])];
   if(field.options)out[name].options={...field.options,...prior.options};
   if(!prior.visibleWhen||!field.visibleWhen)delete out[name].visibleWhen;
   else out[name].visibleWhen=[...prior.visibleWhen,...field.visibleWhen];
  }
 }
 return out;
}
export function scopeCustomerFields(type,p={},rules={}){
 const out={},defs=scopeDefinitions(type,p);
 // Selection facts are collected even before an entry matches.
 for(const [key,def] of Object.entries(defs))if(scopeBaseKey(key)===key)for(const [name,field] of Object.entries(def.customerFields))out[name]={...field,visibleWhen:key==='insulation'?[[[name.startsWith('coverboard')?'coverboardNeeded':'insulationNeeded','eq',true]]]:scopeConditions(type,key,p,rules)};
 if(type==='SIDING_REPLACEMENT'&&scopeEntriesFor(p,'siding_removal').length)out.existingSidingType={...cchoice('Existing siding type to remove',[...new Set(scopeEntriesFor(p,'siding_removal').map(([,d])=>d.existingSidingType).filter(text))]),visibleWhen:scopeConditions(type,'siding_removal',p,rules)};
 for(const [key,d]of Object.entries(record(p.scopeDetails)?p.scopeDetails:{}))if(own(defs,key)&&record(d)){
  const base=scopeBaseKey(key),conditions=scopeConditions(type,key,p,rules),visibleWhen=conditions.map(all=>[...all,...scopeMatchConditions(base,d)]);
  const name=defs[key].confirmation,label=key.startsWith('paint_')?'The selected paint products, coating variants and preparation products match this job':'Confirmed '+defs[key].label.toLowerCase()+': '+(d.description||'owner-defined scope');
  const details=[defs[key].label+': '+(d.description||'')];
  if(base==='stairs')details.push('Flooring: '+d.flooringType+'. Maximum tread width: '+d.maximumWidthLF+' ft. '+['underlayment','removal','disposal'].map(part=>(part==='underlayment'?'Underlayment':part==='removal'?'Existing covering removal':'Debris disposal')+(d[part+'Included']?' is included.':' is not included.')).join(' '));
  const variants=key==='insulation'?['insulation','coverboard'].map(layer=>({label:'Confirmed '+layer+' work: '+(d[layer+'System']||'owner-defined system'),details:[layer+': '+(d[layer+'System']||''),d.description||''],visibleWhen:[[[layer+'Needed','eq',true]]]})):[{label,details,visibleWhen}];
  out[name]={...confirm(out[name]?.label||label),details:[...(out[name]?.details||[]),...details],visibleWhen:[...(out[name]?.visibleWhen||[]),...visibleWhen],presentationVariants:[...(out[name]?.presentationVariants||[]),...variants]};
 }
 return out;
}
export function scopeRequiredCustomer(type,c,p={},rules={}){
 const fields=[],defs=scopeDefinitions(type,p);
 // A requested insulation/coverboard layer always needs its measured area,
 // even before the owner prices it, so the area is never treated as stray input.
 for(const key of scopeKeysForRequest(type,c,p,rules))if(defs[key]&&(key==='insulation'||record(p.scopeDetails?.[key])||scopeEntriesFor(p,scopeBaseKey(key)).length)){
  if(record(p.scopeDetails?.[key]))fields.push(defs[key].confirmation);
  fields.push(...Object.keys(defs[key].customerFields).filter(name=>key!=='insulation'||c[(name.startsWith('coverboard')?'coverboard':'insulation')+'Needed']===true));
 }
 return [...new Set(fields)];
}

function accessValues(d){const ordered=['easy','moderate','difficult'];return d.accessMatch==='up_to'?ordered.slice(0,ordered.indexOf(d.accessDifficulty)+1):[d.accessDifficulty];}
function scopeMatchConditions(base,d){
 if(base==='stairs')return [['newFlooringType','eq',d.flooringType],['stairWidthLF','lte',d.maximumWidthLF],...(finite(d.minimumWidthLF)?[['stairWidthLF','gt',d.minimumWidthLF]]:[]),['stairRemovalNeeded','eq',d.removalIncluded],['stairDisposalNeeded','eq',d.disposalIncluded]];
 if(base==='floor_overlay')return [['existingFloorType','eq',d.existingFloorType],['newFlooringType','eq',d.newFlooringType]];
 if(base==='siding_removal')return [['existingSidingType','eq',d.existingSidingType],['sidingRemovalStories','eq',d.stories]];
 if(base==='demolition')return [['demolitionThickness','lte',d.maximumThickness],...(finite(d.minimumThickness)?[['demolitionThickness','gt',d.minimumThickness]]:[]),['demolitionReinforcement','eq',d.reinforcement],['demolitionAccessDifficulty','in',accessValues(d)]];
 return [];
}
export function scopeEntrySummary(key,d={}){
 const base=scopeBaseKey(key),words=v=>typeof v==='string'?v.replaceAll('_',' '):v,range=(low,high,unit)=>(finite(low)?'over '+low+' up to ':'up to ')+(finite(high)?high:'?')+' '+unit;
 if(base==='siding_removal')return [words(d.existingSidingType)||'siding type not set',d.stories?d.stories+(d.stories===1?' story':' stories'):'stories not set'].join(', ');
 if(base==='demolition')return [range(d.minimumThickness,d.maximumThickness,'in'),words(d.reinforcement)||'reinforcement not set',(d.accessMatch==='up_to'?'access up to ':'')+(words(d.accessDifficulty)||'access not set')].join(', ');
 if(base==='stairs')return [words(d.flooringType)||'flooring not set',range(d.minimumWidthLF,d.maximumWidthLF,'ft wide')].join(', ');
 if(base==='floor_overlay')return (words(d.newFlooringType)||'new floor not set')+' over '+(words(d.existingFloorType)||'existing floor not set');
 return '';
}
export function scopeMatchesRequest(key,d,c){return matchesConditions([scopeMatchConditions(scopeBaseKey(key),d)],c);}
export function scopeOverlapDiagnostics(type,p={}){
 const out=[],catalog=scopeDefinitions(type,p);
 for(const base of MULTI_SCOPE_KEYS){
  const entries=scopeEntriesFor(p,base).filter(([key,d])=>catalog[key]&&scopeMatchConditions(base,d).every(([,op,value])=>op==='in'?value.length&&value.every(v=>v!==undefined):value!==undefined));
  for(let i=0;i<entries.length;i++)for(let j=i+1;j<entries.length;j++){
   const [left,a]=entries[i],[right,b]=entries[j];
   const band=(low,high,low2,high2)=>Math.max(finite(low)?low:0,finite(low2)?low2:0)<Math.min(high,high2);
   const overlaps=base==='stairs'?a.flooringType===b.flooringType&&a.removalIncluded===b.removalIncluded&&a.disposalIncluded===b.disposalIncluded&&band(a.minimumWidthLF,a.maximumWidthLF,b.minimumWidthLF,b.maximumWidthLF):
    base==='floor_overlay'?a.existingFloorType===b.existingFloorType&&a.newFlooringType===b.newFlooringType:
    base==='siding_removal'?a.existingSidingType===b.existingSidingType&&a.stories===b.stories:
    a.reinforcement===b.reinforcement&&band(a.minimumThickness,a.maximumThickness,b.minimumThickness,b.maximumThickness)&&accessValues(a).some(v=>accessValues(b).includes(v));
   if(overlaps)out.push({type:'invalid',kind:'scope_configuration',path:'scopeDetails.'+right,message:'This scope overlaps '+left+'. Give each entry distinct matching facts before saving.'});
  }
 }
 return out;
}
