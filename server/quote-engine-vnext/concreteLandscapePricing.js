import {exactAdd,exactCompare,exactDecimal,exactDivide,exactMultiply,exactSqrtCeil,exactSqrtRound,exactSubtract,exactToNumber} from './exactMath.js';

export const present = value => value !== undefined && value !== null && value !== '';
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const PLACEMENT_METHODS = ['pump','conveyor','power_buggy','wheelbarrow'];
export const PLACEMENT_LABELS = {pump:'Pump',conveyor:'Conveyor',power_buggy:'Power buggy',wheelbarrow:'Wheelbarrow'};
export const STOCK_LABELS = {container:'Container',balled_and_burlapped:'Balled and burlapped',bare_root:'Bare root'};
export const CONCRETE_MONEY_FIELDS = ['shortLoadPerYard','shortLoadFlatFee','sawCutPerLF','baseGravelPerCubicYard','baseExcavationGradingPerSqft','formingLaborPerLF','isolationJointPerLF'];
export const SOD_MONEY_FIELDS = ['sodRemovalPerSqft','sodGradingPerSqft','topsoilPerCubicYard'];
// The contractor specifies new-slab thickness, reinforcement and base. When the
// owner sets them, the customer is not asked and the owner's specification is
// always used: a stale or replayed customer answer never changes the slab.
// Blank keeps asking the customer.
export const CONCRETE_SPEC_FIELDS = ['defaultSlabThicknessInches','defaultReinforcement','newSlabBase'];
export const CONCRETE_SPEC_INPUTS = {defaultSlabThicknessInches:'thickness',defaultReinforcement:'reinforcement',newSlabBase:'baseNeeded'};
export function concreteSpecInputs(c,p){
  const out={...c};
  if(present(p.defaultSlabThicknessInches))out.thickness=p.defaultSlabThicknessInches;
  if(present(p.defaultReinforcement))out.reinforcement=p.defaultReinforcement;
  if(present(p.newSlabBase))out.baseNeeded=p.newSlabBase==='included';
  return out;
}
export const CONCRETE_FIELDS = [...CONCRETE_MONEY_FIELDS,'shortLoadThresholdCubicYards','controlJointPricing','controlJointSpacingFt','slabLaborMinThicknessInches','slabLaborMaxThicknessInches','placementFlat','placementPerCubicYard','defaultPlacementMethod','uncertainPlacementMethod','baseDepthInches','baseCompactionAllowance','formingLaborPricing','isolationJointPricing','concreteMixDescription',...CONCRETE_SPEC_FIELDS];
// Decisions every concrete price book states before it quotes. They show with
// the required prices, not the optional ones.
export const CONCRETE_REQUIRED_DECISIONS = ['slabLaborMinThicknessInches','slabLaborMaxThicknessInches','formingLaborPricing','isolationJointPricing'];
export const SOD_FIELDS = [...SOD_MONEY_FIELDS,'topsoilTargetDepthInches','topsoilTypicalImportDepthInches'];
export const FIELD_COPY = {
  shortLoadThresholdCubicYards:{label:'Supplier short-load threshold (cubic yards)',help:'Orders below this quantity incur your chosen short-load fee, after the ready-mix order increment. Enter either a per-yard-short fee or a flat fee.'},
  shortLoadPerYard:{label:'Short-load fee ($ per cubic yard short)',help:'Supplier charge for each cubic yard below the threshold. Leave the flat fee blank. Blank adds no per-yard short-load charge.'},
  shortLoadFlatFee:{label:'Short-load flat fee ($ per pour)',help:'Supplier charge once when the ordered quantity is below the threshold. Leave the per-yard-short fee blank. Blank adds no flat short-load charge.'},
  formingLaborPricing:{label:'Forming labor',help:'Setting, staking and stripping forms is driven by the length of open slab edge, not the area. Choose per linear foot to charge it on the measured open edges, or included if your square-foot labor already covers it.',type:'select',options:['per_linear_foot','included_in_slab_labor'],optionLabels:{per_linear_foot:'Priced per linear foot of form',included_in_slab_labor:'Included in my square-foot slab labor'}},
  formingLaborPerLF:{label:'Forming labor ($ per linear foot of form)',help:'Labor to set, stake and strip forms on each linear foot of open slab edge, using the slab access adjustment. Edges against a foundation or existing concrete are not formed.'},
  isolationJointPricing:{label:'Isolation joints where a slab meets a foundation or existing concrete',help:'NRMCA separates a new slab from walls, foundations and existing slabs with an isolation joint. Choose per linear foot to charge it on the adjoining edges, or included if your other prices cover it.',type:'select',options:['per_linear_foot','included'],optionLabels:{per_linear_foot:'Priced per linear foot',included:'Included in my other prices'}},
  isolationJointPerLF:{label:'Isolation joint ($ per linear foot)',help:'Joint filler and installation for each linear foot of edge against a foundation or existing concrete.'},
  concreteMixDescription:{label:'Concrete mix you pour',help:'Optional. For example 32 MPa air-entrained, or 4,000 psi with 5 to 7 percent air. It is shown on the quote.'},
  controlJointPricing:{label:'Control joints in slab labor',help:'State whether your slab labor includes saw-cut control joints. A separate saw-cut price applies only when you choose Excluded.',type:'select',options:['included','excluded'],optionLabels:{included:'Included',excluded:'Excluded'}},
  controlJointSpacingFt:{label:'Control-joint spacing (feet)',help:'Maximum spacing used to lay out saw cuts, with panels no longer than 1.5 times their width. Rectangles use their stated length and width. A measured outline is split into rectangles at each inside corner, with a joint from each inside corner. A slab given only as area and perimeter uses a square of the same area. Joint length is an allowance confirmed on site.'},
  sawCutPerLF:{label:'Saw-cut control joints ($ per linear foot)',help:'Optional separate labor price when control joints are excluded from slab labor, using the slab labor access adjustment. Blank adds no saw-cut line; the quote states that control joints are extra.'},
  slabLaborMinThicknessInches:{label:'Slab labor minimum thickness (inches)',help:'Thinnest slab covered by your slab labor price. Set both ends of the range; a request outside it goes to you for review instead of quoting.'},
  slabLaborMaxThicknessInches:{label:'Slab labor maximum thickness (inches)',help:'Thickest slab covered by your slab labor price. Thicker slabs take more labor per square foot, so a request above this goes to you for review.'},
  placementFlat:{label:'Placement flat charge ($ per pour)',help:'Optional charge for each offered placement method. Add a per-yard charge if both apply. Blank methods are not offered. Uses your Additional work category settings; no slab-access multiplier is added.',type:'json',tree:{depth:1,rootKeys:PLACEMENT_METHODS,keyLabel:'Placement method',leafLabels:PLACEMENT_LABELS,allowEmpty:true}},
  placementPerCubicYard:{label:'Placement charge ($ per cubic yard ordered)',help:'Optional charge on ready-mix quantity after waste and the order increment. Added to any flat charge for the selected method using your Additional work category settings.',type:'json',tree:{depth:1,rootKeys:PLACEMENT_METHODS,keyLabel:'Placement method',leafLabels:PLACEMENT_LABELS,allowEmpty:true}},
  defaultPlacementMethod:{label:'Placement when the chute cannot reach',help:'Choose an offered method for No. With one priced method it is selected automatically; with several and no default the customer chooses.',type:'select',options:PLACEMENT_METHODS,optionLabels:PLACEMENT_LABELS},
  uncertainPlacementMethod:{label:'Placement allowance for Not sure',help:'Optional offered method to price when chute access is uncertain. Blank quotes without placement and states that placement other than the chute is extra.',type:'select',options:PLACEMENT_METHODS,optionLabels:PLACEMENT_LABELS},
  defaultSlabThicknessInches:{label:'New slab thickness (inches)',help:'The thickness you pour for this service, for example 4 for a patio or walk and 5 to 6 for a driveway. When set, customers are not asked. Blank asks the customer.'},
  defaultReinforcement:{label:'New slab reinforcement',help:'The reinforcement you use for this service. When set, customers are not asked. Blank asks the customer.',type:'select',options:['none','wire_mesh','rebar'],optionLabels:{none:'None',wire_mesh:'Wire mesh',rebar:'Rebar'}},
  newSlabBase:{label:'Compacted gravel base on new slabs',help:'Whether every new slab gets your base preparation. When set, customers are not asked. Blank asks the customer.',type:'select',options:['included','not_included'],optionLabels:{included:'Included on every new slab',not_included:'Not included'}},
  baseDepthInches:{label:'Compacted base depth (inches)',help:'Owner-set base depth for this service or price option, stated in quotes using separate base pricing.'},
  baseCompactionAllowance:{ownerInputUnit:'percent',label:'Base gravel compaction allowance (%)',help:'Additional gravel for compaction, as a percent; enter 20 for 20%. Gravel quantity is slab area times base depth divided by 324, then multiplied by one plus this allowance.'},
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
// A blank chute answer is not a yes: it is priced and disclosed as Not sure.
export const chuteAccessUncertain=c=>c.chuteAccess!=='yes'&&c.chuteAccess!=='no';
export function placementFor(c,p){
  if(chuteAccessUncertain(c))return p.uncertainPlacementMethod;
  if(c.chuteAccess!=='no')return undefined;
  const offered=offeredPlacement(p);
  return c.placementMethod||p.defaultPlacementMethod||(offered.length===1?offered[0]:undefined);
}
export const customPlantSizes = p => record(p.plantSizes)&&Object.keys(p.plantSizes).length>0;
export const plantSizeKeys = p => customPlantSizes(p)?Object.keys(p.plantSizes):['small','medium','large'];
export const plantSizeLabel = (p,key) => customPlantSizes(p)?p.plantSizes[key]?.name:key[0].toUpperCase()+key.slice(1);
// NRMCA CIP 6: maximum joint spacing 24 to 36 times slab thickness, never over
// 15 ft. Warn only past the top of that range (36 x thickness = 3 ft per inch).
export const jointSpacingCap = thickness => Math.min(3*thickness,15);
function ceiling(value){const r=exactDecimal(value);return Number((r.numerator+r.denominator-1n)/r.denominator);}
// NRMCA CIP 6: panels square or nearly so (no longer than 1.5 x their width),
// with sides within the joint spacing. Each count is set directly from the
// rule, so the layout never steps one panel at a time.
export function rectangleJointLayout(length,width,spacing){
  let a=Math.max(1,ceiling(exactDivide(length,spacing))),b=Math.max(1,ceiling(exactDivide(width,spacing)));
  for(let round=0;round<20;round++){
    const nextA=Math.max(a,ceiling(exactDivide(exactMultiply(2,length,b),exactMultiply(3,width))));
    const nextB=Math.max(b,ceiling(exactDivide(exactMultiply(2,width,nextA),exactMultiply(3,length))));
    if(nextA===a&&nextB===b)return {panelsAlongLength:a,panelsAlongWidth:b,joints:exactAdd(exactMultiply(a-1,width),exactMultiply(b-1,length))};
    a=nextA;b=nextB;
  }
  throw new RangeError('The joint layout did not settle.');
}
// An orthogonal outline is cut into rectangles along lines from its inside
// corners; each of those cuts is a joint (NRMCA CIP 6: joints run through
// re-entrant corners). Each rectangle is then laid out with the rectangle rule.
function outlineStrips(points){
  const ys=[...new Set(points.map(p=>p.y))].sort((a,b)=>a-b);
  const verticals=[];
  for(let i=0;i+1<points.length;i++){const a=points[i],b=points[i+1];if(a.x===b.x)verticals.push({x:a.x,y0:Math.min(a.y,b.y),y1:Math.max(a.y,b.y)});}
  const rectangles=[];let open=new Map(),previous=[],cuts=exactDecimal(0);
  for(let k=0;k+1<ys.length;k++){
    const y0=ys[k],y1=ys[k+1],xs=verticals.filter(v=>v.y0<=y0&&v.y1>=y1).map(v=>v.x).sort((a,b)=>a-b);
    const intervals=[];for(let i=0;i+1<xs.length;i+=2)intervals.push([xs[i],xs[i+1]]);
    const next=new Map();
    for(const [x0,x1] of intervals){
      const key=x0+':'+x1,continuing=open.get(key);
      if(continuing){continuing.y1=y1;next.set(key,continuing);}
      else{const rectangle={x0,x1,y0,y1};rectangles.push(rectangle);next.set(key,rectangle);}
    }
    for(const [px0,px1] of previous)for(const [x0,x1] of intervals){
      if(px0===x0&&px1===x1)continue;
      const lo=Math.max(px0,x0),hi=Math.min(px1,x1);
      if(lo<hi)cuts=exactAdd(cuts,exactSubtract(hi,lo));
    }
    open=next;previous=intervals;
  }
  return {rectangles,cuts};
}
function outlineJointLayout(points,spacing){
  const layouts=[points,points.map(p=>({x:p.y,y:p.x}))].map(pts=>{
    const {rectangles,cuts}=outlineStrips(pts);
    let quantity=cuts,narrow=false;
    const panels=rectangles.map(r=>{
      const length=exactSubtract(r.x1,r.x0),width=exactSubtract(r.y1,r.y0);
      if(exactCompare(length,1)<0||exactCompare(width,1)<0)narrow=true;
      const layout=rectangleJointLayout(length,width,spacing);
      quantity=exactAdd(quantity,layout.joints);
      return {length:exactToNumber(length),width:exactToNumber(width),panelsAlongLength:layout.panelsAlongLength,panelsAlongWidth:layout.panelsAlongWidth};
    });
    return {quantity,cornerJoints:cuts,panels,narrow,rectangleCount:rectangles.length};
  });
  return exactCompare(layouts[1].quantity,layouts[0].quantity)<0?layouts[1]:layouts[0];
}
// The narrowest side of the slab as measured: a slab under 1 ft wide is not a
// slab this service prices; it needs an on-site look.
export function concreteNarrowestSideFt(c){
  if(c.dimensionMethod==='exact'&&Number.isFinite(c.length)&&Number.isFinite(c.width))return Math.min(c.length,c.width);
  // An outline's narrowest part, not its bounding box: across every band
  // between vertex heights, the width of each run of slab, in both directions.
  // An L with 0.5 ft legs is 0.5 ft wide although its box is 8 x 8.
  if(c.dimensionMethod==='measured_outline'&&Array.isArray(c.outlinePoints)&&c.outlinePoints.length){
    const widths=[c.outlinePoints,c.outlinePoints.map(p=>({x:p.y,y:p.x}))].flatMap(points=>{
      const ys=[...new Set(points.map(p=>p.y))].sort((a,b)=>a-b),verticals=[];
      for(let i=0;i+1<points.length;i++){const a=points[i],b=points[i+1];if(a.x===b.x&&a.y!==b.y)verticals.push({x:a.x,y0:Math.min(a.y,b.y),y1:Math.max(a.y,b.y)});}
      const out=[];
      for(let k=0;k+1<ys.length;k++){
        const xs=verticals.filter(v=>v.y0<=ys[k]&&v.y1>=ys[k+1]).map(v=>v.x).sort((a,b)=>a-b);
        for(let i=0;i+1<xs.length;i+=2)out.push(xs[i+1]-xs[i]);
      }
      return out;
    });
    return widths.length?Math.min(...widths):undefined;
  }
  if(c.dimensionMethod==='measured_area_perimeter'&&Number.isFinite(c.areaSqft)&&Number.isFinite(c.perimeterLF)){
    const half=c.perimeterLF/2,disc=half*half-4*c.areaSqft;
    return disc<0?undefined:(half-Math.sqrt(disc))/2;
  }
  return undefined;
}
export const NARROW_SLAB_MESSAGE='A slab narrower than 1 foot needs an on-site check before it can be priced.';
export function controlJointLength(c,area,spacing){
  if(c.dimensionMethod==='exact'){
    const layout=rectangleJointLayout(c.length,c.width,spacing);
    return {quantity:layout.joints,length:c.length,width:c.width,rectangle:true,panelsAlongLength:layout.panelsAlongLength,panelsAlongWidth:layout.panelsAlongWidth};
  }
  if(c.dimensionMethod==='measured_outline'&&Array.isArray(c.outlinePoints)&&c.outlinePoints.length){
    const layout=outlineJointLayout(c.outlinePoints,spacing);
    if(layout.rectangleCount===1){const panel=layout.panels[0];return {quantity:layout.quantity,length:panel.length,width:panel.width,rectangle:true,panelsAlongLength:panel.panelsAlongLength,panelsAlongWidth:panel.panelsAlongWidth,narrow:layout.narrow};}
    return {quantity:layout.quantity,rectangle:false,outline:true,cornerJoints:layout.cornerJoints,panels:layout.panels,narrow:layout.narrow};
  }
  // Area and perimeter alone carry no shape: an allowance from a square of
  // the same area, confirmed on site. Decide spans from exact area / spacing^2.
  const side=Math.sqrt(exactToNumber(area));
  const cuts=Math.max(0,exactSqrtCeil(exactDivide(area,exactMultiply(spacing,spacing)))-1);
  // 2 * cuts * sqrt(area), rounded once to 0.01 LF, without rounding the side.
  const quantity=exactDivide(exactSqrtRound(exactMultiply(area,200,200,cuts,cuts)),100);
  return {quantity,length:side,width:side,rectangle:false};
}
export function topsoilQuantity(c,p){
  const unknown=c.usableTopsoilDepthInches==='unknown';
  const difference=unknown?p.topsoilTypicalImportDepthInches:exactSubtract(p.topsoilTargetDepthInches,c.usableTopsoilDepthInches);
  const depth=exactCompare(difference,0)>0?difference:0;
  // Imported topsoil settles, so the order adds the owner's overage (blank on
  // older services adds none).
  const overage=typeof p.topsoilWasteFactor==='number'?p.topsoilWasteFactor:0;
  return {unknown,depth,overage,quantity:exactMultiply(exactDivide(exactMultiply(c.sodSqft,depth),324),exactAdd(1,overage))};
}
export function concreteLandscapeNotices(type,p={}){
  if(typeof type!=='string'||!type.startsWith('CONCRETE_'))return [];
  const notices=[];
  if(!present(p.controlJointPricing))notices.push('State whether saw-cut control joints are included in the slab labor price.');
  const thickness=present(p.slabLaborMinThicknessInches)?p.slabLaborMinThicknessInches:4;
  if(p.controlJointPricing==='excluded'&&p.controlJointSpacingFt>jointSpacingCap(thickness))notices.push(`Control-joint spacing of ${p.controlJointSpacingFt} feet exceeds ${jointSpacingCap(thickness)} feet for a ${thickness}-inch slab. NRMCA recommends a maximum of 24 to 36 times the slab thickness (about 10 feet for a 4-inch slab) and never more than 15 feet. A quote for a slab too thin for this spacing (more than 36 times its thickness) goes to you for review.`);
  return notices;
}
export function concreteLandscapeDiagnostics(type,p={}){
  const out=[],bad=(path,message)=>out.push({type:'invalid',kind:'concrete_landscape_pricing',path,message});
  const numeric=(key,min,max=Number.MAX_SAFE_INTEGER,integer=false)=>{if(present(p[key])&&(typeof p[key]!=='number'||!Number.isFinite(p[key])||p[key]<min||p[key]>max||integer&&!Number.isSafeInteger(p[key])))bad(key,`${FIELD_COPY[key]?.label||key}: enter a ${integer?'whole-number ':''}value from ${min} to ${max}.`);};
  if(type.startsWith('CONCRETE_')){
    for(const key of CONCRETE_MONEY_FIELDS)numeric(key,0,Number.MAX_SAFE_INTEGER,key==='shortLoadFlatFee');
    numeric('shortLoadThresholdCubicYards',0.01,1_000_000);
    // NRMCA CIP 6: joint spacing never more than 15 ft.
    numeric('controlJointSpacingFt',0.01,15);
    for(const key of ['slabLaborMinThicknessInches','slabLaborMaxThicknessInches'])numeric(key,2,24);
    numeric('baseDepthInches',0.01,120);numeric('baseCompactionAllowance',0,5);
    numeric('defaultSlabThicknessInches',2,24);
    if(present(p.defaultSlabThicknessInches)&&present(p.slabLaborMinThicknessInches)&&present(p.slabLaborMaxThicknessInches)&&(p.defaultSlabThicknessInches<p.slabLaborMinThicknessInches||p.defaultSlabThicknessInches>p.slabLaborMaxThicknessInches))bad('defaultSlabThicknessInches','The new slab thickness must be inside the thickness range your slab labor covers.');
    if(present(p.defaultReinforcement)&&!['none','wire_mesh','rebar'].includes(p.defaultReinforcement))bad('defaultReinforcement','Choose none, wire mesh or rebar.');
    if(present(p.newSlabBase)&&!['included','not_included'].includes(p.newSlabBase))bad('newSlabBase','Choose whether the base is included on every new slab.');
    if(present(p.shortLoadPerYard)&&present(p.shortLoadFlatFee))bad('shortLoadFlatFee','Choose either a per-yard-short fee or a flat short-load fee, not both.');
    if(present(p.controlJointPricing)&&!['included','excluded'].includes(p.controlJointPricing))bad('controlJointPricing','Choose Included or Excluded for control joints.');
    if(present(p.formingLaborPricing)&&!['per_linear_foot','included_in_slab_labor'].includes(p.formingLaborPricing))bad('formingLaborPricing','Choose per linear foot or included in slab labor for forming labor.');
    if(present(p.isolationJointPricing)&&!['per_linear_foot','included'].includes(p.isolationJointPricing))bad('isolationJointPricing','Choose per linear foot or included for isolation joints.');
    if(present(p.concreteMixDescription)&&(typeof p.concreteMixDescription!=='string'||!p.concreteMixDescription.trim()||p.concreteMixDescription.length>120||/[<>\u0000-\u001f]/.test(p.concreteMixDescription)))bad('concreteMixDescription','Describe the mix in 120 characters or fewer.');
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
