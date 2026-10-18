import {exactAdd,exactCompare,exactDecimal,exactDivide,exactMultiply,exactRound,exactSubtract,exactToNumber} from './exactMath.js';

export const present = value => value !== undefined && value !== null && value !== '';
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const PLACEMENT_METHODS = ['pump','conveyor','power_buggy','wheelbarrow'];
export const PLACEMENT_LABELS = {pump:'Pump',conveyor:'Conveyor',power_buggy:'Power buggy',wheelbarrow:'Wheelbarrow'};
export const STOCK_LABELS = {container:'Container',balled_and_burlapped:'Balled and burlapped',bare_root:'Bare root'};
export const CONCRETE_MONEY_FIELDS = ['shortLoadPerYard','shortLoadFlatFee','sawCutPerLF','baseGravelPerCubicYard','baseExcavationGradingPerSqft'];
export const SOD_MONEY_FIELDS = ['sodRemovalPerSqft','sodGradingPerSqft','topsoilPerCubicYard'];
export const CONCRETE_FIELDS = [...CONCRETE_MONEY_FIELDS,'shortLoadThresholdCubicYards','controlJointPricing','controlJointSpacingFt','slabLaborMinThicknessInches','slabLaborMaxThicknessInches','placementFlat','placementPerCubicYard','defaultPlacementMethod','uncertainPlacementMethod','baseDepthInches','baseCompactionAllowance'];
export const SOD_FIELDS = [...SOD_MONEY_FIELDS,'topsoilTargetDepthInches','topsoilTypicalImportDepthInches'];
export const FIELD_COPY = {
  shortLoadThresholdCubicYards:{label:'Supplier short-load threshold (cubic yards)',help:'Orders below this quantity incur your chosen short-load fee, after the ready-mix order increment. Enter either a per-yard-short fee or a flat fee.'},
  shortLoadPerYard:{label:'Short-load fee ($ per cubic yard short)',help:'Supplier charge for each cubic yard below the threshold. Leave the flat fee blank. Blank adds no per-yard short-load charge.'},
  shortLoadFlatFee:{label:'Short-load flat fee ($ per pour)',help:'Supplier charge once when the ordered quantity is below the threshold. Leave the per-yard-short fee blank. Blank adds no flat short-load charge.'},
  controlJointPricing:{label:'Control joints in slab labor',help:'State whether your slab labor includes saw-cut control joints. A separate saw-cut price applies only when you choose Excluded.',type:'select',options:['included','excluded'],optionLabels:{included:'Included',excluded:'Excluded'}},
  controlJointSpacingFt:{label:'Control-joint spacing (feet)',help:'Maximum spacing used to lay out saw cuts. Rectangles use their stated dimensions; other slab shapes use a square of equal area, with joint length confirmed on site.'},
  sawCutPerLF:{label:'Saw-cut control joints ($ per linear foot)',help:'Optional separate labor price when control joints are excluded from slab labor, using the slab labor access adjustment. Blank adds no saw-cut line; the quote states that control joints are extra.'},
  slabLaborMinThicknessInches:{label:'Slab labor minimum thickness (inches)',help:'Set both ends of the thickness range covered by this service or price option. Requests outside the range go to review. Blank range keeps existing pricing.'},
  slabLaborMaxThicknessInches:{label:'Slab labor maximum thickness (inches)',help:'Thickest slab covered by this labor rate. Set the minimum too. Blank range keeps existing pricing.'},
  placementFlat:{label:'Placement flat charge ($ per pour)',help:'Optional charge for each offered placement method. Add a per-yard charge if both apply. Blank methods are not offered. Uses your Additional work category settings; no slab-access multiplier is added.',type:'json',tree:{depth:1,rootKeys:PLACEMENT_METHODS,keyLabel:'Placement method',leafLabels:PLACEMENT_LABELS,allowEmpty:true}},
  placementPerCubicYard:{label:'Placement charge ($ per cubic yard ordered)',help:'Optional charge on ready-mix quantity after waste and the order increment. Added to any flat charge for the selected method using your Additional work category settings.',type:'json',tree:{depth:1,rootKeys:PLACEMENT_METHODS,keyLabel:'Placement method',leafLabels:PLACEMENT_LABELS,allowEmpty:true}},
  defaultPlacementMethod:{label:'Placement when the chute cannot reach',help:'Choose an offered method for No. With one priced method it is selected automatically; with several and no default the customer chooses.',type:'select',options:PLACEMENT_METHODS,optionLabels:PLACEMENT_LABELS},
  uncertainPlacementMethod:{label:'Placement allowance for Not sure',help:'Optional offered method to price when chute access is uncertain. Blank quotes without placement and states that placement other than the chute is extra.',type:'select',options:PLACEMENT_METHODS,optionLabels:PLACEMENT_LABELS},
  baseDepthInches:{label:'Compacted base depth (inches)',help:'Owner-set base depth for this service or price option, stated in quotes using separate base pricing.'},
  baseCompactionAllowance:{label:'Base gravel compaction allowance',help:'Additional gravel fraction for compaction; enter 0.20 for 20%. Gravel quantity is slab area times base depth divided by 324, then multiplied by one plus this allowance.'},
  baseGravelPerCubicYard:{label:'Base gravel ($ per cubic yard)',help:'Optional gravel material price. Any separate base price replaces the old combined Base preparation line. Enter excavation and grading separately if offered.'},
  baseExcavationGradingPerSqft:{label:'Base excavation and grading labor ($ per square foot)',help:'Optional labor price with the same access adjustment as slab labor. Any separate base price replaces the old combined Base preparation line; gravel is charged only when separately priced.'},
  sodRemovalPerSqft:{label:'Old-lawn removal with disposal ($ per square foot)',help:'Optional preparation labor including removal, loading and disposal of the old lawn. Uses sod slope and access adjustments. Any separate preparation price replaces the old combined Ground preparation line.'},
  sodGradingPerSqft:{label:'Sod grading labor ($ per square foot)',help:'Optional grading labor using sod slope and access adjustments. In separate preparation pricing, removal and topsoil are included only when separately priced.'},
  topsoilPerCubicYard:{label:'Imported topsoil ($ per cubic yard)',help:'Optional material price for only the depth missing from your target. When the customer is not sure, use your typical import depth as an allowance confirmed on site.'},
  topsoilTargetDepthInches:{label:'Target usable topsoil depth (inches)',help:'Total usable topsoil depth wanted before sod installation. Existing usable topsoil is deducted; no topsoil charge applies when the target is already met.'},
  topsoilTypicalImportDepthInches:{label:'Typical topsoil import depth (inches)',help:'Depth to import as an allowance when the customer does not know the usable topsoil depth. Set explicitly, including zero when appropriate.'},
  plantSizes:{label:'Owner-defined plant sizes',help:'Optional named shrub and tree sizes. Define shrubs by container number and trees by caliper or height, with stock type. Enter labor and material allowance for each size in the matching price rows. Blank retains Small, Medium and Large.',type:'scope_configuration'}
};
export const CUSTOMER_COPY = {
  chuteAccess:{label:'Can the concrete truck get its chute to the pour?',options:{yes:'Yes',no:'No',unknown:'Not sure'}},
  placementMethod:{label:'Which offered placement method is needed?'},
  usableTopsoilDepthInches:{label:'About how many inches of usable topsoil are already there?',help:'Your confirmed best estimate is accepted. Choose Not sure to use the business’s typical import allowance.'}
};
export const JOINT_SITE_NOTE = 'The control-joint length is an allowance based on a square of the same area and will be confirmed on site.';
export const JOINT_EXTRA_NOTE = 'Saw-cut control joints are not included in this price; the business will confirm their price on site.';
export const PLACEMENT_SITE_NOTE = 'Concrete placement is an allowance and will be confirmed on site.';
export const PLACEMENT_EXTRA_NOTE = 'Placement other than the truck chute would be extra and will be confirmed on site.';
export const TOPSOIL_SITE_NOTE = 'Imported topsoil is an allowance using the business’s typical import depth and will be confirmed on site.';
export const separateBase = p => ['baseGravelPerCubicYard','baseExcavationGradingPerSqft'].some(k=>present(p[k]));
export const separateSodPrep = p => SOD_MONEY_FIELDS.some(k=>present(p[k]));
export const offeredPlacement = p => PLACEMENT_METHODS.filter(k=>present(p.placementFlat?.[k])||present(p.placementPerCubicYard?.[k]));
export function placementFor(c,p){
  if(c.chuteAccess==='unknown')return p.uncertainPlacementMethod;
  if(c.chuteAccess!=='no')return undefined;
  const offered=offeredPlacement(p);
  return c.placementMethod||p.defaultPlacementMethod||(offered.length===1?offered[0]:undefined);
}
export const customPlantSizes = p => record(p.plantSizes)&&Object.keys(p.plantSizes).length>0;
export const plantSizeKeys = p => customPlantSizes(p)?Object.keys(p.plantSizes):['small','medium','large'];
export const plantSizeLabel = (p,key) => customPlantSizes(p)?p.plantSizes[key]?.name:key[0].toUpperCase()+key.slice(1);
export const jointSpacingCap = thickness => thickness<=5?10:thickness<6?12.5:15;
function ceiling(value){const r=exactDecimal(value);return Number((r.numerator+r.denominator-1n)/r.denominator);}
export function controlJointLength(c,area,spacing){
  const rectangle=c.dimensionMethod==='exact';
  const length=rectangle?c.length:Math.sqrt(exactToNumber(area)),width=rectangle?c.width:length;
  const joints=exactAdd(exactMultiply(Math.max(0,ceiling(exactDivide(length,spacing))-1),width),exactMultiply(Math.max(0,ceiling(exactDivide(width,spacing))-1),length));
  return {quantity:rectangle?joints:exactDivide(exactRound(exactMultiply(joints,100)),100),length,width,rectangle};
}
export function topsoilQuantity(c,p){
  const unknown=c.usableTopsoilDepthInches==='unknown';
  const difference=unknown?p.topsoilTypicalImportDepthInches:exactSubtract(p.topsoilTargetDepthInches,c.usableTopsoilDepthInches);
  const depth=exactCompare(difference,0)>0?difference:0;
  return {unknown,depth,quantity:exactDivide(exactMultiply(c.sodSqft,depth),324)};
}
export function concreteLandscapeNotices(type,p={}){
  if(typeof type!=='string'||!type.startsWith('CONCRETE_'))return [];
  const notices=[];
  if(!present(p.slabLaborMinThicknessInches)&&!present(p.slabLaborMaxThicknessInches))notices.push('Set the thickness range covered by this slab labor rate. Until then, the existing 2–24 inch input range remains available.');
  if(!present(p.controlJointPricing))notices.push('State whether saw-cut control joints are included in the slab labor price.');
  const thickness=present(p.slabLaborMinThicknessInches)?p.slabLaborMinThicknessInches:4;
  if(p.controlJointPricing==='excluded'&&p.controlJointSpacingFt>jointSpacingCap(thickness))notices.push(`Control-joint spacing of ${p.controlJointSpacingFt} feet exceeds the configured spacing limit of ${jointSpacingCap(thickness)} feet for a ${thickness}-inch slab. Check the spacing for every thickness this rate covers.`);
  return notices;
}
export function concreteLandscapeDiagnostics(type,p={}){
  const out=[],bad=(path,message)=>out.push({type:'invalid',kind:'concrete_landscape_pricing',path,message});
  const numeric=(key,min,max=Number.MAX_SAFE_INTEGER,integer=false)=>{if(present(p[key])&&(typeof p[key]!=='number'||!Number.isFinite(p[key])||p[key]<min||p[key]>max||integer&&!Number.isSafeInteger(p[key])))bad(key,`${FIELD_COPY[key]?.label||key}: enter a ${integer?'whole-number ':''}value from ${min} to ${max}.`);};
  if(type.startsWith('CONCRETE_')){
    for(const key of CONCRETE_MONEY_FIELDS)numeric(key,0,Number.MAX_SAFE_INTEGER,key==='shortLoadFlatFee');
    for(const key of ['shortLoadThresholdCubicYards','controlJointSpacingFt'])numeric(key,0.01,1_000_000);
    for(const key of ['slabLaborMinThicknessInches','slabLaborMaxThicknessInches'])numeric(key,2,24);
    numeric('baseDepthInches',0.01,120);numeric('baseCompactionAllowance',0,5);
    if(present(p.shortLoadPerYard)&&present(p.shortLoadFlatFee))bad('shortLoadFlatFee','Choose either a per-yard-short fee or a flat short-load fee, not both.');
    if(present(p.controlJointPricing)&&!['included','excluded'].includes(p.controlJointPricing))bad('controlJointPricing','Choose Included or Excluded for control joints.');
    const min=present(p.slabLaborMinThicknessInches),max=present(p.slabLaborMaxThicknessInches);
    if(min!==max||min&&p.slabLaborMinThicknessInches>p.slabLaborMaxThicknessInches)bad('slabLaborMinThicknessInches','Set both slab labor thickness limits, with the minimum no greater than the maximum.');
    for(const field of ['placementFlat','placementPerCubicYard'])if(present(p[field])){
      if(!record(p[field])){bad(field,'Enter prices by offered placement method.');continue;}
      for(const [key,value] of Object.entries(p[field]))if(!PLACEMENT_METHODS.includes(key)||typeof value!=='number'||!Number.isFinite(value)||value<0||value>Number.MAX_SAFE_INTEGER||field==='placementFlat'&&!Number.isSafeInteger(value))bad(field+'.'+key,'Enter a non-negative price for pump, conveyor, power buggy or wheelbarrow; flat charges require whole cents.');
    }
    for(const key of ['defaultPlacementMethod','uncertainPlacementMethod'])if(present(p[key])&&!offeredPlacement(p).includes(p[key]))bad(key,'Choose a placement method with a saved flat or per-yard price.');
  }
  if(type==='LANDSCAPING_SOD'){
    for(const key of SOD_MONEY_FIELDS)numeric(key,0);
    for(const key of ['topsoilTargetDepthInches','topsoilTypicalImportDepthInches'])numeric(key,0,120);
  }
  if(type==='LANDSCAPING_PLANTING'&&present(p.plantSizes)){
    if(!record(p.plantSizes)||Object.keys(p.plantSizes).length>32){bad('plantSizes','Define at most 32 named plant sizes.');return out;}
    const names=new Set();
    for(const [key,row] of Object.entries(p.plantSizes)){
      const path='plantSizes.'+key;
      if(!/^[a-z][a-z0-9_]{0,99}$/.test(key)||['constructor','prototype','__proto__'].includes(key)||!record(row)){bad(path,'Use a distinct plant-size key and definition.');continue;}
      if(Object.keys(row).some(k=>!['name','plantType','stockType','containerNumber','caliperInches','heightFt'].includes(k)))bad(path,'Plant sizes support only name, plant type, stock type, container number, caliper and height.');
      if(typeof row.name!=='string'||!row.name.trim()||row.name.length>160||/[\u0000-\u001f\u007f<>]/.test(row.name))bad(path+'.name','Give the customer a plain plant-size name of 1–160 characters.');
      else {const name=row.name.trim().toLowerCase();if(names.has(name))bad(path+'.name','Use a different customer name for every plant size.');names.add(name);}
      if(!Object.hasOwn(STOCK_LABELS,row.stockType))bad(path+'.stockType','Choose Container, Balled and burlapped, or Bare root.');
      const positive=v=>typeof v==='number'&&Number.isFinite(v)&&v>0&&v<=1000;
      if(row.plantType==='shrub'){
        if(!positive(row.containerNumber)||!Number.isInteger(row.containerNumber)||present(row.caliperInches)||present(row.heightFt))bad(path,'Define a shrub by its whole container number only.');
      }else if(row.plantType==='tree'){
        if(present(row.containerNumber)||present(row.caliperInches)===present(row.heightFt)||!positive(row.caliperInches??row.heightFt))bad(path,'Define a tree by either caliper in inches or height in feet.');
      }else bad(path+'.plantType','Choose Shrub or Tree.');
    }
  }
  return out;
}
