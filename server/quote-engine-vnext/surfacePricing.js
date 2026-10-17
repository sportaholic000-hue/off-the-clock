import {exactAdd,exactSubtract,exactMultiply,exactDivide,exactCompare,exactToNumber,exactEvidence} from './exactMath.js';

// October 16 owner ruling. These opt-in settings contain no starting prices or
// coat ratios. Legacy requests/rates retain their original meaning when absent.
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const own=(v,k)=>Object.hasOwn(v||{},k);
export const paintingType=type=>['INTERIOR_PAINTING','EXTERIOR_PAINTING'].includes(type);
export const surfaceType=type=>paintingType(type)||type==='SIDING_REPLACEMENT';
export const SURFACE_FIELDS=['paintingSettings','paintingRates','surfaceExtraRates','sidingSettings'];
export const COAT_RATIOS={wallAdditionalCoatRatio:'Walls',ceilingAdditionalCoatRatio:'Ceilings',trimAdditionalCoatRatio:'Trim',primerAdditionalCoatRatio:'Wall primer',ceilingPrimerAdditionalCoatRatio:'Ceiling primer',trimPrimerAdditionalCoatRatio:'Trim primer'};
export const PAINTING_RATES={
 primerLaborPerSqftPerCoat:'Wall primer labor per square foot per coat',primerMaterialPerSqftPerCoat:'Wall primer material per square foot per coat',
 ceilingPrimerLaborPerSqftPerCoat:'Ceiling primer labor per square foot per coat',ceilingPrimerMaterialPerSqftPerCoat:'Ceiling primer material per square foot per coat',
 trimLaborPerLFPerCoat:'Trim labor per linear foot per coat',trimMaterialPerLFPerCoat:'Trim material per linear foot per coat',
 trimPrimerLaborPerLFPerCoat:'Trim primer labor per linear foot per coat',trimPrimerMaterialPerLFPerCoat:'Trim primer material per linear foot per coat',
 ...Object.fromEntries(['good','fair','poor'].flatMap(condition=>[['trimPrepLaborPerLF_'+condition,condition+' trim preparation labor per linear foot'],['trimPrepMaterialPerLF_'+condition,condition+' trim preparation material per linear foot']]))
};
export const SIDING_CONVENTIONS={openings_left_in:'Openings left in (VSI, CertainTeed)',openings_subtracted:'Openings subtracted (LP)'};
const num=(label,unit,min=0,max=1_000_000,extra={})=>({label,unit,type:'number',min,max,...extra});
const select=(label,values,extra={})=>({label,type:'enum',unit:null,values,...extra});
const conditions=select('Surface condition',['good','fair','poor']);
const when=(name,value=true)=>[[[name,'eq',value]]];
const dimensionalWhen=[...when('areaInputMethod','room_dimensions'),...when('areaInputMethod','building_dimensions')];
const rows=(label,rowFields,minRows=0)=>({label,type:'surface_rows',unit:null,rowFields,minRows,maxRows:100});
export const INTERIOR_OPENING_FIELDS={widthFeet:num('Opening width','feet',0.01,10000),heightFeet:num('Opening height','feet',0.01,1000),runsFloorToCeiling:{label:'Runs floor to ceiling?',type:'boolean',unit:null,optional:true}};
const INTERIOR_OPENING_HELP='Only openings not counted as doors or windows. Openings 100 square feet or larger, or openings that run floor to ceiling and are wider than 5 feet, are removed from labor. All listed openings are removed from paint quantity.';
export const ROOM_FIELDS={lengthFeet:num('Room length','feet',0.01,10000),widthFeet:num('Room width','feet',0.01,10000),heightFeet:num('Ceiling height','feet',0.01,1000),doorCount:num('Door openings','doors',0,10000,{integer:true}),windowCount:num('Window openings','windows',0,10000,{integer:true}),largeOpenings:{...rows('Large room openings',INTERIOR_OPENING_FIELDS),optional:true,details:[INTERIOR_OPENING_HELP]}};
export const GABLE_FIELDS={widthFeet:num('Gable width','feet',0.01,10000),heightFeet:num('Gable height','feet',0.01,1000)};
export const GARAGE_FIELDS={widthFeet:num('Garage opening width','feet',0.01,10000),heightFeet:num('Garage opening height','feet',0.01,1000)};
export const OPENING_FIELDS={areaSqft:num('Other opening area not counted above','square feet',0.01,2_000_000)};

export function surfaceExtraDefinitions(type,p={}){
 const each=(label,field)=>({label,field,unit:'each',integer:true});
 if(type==='INTERIOR_PAINTING')return {doorSides:each('Door sides','paintDoorSides'),doorFrames:each('Door frames','paintDoorFrames'),windows:each('Windows','paintWindows'),cabinetFaces:each('Cabinet doors or drawer faces','paintCabinetFaces')};
 if(type==='EXTERIOR_PAINTING')return {windows:each('Windows','paintWindows'),doors:each('Doors','paintDoors'),shutters:each('Shutters','paintShutters'),garageDoors:each('Garage doors','paintGarageDoors'),exteriorTrim:{label:'Exterior trim',field:'exteriorTrimLengthLF',unit:'linear feet'},soffit:{label:'Soffit',field:'soffitQuantity',unit:'linear feet'},fascia:{label:'Fascia',field:'fasciaLengthLF',unit:'linear feet'},powerWashing:{label:'Power washing',field:'powerWashingAreaSqft',unit:'square feet'}};
 if(type==='SIDING_REPLACEMENT')return {soffit:{label:'Soffit',field:'soffitQuantity',unit:p.sidingSettings?.soffitUnit==='square_feet'?'square feet':p.sidingSettings?.soffitUnit==='linear_feet'?'linear feet':null},fascia:{label:'Fascia',field:'fasciaLengthLF',unit:'linear feet'}};
 return {};
}

export function surfaceOwnerDiagnostics(type,p={}){
 if(!surfaceType(type))return [];
 const errors=[],bad=(path,message)=>errors.push({type:'invalid',kind:'surface_pricing',path,message});
 const settings=p.paintingSettings;
 if(settings!==undefined){
  if(!paintingType(type)||!record(settings))bad('paintingSettings','Painting settings must be a plain named map.');
  else for(const [key,value] of Object.entries(settings)){
   if(own(COAT_RATIOS,key)){if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>Number.MAX_SAFE_INTEGER)bad('paintingSettings.'+key,'An additional-coat ratio must be finite and non-negative; remove it to retain linear per-coat pricing.');}
   else if(['primerCoats','ceilingPrimerCoats','trimPrimerCoats'].includes(key)){if(!Number.isInteger(value)||value<0||value>3)bad('paintingSettings.'+key,'Primer coats must be a whole number from 0 to 3.');}
   else if(key==='heightBands'){
    const keys=['standardMaxFeet','highMaxFeet','vaultedMaxFeet'];
    if(!record(value)||Object.keys(value).length!==3||keys.some(k=>typeof value[k]!=='number'||!Number.isFinite(value[k])||value[k]<=0||value[k]>1000)||!(value.standardMaxFeet<value.highMaxFeet&&value.highMaxFeet<value.vaultedMaxFeet))bad('paintingSettings.heightBands','Enter all three positive, increasing height-band upper limits in feet.');
   }else bad('paintingSettings.'+key,'Unsupported painting setting.');
  }
 }
 for(const [root,definitions] of [['paintingRates',paintingType(type)?PAINTING_RATES:{}],['surfaceExtraRates',surfaceExtraDefinitions(type,p)]])if(p[root]!==undefined){
  if(!record(p[root])){bad(root,'Prices must be a named map.');continue;}
  for(const [key,value] of Object.entries(p[root])){
   if(!own(definitions,key))bad(root+'.'+key,'Unsupported surface price.');
   else if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>Number.MAX_SAFE_INTEGER||root==='surfaceExtraRates'&&definitions[key].integer&&!Number.isSafeInteger(value))bad(root+'.'+key,'Enter a finite non-negative price in cents; each-item prices must be whole cents.');
  }
 }
 if(p.sidingSettings!==undefined){
  const d=p.sidingSettings;
  if(type!=='SIDING_REPLACEMENT'||!record(d))bad('sidingSettings','Siding measurement settings must be a named map.');
  else {
   for(const key of Object.keys(d))if(!['areaConventionByType','soffitUnit'].includes(key))bad('sidingSettings.'+key,'Unsupported siding setting.');
   if(d.areaConventionByType!==undefined){
    if(!record(d.areaConventionByType))bad('sidingSettings.areaConventionByType','Choose the measurement convention for each priced siding type.');
    else for(const [key,value] of Object.entries(d.areaConventionByType))if(!['vinyl','fiber_cement','wood','metal'].includes(key)||!own(SIDING_CONVENTIONS,value))bad('sidingSettings.areaConventionByType.'+key,'Choose a supported siding type and measurement convention.');
   }
   if(d.soffitUnit!==undefined&&!['square_feet','linear_feet'].includes(d.soffitUnit))bad('sidingSettings.soffitUnit','Choose square feet or linear feet for soffit.');
  }
 }
 if(type==='SIDING_REPLACEMENT'&&p.surfaceExtraRates?.soffit!==undefined&&!['square_feet','linear_feet'].includes(p.sidingSettings?.soffitUnit))bad('sidingSettings.soffitUnit','Choose the unit covered by the soffit price.');
 return errors;
}

export function surfaceRowsIssue(def,value){
 if(!Array.isArray(value)||value.length<def.minRows||value.length>def.maxRows)return 'must contain '+def.minRows+'–'+def.maxRows+' measured rows';
 for(const row of value){
  if(!record(row)||Object.keys(row).some(key=>!own(def.rowFields,key)))return 'must contain only the stated measurements in each row';
  for(const [key,f] of Object.entries(def.rowFields)){
   if(row[key]===undefined&&f.optional)continue;
   if(f.type==='surface_rows'){const issue=surfaceRowsIssue(f,row[key]);if(issue)return key+' '+issue;}
   else if(f.type==='boolean'){if(typeof row[key]!=='boolean')return key+' must be true or false';}
   else if(typeof row[key]!=='number'||!Number.isFinite(row[key])||row[key]<f.min||row[key]>f.max||f.integer&&!Number.isInteger(row[key]))return key+' must be a finite '+(f.integer?'whole ':'')+'number from '+f.min+' to '+f.max;
  }
 }
 return null;
}
function fail(field,message){throw Object.assign(Error(message),{surfaceField:field});}
const amount=(c,key,{zero=false}={})=>{
 const value=c[key];if(typeof value!=='number'||!Number.isFinite(value)||value<(zero?0:Number.MIN_VALUE)||value>2_000_000)fail(key,'Enter a supported positive measurement for '+key+'.');return value;
};
function array(c,key,definition){const value=c[key]??[];const error=surfaceRowsIssue(definition,value);if(error)fail(key,error);return value;}
function heightBand(feet,p,fallback){
 const b=p.paintingSettings?.heightBands;
 if(!b)return fallback;
 for(const [band,key] of [['standard','standardMaxFeet'],['high','highMaxFeet'],['vaulted','vaultedMaxFeet']])if(feet<=b[key])return band;
 fail('wallHeightFeet','This height is outside the owner-priced height bands.');
}
const total=(items,fn)=>exactAdd(...items.map(fn));
const interiorOpeningArea=opening=>exactMultiply(opening.widthFeet,opening.heightFeet);
const deductibleInteriorOpening=opening=>exactCompare(interiorOpeningArea(opening),100)>=0||opening.runsFloorToCeiling===true&&opening.widthFeet>5;

export function surfaceGeometry(type,c,p={}){
 const interior=type==='INTERIOR_PAINTING',siding=type==='SIDING_REPLACEMENT',method=c.areaInputMethod;
 const key=siding?'sidingAreaSqft':interior?'wallAreaSqft':'exteriorAreaSqft';
 const gableRows=array(c,'gables',rows('Gables',GABLE_FIELDS));
 const gables=total(gableRows,r=>exactDivide(exactMultiply(r.widthFeet,r.heightFeet),2));
 const other=array(c,'largeOpenings',rows('Other openings',interior?INTERIOR_OPENING_FIELDS:OPENING_FIELDS));
 const openingArea=interior?interiorOpeningArea:r=>r.areaSqft;
 const otherArea=total(other,openingArea),largeOther=total(other.filter(interior?deductibleInteriorOpening:r=>r.areaSqft>=100),openingArea);
 let groups=[],gross,doors=0,windows=0,garage=0,largeGarage=0,ceiling=0,roomOpenings=0,largeRoomOpenings=0;
 if(method==='room_dimensions'){
  if(!interior)fail('areaInputMethod','Room dimensions apply only to interior painting.');
  if(c[key]!==undefined||c.ceilingAreaSqft!==undefined||c.wallHeightFeet!==undefined)fail(key,'Use room dimensions or direct areas, not both.');
  const roomRows=array(c,'rooms',rows('Rooms',ROOM_FIELDS,1));
  groups=roomRows.map(r=>{
   const gross=exactMultiply(2,exactAdd(r.lengthFeet,r.widthFeet),r.heightFeet),openings=r.largeOpenings||[];
   const all=total(openings,interiorOpeningArea),large=total(openings.filter(deductibleInteriorOpening),interiorOpeningArea);
   if(exactCompare(exactSubtract(gross,exactAdd(all,exactMultiply(r.doorCount,20),exactMultiply(r.windowCount,15))),0)<0||exactCompare(gross,large)<=0)fail('rooms','The openings must fit within their own room wall area.');
   roomOpenings=exactAdd(roomOpenings,all);largeRoomOpenings=exactAdd(largeRoomOpenings,large);
   return {gross,area:exactSubtract(gross,large),ceiling:exactMultiply(r.lengthFeet,r.widthFeet),height:heightBand(r.heightFeet,p,c.wallHeight)};
  });
  gross=total(groups,g=>g.gross);ceiling=total(groups,g=>g.ceiling);
  if(exactCompare(largeOther,0)>0&&new Set(groups.map(g=>g.height)).size>1)fail('largeOpenings','Put each large opening in its room so its actual height adjustment can be used.');
  doors=roomRows.reduce((n,r)=>n+r.doorCount,0);windows=roomRows.reduce((n,r)=>n+r.windowCount,0);
 }else if(method==='building_dimensions'){
  if(interior)fail('areaInputMethod','Building dimensions apply to exterior painting or siding.');
  if(c[key]!==undefined)fail(key,'Use building dimensions or direct area, not both.');
  const perimeter=amount(c,'buildingPerimeterFeet'),height=amount(c,'wallHeightFeet');
  gross=exactAdd(exactMultiply(perimeter,height),gables);
 }else {
  gross=exactAdd(amount(c,key),gables);
  ceiling=c.ceilingAreaSqft??0;
 }
 if(method!=='room_dimensions'){
  doors=c.doorCount??0;windows=c.windowCount??0;
  const n=c.garageDoorCount??0;
  if(c.garageOpenings!==undefined){
   const openings=array(c,'garageOpenings',rows('Garage-door openings',GARAGE_FIELDS,1));
   if(openings.length!==n)fail('garageOpenings','List one opening for each garage door.');
   if(c.garageDoorWidthFeet!==undefined||c.garageDoorHeightFeet!==undefined)fail('garageOpenings','Use individual garage openings or the shared opening dimensions, not both.');
   garage=total(openings,r=>exactMultiply(r.widthFeet,r.heightFeet));
   largeGarage=total(openings.filter(r=>exactCompare(exactMultiply(r.widthFeet,r.heightFeet),100)>=0),r=>exactMultiply(r.widthFeet,r.heightFeet));
  }else if(n>0){garage=exactMultiply(n,amount(c,'garageDoorWidthFeet'),amount(c,'garageDoorHeightFeet'));if(exactCompare(exactMultiply(c.garageDoorWidthFeet,c.garageDoorHeightFeet),100)>=0)largeGarage=garage;}
 }
 const openings=exactAdd(exactMultiply(doors,20),exactMultiply(windows,15),garage,otherArea,roomOpenings);
 let labor=exactSubtract(gross,exactAdd(largeGarage,largeOther,largeRoomOpenings)),paint=exactSubtract(gross,openings);
 if(siding){
  const convention=p.sidingSettings?.areaConventionByType?.[c.sidingType];
  if(method==='building_dimensions'){
   if(!convention)fail('sidingType','The owner must choose the area convention for this siding rate before dimension-based quoting.');
   labor=convention==='openings_left_in'?exactSubtract(gross,exactDivide(exactAdd(garage,otherArea),2)):paint;
  }else labor=gross; // Direct area is entered using the owner's stated convention.
  paint=labor;
 }
 if(exactCompare(labor,0)<=0||exactCompare(paint,0)<0||exactCompare(gross,2_000_000)>0)fail(key,'Openings and dimensions must leave a supported non-negative paint area and positive wall area.');
 if(!groups.length)groups=[{area:labor,ceiling,height:heightBand(c.wallHeightFeet,p,c.wallHeight)}];
 // Global openings may share an allocation only when all room height factors
 // are identical. Mixed-height openings must be placed in their actual room.
 if(method==='room_dimensions'&&exactCompare(largeOther,0)>0)groups=groups.map(g=>({...g,area:exactMultiply(g.area,exactDivide(labor,exactSubtract(gross,largeRoomOpenings)))}));
 if(paintingType(type)){
  const byHeight=new Map();
  for(const group of groups){const previous=byHeight.get(group.height);byHeight.set(group.height,previous?{height:group.height,area:exactAdd(previous.area,group.area),ceiling:exactAdd(previous.ceiling,group.ceiling)}:group);}
  groups=[...byHeight.values()];
 }
 return {gross,labor,paint,ceiling,groups,openings};
}

export function surfaceCalculationInputs(type,c,p){
 if(!surfaceType(type))return c;
 const geometry=surfaceGeometry(type,c,p),key=type==='SIDING_REPLACEMENT'?'sidingAreaSqft':type==='INTERIOR_PAINTING'?'wallAreaSqft':'exteriorAreaSqft';
 return {...c,[key]:exactToNumber(geometry.labor),paintNetAreaSqft:exactToNumber(geometry.paint),...(type==='INTERIOR_PAINTING'&&c.ceilingsIncluded?{ceilingAreaSqft:exactToNumber(geometry.ceiling)}:{}),...(p.paintingSettings?.heightBands?{wallHeight:geometry.groups[0].height}:{}),_surfaceGeometry:geometry};
}

export function surfaceActivationInput(type,p,c){
 if(type!=='INTERIOR_PAINTING')return c;
 const next={...c},d=p.offeringDetails||{};
 if(p.paintingSettings?.heightBands)next.wallHeightFeet=p.paintingSettings.heightBands[{standard:'standardMaxFeet',high:'highMaxFeet',vaulted:'vaultedMaxFeet'}[c.wallHeight||'standard']];
 if(Object.keys(p.paintingSettings||{}).length||Object.keys(p.paintingRates||{}).length){
  if(c.ceilingsIncluded){next.ceilingCoats=c.ceilingCoats??d.ceilingCoats??c.coats;next.ceilingSurfaceCondition=c.ceilingSurfaceCondition??d.ceilingSurfaceCondition??c.surfaceCondition;}
  if(c.trimIncluded){next.trimCoats=c.trimCoats??d.trimFinishCoats??1;next.trimSurfaceCondition=c.trimSurfaceCondition??d.trimSurfaceCondition??'good';}
 }
 return next;
}

export function surfaceCustomerContract(type,p,base){
 if(!surfaceType(type))return base;
 const interior=type==='INTERIOR_PAINTING',siding=type==='SIDING_REPLACEMENT';
 const fields={...base.fields};
 const convention=p.sidingSettings?.areaConventionByType;
 fields.areaInputMethod=select(siding?'Siding area measurement method':'Wall area measurement method',interior?['wall_sqft','room_dimensions']:siding?['sqft','building_dimensions']:['wall_sqft','building_dimensions'],{optionLabels:{sqft:'Enter siding wall area directly',wall_sqft:'Enter wall area directly',room_dimensions:'Room length, width and height',building_dimensions:'House perimeter and wall height'},details:['Changing measurement methods clears the other method\'s measurements. Enter gables separately only when they are not included in the direct area.']});
 if(interior)fields.rooms={...rows('Room measurements',ROOM_FIELDS,1),visibleWhen:when('areaInputMethod','room_dimensions')};
 else {
  fields.buildingPerimeterFeet={...num('House perimeter','feet',0.01),visibleWhen:when('areaInputMethod','building_dimensions')};
  fields.gables={...rows('Gable triangles',GABLE_FIELDS),details:['Enter each gable separately. Its width × height ÷ 2 is added once; leave these triangles out of any direct area entered above.'],visibleWhen:[...when('areaInputMethod','building_dimensions'),...when('areaInputMethod',siding?'sqft':'wall_sqft')]};
  for(const [name,label] of [['doorCount','Door openings'],['windowCount','Window openings'],['garageDoorCount','Garage-door openings']])fields[name]={...num(label,'openings',0,10000,{integer:true}),visibleWhen:when('areaInputMethod','building_dimensions')};
  fields.garageDoorWidthFeet={...num('Width of each garage-door opening','feet',0.01),visibleWhen:[[['garageDoorCount','gt',0]]]};
  fields.garageDoorHeightFeet={...num('Height of each garage-door opening','feet',0.01),visibleWhen:[[['garageDoorCount','gt',0]]]};
  fields.garageOpenings={...rows('Individual garage-door openings',GARAGE_FIELDS,1),details:['Use this list when opening sizes differ; otherwise enter the shared width and height above. Do not use both.'],visibleWhen:[[['garageDoorCount','gt',0]]]};
 }
 fields.largeOpenings={...rows('Other openings',interior?INTERIOR_OPENING_FIELDS:OPENING_FIELDS),details:[interior?INTERIOR_OPENING_HELP:siding?'Only openings not already counted as doors, windows or garage doors. Openings left in subtracts half the area of every garage door and every listed other opening, whatever its size; ordinary windows and doors stay in. Openings subtracted removes their full area.':'Only openings not already counted as doors, windows or garage doors. Openings 100 square feet or larger are removed from painting labor; all listed openings are removed from paint quantity.'],visibleWhen:paintingType(type)?[...dimensionalWhen,...when('areaInputMethod','wall_sqft')]:dimensionalWhen};
 if(interior)for(const [name,label]of [['doorCount','Door openings'],['windowCount','Window openings']])fields[name]={...num(label,'openings',0,10000,{integer:true}),visibleWhen:when('areaInputMethod','wall_sqft')};
 if(type==='EXTERIOR_PAINTING')for(const name of ['doorCount','windowCount','garageDoorCount'])fields[name].visibleWhen=[...when('areaInputMethod','building_dimensions'),...when('areaInputMethod','wall_sqft')];
 const areaKey=siding?'sidingAreaSqft':interior?'wallAreaSqft':'exteriorAreaSqft';
 fields[areaKey]={...fields[areaKey],visibleWhen:when('areaInputMethod',siding?'sqft':'wall_sqft'),...(siding?{details:['Use the convention saved for the selected siding rate. Gable triangles entered separately are added once.'],presentationVariants:Object.entries(convention||{}).map(([value,basis])=>({label:'Siding wall area — '+SIDING_CONVENTIONS[basis],details:[basis==='openings_left_in'?'Leave ordinary door and window openings in. Subtract half the area of every garage door and every listed other opening, whatever its size.':'Subtract 15 square feet per window, 20 per door and the full area of garage doors and other openings.','Include gable area (width × height ÷ 2), or enter its triangle separately below and leave it out of this direct area.'],visibleWhen:when('sidingType',value)}))}:{})};
 if(!interior||p.paintingSettings?.heightBands)fields.wallHeightFeet={...num(interior?'Wall height':'Wall height to the eaves','feet',0.01,1000),visibleWhen:interior?when('areaInputMethod','wall_sqft'):when('areaInputMethod','building_dimensions')};
 if(paintingType(type)){
  fields.coats={...fields.coats,label:'Wall finish coats'};
  fields.surfaceCondition={...fields.surfaceCondition,label:'Wall surface condition'};
  if(interior){
   if(p.paintingSettings?.heightBands)fields.wallHeight={...fields.wallHeight,visibleWhen:[]};
   fields.wallScopeUniform={...fields.wallScopeUniform,visibleWhen:when('areaInputMethod','wall_sqft')};
   fields.ceilingCoats={...num('Ceiling finish coats','coats',1,3,{integer:true}),visibleWhen:when('ceilingsIncluded')};
   fields.ceilingSurfaceCondition={...conditions,label:'Ceiling surface condition',visibleWhen:when('ceilingsIncluded')};
   fields.trimCoats={...num('Trim finish coats','coats',1,3,{integer:true}),visibleWhen:when('trimIncluded')};
   fields.trimSurfaceCondition={...conditions,label:'Trim surface condition',visibleWhen:when('trimIncluded')};
   fields.ceilingAreaSqft={...fields.ceilingAreaSqft,visibleWhen:[[['areaInputMethod','eq','wall_sqft'],['ceilingsIncluded','eq',true]]]};
  }
 }
 const extras=surfaceExtraDefinitions(type,p);
 fields.surfaceOptionalItems={label:siding?'Which optional siding items would you like?':'Which optional painting items would you like?',type:'multi_enum',unit:null,values:Object.keys(extras),optionLabels:Object.fromEntries(Object.entries(extras).map(([key,def])=>[key,def.label])),details:['Select all that apply, or leave all unchecked for none. We ask for quantities only for selected items with a saved price. Unpriced items are excluded from this quote and need a separate estimate.']};
 for(const [key,def] of Object.entries(extras)){
  const priced=p.surfaceExtraRates?.[key]!==undefined&&def.unit!==null;
  fields[def.field]=num(def.label==='Power washing'?'Power-washing area':def.label+' to '+(siding?'install':'paint'),def.unit,0,1_000_000,{...(def.integer?{integer:true}:{}),optionalItemKey:key,evidenceOnly:!priced,visibleWhen:priced?[[['surfaceOptionalItems','contains',key]]]:[],details:[(def.integer?'Enter your best estimate of the number of items.':'Enter your best estimate in '+def.unit+'.')+' The business will confirm it on site.']});
  if(!priced)delete fields[def.field].details;
 }
 if(paintingType(type))fields[areaKey].details=['If you supply opening counts or areas, enter wall area before subtracting those openings. Without opening inputs, your existing directly entered area is used unchanged.'];
 const geometryErrors=c=>{
  const errors=[];
  if(siding&&c.areaInputMethod==='building_dimensions'&&!p.sidingSettings?.areaConventionByType?.[c.sidingType])return errors;
  if(c.areaInputMethod==='room_dimensions'&&c.rooms!==undefined||c.areaInputMethod==='building_dimensions'&&c.buildingPerimeterFeet!==undefined||c.gables!==undefined||c.largeOpenings!==undefined||p.paintingSettings?.heightBands&&c.wallHeightFeet!==undefined)try{surfaceGeometry(type,c,p);}catch(error){errors.push({field:error.surfaceField||areaKey,message:error.message});}
  return errors;
 };
 const forLegacy=c=>{
  let value={...c};
  if(['room_dimensions','building_dimensions'].includes(c.areaInputMethod))try{value={...value,...surfaceCalculationInputs(type,c,p),areaInputMethod:siding?'sqft':'wall_sqft',wallScopeUniform:true};}catch{}
  return value;
 };
 return {...base,fields,required:c=>{
  const dimensional=['room_dimensions','building_dimensions'].includes(c.areaInputMethod);
  const modern=dimensional||Object.keys(p.paintingSettings||{}).length||Object.keys(p.paintingRates||{}).length;
  const out=(base.required?.(forLegacy(c),p)||[]).filter(name=>!(dimensional&&[areaKey,'ceilingAreaSqft','wallScopeUniform'].includes(name))&&!(p.paintingSettings?.heightBands&&name==='wallHeight'));
  if(c.areaInputMethod==='room_dimensions')out.push('rooms');
  if(c.areaInputMethod==='building_dimensions')out.push('buildingPerimeterFeet','wallHeightFeet','doorCount','windowCount','garageDoorCount','gables');
  if(p.paintingSettings?.heightBands&&c.areaInputMethod!=='room_dimensions')out.push('wallHeightFeet');
  if((c.garageDoorCount??0)>0&&c.garageOpenings===undefined)out.push('garageDoorWidthFeet','garageDoorHeightFeet');
  if(modern&&paintingType(type)&&c.ceilingsIncluded)out.push('ceilingCoats','ceilingSurfaceCondition');
  if(modern&&paintingType(type)&&c.trimIncluded)out.push('trimCoats','trimSurfaceCondition');
  for(const [key,def] of Object.entries(extras))if(Array.isArray(c.surfaceOptionalItems)&&c.surfaceOptionalItems.includes(key)&&p.surfaceExtraRates?.[key]!==undefined&&def.unit!==null)out.push(def.field);
  return [...new Set(out)];
 },crossValidate:c=>[...(base.crossValidate?.(forLegacy(c),p)||[]),...geometryErrors(c)],inspection:c=>interior&&!p.offeringMode&&c.ceilingsIncluded&&['fair','poor'].includes(c.ceilingSurfaceCondition)?'Ceiling preparation for this condition requires itemized painting preparation prices.':base.inspection?.(forLegacy(c),p)};
}

// The legacy price is retained as a two-coat basis. Keeping the conversion as an
// exact multiplier avoids serializing 111.111... cents as a rounded unit price.
export function coatLaborParts(quantity,coats,ratio){
 if(ratio===undefined)return [{suffix:'',quantity:exactMultiply(quantity,coats),multipliers:[]}];
 const first=exactDivide(2,exactAdd(1,ratio));
 return [{suffix:' — first coat',quantity,multipliers:[{name:'First-coat price conversion',path:'paintingSettings',value:exactToNumber(first),exactValue:exactEvidence(first)}]},...(coats>1?[{suffix:' — additional coats',quantity:exactMultiply(quantity,coats-1),multipliers:[{name:'Additional-coat price conversion',path:'paintingSettings',value:exactToNumber(exactMultiply(first,ratio)),exactValue:exactEvidence(exactMultiply(first,ratio)),allowZero:true}]}]:[])];
}

export const trimComponentPricing=p=>p.paintingRates?.trimLaborPerLFPerCoat!==undefined||p.paintingRates?.trimMaterialPerLFPerCoat!==undefined;

export function trimPreparationNeeded(c,p){
 const condition=c.trimSurfaceCondition;
 return !!condition&&(condition!=='good'||['Labor','Material'].some(category=>p.paintingRates?.['trimPrep'+category+'PerLF_'+condition]!==undefined));
}

export function requestedSurfaceExtras(type,c,p={}){
 return Object.entries(surfaceExtraDefinitions(type,p)).filter(([key,d])=>Array.isArray(c.surfaceOptionalItems)?c.surfaceOptionalItems.includes(key)&&(p.surfaceExtraRates?.[key]===undefined||c[d.field]>0):c[d.field]>0).map(([key,def])=>({key,...def,quantity:c[def.field],ratePath:'surfaceExtraRates.'+key,rateCents:p.surfaceExtraRates?.[key]}));
}
