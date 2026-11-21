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
// How a siding rate was set: on the full wall area, with garage doors and
// other large openings taken out, or with every opening taken out.
export const SIDING_CONVENTIONS={openings_left_in:'Full wall area: openings left in',large_openings_subtracted:'Garage doors and other large openings subtracted; windows and doors left in',openings_subtracted:'All openings subtracted'};
// Siding labor and materials may be priced on different areas, as painting
// labor and paint are. The material convention defaults to the labor one, so
// a book without it prices exactly as before.
export const sidingMaterialConvention=(p,type)=>p.sidingSettings?.materialAreaConventionByType?.[type]??p.sidingSettings?.areaConventionByType?.[type];
export const sidingAreasDiffer=(p,type)=>{const labor=p.sidingSettings?.areaConventionByType?.[type];return !!labor&&sidingMaterialConvention(p,type)!==labor;};
const num=(label,unit,min=0,max=1_000_000,extra={})=>({label,unit,type:'number',min,max,...extra});
const select=(label,values,extra={})=>({label,type:'enum',unit:null,values,...extra});
const conditions=select('Surface condition',['good','fair','poor']);
const when=(name,value=true)=>[[[name,'eq',value]]];
const dimensionalWhen=[...when('areaInputMethod','room_dimensions'),...when('areaInputMethod','building_dimensions')];
const rows=(label,rowFields,minRows=0)=>({label,type:'surface_rows',unit:null,rowFields,minRows,maxRows:100});
export const INTERIOR_OPENING_FIELDS={widthFeet:num('Opening width','feet',0.01,10000),heightFeet:num('Opening height','feet',0.01,1000),runsFloorToCeiling:{label:'Runs floor to ceiling?',type:'boolean',unit:null,optional:true}};
const INTERIOR_OPENING_HELP='Only openings not counted as doors or windows. Openings 100 square feet or larger, or openings that run floor to ceiling and are wider than 5 feet, are removed from labor. All listed openings are removed from paint quantity.';
export const ROOM_FIELDS={lengthFeet:num('Room length','feet',0.01,10000),widthFeet:num('Room width','feet',0.01,10000),heightFeet:num('Ceiling height','feet',0.01,1000),doorCount:num('Door openings','doors',0,10000,{integer:true}),windowCount:num('Window openings','windows',0,10000,{integer:true}),largeOpenings:{...rows('Large room openings',INTERIOR_OPENING_FIELDS),optional:true,details:[INTERIOR_OPENING_HELP]},coats:num('Wall finish coats in this room','coats',1,3,{integer:true,optional:true})};
// A room's wall color, asked only when wall paint is bought by the can. Saved
// rooms are always checked with it, so a supplied color is never dropped.
export const ROOM_WALL_COLOR_FIELD={wallColor:num('Wall color number','color number',1,100,{integer:true,optional:true})};
const ROOM_COATS_HELP='Enter a room\'s wall finish coats only when that room needs a different number of coats than the wall finish coats for the job, for example a room changing color. A room left blank uses the wall finish coats for the job.';
const ROOM_COLOR_HELP='For multiple wall colors, give every room its color number. If a room has an accent wall, enter wall area directly and give the paintable area of each color.';
const COLOR_AREAS=rows('Paintable wall area by color',{areaSqft:num('Wall area for this color','square feet',0.01,2_000_000)},2);
export const GABLE_FIELDS={widthFeet:num('Gable width','feet',0.01,10000),heightFeet:num('Gable height','feet',0.01,1000)};
export const GARAGE_FIELDS={widthFeet:num('Garage opening width','feet',0.01,10000),heightFeet:num('Garage opening height','feet',0.01,1000)};
export const OPENING_FIELDS={areaSqft:num('Other opening area not counted above','square feet',0.01,2_000_000)};

export function surfaceExtraDefinitions(type,p={}){
 const each=(label,field)=>({label,field,unit:'each',integer:true});
 if(type==='INTERIOR_PAINTING')return {doorSides:each('Door sides','paintDoorSides'),doorFrames:each('Door frames','paintDoorFrames'),windows:each('Windows','paintWindows'),cabinetFaces:each('Cabinet doors or drawer faces','paintCabinetFaces')};
 if(type==='EXTERIOR_PAINTING')return {windows:each('Windows','paintWindows'),doors:each('Doors','paintDoors'),shutters:each('Shutters','paintShutters'),garageDoors:each('Garage doors','paintGarageDoors'),exteriorTrim:{label:'Exterior trim',field:'exteriorTrimLengthLF',unit:'linear feet'},soffit:{label:'Soffit',field:'soffitQuantity',unit:p.paintingSettings?.soffitUnit==='square_feet'?'square feet':'linear feet'},fascia:{label:'Fascia',field:'fasciaLengthLF',unit:'linear feet'},powerWashing:{label:'Power washing',field:'powerWashingAreaSqft',unit:'square feet'}};
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
   else if(key==='soffitUnit'){if(type!=='EXTERIOR_PAINTING'||!['square_feet','linear_feet'].includes(value))bad('paintingSettings.soffitUnit','Choose square feet or linear feet for exterior soffit.');}
   else if(['primerCoats','ceilingPrimerCoats','trimPrimerCoats'].includes(key)){if(!Number.isInteger(value)||value<0||value>3)bad('paintingSettings.'+key,'Primer coats must be a whole number from 0 to 3.');}
   else if(key==='heightBands'&&type!=='INTERIOR_PAINTING')bad('paintingSettings.heightBands','Wall height bands apply to interior painting only.');
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
   for(const key of Object.keys(d))if(!['areaConventionByType','materialAreaConventionByType','soffitUnit'].includes(key))bad('sidingSettings.'+key,'Unsupported siding setting.');
   for(const field of ['areaConventionByType','materialAreaConventionByType'])if(d[field]!==undefined){
    if(!record(d[field]))bad('sidingSettings.'+field,'Choose the measurement convention for each priced siding type.');
    else for(const [key,value] of Object.entries(d[field]))if(!['vinyl','fiber_cement','wood','metal'].includes(key)||!own(SIDING_CONVENTIONS,value))bad('sidingSettings.'+field+'.'+key,'Choose a supported siding type and measurement convention.');
   }
   // A separate material convention converts from the labor convention.
   if(record(d.materialAreaConventionByType))for(const key of Object.keys(d.materialAreaConventionByType))if(!own(record(d.areaConventionByType)?d.areaConventionByType:{},key))bad('sidingSettings.areaConventionByType.'+key,'Choose the area convention for this siding type before a separate material area convention.');
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
 let groups=[],rooms,gross,doors=0,windows=0,garage=0,largeGarage=0,ceiling=0,roomOpenings=0,largeRoomOpenings=0;
 if(method==='room_dimensions'){
  if(!interior)fail('areaInputMethod','Room dimensions apply only to interior painting.');
  if(c[key]!==undefined||c.ceilingAreaSqft!==undefined||c.wallHeightFeet!==undefined)fail(key,'Use room dimensions or direct areas, not both.');
  // Doors and windows are counted in each room; a whole-job count would be ignored.
  for(const name of ['doorCount','windowCount','garageDoorCount'])if(c[name]!==undefined)fail(name,'Count doors and windows in each room, not for the whole job.');
  const roomRows=array(c,'rooms',rows('Rooms',{...ROOM_FIELDS,...ROOM_WALL_COLOR_FIELD},1));
  groups=roomRows.map(r=>{
   const gross=exactMultiply(2,exactAdd(r.lengthFeet,r.widthFeet),r.heightFeet),openings=r.largeOpenings||[];
   const all=total(openings,interiorOpeningArea),large=total(openings.filter(deductibleInteriorOpening),interiorOpeningArea);
   const roomPaint=exactSubtract(gross,exactAdd(all,exactMultiply(r.doorCount,20),exactMultiply(r.windowCount,15)));
   if(exactCompare(roomPaint,0)<0||exactCompare(gross,large)<=0)fail('rooms','The openings must fit within their own room wall area.');
   roomOpenings=exactAdd(roomOpenings,all);largeRoomOpenings=exactAdd(largeRoomOpenings,large);
   // A room without its own coat count uses the job's wall finish coats.
   return {gross,area:exactSubtract(gross,large),ceiling:exactMultiply(r.lengthFeet,r.widthFeet),height:heightBand(r.heightFeet,p,c.wallHeight),coats:r.coats??c.coats,paint:roomPaint,...(r.wallColor!==undefined?{wallColor:r.wallColor}:{})};
  });
  gross=total(groups,g=>g.gross);ceiling=total(groups,g=>g.ceiling);
  if(exactCompare(largeOther,0)>0&&new Set(groups.map(g=>g.height)).size>1)fail('largeOpenings','Put each large opening in its room so its actual height adjustment can be used.');
  // An opening listed outside the rooms cannot be placed in a room, so it is
  // refused when a room has its own coats or wall color.
  if(exactCompare(otherArea,0)>0&&new Set(groups.map(g=>g.coats)).size>1)fail('largeOpenings','Put each opening in its room so that room\'s own coats can be used.');
  if(exactCompare(otherArea,0)>0&&groups.some(g=>g.wallColor!==undefined))fail('largeOpenings','Put each opening in its room so its wall color can be used.');
  rooms=groups.map(g=>({paint:g.paint,coats:g.coats,...(g.wallColor!==undefined?{wallColor:g.wallColor}:{})}));
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
  const area=basis=>basis==='openings_left_in'?gross:basis==='large_openings_subtracted'?exactSubtract(gross,exactAdd(garage,otherArea)):paint;
  // Labor takes the owner's labor convention and materials the material one.
  // A direct area is the full wall area when the two differ.
  if(method==='building_dimensions'||sidingAreasDiffer(p,c.sidingType)){
   if(!convention)fail('sidingType','The owner must choose the area convention for this siding rate before dimension-based quoting.');
   labor=area(convention);paint=area(sidingMaterialConvention(p,c.sidingType));
  }else {labor=gross;paint=labor;} // Direct area is entered using the owner's stated convention.
 }
 if(exactCompare(labor,0)<=0||exactCompare(paint,0)<0||exactCompare(gross,2_000_000)>0)fail(key,'Openings and dimensions must leave a supported non-negative paint area and positive wall area.');
 if(!groups.length)groups=[{area:labor,ceiling,height:heightBand(c.wallHeightFeet,p,c.wallHeight)}];
 // Global openings may share an allocation only when all room height factors
 // are identical. Mixed-height openings must be placed in their actual room.
 if(method==='room_dimensions'&&exactCompare(largeOther,0)>0)groups=groups.map(g=>({...g,area:exactMultiply(g.area,exactDivide(labor,exactSubtract(gross,largeRoomOpenings)))}));
 if(paintingType(type)){
  const byHeight=new Map();
  // Rooms share one labor line when they share a height and a coat count.
  for(const group of groups){const key=group.height+'|'+group.coats,previous=byHeight.get(key);byHeight.set(key,previous?{height:group.height,coats:group.coats,area:exactAdd(previous.area,group.area),ceiling:exactAdd(previous.ceiling,group.ceiling)}:group);}
  groups=[...byHeight.values()];
 }
 return {gross,labor,paint,ceiling,groups,openings,doors,windows,...(rooms?{rooms}:{})};
}

// Wall paint coat quantity: the paint area times the job's coats, or room by
// room when a room has its own coat count. Rooms with their own coats never
// share an opening listed outside the rooms (surfaceGeometry refuses it).
export function wallPaintCoatArea(c,paintArea){
 const rooms=c._surfaceGeometry?.rooms;
 if(!rooms||rooms.every(r=>r.coats===c.coats))return exactMultiply(paintArea,c.coats);
 return total(rooms,r=>exactMultiply(r.paint,r.coats));
}
// Ceiling work does not depend on a room's wall coats: rooms of one height
// share one ceiling line, so two rooms with different wall coats do not show
// the same ceiling line twice.
export function ceilingsByHeight(groups){
 const out=new Map();
 for(const group of groups)out.set(group.height,out.has(group.height)?exactAdd(out.get(group.height),group.ceiling):group.ceiling);
 return [...out].map(([height,ceiling])=>({height,ceiling}));
}
export const roomCoatsDiffer=c=>!!c._surfaceGeometry?.rooms?.some(r=>r.coats!==c.coats);
// "2 and 3" for the coat counts used room by room.
export function roomCoatsText(c){
 const list=[...new Set(c._surfaceGeometry.rooms.map(r=>r.coats))].sort((a,b)=>a-b);
 return list.length>1?list.slice(0,-1).join(', ')+' and '+list.at(-1):String(list[0]);
}
// Round packages separately using the measured area and coats for each color.
export function wallPaintByColor(c){
 const n=c.wallColorCount,rooms=c._surfaceGeometry?.rooms;
 if(rooms?.length)return Array.from({length:n},(_,i)=>total(rooms.filter(r=>r.wallColor===i+1),r=>exactMultiply(r.paint,r.coats)));
 return c.wallColorAreas.map(row=>exactMultiply(row.areaSqft,c.coats));
}
// Wall paint is bought by the can when the owner prices its packages.
export const wallPaintByCan=(type,p={},rules={})=>paintingType(type)&&p.offeringMode!=='installed'&&rules.priceBasisByCategory?.material==='cost'&&record(p.scopeDetails?.paint_wall);

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

export function surfaceCustomerContract(type,p,base,rules={}){
 if(!surfaceType(type))return base;
 const interior=type==='INTERIOR_PAINTING',siding=type==='SIDING_REPLACEMENT';
 const fields={...base.fields};
 const convention=p.sidingSettings?.areaConventionByType;
 // Siding types whose labor and material conventions differ take a direct
 // area with every opening left in, and their openings.
 const fullAreaTypes=siding?Object.keys(convention||{}).filter(value=>sidingAreasDiffer(p,value)):[];
 const fullAreaWhen=fullAreaTypes.map(value=>[['areaInputMethod','eq','sqft'],['sidingType','eq',value]]);
 const roomGuidance='Room dimensions assume a rectangular room, one wall height and a flat ceiling. For sloped ceilings, irregular rooms or walls with different heights, enter the measured wall and ceiling surface areas directly.';
 fields.areaInputMethod=select(siding?'Siding area measurement method':'Wall area measurement method',interior?['wall_sqft','room_dimensions']:siding?['sqft','building_dimensions']:['wall_sqft','building_dimensions'],{optionLabels:{sqft:'Enter siding wall area directly',wall_sqft:'Enter wall area directly',room_dimensions:'Room length, width and height',building_dimensions:'House perimeter and wall height'},details:['Changing measurement methods clears the other method\'s measurements. Enter gables separately only when they are not included in the direct area.',...(interior?[roomGuidance]:[])]});
 const byCan=wallPaintByCan(type,p,rules);
 if (byCan) fields.wallColorAreas={...COLOR_AREAS,
  details:['Enter one row per color, starting with color 1. Use paintable square feet for one coat after subtracting openings. The rows must add up to the total paintable wall area.'],
  visibleWhen:(interior?['wall_sqft']:['wall_sqft','building_dimensions']).map(method=>[['areaInputMethod','eq',method],['wallColorCount','gt',1]])};
 if(interior)fields.rooms={...rows('Room measurements',{...ROOM_FIELDS,...(byCan?ROOM_WALL_COLOR_FIELD:{})},1),details:[roomGuidance,ROOM_COATS_HELP,...(byCan?[ROOM_COLOR_HELP]:[])],visibleWhen:when('areaInputMethod','room_dimensions')};
 else {
  fields.buildingPerimeterFeet={...num('House perimeter','feet',0.01),visibleWhen:when('areaInputMethod','building_dimensions')};
  fields.gables={...rows('Gable triangles',GABLE_FIELDS),details:['Enter each gable separately. Its width × height ÷ 2 is added once; leave these triangles out of any direct area entered above.'],visibleWhen:[...when('areaInputMethod','building_dimensions'),...when('areaInputMethod',siding?'sqft':'wall_sqft')]};
  for(const [name,label] of [['doorCount','Door openings'],['windowCount','Window openings'],['garageDoorCount','Garage-door openings']])fields[name]={...num(label,'openings',0,10000,{integer:true}),visibleWhen:[...when('areaInputMethod','building_dimensions'),...fullAreaWhen]};
  fields.garageDoorWidthFeet={...num('Width of each garage-door opening','feet',0.01),visibleWhen:[[['garageDoorCount','gt',0]]]};
  fields.garageDoorHeightFeet={...num('Height of each garage-door opening','feet',0.01),visibleWhen:[[['garageDoorCount','gt',0]]]};
  fields.garageOpenings={...rows('Individual garage-door openings',GARAGE_FIELDS,1),details:['Use this list when opening sizes differ; otherwise enter the shared width and height above. Do not use both.'],visibleWhen:[[['garageDoorCount','gt',0]]]};
 }
 fields.largeOpenings={...rows('Other openings',interior?INTERIOR_OPENING_FIELDS:OPENING_FIELDS),details:[interior?INTERIOR_OPENING_HELP:siding?'Only openings not already counted as doors, windows or garage doors. Full wall area keeps every opening in. Large openings subtracted removes the full area of garage doors and these openings. All openings subtracted also removes 15 square feet per window and 20 per door.':'Only openings not already counted as doors, windows or garage doors. Openings 100 square feet or larger are removed from painting labor; all listed openings are removed from paint quantity.'],visibleWhen:paintingType(type)?[...dimensionalWhen,...when('areaInputMethod','wall_sqft')]:[...dimensionalWhen,...fullAreaWhen]};
 if(interior)for(const [name,label]of [['doorCount','Door openings'],['windowCount','Window openings']])fields[name]={...num(label,'openings',0,10000,{integer:true}),visibleWhen:when('areaInputMethod','wall_sqft')};
 if(type==='EXTERIOR_PAINTING')for(const name of ['doorCount','windowCount','garageDoorCount'])fields[name].visibleWhen=[...when('areaInputMethod','building_dimensions'),...when('areaInputMethod','wall_sqft')];
 const areaKey=siding?'sidingAreaSqft':interior?'wallAreaSqft':'exteriorAreaSqft';
 fields[areaKey]={...fields[areaKey],visibleWhen:when('areaInputMethod',siding?'sqft':'wall_sqft'),...(siding?{details:['Use the convention saved for the selected siding rate. Gable triangles entered separately are added once.'],presentationVariants:Object.entries(convention||{}).map(([value,basis])=>fullAreaTypes.includes(value)?{label:'Siding wall area — '+SIDING_CONVENTIONS.openings_left_in,details:['Leave every opening in: do not subtract windows, doors or garage doors. Count them below instead.','Include gable area (width × height ÷ 2), or enter its triangle separately below and leave it out of this direct area.'],visibleWhen:when('sidingType',value)}:{label:'Siding wall area — '+SIDING_CONVENTIONS[basis],details:[basis==='openings_left_in'?'Leave every opening in: do not subtract windows, doors or garage doors.':basis==='large_openings_subtracted'?'Subtract the full area of garage doors and other large openings. Leave windows and doors in.':'Subtract 15 square feet per window, 20 per door and the full area of garage doors and other openings.','Include gable area (width × height ÷ 2), or enter its triangle separately below and leave it out of this direct area.'],visibleWhen:when('sidingType',value)})}:{})};
 if(!interior||p.paintingSettings?.heightBands)fields.wallHeightFeet={...num(interior?'Wall height':'Wall height to the eaves','feet',0.01,1000),visibleWhen:interior?when('areaInputMethod','wall_sqft'):when('areaInputMethod','building_dimensions')};
 if(paintingType(type)){
  fields.coats={...fields.coats,label:'Wall finish coats'};
  fields.surfaceCondition={...fields.surfaceCondition,label:'Wall surface condition'};
  if(interior){
   if(p.paintingSettings?.heightBands)fields.wallHeight={...fields.wallHeight,visibleWhen:[]};
   fields.wallScopeUniform={...fields.wallScopeUniform,visibleWhen:when('areaInputMethod','wall_sqft'),evidenceOnly:true};
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
 // Room wall colors: every room or none, each number from 1 to the job's
 // number of wall colors used by at least one room.
 const colorErrors=c=>{
  const rooms=Array.isArray(c.rooms)?c.rooms:[],colored=rooms.filter(r=>record(r)&&r.wallColor!==undefined);
  const n=c.wallColorCount;
  if (c.wallColorAreas !== undefined) {
   if (!byCan || !(n>1) || c.areaInputMethod==='room_dimensions') return [{field:'wallColorAreas',message:'Use color areas for multiple colors on walls measured without room rows.'}];
   const issue=surfaceRowsIssue(COLOR_AREAS,c.wallColorAreas);
   if (issue || c.wallColorAreas.length!==n) return [{field:'wallColorAreas',message:issue || 'Enter one area for each wall color.'}];
   try {
    const net=surfaceGeometry(type,c,p).paint;
    if (exactCompare(total(c.wallColorAreas,row=>row.areaSqft),net)!==0) return [{field:'wallColorAreas',message:'Color areas must add up to the paintable wall area after openings ('+exactToNumber(net)+' sq ft).'}];
   } catch { /* The geometry validator reports incomplete or invalid measurements. */ }
  }
  if (!colored.length && !(byCan && n>1 && rooms.length)) return [];
  if(!byCan||c.areaInputMethod!=='room_dimensions')return [{field:'rooms',message:'This detail was supplied for work not selected in this request.'}];
  if(colored.length!==rooms.length)return [{field:'rooms',message:'Give every room its wall color number.'}];
  if(!Number.isInteger(n))return [];
  const used=new Set(colored.map(r=>r.wallColor));
  return colored.some(r=>!Number.isInteger(r.wallColor)||r.wallColor<1||r.wallColor>n)||used.size!==n?[{field:'rooms',message:'Room wall color numbers must use each number from 1 to the number of wall colors.'}]:[];
 };
 // Openings counted on a direct area are checked here too, so a count that
 // leaves no wall area is reported as the customer's answer, not as an owner price.
 const geometryErrors=c=>{
  const errors=[];
  if(siding&&c.areaInputMethod==='building_dimensions'&&!p.sidingSettings?.areaConventionByType?.[c.sidingType])return errors;
  if(c.areaInputMethod==='room_dimensions'&&c.rooms!==undefined||c.areaInputMethod==='building_dimensions'&&c.buildingPerimeterFeet!==undefined||c.gables!==undefined||c.largeOpenings!==undefined||c.doorCount!==undefined||c.windowCount!==undefined||c.garageDoorCount!==undefined||c.garageOpenings!==undefined||p.paintingSettings?.heightBands&&c.wallHeightFeet!==undefined||siding&&c.areaInputMethod==='sqft'&&fullAreaTypes.includes(c.sidingType)&&c.sidingAreaSqft!==undefined)try{surfaceGeometry(type,c,p);}catch(error){errors.push({field:error.surfaceField||areaKey,message:error.message});}
  return errors;
 };
 const forLegacy=c=>{
  let value={...c};
  if(['room_dimensions','building_dimensions'].includes(c.areaInputMethod))try{value={...value,...surfaceCalculationInputs(type,c,p),areaInputMethod:siding?'sqft':'wall_sqft',wallScopeUniform:true};}catch{}
  return value;
 };
 // Room or building dimensions that do not convert to a wall area are reported
 // by the geometry check as the customer's answer; the direct-area inspection
 // would wrongly say the measurement route is not used.
 const legacyInspection=c=>{const legacy=forLegacy(c);return ['room_dimensions','building_dimensions'].includes(legacy.areaInputMethod)?null:base.inspection?.(legacy,p);};
 return {...base,fields,required:c=>{
  const dimensional=['room_dimensions','building_dimensions'].includes(c.areaInputMethod);
  const modern=dimensional||Object.keys(p.paintingSettings||{}).length||Object.keys(p.paintingRates||{}).length;
  const offering=['offeringMode','offeringDetails','offeringRates'].some(k=>own(p,k));
  const out=(base.required?.(forLegacy(c),p)||[]).filter(name=>!(dimensional&&[areaKey,'ceilingAreaSqft','wallScopeUniform'].includes(name))&&!(p.paintingSettings?.heightBands&&name==='wallHeight'));
  if(c.areaInputMethod==='room_dimensions')out.push('rooms');
  if(byCan && c.wallColorCount>1 && ['wall_sqft','building_dimensions'].includes(c.areaInputMethod))out.push('wallColorAreas');
  if(c.areaInputMethod==='building_dimensions')out.push('buildingPerimeterFeet','wallHeightFeet','doorCount','windowCount','garageDoorCount','gables');
  if(siding&&c.areaInputMethod==='sqft'&&fullAreaTypes.includes(c.sidingType))out.push('doorCount','windowCount','garageDoorCount');
  if(p.paintingSettings?.heightBands&&c.areaInputMethod!=='room_dimensions')out.push('wallHeightFeet');
  if((c.garageDoorCount??0)>0&&c.garageOpenings===undefined)out.push('garageDoorWidthFeet','garageDoorHeightFeet');
  if(modern&&paintingType(type)&&c.ceilingsIncluded)out.push('ceilingCoats','ceilingSurfaceCondition');
  // Trim priced per coat (basic or component trim prices, or trim paint bought
  // by the can) needs the customer's trim coats on every setup; an offering's
  // installed trim price covers its own defined coats.
  if(paintingType(type)&&c.trimIncluded&&(modern||!offering))out.push('trimCoats');
  if(modern&&paintingType(type)&&c.trimIncluded)out.push('trimSurfaceCondition');
  for(const [key,def] of Object.entries(extras))if(Array.isArray(c.surfaceOptionalItems)&&c.surfaceOptionalItems.includes(key)&&p.surfaceExtraRates?.[key]!==undefined&&def.unit!==null)out.push(def.field);
  return [...new Set(out)];
 },crossValidate:c=>[...(base.crossValidate?.(forLegacy(c),p)||[]),...geometryErrors(c),...colorErrors(c)],inspection:c=>interior&&!p.offeringMode&&c.ceilingsIncluded&&(c.ceilingSurfaceCondition==='poor'||c.ceilingSurfaceCondition==='fair'&&p.wallPriceIncludesTouchUp!=='yes')?'Ceiling preparation for this condition requires itemized painting preparation prices.':legacyInspection(c)};
}

// The legacy price is retained as a two-coat basis. Keeping the conversion as an
// exact multiplier avoids serializing 111.111... cents as a rounded unit price.
export const COAT_RATE_BASIS='With an additional-coat ratio, enter the average labor price per coat on a two-coat job. With no ratio, every coat uses the entered price.';
const coatRatioForRate={
 laborPerWallSqftPerCoat:'wallAdditionalCoatRatio',wallLaborPerSqftPerCoat:'wallAdditionalCoatRatio',
 ceilingLaborPerSqftPerCoat:'ceilingAdditionalCoatRatio',trimLaborPerLF:'trimAdditionalCoatRatio',trimLaborPerLFPerCoat:'trimAdditionalCoatRatio',
 primerLaborPerSqftPerCoat:'primerAdditionalCoatRatio',ceilingPrimerLaborPerSqftPerCoat:'ceilingPrimerAdditionalCoatRatio',trimPrimerLaborPerLFPerCoat:'trimPrimerAdditionalCoatRatio'
};
const firstCoatFactor=ratio=>exactDivide(2,exactAdd(1,ratio));
export function coatRatePreview(pricing,field,rate) {
 const key=coatRatioForRate[field];
 if (!key || pricing.offeringMode==='installed') return '';
 const ratio=pricing.paintingSettings?.[key];
 if (!Number.isFinite(rate) || !Number.isFinite(ratio) || ratio<0) return '';
 const first=exactMultiply(rate,firstCoatFactor(ratio));
 const display=v=>exactToNumber(v).toLocaleString('en-US',{maximumSignificantDigits:8});
 const unit=field.includes('LF')?'linear foot':'square foot';
 return 'One coat costs $'+display(first)+' per '+unit+' before job adjustments. Each additional coat costs $'+display(exactMultiply(first,ratio))+' per '+unit+'.';
}
export function coatRateHelp(pricing,field,rate) {
 return coatRatioForRate[field] && pricing.offeringMode!=='installed' ? [COAT_RATE_BASIS,coatRatePreview(pricing,field,rate)].filter(Boolean).join(' ') : '';
}
export function coatLaborParts(quantity,coats,ratio,ratioPath='paintingSettings'){
 if(ratio===undefined)return [{suffix:'',quantity:exactMultiply(quantity,coats),multipliers:[]}];
 const first=firstCoatFactor(ratio);
 return [{suffix:' — first coat',quantity,multipliers:[{name:'First-coat price conversion',path:ratioPath,value:exactToNumber(first),exactValue:exactEvidence(first)}]},...(coats>1?[{suffix:' — additional coats',quantity:exactMultiply(quantity,coats-1),multipliers:[{name:'Additional-coat price conversion',path:ratioPath,value:exactToNumber(exactMultiply(first,ratio)),exactValue:exactEvidence(exactMultiply(first,ratio)),allowZero:true}]}]:[])];
}

// The paintingRates entries a service's effective pricing method reads, so the
// editor offers only those (and their allowance notes). Measured interior
// painting reads every entry it has a setting or a job for; an itemized
// interior offering reads only the trim entries (wall and ceiling primer come
// from offeringRates); an installed offering's installed prices decide the
// charge; exterior painting asks no trim question and has no measured path.
export function activePaintingRateKeys(type,p={}){
 if(type!=='INTERIOR_PAINTING'||p.offeringMode==='installed')return [];
 const keys=Object.keys(PAINTING_RATES);
 return p.offeringMode?keys.filter(key=>key.startsWith('trim')):keys;
}
// The paint, primer and preparation waste allowances apply to measured
// material quantities; an installed offering's prices take none.
export const paintingWasteAllowancesActive=(type,p={})=>paintingType(type)&&p.offeringMode!=='installed';
// Quantity assumptions (Class 2) a painting service's pricing method does not
// read, with why. Installed prices already include the offering's defined
// coats and take no material waste. No exterior painting method reads the fair-condition
// preparation hours. The owner's saved value is kept and shown as unused; it
// is never reset or edited while unused.
const INSTALLED_UNUSED_ASSUMPTIONS=['paintWasteFactor','primerWasteFactor','prepMaterialWasteFactor'];
// The painting settings group also holds the interior wall-height bands and the
// exterior soffit unit, which installed pricing does use, so under installed
// pricing only its additional-coat ratios are named as unused.
export const installedCoatRatiosUnused=type=>'The additional-coat labor ratios are saved, but not used by installed pricing: installed prices already include the offering\'s defined coats, so changing a ratio changes nothing. They are kept unchanged unless you remove them. '+(type==='INTERIOR_PAINTING'?'The wall-height bands are':'The soffit price unit is')+' still used; edit '+(type==='INTERIOR_PAINTING'?'them':'it')+' in the service fields above.';
export function installedUnusedSettings(field,value){
  if(field!=='paintingSettings'||!record(value))return value;
  const ratios=Object.entries(value).filter(([key])=>own(COAT_RATIOS,key));
  return ratios.length?Object.fromEntries(ratios):undefined;
}
export const EXTERIOR_PREP_HOURS_UNUSED='Saved, but not used by any exterior painting pricing method: changing it changes nothing. It is kept unchanged unless you remove it.';
export function inactiveQuantityAssumption(type,p={},field){
  if(type==='EXTERIOR_PAINTING'&&field==='prepHoursPerSqft')return EXTERIOR_PREP_HOURS_UNUSED;
  if(paintingType(type)&&p.offeringMode==='installed'&&field==='paintingSettings')return installedCoatRatiosUnused(type);
  if(paintingType(type)&&p.offeringMode==='installed'&&INSTALLED_UNUSED_ASSUMPTIONS.includes(field))return 'Saved, but not used by installed pricing: installed prices already include the offering\'s defined coats and take no waste allowance, so changing it changes nothing. It is kept unchanged unless you remove it.';
  return null;
}
export const INACTIVE_PAINTING_RATE_HELP='Saved, but not used by this pricing method: the quote does not read this price, and changing it changes nothing. It is kept unchanged unless you remove it.';
export const trimComponentPricing=p=>p.paintingRates?.trimLaborPerLFPerCoat!==undefined||p.paintingRates?.trimMaterialPerLFPerCoat!==undefined;

export function trimPreparationNeeded(c,p){
 const condition=c.trimSurfaceCondition;
 return !!condition&&(condition!=='good'||['Labor','Material'].some(category=>p.paintingRates?.['trimPrep'+category+'PerLF_'+condition]!==undefined));
}

export function requestedSurfaceExtras(type,c,p={}){
 return Object.entries(surfaceExtraDefinitions(type,p)).filter(([key,d])=>Array.isArray(c.surfaceOptionalItems)?c.surfaceOptionalItems.includes(key)&&(p.surfaceExtraRates?.[key]===undefined||c[d.field]>0):c[d.field]>0).map(([key,def])=>({key,...def,quantity:c[def.field],ratePath:'surfaceExtraRates.'+key,rateCents:p.surfaceExtraRates?.[key]}));
}
