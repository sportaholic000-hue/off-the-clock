import {exactAdd,exactCompare,exactDecimal,exactDivide,exactMultiply,exactToNumber} from './exactMath.js';
import {measuredOutlineVNext} from './geometry.js';

// Owner-defined measured scope. Prices never live in descriptions. Existing
// prices retain their meaning; an explicitly configured scope replaces only
// the corresponding formerly unsupported component.
import {scopeBaseKey,scopeEntriesFor,scopeMatchesRequest,scopeOverlapDiagnostics,SCOPE_TYPES,SCOPE_FIELDS,scopeRatePath,scopeDefinitions,scopeKeysForRequest,scopeRateDefinitions,scopeCustomerFields,scopeRequiredCustomer} from '../scopeConfiguration.js';
export {scopeBaseKey,scopeEntriesFor,scopeMatchesRequest,scopeOverlapDiagnostics,SCOPE_TYPES,SCOPE_FIELDS,scopeRatePath,scopeDefinitions,scopeKeysForRequest,scopeRateDefinitions,scopeCustomerFields,scopeRequiredCustomer};
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v),own=(v,k)=>Object.hasOwn(v||{},k);
const text=v=>typeof v==='string'&&v.trim().length>0&&v.length<=2000;
const finite=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=Number.MAX_SAFE_INTEGER;
const costing=(type,p,rules)=>['INTERIOR_PAINTING','EXTERIOR_PAINTING'].includes(type)&&p.offeringMode!=='installed'&&rules.priceBasisByCategory?.material==='cost';
function validField(f,value){
 if(f.type==='boolean')return typeof value==='boolean';
 if(f.type==='enum')return f.values.includes(value);
 if(f.type==='number')return finite(value)&&value>=f.min;
 // Older optional scopes may store a display name here. Preserve their
 // unrelated base work; selected scope matching still requires exact facts.
 return text(value);
}
export function scopeStructureDiagnostics(type,p={}){
 const errors=[],add=(path,message,kind='invalid')=>errors.push({type:kind,kind:'scope_configuration',path,message});
 if(!SCOPE_TYPES.includes(type))return errors;
 for(const name of SCOPE_FIELDS)if(own(p,name)&&!record(p[name]))add(name,'Use a plain map of owner-defined scope settings.');
 const catalog=scopeDefinitions(type,p),details=record(p.scopeDetails)?p.scopeDetails:{};
 for(const [key,d]of Object.entries(details)){
  const base=scopeBaseKey(key),def=own(catalog,key)?catalog[key]:null,at='scopeDetails.'+key;
  if(!def){add(at,'This scope is not supported by the selected service.','unsupported');continue;}
  if(!record(d)){add(at,'Define this scope with the displayed settings.');continue;}
  for(const name of Object.keys(d))if(!own(def.fields,name))add(at+'.'+name,'Unsupported scope setting.','unsupported');
  for(const [name,f]of Object.entries(def.fields)){
   const active=!f.optional&&!(name==='category'&&d.mode!=='installed')&&!(['coverage','wastePercent','productKey'].includes(name)&&d.mode!=='package_cost');
   if((active||own(d,name))&&!validField(f,d[name]))add(at+'.'+name,f.label+' must be explicitly configured.',d[name]===undefined?'missing':'invalid');
  }
  if(base==='stairs'&&d.disposalIncluded&&!d.removalIncluded)add(at+'.disposalIncluded','Stair removal debris disposal requires the selected stair removal scope.');
  if(key==='exposed_aggregate'&&d.basePriceExcludesFinish!==true)add(at+'.basePriceExcludesFinish','Separate finishing charges require base prices that exclude those same charges.');
  if(key==='insulation'&&d.baseRoofLaborExcludesInstallation!==true)add(at+'.baseRoofLaborExcludesInstallation','Separate installation charges require roof labor that excludes those same installation charges.');
  if(base==='floor_overlay'&&d.basePriceExcludesPreparation!==true)add(at+'.basePriceExcludesPreparation','Separate overlay preparation charges require base flooring prices that exclude that preparation.');
  if(key==='siding_trim'&&d.basePriceExcludesTrim!==true)add(at+'.basePriceExcludesTrim','Separate trim charges require base siding prices that exclude the same trim.');
 }
 const defs=scopeRateDefinitions(type,p,true);
 if(record(p.scopeRates))for(const [key,value]of Object.entries(p.scopeRates)){
  if(!own(defs,key))add('scopeRates.'+key,'This price has no matching supported scope definition.','unsupported');
  else if(!finite(value)||defs[key].moneyKind==='fixed_amount'&&!Number.isSafeInteger(value))add('scopeRates.'+key,'Enter a non-negative price with the displayed unit and precision.');
 }
 for(const [key,f]of Object.entries(scopeRateDefinitions(type,p)))if(!own(p.scopeRates,key))add('scopeRates.'+key,f.label+' needs an explicit owner price.','missing');
 const groups=new Map();
 for(const [key,d]of Object.entries(details))if(record(d)&&d.mode==='package_cost'&&text(d.productKey)){
  const signature=[key==='paint_trim'?'linear feet':'square feet',d.coverage,d.wastePercent,p.scopeRates?.[key]],previous=groups.get(d.productKey);
  // Missing settings already have their own diagnostics. An unfinished scope
  // does not contradict a configured member of the same purchase group. Keep
  // every supplied value so a later conflicting member cannot hide behind it.
  if(previous&&signature.some((value,index)=>value!==undefined&&previous[index]!==undefined&&value!==previous[index]))add('scopeDetails.'+key+'.productKey','A shared purchase group must use the same product, unit, coverage, waste allowance and package price.');
  else groups.set(d.productKey,signature.map((value,index)=>value===undefined?previous?.[index]:value));
 }
 return [...errors,...scopeOverlapDiagnostics(type,p)];
}

export function scopeCustomerErrors(type,c,p={},rules={}){
 const errors=[],bad=(field,message)=>errors.push({field,message}),defs=scopeDefinitions(type,p),keys=scopeKeysForRequest(type,c,p,rules),active=new Set(scopeRequiredCustomer(type,c,p,rules));
 for(const [field,value]of Object.entries(scopeCustomerFields(type,p)))if(c[field]!==undefined&&!active.has(field))bad(field,'This detail was supplied for work not selected in this request.');
 for(const key of keys){const base=scopeBaseKey(key),d=p.scopeDetails?.[key],def=defs[key];if(!record(d)||!def)continue;
  if(c[def.confirmation]===false)bad(def.confirmation,'Confirm that the selected owner scope matches the requested work, or correct the request.');
  if(base==='stairs'){
   if(c.floorAreaExcludesStairs===false)bad('floorAreaExcludesStairs','Use floor area excluding separately priced stairs to avoid charging the same materials twice.');
   if(c.newFlooringType!==d.flooringType)bad('newFlooringType','The stair package is configured for a different flooring type.');
   if(finite(c.stairWidthLF)&&finite(d.maximumWidthLF)&&c.stairWidthLF>d.maximumWidthLF)bad('stairWidthLF','The measured tread width exceeds this owner offering.');
   for(const [f,k]of [['stairRemovalNeeded','removalIncluded'],['stairDisposalNeeded','disposalIncluded']])if(c[f]!==undefined&&c[f]!==d[k])bad(f,'This selection does not match the defined stair work.');
  }
  if(base==='floor_overlay')for(const f of ['existingFloorType','newFlooringType'])if(c[f]!==d[f])bad(f,'This installation-over-existing-floor offering does not cover the selected flooring combination.');
  if(base==='siding_removal'&&c.existingSidingType!==undefined&&c.existingSidingType!==d.existingSidingType)bad('existingSidingType','The existing siding does not match this removal offering.');
  if(base==='siding_removal'&&c.sidingRemovalStories!==undefined&&c.sidingRemovalStories!==d.stories)bad('sidingRemovalStories','The existing siding stories do not match this removal price.');
  if(base==='demolition'){
   if(finite(c.demolitionThickness)&&finite(d.maximumThickness)&&c.demolitionThickness>d.maximumThickness)bad('demolitionThickness','The existing slab exceeds the priced thickness.');
   if(c.demolitionReinforcement!==undefined&&c.demolitionReinforcement!==d.reinforcement)bad('demolitionReinforcement','The existing slab reinforcement does not match this removal scope.');
   if(c.demolitionAccessDifficulty!==undefined&&!scopeMatchesRequest(key,d,{...c,demolitionThickness:Math.min(c.demolitionThickness||d.maximumThickness,d.maximumThickness),demolitionReinforcement:d.reinforcement}))bad('demolitionAccessDifficulty','This access is not covered by the explicitly configured matching rule.');
  }
  if(key==='insulation'){
   let total=c.roofSqft;if(c.serviceScope==='partial'&&finite(total))total=c.partialAreaSqft??(finite(c.partialPercent)?exactToNumber(exactDivide(exactMultiply(total,c.partialPercent),100)):undefined);
   for(const field of ['insulationAreaSqft','coverboardAreaSqft'].filter(name=>c[(name.startsWith('coverboard')?'coverboard':'insulation')+'Needed']===true))if(finite(c[field])&&finite(total)&&c[field]>total)bad(field,'Layer area cannot exceed the selected measured roof area.');
  }
 }
 return errors;
}

export function scopeOwnerDiagnostics(type,c,p={},rules={}){
 const out=[],defs=scopeDefinitions(type,p);
 for(const key of scopeKeysForRequest(type,c,p,rules))if(!record(p.scopeDetails?.[key]))out.push({path:'scopeDetails.'+key,kind:'measured_scope_setup',message:'Configure '+(defs[key]?.label||key)+' in the owner price book, including its measured scope and prices.'});
 return out;
}
export function scopeRequirements(type,c,p={},rules={}){
 const wanted=new Set(scopeKeysForRequest(type,c,p,rules)),definitions=scopeRateDefinitions(type,p);
 return Object.entries(definitions).filter(([,f])=>wanted.has(f.scopeKey)&&(!f.layer||c[f.layer+'Needed']===true)).map(([key,f])=>({path:'scopeRates.'+key,label:f.label,kind:f.moneyKind==='fixed_amount'?'non_negative_money':'non_negative_number'}));
}

export function scopesSuppressPrice(type,c,p,rules,path){
 const active=new Set(scopeKeysForRequest(type,c,p,rules).filter(k=>record(p.scopeDetails?.[k])).map(scopeBaseKey));
 if(active.has('stairs')&&path==='perStepPrice'||active.has('siding_removal')&&path==='removalPerSqft'||active.has('siding_trim')&&path==='trimPerLinearFoot'||active.has('demolition')&&path==='demolitionPerSqft')return true;
 if([...active].some(k=>k.includes('underlayment'))&&['underlaymentPerSqft','underlaymentPriceBasis','underlaymentPerSquare.'+c.replacementRoofType,'underlaymentPriceBasis.'+c.replacementRoofType].includes(path))return true;
 if(active.has('insulation')&&path==='insulationPerSqft'||active.has('exposed_aggregate')&&path==='finishMultiplier.exposed_aggregate')return true;
 if(costing(type,p,rules))return /^(?:offeringRates\.)?(?:wallMaterial|primerMaterial|prepMaterial|ceilingMaterial|ceilingPrimerMaterial)/.test(path)||['materialPerWallSqftPerCoat','materialPerSqftPerCoat','ceilingMaterialPerSqftPerCoat','trimMaterialPerLF'].includes(path);
 return false;
}

function ceilExact(value){const e=exactDecimal(value),n=(e.numerator+e.denominator-1n)/e.denominator;if(n<0n||n>BigInt(Number.MAX_SAFE_INTEGER))throw new RangeError('Purchased quantity exceeds the supported numeric range.');return Number(n);}
export function scopeLines(type,c,p={},rules={}){
 const out={lines:[],disclosures:[],rules:[],replacedCommonFees:[],feeScope:{}},defs=scopeRateDefinitions(type,p),catalog=scopeDefinitions(type,p),purchases=new Map();
 const add=(key,quantity,multipliers=[])=>{const f=defs[key];if(!f)throw new TypeError('Missing configured scope price definition: '+key);out.lines.push({key,name:f.label,quantity,category:f.category,unit:f.unit,rateCents:p.scopeRates[key],ratePath:'scopeRates.'+key,priceBasis:key.startsWith('floor_underlayment_')&&p.scopeRates[key]===0&&rules.zeroPricePolicy?.includedPrices?.['scopeRates.'+key]==='materialPerSqft.'+key.slice('floor_underlayment_'.length)?rules.priceBasisByCategory?.material:f.priceBasis,multipliers});};
 const quantityFor=key=>{
  key=scopeBaseKey(key);
  if(key.startsWith('floor_underlayment')||key==='floor_overlay')return c.sqft;
  if(key.startsWith('roof_underlayment'))return c.serviceScope==='partial'?(c.partialAreaSqft??exactDivide(exactMultiply(c.roofSizeInput,c.partialPercent),100)):c.roofSizeInput;
  if(key==='stairs')return c.stairSteps;if(key==='siding_removal')return c.sidingRemovalAreaSqft;if(key==='siding_trim')return c.trimLengthLF;if(key==='demolition')return c.demolitionAreaSqft;
  if(key==='exposed_aggregate')return c.dimensionMethod==='exact'?exactMultiply(c.length,c.width):c.dimensionMethod==='measured_outline'?measuredOutlineVNext(c.outlinePoints).exactAreaSqft:c.areaSqft;
  const d=p.offeringDetails||{},area=c[type==='INTERIOR_PAINTING'?'wallAreaSqft':'exteriorAreaSqft'];
  return {paint_wall:()=>exactMultiply(area,c.coats),paint_primer:()=>exactMultiply(area,d.primerCoats),paint_prep:()=>exactAdd(area,c.ceilingsIncluded?c.ceilingAreaSqft:0),paint_ceiling:()=>exactMultiply(c.ceilingAreaSqft,p.offeringMode==='itemized'?c.coats:c.ceilingCoats),paint_ceiling_primer:()=>exactMultiply(c.ceilingAreaSqft,d.ceilingPrimerCoats),paint_trim:()=>c.trimLengthLF}[key]?.();
 };
 for(const key of scopeKeysForRequest(type,c,p,rules)){
  const base=scopeBaseKey(key),d=p.scopeDetails[key],label=catalog[key].label;
   const description=d.description.trim();
   const ending=/[.!?…](?:["'’”\)\]])?$/.test(description)?'':'.';
   out.disclosures.push((key==='insulation'?'Roof '+['insulation','coverboard'].filter(layer=>c[layer+'Needed']===true).join(' and '):label)+': '+description+ending);
  if(key==='insulation'){
   for(const layer of ['insulation','coverboard'].filter(layer=>c[layer+'Needed']===true))out.disclosures.push(layer+': '+d[layer+'System']+'.');
   for(const layer of ['insulation','coverboard'].filter(layer=>c[layer+'Needed']===true))for(const suffix of d.mode==='installed'?['installed']:['labor','material'])add(layer+'_'+suffix,c[layer+'AreaSqft'],suffix==='labor'?[{name:'roof access',value:p.accessMultiplier[c.accessDifficulty],path:'accessMultiplier.'+c.accessDifficulty}]:[]);
   continue;
  }
  const quantity=quantityFor(key);
  if(key.includes('underlayment')||key.startsWith('paint_')){
   if(d.mode==='included_in_floor_price'){out.disclosures.push('Underlayment is included in the flooring material price.');continue;}
   if(d.mode==='package_cost'){
    const unit=key==='paint_trim'?'linear feet':'square feet',signature=JSON.stringify([unit,d.coverage,d.wastePercent,p.scopeRates[key]]),previous=purchases.get(d.productKey);
    if(previous&&previous.signature!==signature)throw new TypeError('The same material purchase group has conflicting unit, coverage, waste or package prices.');
    const group=previous||{signature,quantity:exactDecimal(0),d,keys:[],unit};group.quantity=exactAdd(group.quantity,quantity);group.keys.push(key);purchases.set(d.productKey,group);
   }else add(key,quantity);
   continue;
  }
  for(const rateKey of Object.keys(defs).filter(k=>defs[k].scopeKey===key)){
   // The October 1 concrete rule applies access to separately priced finish
   // labor as well as base labor. Installed-price scope retains its own basis.
   const adjustments=d.mode==='itemized'&&rateKey==='exposed_aggregate_labor'
    ? [{name:'access',value:p.accessMultiplier[c.accessDifficulty],path:'accessMultiplier.'+c.accessDifficulty}]
    : d.mode==='itemized'&&rateKey==='siding_trim_labor'?[{name:'building stories',value:p.storyMultiplier[c.stories],path:'storyMultiplier.'+c.stories}]:[];
   add(rateKey,quantity,adjustments);
  }
  if((base==='demolition'||base==='siding_removal'||base==='stairs'&&!c.removalNeeded)&&d.disposalIncluded)out.replacedCommonFees.push('disposal');
  if(base==='demolition'||base==='siding_removal')out.feeScope.disposal=true;
 }
 for(const [productKey,g]of purchases){
  const required=exactMultiply(g.quantity,exactAdd(1,exactDivide(g.d.wastePercent,100))),packages=ceilExact(exactDivide(required,g.d.coverage)),key=g.keys[0];
  add(key,packages);out.lines[out.lines.length-1].name='Purchased materials: '+productKey;
  out.rules.push({name:'purchased_'+key,rule:'ceil(sum of measured product quantities * (1 + owner waste percent / 100) / owner package coverage)',inputs:{productKey,components:g.keys,measuredQuantity:exactToNumber(g.quantity),wastePercent:g.d.wastePercent,packageCoverage:g.d.coverage},result:packages,usedBy:['Purchased materials: '+productKey]});
 }
 return out;
}

// Activation probes are synthetic verification inputs, never customer defaults.
export function scopeActivationInputs(type,input,p,rules={}){
 const c={...input};
 for(const key of scopeKeysForRequest(type,c,p,rules)){
  const base=scopeBaseKey(key),d=p.scopeDetails?.[key],def=scopeDefinitions(type,p)[key];if(!record(d)||!def)continue;c[def.confirmation]=true;
  if(base==='stairs')Object.assign(c,{stairWidthLF:d.maximumWidthLF,stairRemovalNeeded:d.removalIncluded,stairDisposalNeeded:d.disposalIncluded,floorAreaExcludesStairs:true});
  if(base==='siding_removal')Object.assign(c,{existingSidingType:d.existingSidingType,sidingRemovalAreaSqft:c.sidingAreaSqft??c.areaSqft,sidingRemovalStories:d.stories});
  if(base==='demolition')Object.assign(c,{demolitionThickness:d.maximumThickness,demolitionReinforcement:d.reinforcement,demolitionAccessDifficulty:d.accessDifficulty});
  if(key==='insulation')for(const layer of ['insulation','coverboard'])if(c[layer+'Needed']===true)c[layer+'AreaSqft']=c.roofSqft;
 }
 return c;
}
