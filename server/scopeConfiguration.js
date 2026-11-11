import {trimComponentPricing,trimPreparationNeeded} from './quote-engine-vnext/surfacePricing.js';
import {FLOAT_CONDITION_FIELDS,LEGACY_FLOAT_CONDITION_KEYS} from './quote-engine-vnext/floatConditionNames.js';
export {FLOAT_CONDITION_FIELDS,LEGACY_FLOAT_CONDITION_KEYS};
export const BASIC_PAINT_PREPARATION_NOTICE='Fair or poor walls go to review until you use itemized pricing with preparation rates.';
export const BASIC_PAINT_POOR_NOTICE='Poor walls go to review until you use itemized pricing with preparation rates.';
export const basicPaintNotice=(p={})=>p.wallPriceIncludesTouchUp==='yes'?BASIC_PAINT_POOR_NOTICE:BASIC_PAINT_PREPARATION_NOTICE;
export const basicInteriorPainting=(type,p={})=>type==='INTERIOR_PAINTING'&&!['itemized','installed'].includes(p.offeringMode);
export const scopeVisibleInEditor=(type,p,key)=>!(basicInteriorPainting(type,p)&&key==='paint_prep');
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
// Tile underlayment (cement backer board or an uncoupling membrane) is priced
// only when the owner sets it up; tile quotes without it are unchanged.
const floorUnderlay=(c,p)=>['hardwood','laminate','carpet'].includes(c.newFlooringType)||c.newFlooringType==='tile'&&own(p.scopeDetails,'floor_underlayment_tile')||c.newFlooringType==='vinyl_plank'&&(p.vinylPlankUnderlaymentRule==='always_included'||p.vinylPlankUnderlaymentRule==='customer_selectable_addon'&&c.underlaymentSelected===true||p.vinylPlankUnderlaymentRule==='subfloor_condition'&&c.subfloorCondition==='requires_underlayment');

const frozenScopeDefinitions=new WeakMap();
const freezeDefinition=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freezeDefinition(child);Object.freeze(value);}return value;};
export function scopeDefinitions(type,p={}){
 // Definitions depend on these maps' keys, not their editable leaf values.
 // Readiness's frozen snapshots can reuse them; ordinary mutable editor and
 // quote inputs always rebuild. Freeze a clone so callers cannot poison reuse
 // or freeze the shared schema objects used by other services.
 const cacheable=record(p)&&Object.isFrozen(p)&&[p.underlaymentPriceBasis,p.materialCostPerSquare,p.scopeDetails].every(value=>value===undefined||Object.isFrozen(value));
 const cached=cacheable&&frozenScopeDefinitions.get(p);
 if(cached?.type===type)return cached.definitions;
 const out={};
 if(type.startsWith('FLOORING_')){
  for(const f of ['hardwood','laminate','carpet','vinyl_plank','tile'])out['floor_underlayment_'+f]=rule(f==='tile'?'tile backer board or uncoupling membrane':f.replaceAll('_',' ')+' underlayment',{...product,mode:choice('Underlayment price meaning',['installed_area_sell_price','package_cost','included_in_floor_price'])},'underlaymentScopeConfirmed');
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
 if(['INTERIOR_PAINTING','EXTERIOR_PAINTING'].includes(type))for(const [key,label]of Object.entries({paint_wall:'Wall finish materials',paint_primer:'Wall primer materials',paint_prep:'Preparation materials',paint_ceiling:'Ceiling finish materials',paint_ceiling_primer:'Ceiling primer materials',paint_trim:'Complete trim coating materials',paint_trim_primer:'Trim primer materials',paint_trim_prep:'Trim preparation materials'}))out[key]=rule(label,key.startsWith('paint_trim')?{...purchase,coverage:{...purchase.coverage,unit:'linear feet'}}:purchase,'paintProductsConfirmed');
 for(const key of Object.keys(p.scopeDetails||{})){const base=scopeBaseKey(key);if(base!==key&&slug(key)&&own(out,base))out[key]={...out[base],baseKey:base};}
 if(cacheable){const definitions=freezeDefinition(structuredClone(out));frozenScopeDefinitions.set(p,{type,definitions});return definitions;}
 return out;
}

// A new floating floor laid over a sound, fully attached existing floor is a
// standard install only when the product's installation instructions permit
// that substrate and the job meets the conditions they set. New laminate is
// quoted only as a floating install; new vinyl plank floats only when the
// owner says their product is a floating (click) install.
// The existing floor's material comes from the owner's classification of each
// registered name (existingFloorSubstrate), or from a short list of names whose
// material is unambiguous. A name never establishes attachment or cushioning:
// the customer's soundness answer does.
// Outcomes for a floating product, in this order:
// - prohibited: the class contradicts a recognized name, the floor is carpet
//   or always floats, the product's list says no, every floatable class is
//   explicitly no for an unclassified floor, or a known answer breaks a
//   configured condition (even when the list is blank);
// - conditional: the floor is unclassified, the product's list has no entry
//   for the substrate, or an applicable condition is unanswered, Not sure, or
//   a construction it does not decide; priced as a partial estimate with
//   whether the existing floor can stay left for the site visit;
// - permitted: the product's list allows the substrate and every applicable
//   condition is answered as met.
// An overlay or preparation price is separately priced work. It never changes
// the outcome: it cannot make a prohibited floor quote, and a permitted floor
// quotes without one.
export const FLOATING_FLOOR_TYPES=Object.freeze(['laminate','vinyl_plank']);
export const SUBSTRATE_CLASSES=Object.freeze(['wood','resilient_sheet','resilient_tile_plank','laminate','ceramic_stone_tile','concrete','cushioned_or_floating','carpet']);
export const FLOATABLE_SUBSTRATES=Object.freeze(['wood','resilient_sheet','resilient_tile_plank','laminate','ceramic_stone_tile','concrete']);
export const FLOAT_OVER_FIELDS=Object.freeze({laminate:'laminateFloatsOver',vinyl_plank:'vinylPlankFloatsOver'});
export const FLOAT_INSTRUCTION_FIELDS=Object.freeze({laminate:'laminateInstallInstructions',vinyl_plank:'vinylPlankInstallInstructions'});
// Conditions a product's instructions can set, the customer question that
// resolves each, the answers that meet or break it, and which substrates it
// applies to. Any other answer (Not sure, or a construction the condition does
// not decide) leaves it unresolved. Each product turns on only the conditions
// its own instructions state.
//
// Two kinds. Covering conditions (one sheet-vinyl layer; no wood floor glued to
// concrete) describe the existing floor covering itself, so they apply only
// while that covering stays. Construction conditions (no wood or wood subfloor
// directly over concrete; no sleeper construction) describe what the new floor
// is laid on, which a removed covering leaves in place, so they apply whether
// the old covering stays, is removed, or there is none. Manufacturers state
// them in separate sections (existing floor coverings; subfloors).
export const WOOD_FLOOR_ASSEMBLIES=Object.freeze(['joists','glued_to_concrete','direct_on_concrete','sleepers','not_sure']);
// What a floor other than a wood floor is laid on (or, with no existing floor,
// what the new floor will be laid on).
export const FLOOR_SUPPORT_CONSTRUCTIONS=Object.freeze(['joists','wood_on_concrete','sleepers','concrete_slab','not_sure']);
export const FLOAT_CONDITIONS=Object.freeze({
  sheet_vinyl_single_layer:{substrates:['resilient_sheet'],input:'existingFloorLayers',met:['one'],broken:['two_or_more'],reason:'its installation instructions allow only one layer of existing sheet vinyl or linoleum'},
  wood_not_glued_to_concrete:{substrates:['wood'],input:'woodFloorAssembly',met:['joists','direct_on_concrete','sleepers'],broken:['glued_to_concrete'],reason:'its installation instructions do not allow a wood floor glued directly to concrete'},
  // Wood covering kept: its own question. Sleepers stay unresolved: whether
  // they sit on concrete is not asked. Wood covering removed: a wood floor
  // glued to concrete leaves the bare slab; a floor laid on or fastened to
  // concrete may or may not leave plywood or boards on it, so that answer is
  // unresolved. Any other floor: what it is laid on.
  wood_not_directly_over_concrete:{construction:true,substrates:['wood'],input:'woodFloorAssembly',met:['joists'],broken:['glued_to_concrete','direct_on_concrete'],
    removed:{met:['joists','glued_to_concrete'],broken:[]},
    support:{met:['joists','concrete_slab'],broken:['wood_on_concrete']},
    reason:'its installation instructions do not allow a wood floor or wood subfloor laid directly over concrete'},
  no_sleeper_construction:{construction:true,substrates:['wood'],input:'woodFloorAssembly',met:['joists','glued_to_concrete','direct_on_concrete'],broken:['sleepers'],
    removed:{met:['joists','glued_to_concrete','direct_on_concrete'],broken:['sleepers']},
    support:{met:['joists','wood_on_concrete','concrete_slab'],broken:['sleepers']},
    reason:'its installation instructions do not allow sleeper construction'}
});
export const CONSTRUCTION_FLOAT_CONDITIONS=Object.freeze(Object.keys(FLOAT_CONDITIONS).filter(key=>FLOAT_CONDITIONS[key].construction));
// Earlier saved settings and answers, read with exactly their meaning:
// wood_not_on_concrete was the glue-only condition (see floatConditionNames.js;
// tier merging carries it under its current name at each level);
// woodAdheredToConcrete answered only whether the wood is glued directly to
// concrete, so No meets the glue-only condition and says nothing about the
// other two. It is read only while the wood floor stays.
export function floatConditionSet(product,p={}){
  const set=p[FLOAT_CONDITION_FIELDS[product]];
  if(!record(set))return undefined;
  const out={};
  for(const [key,value] of Object.entries(set))if(!Object.hasOwn(LEGACY_FLOAT_CONDITION_KEYS,key))out[key]=value;
  for(const [old,key] of Object.entries(LEGACY_FLOAT_CONDITION_KEYS))if(Object.hasOwn(set,old)&&!Object.hasOwn(out,key))out[key]=set[old];
  return out;
}
// The job's relation to the existing floor: stay (floated over), remove, or
// none (no existing floor). Undefined while unanswered.
export function floorScenario(c={}){
  if(c?.existingFloorType==='none')return c.removalNeeded===true?undefined:'none';
  if(typeof c?.existingFloorType!=='string')return undefined;
  return c.removalNeeded===false?'stay':c.removalNeeded===true?'remove':undefined;
}
// The question that decides one condition in one scenario, and its readings;
// null when the condition does not apply there. substrate is the existing
// covering's effective class (undefined: none, unclassified or contradicted).
export function floatConditionReading(key,scenario,substrate){
  const condition=FLOAT_CONDITIONS[key];
  if(!condition)return null;
  if(!condition.construction)return scenario==='stay'&&condition.substrates.includes(substrate)?{input:condition.input,met:condition.met,broken:condition.broken,legacyGlue:true}:null;
  if(substrate==='wood'&&scenario==='stay')return {input:'woodFloorAssembly',met:condition.met,broken:condition.broken,legacyGlue:true};
  if(substrate==='wood'&&scenario==='remove')return {input:'woodFloorAssembly',...condition.removed};
  if(scenario==='stay'&&!FLOATABLE_SUBSTRATES.includes(substrate))return null;
  return ['stay','remove','none'].includes(scenario)?{input:'floorSupportConstruction',...condition.support}:null;
}
// met, broken, or undefined (unanswered) / unresolved for one condition under
// one reading (default: the wood floor kept in place).
export function floatConditionState(key,c={},reading=floatConditionReading(key,'stay',FLOAT_CONDITIONS[key]?.substrates[0])){
  if(!reading)return undefined;
  const answer=c?.[reading.input];
  if(answer!==undefined)return reading.met.includes(answer)?'met':reading.broken.includes(answer)?'broken':'unresolved';
  if(reading.legacyGlue&&reading.input==='woodFloorAssembly'&&c?.woodAdheredToConcrete!==undefined){
    if(c.woodAdheredToConcrete==='yes')return reading.broken.includes('glued_to_concrete')?'broken':'met';
    if(c.woodAdheredToConcrete==='no'&&key==='wood_not_glued_to_concrete')return 'met';
    if(c.woodAdheredToConcrete==='not_sure')return 'unresolved';
  }
  // The customer said they don't know what is under the floor: left for the
  // site visit, exactly like Not sure. A known answer above always wins.
  if(CONSTRUCTION_DETAIL_INPUTS.includes(reading.input)&&c?.floorConstructionKnown==='no')return 'unresolved';
  return undefined;
}
// The detail questions are asked only after the customer says they know what is
// under the floor; most homeowners don't, and one No answers every condition.
export const CONSTRUCTION_DETAIL_INPUTS=Object.freeze(['woodFloorAssembly','floorSupportConstruction']);
const askedInput=(input,c)=>CONSTRUCTION_DETAIL_INPUTS.includes(input)&&c?.floorConstructionKnown!=='yes'?'floorConstructionKnown':input;
// Names whose material is unambiguous. tile is the engine's own tile flooring
// type (ceramic or porcelain); bare vinyl is not recognized (sheet, tile or
// plank). Laminate is a material: some laminates are fully bonded, so whether
// an existing laminate floor floats is the customer's answer. Only the name
// floating says the existing floor floats.
export const RECOGNIZED_FLOOR_NAMES=Object.freeze(Object.fromEntries([
  ...['tile','ceramic','ceramic_tile','porcelain','porcelain_tile','stone','natural_stone','marble','granite','terrazzo'].map(n=>[n,'ceramic_stone_tile']),
  ...['sheet_vinyl','linoleum','lino'].map(n=>[n,'resilient_sheet']),
  ...['vct','vinyl_plank','lvp','luxury_vinyl_tile','lvt'].map(n=>[n,'resilient_tile_plank']),
  ...['hardwood','solid_hardwood','engineered_hardwood','oak','maple'].map(n=>[n,'wood']),
  ['concrete','concrete'],
  ...['carpet','berber'].map(n=>[n,'carpet']),
  ['laminate','laminate'],
  ['floating','cushioned_or_floating']
]));
export const recognizedSubstrate=name=>typeof name==='string'&&Object.hasOwn(RECOGNIZED_FLOOR_NAMES,name)?RECOGNIZED_FLOOR_NAMES[name]:undefined;
export function existingFloorSubstrate(name,p={}){
  if(typeof name!=='string'||name==='none')return undefined;
  const stated=record(p.existingFloorSubstrate)&&Object.hasOwn(p.existingFloorSubstrate,name)?p.existingFloorSubstrate[name]:undefined;
  return SUBSTRATE_CLASSES.includes(stated)?stated:recognizedSubstrate(name);
}
// An owner class that contradicts a recognized name (carpet saved as wood).
export function substrateContradiction(name,p={}){
  const recognized=recognizedSubstrate(name),stated=record(p.existingFloorSubstrate)?p.existingFloorSubstrate[name]:undefined;
  return recognized!==undefined&&SUBSTRATE_CLASSES.includes(stated)&&stated!==recognized?{recognized,stated}:null;
}
// The conditions set for this product that apply to this substrate in this
// scenario (default: the covering stays).
export function applicableFloatConditions(product,substrate,p={},scenario='stay'){
  const set=floatConditionSet(product,p);
  return set?Object.keys(FLOAT_CONDITIONS).filter(key=>set[key]===true&&floatConditionReading(key,scenario,substrate)):[];
}
export function floatCompatibilityDetail(product,name,p={},c={}){
  const substrate=existingFloorSubstrate(name,p),map=p[FLOAT_OVER_FIELDS[product]];
  // Unclassified: the material is unknown. Prohibited only when the product
  // excludes every floatable material; otherwise unresolved, never priced as
  // compatible by an overlay or preparation price.
  if(substrate===undefined){
    if(record(map)&&FLOATABLE_SUBSTRATES.every(k=>map[k]===false))return {outcome:'prohibited'};
    return {outcome:'conditional',unresolved:'material'};
  }
  if(substrateContradiction(name,p)||!FLOATABLE_SUBSTRATES.includes(substrate))return {outcome:'prohibited',substrate};
  const entry=record(map)&&Object.hasOwn(map,substrate)?map[substrate]:undefined;
  if(entry===false)return {outcome:'prohibited',substrate};
  // A known answer that breaks a configured condition prohibits the assembly
  // whatever the product's list says about permission.
  const conditions=applicableFloatConditions(product,substrate,p,'stay');
  const state=key=>floatConditionState(key,c,floatConditionReading(key,'stay',substrate));
  for(const key of conditions)if(state(key)==='broken')return {outcome:'prohibited',substrate,condition:key};
  if(entry!==true)return {outcome:'conditional',substrate,unresolved:'product_rules'};
  const unknown=conditions.filter(key=>state(key)!=='met');
  return unknown.length?{outcome:'conditional',substrate,unresolved:'conditions',conditions:unknown}:{outcome:'permitted',substrate,conditions};
}
export const floatCompatibility=(product,name,p={},c={})=>floatCompatibilityDetail(product,name,p,c).outcome;
// A floatable substrate (before the product's own list is applied).
export const hardOverlayBase=(name,p={})=>FLOATABLE_SUBSTRATES.includes(existingFloorSubstrate(name,p))&&!substrateContradiction(name,p);
// Carpet by its recognized name or by the owner's class; either one refuses.
export const carpetFloorName=(name,p={})=>recognizedSubstrate(name)==='carpet'||existingFloorSubstrate(name,p)==='carpet';
export const newFloorFloats=(c,p={})=>c?.newFlooringType==='laminate'||c?.newFlooringType==='vinyl_plank'&&p.vinylPlankInstallMethod==='floating';
// The existing floor is a wood floor (by its effective class, not contradicted).
export const woodCoveringVNext=(c,p={})=>typeof c?.existingFloorType==='string'&&c.existingFloorType!=='none'&&!substrateContradiction(c.existingFloorType,p)&&existingFloorSubstrate(c.existingFloorType,p)==='wood';
// No existing floor (none) or no answer yet: nothing to float over.
export const floatCompatibilityDetailVNext=(c,p={})=>c?.removalNeeded===false&&newFloorFloats(c,p)&&typeof c.existingFloorType==='string'&&c.existingFloorType!=='none'?floatCompatibilityDetail(c.newFlooringType,c.existingFloorType,p,c):null;
export const floatCompatibilityVNext=(c,p={})=>floatCompatibilityDetailVNext(c,p)?.outcome??null;
export const floatingOverlayCandidateVNext=(c,p={})=>['permitted','conditional'].includes(floatCompatibilityVNext(c,p));
// The covering class a construction reading uses once the covering is removed
// or absent: a name that contradicts its saved class is not treated as wood.
const supportSubstrate=(c,p)=>c?.existingFloorType==='none'||substrateContradiction(c?.existingFloorType,p)?undefined:existingFloorSubstrate(c?.existingFloorType,p);
// What the new floor is laid on when the old covering is removed, or when
// there is none: only construction conditions apply there. null: no floating
// product, no construction condition set, or the job is a floated overlay
// (floatCompatibilityDetailVNext). Outcomes: prohibited (a known answer breaks
// a condition), unanswered (a question is missing), conditional (an answer
// leaves a condition unresolved; checked on site), permitted.
export function floorSupportDetailVNext(c,p={}){
  const scenario=floorScenario(c);
  if(!['remove','none'].includes(scenario)||!newFloorFloats(c,p))return null;
  const substrate=supportSubstrate(c,p),conditions=applicableFloatConditions(c.newFlooringType,substrate,p,scenario);
  if(!conditions.length)return null;
  const states=conditions.map(key=>[key,floatConditionState(key,c,floatConditionReading(key,scenario,substrate))]);
  const broken=states.find(([,state])=>state==='broken');
  if(broken)return {outcome:'prohibited',scenario,condition:broken[0],conditions};
  const unanswered=states.filter(([,state])=>state===undefined).map(([key])=>key);
  if(unanswered.length)return {outcome:'unanswered',scenario,conditions:unanswered,inputs:[...new Set(unanswered.map(key=>askedInput(floatConditionReading(key,scenario,substrate).input,c)))]};
  const unresolved=states.filter(([,state])=>state!=='met').map(([key])=>key);
  return unresolved.length?{outcome:'conditional',scenario,conditions:unresolved}:{outcome:'permitted',scenario,conditions};
}
// Customer questions a set condition needs for this job (asked with Not sure).
export function floatConditionInputsVNext(c,p={}){
  if(!newFloorFloats(c,p))return [];
  const support=floorSupportDetailVNext(c,p);
  if(support)return support.outcome==='unanswered'?support.inputs:[];
  if(c?.removalNeeded!==false)return [];
  const substrate=existingFloorSubstrate(c.existingFloorType,p),map=p[FLOAT_OVER_FIELDS[c.newFlooringType]];
  if(substrate===undefined||record(map)&&map[substrate]===false||substrateContradiction(c.existingFloorType,p))return [];
  // A question is asked while an applicable condition has no answer; one
  // question can serve several conditions.
  return [...new Set(applicableFloatConditions(c.newFlooringType,substrate,p,'stay').map(key=>[key,floatConditionReading(key,'stay',substrate)]).filter(([key,reading])=>floatConditionState(key,c,reading)===undefined).map(([,reading])=>askedInput(reading.input,c)))];
}
// The reason a known construction answer refuses the product, by scenario.
// Removing the covering leaves the construction, so the wording never implies
// that removing the old floor alone makes the product compatible.
export function floorConstructionRefusal(scenario,condition){
  const reason=FLOAT_CONDITIONS[condition]?.reason;
  if(scenario==='remove')return 'This flooring product can\'t be installed over the floor construction that remains after the existing floor is removed ('+reason+'). The business will confirm on site what the floor needs before pricing.';
  if(scenario==='none')return 'This flooring product can\'t be installed over the floor construction it would be laid on ('+reason+'). The business will confirm on site what the floor needs before pricing.';
  return 'This flooring product can\'t be installed over this floor\'s construction ('+reason+'). The business will confirm on site what the floor needs, including whether removing the existing floor is enough, before pricing.';
}
export const FLOOR_STAY_LABEL='Whether the existing floor can stay under this product (any additional removal, disposal, preparation, leveling, underlayment or moisture treatment it needs)';
export const FLOOR_SUPPORT_LABEL='Whether the floor construction under the new floor suits this product (any subfloor work it needs beyond the work listed in this estimate)';
// Wording of the construction question for each scenario.
export const FLOOR_SUPPORT_QUESTIONS=Object.freeze({
  stay:'What is the existing floor laid on?',
  remove:'What is under the existing floor? The new floor will be laid on it.',
  none:'What will the new floor be laid on?'
});
// The questions a product condition asks, and when the customer form shows
// each one for one option's effective pricing (base, or one tier merged once
// from the base): the new floor is a floating product with that condition set,
// and the job is one the condition applies to. A covering condition applies
// while a registered existing floor of its material stays. A construction
// condition applies when the old floor stays (floatable materials), is
// removed (any registered floor), or there is none; a wood floor answers the
// wood question, any other floor what it is laid on. Each option is built
// separately; the form merges the options, so settings from different tiers
// are never combined. No clause: the question is not offered.
export function floatConditionVisibility(type,p={},rules={}){
  if(!['FLOORING_INSTALL','FLOORING_REPLACEMENT'].includes(type))return {};
  const names=Object.keys(rules.knownOfferings?.existingFloorType||{}).filter(name=>name!=='none');
  const clausesByInput={woodFloorAssembly:[],floorSupportConstruction:[]};
  for(const [key,condition] of Object.entries(FLOAT_CONDITIONS)){
    clausesByInput[condition.input]??=[];
    for(const product of FLOATING_FLOOR_TYPES){
      if(!newFloorFloats({newFlooringType:product},p)||floatConditionSet(product,p)?.[key]!==true)continue;
      const map=p[FLOAT_OVER_FIELDS[product]];
      const byInput=(scenario,eligible)=>{
        const groups={};
        for(const name of names.filter(eligible)){
          const substrate=scenario==='stay'?existingFloorSubstrate(name,p):supportSubstrate({existingFloorType:name},p),reading=floatConditionReading(key,scenario,substrate);
          if(reading)(groups[reading.input]??=[]).push(name);
        }
        return groups;
      };
      const stay=byInput('stay',name=>{const substrate=existingFloorSubstrate(name,p);return !substrateContradiction(name,p)&&!(record(map)&&map[substrate]===false);});
      for(const [input,matching] of Object.entries(stay))(clausesByInput[input]??=[]).push([['removalNeeded','eq',false],['newFlooringType','eq',product],['existingFloorType','in',matching]]);
      if(!condition.construction)continue;
      for(const [input,matching] of Object.entries(byInput('remove',()=>true)))(clausesByInput[input]??=[]).push([['removalNeeded','eq',true],['newFlooringType','eq',product],['existingFloorType','in',matching]]);
      clausesByInput.floorSupportConstruction.push([['existingFloorType','eq','none'],['newFlooringType','eq',product]]);
    }
  }
  const unique=clauses=>{const out=[...new Map(clauses.map(clause=>[JSON.stringify(clause),clause])).values()];return out.length?out:null;};
  // Whether the customer knows what is under the floor is asked wherever either
  // detail question applies; each detail question only after a Yes.
  const known=unique(CONSTRUCTION_DETAIL_INPUTS.flatMap(input=>clausesByInput[input]||[]));
  return {
    ...Object.fromEntries(Object.entries(clausesByInput).map(([input,clauses])=>[input,unique(CONSTRUCTION_DETAIL_INPUTS.includes(input)?clauses.map(clause=>[...clause,[KNOWN_FIELD,'eq','yes']]):clauses)])),
    floorConstructionKnown:known
  };
}
const KNOWN_FIELD='floorConstructionKnown';
// Wording of the knowledge question: an existing floor, or none.
export function floorConstructionKnownPresentation(){
  return {presentationVariants:[
    {label:FLOOR_CONSTRUCTION_KNOWN_QUESTIONS.existing,visibleWhen:[[['existingFloorType','ne','none']]]},
    {label:FLOOR_CONSTRUCTION_KNOWN_QUESTIONS.none,visibleWhen:[[['existingFloorType','eq','none']]]}
  ]};
}
export const FLOOR_CONSTRUCTION_KNOWN_QUESTIONS=Object.freeze({
  existing:'Do you know what the existing floor is laid on?',
  none:'Do you know what the new floor will be laid on?'
});
// Construction-question wording follows the scenario.
export function floorSupportPresentation(){
  return {presentationVariants:[
    {label:FLOOR_SUPPORT_QUESTIONS.stay,visibleWhen:[[['removalNeeded','eq',false],['existingFloorType','ne','none']]]},
    {label:FLOOR_SUPPORT_QUESTIONS.remove,visibleWhen:[[['removalNeeded','eq',true]]]},
    {label:FLOOR_SUPPORT_QUESTIONS.none,visibleWhen:[[['existingFloorType','eq','none']]]}
  ]};
}
// Soundness wording follows the existing floor's effective material, so a
// bare slab is not asked whether it is glued or nailed down. The customer's
// visual answer never stands in for measured flatness or moisture, which stay
// on-site checks. A floor the owner has not classified gets neutral wording.
export const FLOOR_SOUND_LABELS=Object.freeze({
  neutral:'Is the existing floor solid, flat and firmly attached, and not cushioned or floating?',
  attached:'Is the existing floor firmly glued or nailed down, flat, and not cushioned or floating?',
  concrete:'Is the concrete floor bare, hard and flat, with no crumbling, flaking or loose patches?'
});
export function floorSoundPresentation(type,p={},rules={}){
  if(!['FLOORING_INSTALL','FLOORING_REPLACEMENT'].includes(type))return {};
  const names=Object.keys(rules.knownOfferings?.existingFloorType||{}).filter(name=>name!=='none');
  const concrete=names.filter(name=>existingFloorSubstrate(name,p)==='concrete'&&!substrateContradiction(name,p));
  const attached=names.filter(name=>{const s=existingFloorSubstrate(name,p);return s!==undefined&&s!=='concrete';});
  const variants=[
    ...(concrete.length?[{label:FLOOR_SOUND_LABELS.concrete,details:['Moisture and exact flatness are checked on site; this answer does not confirm them.'],visibleWhen:[[['existingFloorType','in',concrete]]]}]:[]),
    ...(attached.length?[{label:FLOOR_SOUND_LABELS.attached,details:['A new floating floor can go over a sound hard floor. Loose, cushioned or floating floors usually have to come out first.'],visibleWhen:[[['existingFloorType','in',attached]]]}]:[])
  ];
  return variants.length?{presentationVariants:variants}:{};
}
// Answers to floor questions that no longer apply (the floor is removed, or
// the existing or new floor changed) are dropped before they are sent. The
// construction answers follow their own questions, which still apply when the
// old floor is removed, so choosing removal never drops a known construction
// answer. The earlier glue answer is read only while the wood floor stays.
const FLOOR_STAY_FIELDS=['existingFloorSound','existingFloorLayers','woodFloorAssembly','woodAdheredToConcrete','floorSupportConstruction','floorConstructionKnown'];
// A detail answer already given (a restored draft, or an earlier answer) is kept
// while its question applies to this floor, unless the customer has since said
// they don't know: a known construction fact is never dropped by the gate.
const withoutKnownGate=clauses=>Array.isArray(clauses)?clauses.map(clause=>clause.filter(condition=>condition[0]!==KNOWN_FIELD)):clauses;
export function withoutInapplicableFloorAnswers(fields=[],inputs={}){
  let out=inputs;
  const applies=name=>{const field=fields.find(f=>f.name===name);if(!field)return false;
    if(CONSTRUCTION_DETAIL_INPUTS.includes(name))return inputs.floorConstructionKnown!=='no'&&matchesConditions(withoutKnownGate(field.visibleWhen),inputs);
    return matchesConditions(field.visibleWhen,inputs);};
  for(const name of FLOOR_STAY_FIELDS){
    if(!own(inputs,name))continue;
    // An earlier answer to the glue question is kept, with its meaning, while
    // the wood question applies to a floor that stays and is unanswered.
    const keep=name==='woodAdheredToConcrete'?inputs.removalNeeded===false&&applies('woodFloorAssembly')&&!own(inputs,'woodFloorAssembly'):applies(name);
    if(!keep){if(out===inputs)out={...inputs};delete out[name];}
  }
  return out;
}
// Answers that belong to a scope the customer has explicitly turned off. The
// server rejects each of these combinations; the form and the submission drop
// the dependent answers instead of sending them. An entry applies only when
// the form has its parent question (so it follows the active service and
// input method), and only for an explicit answer: an unanswered or cleared
// parent keeps its dependents. Related confirmations are dropped with them.
export const DEPENDENT_ANSWERS=Object.freeze([
  {parent:'serviceScope',off:['full'],dependents:['partialPercent','partialAreaSqft']},
  {parent:'removalNeeded',off:[false],dependents:['removalAreaSqft']},
  {parent:'floorLevelingNeeded',off:[false],dependents:['floorLevelingSqft']},
  {parent:'subfloorIssues',off:[false],dependents:['subfloorRepairAreaSqft']},
  {parent:'ceilingsIncluded',off:[false],dependents:['ceilingAreaSqft','ceilingCoats']},
  {parent:'trimIncluded',off:[false],dependents:['trimLengthLF']},
  {parent:'gateCount',off:[0],dependents:['gateWidthTotalLF']},
  {parent:'oldFenceRemoval',off:[false],dependents:['removalLengthLF']},
  {parent:'adjoinsExistingConcrete',off:[false],dependents:['adjoiningEdgeLF']},
  {parent:'demolitionNeeded',off:[false],dependents:['demolitionAreaSqft']},
  {parent:'chuteAccess',off:['yes','unknown'],dependents:['placementMethod']},
  {parent:'inputMethod',off:['yards'],dependents:['mulchDepth']},
  {parent:'bedCondition',off:['clean'],dependents:['bedSqft']},
  {parent:'edgingNeeded',off:[false],dependents:['edgeLF']},
  {parent:'mulchNeeded',off:[false],dependents:['mulchYards','mulchType']},
  {parent:'edgingIncluded',off:[false],dependents:['edgingLengthLF']},
  {parent:'groundPrepNeeded',off:[false],dependents:['usableTopsoilDepthInches']},
  // The server ignores this answer when there is no leak instead of refusing it.
  {parent:'leakPresent',off:[false],dependents:['leakSourceIdentified'],serverIgnores:true}
]);
// The customer cleared a parent answer they had given (back to unanswered):
// that edit takes its dependent answers with it, so turning it back on asks
// for them again. A parent that was simply never answered keeps them.
export function withoutDependentsOfClearedParent(name,inputs={}){
  let out=inputs;
  for(const {parent,dependents} of DEPENDENT_ANSWERS){
    if(parent!==name||own(inputs,parent))continue;
    for(const dependent of dependents){
      if(own(out,dependent)){if(out===inputs)out={...inputs};delete out[dependent];}
      if(record(out.confirmedFacts)&&own(out.confirmedFacts,dependent)){if(out===inputs)out={...inputs};out.confirmedFacts={...out.confirmedFacts};delete out.confirmedFacts[dependent];if(!Object.keys(out.confirmedFacts).length)delete out.confirmedFacts;}
    }
  }
  return out;
}
export function withoutDeselectedDependents(fields=[],inputs={}){
  const asked=new Set(fields.map(f=>f.name));
  let out=inputs;
  for(const {parent,off,dependents} of DEPENDENT_ANSWERS){
    if(!asked.has(parent)||!own(inputs,parent)||!off.includes(inputs[parent]))continue;
    for(const name of dependents){
      if(own(out,name)){if(out===inputs)out={...inputs};delete out[name];}
      if(record(out.confirmedFacts)&&own(out.confirmedFacts,name)){if(out===inputs)out={...inputs};out.confirmedFacts={...out.confirmedFacts};delete out.confirmedFacts[name];if(!Object.keys(out.confirmedFacts).length)delete out.confirmedFacts;}
    }
  }
  return out;
}
export const floatingOverHardFloorVNext=(c,p={})=>floatingOverlayCandidateVNext(c,p)&&c?.existingFloorSound==='yes';

export function scopeKeysForRequest(type,c,p={},rules={}){
 const keys=[];
 if(type.startsWith('FLOORING_')){
  const k='floor_underlayment_'+c.newFlooringType;
  if(floorUnderlay(c,p)&&(c.newFlooringType!=='vinyl_plank'||p.underlaymentPriceBasis==='cost'||own(p.scopeDetails,k)))keys.push(k);
  if(c.stairSteps>0)keys.push('stairs');
  // An owner overlay rule still applies to a floating floor when one is priced.
  if(c.removalNeeded===false&&c.existingFloorType!=='none'&&(!floatingOverHardFloorVNext(c,p)||scopeEntriesFor(p,'floor_overlay').length))keys.push('floor_overlay');
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
  if(!p.offeringMode&&p.paintingSettings?.primerCoats>0)keys.push('paint_primer');
  if(!p.offeringMode&&c.ceilingsIncluded&&p.paintingSettings?.ceilingPrimerCoats>0)keys.push('paint_ceiling_primer');
  if(p.offeringMode==='itemized'&&c.trimIncluded&&trimComponentPricing(p))keys.push('paint_trim');
  if(c.trimIncluded&&(!p.offeringMode||trimComponentPricing(p))&&trimPreparationNeeded(c,p))keys.push('paint_trim_prep');
  if(c.trimIncluded&&p.paintingSettings?.trimPrimerCoats>0)keys.push('paint_trim_primer');
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
  if(key.includes('underlayment')||key.startsWith('paint_')){add(key,label,'material',d.mode==='package_cost'?'purchased packages':key.startsWith('paint_trim')?'linear feet':'installed square feet',d.mode==='package_cost'?'cost':'sell_price',d.mode==='package_cost'?'fixed_amount':'unit_rate');continue;}
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
const matchesConditions=(conditions,values)=>!conditions||conditions.some(all=>all.every(([key,op,value])=>op==='absent'?values[key]===undefined:values[key]!==undefined&&(op==='eq'?values[key]===value:op==='ne'?values[key]!==value:op==='in'?value.includes(values[key]):op==='contains'?Array.isArray(values[key])&&values[key].includes(value):op==='lte'?typeof values[key]==='number'&&values[key]<=value:typeof values[key]==='number'&&values[key]>value)));
export function customerFieldVisible(field,values={}){
 if(field.optionalItemKey)return !field.evidenceOnly&&matchesConditions(field.visibleWhen,values);
 return own(values,field.name)||matchesConditions(field.visibleWhen,values);
}
// Labels and product details follow the measured selection. A shared Yes/No
// field must never acquire the last product's wording merely due to map order.
export function customerFieldForInputs(field,values={}){
 const choices=(field.choiceVariants||[]).filter(v=>matchesConditions(v.visibleWhen,values));
 if(field.choiceVariants?.length)field={...field,values:[...new Set(choices.flatMap(v=>v.values||[]))],options:Object.assign({},...choices.map(v=>v.options||{})),gateChoices:[...new Map(choices.flatMap(v=>v.gateChoices||[]).map(g=>[g.value,g])).values()]};
 const selected=(field.presentationVariants||[]).filter(v=>matchesConditions(v.visibleWhen,values));
 if(!selected.length)return field;
 const labels=[...new Set(selected.map(v=>v.label))],details=[...new Set(selected.flatMap(v=>(v.details||[]).map(detail=>v.tierName?v.tierName+': '+detail:detail)))];
 const units=[...new Set(selected.map(v=>v.unit).filter(Boolean))];
 return {...field,label:labels.join('; '),...(details.length?{details}:{}),...(units.length===1?{unit:units[0]}:{})};
}
export function clearChangedScopeConfirmations(fields,before,after){
 const next={...after};
 for(const field of fields)if((field.type==='boolean'&&field.presentationVariants?.some(v=>v.details?.length)||field.type==='number'&&field.presentationVariants?.some(v=>v.unit))&&own(before,field.name)&&own(after,field.name)){
  const oldView=customerFieldForInputs(field,before),newView=customerFieldForInputs(field,after);
  if(field.type==='number'){
   if(oldView.unit!==newView.unit)delete next[field.name];
   continue;
  }
  const wasApplicable=field.presentationVariants.some(v=>matchesConditions(v.visibleWhen,before)),isApplicable=field.presentationVariants.some(v=>matchesConditions(v.visibleWhen,after));
  if(wasApplicable!==isApplicable||JSON.stringify([oldView.label,oldView.details,oldView.unit])!==JSON.stringify([newView.label,newView.details,newView.unit]))delete next[field.name];
 }
 return next;
}
export function mergeCustomerFieldDefinitions(variants){
 const out={};
 for(const {tierName,fields} of variants)for(const [name,field] of Object.entries(fields)){
  const prior=out[name],presentations=(field.presentationVariants||[{label:field.label,details:field.details,unit:field.unit,visibleWhen:field.visibleWhen}]).map(v=>({...v,...(tierName?{tierName}:{})}));
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
  const name=defs[key].confirmation,label=key.startsWith('paint_')?'The selected paint products, coating variants and preparation products match this job':'Confirm '+defs[key].label.toLowerCase()+' matches this job';
  const details=[defs[key].label+': '+(d.description||'')];
  if(base==='stairs')details.push('Flooring: '+d.flooringType+'. Maximum tread width: '+d.maximumWidthLF+' ft. '+['underlayment','removal','disposal'].map(part=>(part==='underlayment'?'Underlayment':part==='removal'?'Existing covering removal':'Debris disposal')+(d[part+'Included']?' is included.':' is not included.')).join(' '));
  const variants=key==='insulation'?['insulation','coverboard'].map(layer=>({label:'Confirm '+layer+' work matches this job',details:[layer+': '+(d[layer+'System']||''),d.description||''].filter(Boolean),visibleWhen:[[[layer+'Needed','eq',true]]]})):[{label,details,visibleWhen}];
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
