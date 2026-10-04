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
  out.stairs=rule('Complete stair work',{...common,mode:modes,category,flooringType:choice('Stair flooring type',['hardwood','laminate','carpet','vinyl_plank','tile']),maximumWidthLF:number('Maximum tread width included','feet',Number.MIN_VALUE),underlaymentIncluded:bool('Stair underlayment included'),removalIncluded:bool('Existing stair covering removal included'),disposalIncluded:bool('Stair debris disposal included')},'stairScopeConfirmed',{
   stairWidthLF:cnumber('Measured stair tread width','feet'),stairRemovalNeeded:confirm('Existing stair covering removal requested'),stairDisposalNeeded:confirm('Stair debris disposal requested'),floorAreaExcludesStairs:confirm('The measured flooring area excludes the separately priced stairs')});
  out.floor_overlay=rule('Additional preparation for flooring over an existing floor',{...common,mode:modes,category,existingFloorType:string('Existing flooring type covered'),newFlooringType:choice('New flooring type covered',['hardwood','laminate','carpet','vinyl_plank','tile']),basePriceExcludesPreparation:bool('Base flooring prices exclude this additional preparation')},'overlayScopeConfirmed');
 }
 if(type==='ROOFING_REPLACEMENT')for(const key of new Set([...Object.keys(p.underlaymentPriceBasis||{}),...Object.keys(p.materialCostPerSquare||{})]))if(slug(key))out['roof_underlayment_'+key]=rule(key.replaceAll('_',' ')+' roof underlayment',purchase,'roofUnderlaymentScopeConfirmed');
 if(type==='SIDING_REPLACEMENT'){
  out.siding_removal=rule('Existing siding removal',{...common,mode:modes,category,existingSidingType:string('Existing siding type covered'),stories:choice('Stories covered by the removal price',[1,2,3]),disposalIncluded:bool('Siding disposal included')},'sidingRemovalScopeConfirmed',{existingSidingType:cslug('Existing siding type to remove'),sidingRemovalAreaSqft:area('Measured existing siding removal area'),sidingRemovalStories:cchoice('Stories of the existing siding removal',[1,2,3])});
  out.siding_trim=rule('Siding trim installation',{...common,mode:modes,category,basePriceExcludesTrim:bool('Base siding prices exclude this separately priced trim')},'sidingTrimScopeConfirmed');
 }
 if(type.startsWith('CONCRETE_')){
  out.demolition=rule('Existing slab demolition',{...common,mode:modes,category,maximumThickness:number('Maximum existing slab thickness included','inches',Number.MIN_VALUE),reinforcement:choice('Existing reinforcement covered',['none','wire_mesh','rebar']),accessDifficulty:choice('Demolition access covered',['easy','moderate','difficult']),disposalIncluded:bool('Demolition debris disposal included')},'demolitionScopeConfirmed',{demolitionThickness:cnumber('Measured existing slab thickness','inches'),demolitionReinforcement:cchoice('Existing slab reinforcement',['none','wire_mesh','rebar']),demolitionAccessDifficulty:cchoice('Existing slab demolition access',['easy','moderate','difficult'])});
  out.exposed_aggregate=rule('Additional exposed-aggregate finishing',{...common,mode:modes,category,basePriceExcludesFinish:bool('The base labor and concrete prices exclude these additional finishing charges')},'exposedAggregateScopeConfirmed');
 }
 if(type==='FLAT_ROOF_REPLACEMENT')out.insulation=rule('Roof insulation and coverboard',{...common,mode:modes,category,insulationSystem:string('Insulation system and thickness'),coverboardSystem:string('Coverboard system and thickness'),baseRoofLaborExcludesInstallation:bool('Base roof labor excludes separately priced insulation and coverboard installation')},'insulationScopeConfirmed',{insulationAreaSqft:area('Measured insulation area'),coverboardAreaSqft:area('Measured coverboard area')});
 if(['INTERIOR_PAINTING','EXTERIOR_PAINTING'].includes(type))for(const [key,label]of Object.entries({paint_wall:'Wall finish materials',paint_primer:'Wall primer materials',paint_prep:'Preparation materials',paint_ceiling:'Ceiling finish materials',paint_ceiling_primer:'Ceiling primer materials',paint_trim:'Complete trim coating materials'}))out[key]=rule(label,purchase,'paintProductsConfirmed');
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
 if(type==='FLAT_ROOF_REPLACEMENT'&&c.buildingType==='commercial')keys.push('insulation');
 if(costing(type,p,rules)){
  keys.push('paint_wall');const d=p.offeringDetails||{};
  if(p.offeringMode==='itemized'){
   if(d.primerCoats>0)keys.push('paint_primer');keys.push('paint_prep');
   if(c.ceilingsIncluded){keys.push('paint_ceiling');if(d.ceilingPrimerCoats>0)keys.push('paint_ceiling_primer');}
  }else{if(c.ceilingsIncluded)keys.push('paint_ceiling');if(c.trimIncluded)keys.push('paint_trim');}
 }
 return keys;
}

export function scopeRateDefinitions(type,p={},allModes=false){
 const out={},catalog=scopeDefinitions(type,p);
 for(const [key,d]of Object.entries(record(p.scopeDetails)?p.scopeDetails:{})){
  if(!own(catalog,key)||!record(d))continue;
  const add=(rateKey,label,category,unit,priceBasis,kind='unit_rate')=>out[rateKey]={scopeKey:key,label,category,unit,...(priceBasis?{priceBasis}:{}),moneyKind:kind};
  const label=catalog[key].label;
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
  const unit=key==='stairs'?'confirmed steps':key==='siding_trim'?'measured trim linear feet':'measured square feet';
  if(installed||allModes)add(key+'_installed',label+' complete installed price',d.category,unit,'sell_price');
  if(!installed||allModes){
   const components=key==='stairs'?['labor','material',...(d.underlaymentIncluded||allModes?['underlayment']:[]),...(d.removalIncluded||allModes?['removal']:[]),...(d.disposalIncluded||allModes?['disposal']:[])]:key==='siding_removal'||key==='demolition'?['removal',...(d.disposalIncluded||allModes?['disposal']:[])]:key==='floor_overlay'?['prep','material']:['labor','material'];
   for(const cat of components)add(key+'_'+cat,label+' '+(cat==='removal'&&['siding_removal','demolition'].includes(key)?'labor':cat),cat==='underlayment'?'material':cat,unit,basis);
  }
 }
 return out;
}

function scopeConditions(type,key,p,rules){
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
 if(key==='insulation')return [[['buildingType','eq','commercial']]];
 if(key.startsWith('paint_'))return costing(type,p,rules)?[[]]:[];
 return [];
}
// Retain a supplied value on screen even after scope changes, so the customer
// can explicitly correct it. Visibility never deletes submitted facts.
const matchesConditions=(conditions,values)=>!conditions||conditions.some(all=>all.every(([key,op,value])=>values[key]!==undefined&&(op==='eq'?values[key]===value:op==='ne'?values[key]!==value:typeof values[key]==='number'&&values[key]>value)));
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
  if(JSON.stringify([oldView.label,oldView.details])!==JSON.stringify([newView.label,newView.details]))delete next[field.name];
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
 for(const [key,d]of Object.entries(record(p.scopeDetails)?p.scopeDetails:{}))if(own(defs,key)&&record(d)){
  const visibleWhen=scopeConditions(type,key,p,rules);
  for(const [name,field]of Object.entries(defs[key].customerFields))out[name]={...field,visibleWhen};
  if(key==='siding_removal')out.existingSidingType={...cchoice('Existing siding type to remove',[d.existingSidingType].filter(text)),visibleWhen};
  const name=defs[key].confirmation,label=key.startsWith('paint_')?'The selected paint products, coating variants and preparation products match this job':'Confirmed '+defs[key].label.toLowerCase()+': '+(d.description||'owner-defined scope');
  const details=[defs[key].label+': '+(d.description||'')];
  if(key==='insulation')details.push('Insulation: '+(d.insulationSystem||''),'Coverboard: '+(d.coverboardSystem||''));
  if(key==='stairs')details.push('Flooring: '+d.flooringType+'. Maximum tread width: '+d.maximumWidthLF+' ft. '+['underlayment','removal','disposal'].map(key=>(key==='underlayment'?'Underlayment':key==='removal'?'Existing covering removal':'Debris disposal')+(d[key+'Included']?' is included.':' is not included.')).join(' '));
  out[name]={...confirm(out[name]?.label||label),details:[...(out[name]?.details||[]),...details],visibleWhen:[...(out[name]?.visibleWhen||[]),...visibleWhen],presentationVariants:[...(out[name]?.presentationVariants||[]),{label,details,visibleWhen}]};
 }
 return out;
}
export function scopeRequiredCustomer(type,c,p={},rules={}){
 const fields=[],defs=scopeDefinitions(type,p);
 for(const key of scopeKeysForRequest(type,c,p,rules))if(record(p.scopeDetails?.[key])&&defs[key])fields.push(defs[key].confirmation,...Object.keys(defs[key].customerFields));
 return [...new Set(fields)];
}
