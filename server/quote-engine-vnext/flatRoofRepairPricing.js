import {exactCompare,exactSubtract,exactMultiply,exactToNumber} from './exactMath.js';

const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export const hasSurfacePrice=v=>v!==undefined&&v!==null&&v!=='';
export const REPAIR_SERVICES=['ROOFING_REPAIR','FLAT_ROOF_REPAIR','SIDING_REPAIR'];
export const REPAIR_UNIT_FIELDS=['repairPricingUnit','repairUnitPrice','repairAreaMinimum','repairFirstAreaSqft'];
export const FLAT_ROOF_ITEMS=[
  {rate:'flatRoofEdgeMetalPerLF',field:'edgeMetalLF',label:'Perimeter edge metal or coping',unit:'linear feet',max:1_000_000},
  {rate:'flatRoofPenetrationEach',field:'penetrationCount',label:'Pipe flashings and other penetrations',unit:'each',max:100_000,integer:true},
  {rate:'flatRoofCurbEach',field:'curbCount',label:'Curbs',unit:'each',max:100_000,integer:true},
  {rate:'flatRoofDrainEach',field:'drainCount',label:'Drains',unit:'each',max:100_000,integer:true},
  {rate:'flatRoofDeckPerSheet',field:'deckSheets',label:'Deck replacement',unit:'sheets',max:100_000,integer:true}
];
export const FLAT_ROOF_FIELDS=[...FLAT_ROOF_ITEMS.map(i=>i.rate),'flatRoofDeckPriceBasis'];
export const FLAT_REPAIR_COPY={
  ...Object.fromEntries(FLAT_ROOF_ITEMS.map(i=>[i.rate,{label:i.label+' price per '+(i.unit==='linear feet'?'linear foot':i.unit==='sheets'?'sheet':'item'),help:'Optional separate '+(i.unit==='sheets'?'deck selling price. Blank price basis means material only; choose installed and enter its labor portion when labor is included.':'installed selling price. Do not include work already covered by your base roof prices.')+' Blank leaves existing quotes unchanged and asks no quantity.'}])),
  flatRoofDeckPriceBasis:{label:'Deck replacement price includes',help:'Blank means material only. Installed includes labor and material; enter the labor portion in Installed prices. The remaining percentage is material.',type:'select',options:['material_only','installed'],optionLabels:{material_only:'Material only',installed:'Installed: labor and material'}},
  repairPricingUnit:{label:'Repair pricing unit by material and repair type',help:'Choose square feet for patches or panels, linear feet for seams or flashing, or each for boots, vents and penetrations. Without a unit price, existing repair bands remain unchanged.',tree:{depth:2,leafType:'enum',options:['square_feet','linear_feet','each'],allowEmpty:true,emptyHelp:'No entries. Add only the repair types you price with this setting.'}},
  repairUnitPrice:{label:'Installed repair price per unit or extra square foot',help:'For area repairs, this is the price per square foot above the first area. For length or count repairs, this is the price per linear foot or item. Enter the labor portion for each installed price; the remaining percentage is material. Blank keeps existing repair bands.',tree:{depth:2,allowEmpty:true,emptyHelp:'No entries. Add only the repair types you price with this setting.'}},
  repairAreaMinimum:{label:'Installed area-repair minimum',help:'Installed price covering the first area for this material and repair type. Enter the covered square feet and the labor portion. Applies only with square-foot pricing.',tree:{depth:2,allowEmpty:true,emptyHelp:'No entries. Add only the repair types you price with this setting.'}},
  repairFirstAreaSqft:{label:'First area covered by the repair minimum (sq ft)',help:'Owner-set square feet covered by the installed area-repair minimum. Only square feet above this area use the extra-square-foot price.',tree:{depth:2,allowEmpty:true,emptyHelp:'No entries. Add only the repair types you price with this setting.'}}
};

export function repairSelection(type,c){
  return type==='SIDING_REPAIR'?[c.sidingType,c.damageLevel]:[type==='ROOFING_REPAIR'?c.roofType:c.membraneType,c.repairType];
}
export function repairUnitConfig(type,c,p){
  if(!REPAIR_SERVICES.includes(type))return null;
  const [material,repair]=repairSelection(type,c),suffix=material+'.'+repair;
  const rate=p.repairUnitPrice?.[material]?.[repair],minimum=p.repairAreaMinimum?.[material]?.[repair];
  if(!hasSurfacePrice(rate)&&!hasSurfacePrice(minimum))return null;
  return {suffix,unit:p.repairPricingUnit?.[material]?.[repair],rate,minimum,firstArea:p.repairFirstAreaSqft?.[material]?.[repair]};
}
export function repairRatePaths(type,c,p){
  const row=repairUnitConfig(type,c,p);
  return row?(row.unit==='square_feet'?['repairAreaMinimum.'+row.suffix,'repairUnitPrice.'+row.suffix]:['repairUnitPrice.'+row.suffix]):[];
}
export function repairUnitRows(p){
  const rows=new Map();
  for(const root of ['repairUnitPrice','repairAreaMinimum'])for(const [material,repairs] of Object.entries(record(p[root])?p[root]:{}))for(const [repair,price] of Object.entries(record(repairs)?repairs:{}))if(hasSurfacePrice(price))rows.set(material+'.'+repair,{material,repair});
  return [...rows.values()];
}
export function flatRepairContract(type,base,p){
  if(type==='FLAT_ROOF_REPLACEMENT'){
    const fields={...base.fields,buildingType:{...base.fields.buildingType,evidenceOnly:true}};
    for(const item of FLAT_ROOF_ITEMS)fields[item.field]={label:item.label,unit:item.unit,type:'number',min:0,max:item.max,integer:Boolean(item.integer),details:['Your best estimate is fine. Enter 0 if none is needed.'],evidenceOnly:!hasSurfacePrice(p[item.rate])};
    return {...base,fields};
  }
  if(!REPAIR_SERVICES.includes(type))return base;
  const materialField=type==='ROOFING_REPAIR'?'roofType':type==='FLAT_ROOF_REPAIR'?'membraneType':'sidingType',repairField=type==='SIDING_REPAIR'?'damageLevel':'repairType';
  const when=unit=>repairUnitRows(p).filter(({material,repair})=>p.repairPricingUnit?.[material]?.[repair]===unit).map(({material,repair})=>[[materialField,'eq',material],[repairField,'eq',repair]]);
  const fields={...base.fields,
    repairAreaMethod:{label:'Affected area measurement',type:'enum',values:['area','dimensions'],optionLabels:{area:'Square feet',dimensions:'Length and width'},details:['Use the affected area or its length and width. Your best estimate is fine.']},
    affectedArea:{...base.fields.affectedArea,visibleWhen:[[['repairAreaMethod','eq','area']],[['repairAreaMethod','absent',true]]]},
    repairLengthFt:{label:'Affected area length',type:'number',unit:'feet',min:0.01,max:1_000_000,visibleWhen:[[['repairAreaMethod','eq','dimensions']]]},
    repairWidthFt:{label:'Affected area width',type:'number',unit:'feet',min:0.01,max:1_000_000,visibleWhen:[[['repairAreaMethod','eq','dimensions']]]}
  };
  for(const [name,label,unit,pricingUnit,integer] of [['repairLengthLF','Repair length','linear feet','linear_feet',false],['repairItemCount','Repair item count','each','each',true]]){
    const visibleWhen=when(pricingUnit);
    fields[name]={label,unit,type:'number',min:integer?1:0.01,max:1_000_000,integer,visibleWhen,evidenceOnly:!visibleWhen.length,details:['Use your best estimate; the business will confirm it on site.']};
  }
  return {...base,fields,required(c,pricing){const unit=repairUnitConfig(type,c,p)?.unit;return [...base.required(c,pricing),...(c.repairAreaMethod==='dimensions'?['repairLengthFt','repairWidthFt']:[]),...(unit==='linear_feet'?['repairLengthLF']:unit==='each'?['repairItemCount']:[])];}};
}

export function repairUnitRequirements(type,c,p){
  const row=repairUnitConfig(type,c,p);if(!row)return null;
  const out=[{path:'repairMinimum',label:'Minimum repair visit price',kind:'minimum'},
    {path:'largeRepairMaxSqft',label:'Largest affected area priced as a repair',kind:'positive_number'},
    {path:'repairPricingUnit.'+row.suffix,label:FLAT_REPAIR_COPY.repairPricingUnit.label,kind:'enum',values:['square_feet','linear_feet','each']}];
  if(row.unit==='square_feet')out.push({path:'repairFirstAreaSqft.'+row.suffix,label:FLAT_REPAIR_COPY.repairFirstAreaSqft.label,kind:'positive_number'});
  for(const path of repairRatePaths(type,c,p))out.push({path,label:path.startsWith('repairAreaMinimum.')?FLAT_REPAIR_COPY.repairAreaMinimum.label:FLAT_REPAIR_COPY.repairUnitPrice.label,kind:'unit_price'},{path:'installedLaborPercent.'+path,label:'Labor portion (%)',kind:'percentage'});
  return out;
}

export function flatRepairPricingDiagnostics(type,p){
  const out=[],bad=(path,message)=>out.push({type:'invalid',kind:'structure',path,message});
  if(type==='FLAT_ROOF_REPLACEMENT'){
    for(const i of FLAT_ROOF_ITEMS)if(hasSurfacePrice(p[i.rate])&&(!(typeof p[i.rate]==='number'&&Number.isFinite(p[i.rate])&&p[i.rate]>=0&&p[i.rate]<=Number.MAX_SAFE_INTEGER)||i.integer&&!Number.isSafeInteger(p[i.rate])))bad(i.rate,'Enter a non-negative price; per-item and per-sheet prices use whole-cent precision.');
    if(hasSurfacePrice(p.flatRoofDeckPriceBasis)&&!['material_only','installed'].includes(p.flatRoofDeckPriceBasis))bad('flatRoofDeckPriceBasis','Choose material only or installed.');
  }
  if(REPAIR_SERVICES.includes(type))for(const root of REPAIR_UNIT_FIELDS){
    if(!hasSurfacePrice(p[root]))continue;
    if(!record(p[root])){bad(root,'Use a map of materials and repair types.');continue;}
    for(const [material,repairs] of Object.entries(p[root])){
      if(!/^[a-z][a-z0-9_]*$/.test(material)||!record(repairs)){bad(root+'.'+material,'Use a named material and a map of repair types.');continue;}
      for(const [repair,value] of Object.entries(repairs)){
        const path=root+'.'+material+'.'+repair;
        if(!/^[a-z][a-z0-9_]*$/.test(repair)){bad(path,'Use a named repair type.');continue;}
        if(!hasSurfacePrice(value))continue;
        if(root==='repairPricingUnit'){if(!['square_feet','linear_feet','each'].includes(value))bad(path,'Choose square feet, linear feet or each.');}
        else if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>Number.MAX_SAFE_INTEGER||root==='repairFirstAreaSqft'&&value<=0||(root==='repairAreaMinimum'||root==='repairUnitPrice'&&p.repairPricingUnit?.[material]?.[repair]==='each')&&!Number.isSafeInteger(value))bad(path,'Enter a valid non-negative price or positive first area; fixed prices use whole cents.');
      }
    }
  }
  for(const [path,share] of Object.entries(p.installedMaterialsPercent||{}))if((type==='FLAT_ROOF_REPLACEMENT'&&path==='flatRoofDeckPerSheet'&&p.flatRoofDeckPriceBasis==='installed'||REPAIR_SERVICES.includes(type)&&/^(repairUnitPrice|repairAreaMinimum)\./.test(path))&&typeof p.installedLaborPercent?.[path]==='number'&&share!==remainingMaterialsShare(p.installedLaborPercent[path]))bad('installedMaterialsPercent.'+path,'Materials must equal the percentage remaining after labor for this installed price.');
  return out;
}

export function repairUnitLines(type,c,p){
  const row=repairUnitConfig(type,c,p);if(!row)return null;
  const name=(type==='SIDING_REPAIR'?c.damageLevel:c.repairType).replaceAll('_',' ');
  const line=(suffix,quantity,unit,root)=>({name:name+' '+suffix,category:'addon',priceBasis:'sell_price',quantity,unit,rateCents:root==='repairAreaMinimum'?row.minimum:row.rate,ratePath:root+'.'+row.suffix});
  if(row.unit==='square_feet')return [line('minimum',1,'first area','repairAreaMinimum'),...(exactCompare(c.affectedArea,row.firstArea)>0?[line('additional area',exactSubtract(c.affectedArea,row.firstArea),'square feet','repairUnitPrice')]:[])];
  return [line('repair',row.unit==='linear_feet'?c.repairLengthLF:c.repairItemCount,row.unit==='linear_feet'?'linear feet':'each','repairUnitPrice')];
}

export function repairScenarioCube(cube,p){
  const out=structuredClone(cube||{});
  for(const {material,repair} of repairUnitRows(p)){out[material]||={};out[material][repair]||={};}
  return out;
}
export function repairScenarioInputs(type,c,p){
  const unit=repairUnitConfig(type,c,p)?.unit;
  return {...c,...(unit==='linear_feet'?{repairLengthLF:1_000_000}:unit==='each'?{repairItemCount:1_000_000}:{})};
}

export function normalizeRepairArea(type,c){
  if(!REPAIR_SERVICES.includes(type)||c.repairAreaMethod!=='dimensions')return c;
  if(![c.repairLengthFt,c.repairWidthFt].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>0))return c;
  const area=exactMultiply(c.repairLengthFt,c.repairWidthFt);
  if(c.affectedArea!==undefined&&exactCompare(area,c.affectedArea)!==0)throw new TypeError('Affected area must agree with its length and width.');
  return {...c,affectedArea:exactToNumber(area)};
}

export const remainingMaterialsShare=labor=>exactToNumber(exactSubtract(100,labor));
