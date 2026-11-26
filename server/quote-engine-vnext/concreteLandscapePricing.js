import {exactAdd,exactCompare,exactDecimal,exactDivide,exactMultiply,exactSqrtCeil,exactSqrtRound,exactSubtract,exactToNumber} from './exactMath.js';

export const present = value => value !== undefined && value !== null && value !== '';
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const PLACEMENT_METHODS = ['pump','conveyor','power_buggy','wheelbarrow'];
export const PLACEMENT_LABELS = {pump:'Pump',conveyor:'Conveyor',power_buggy:'Power buggy',wheelbarrow:'Wheelbarrow'};
export const STOCK_LABELS = {container:'Container',balled_and_burlapped:'Balled and burlapped',bare_root:'Bare root'};
export const CONCRETE_MONEY_FIELDS = ['shortLoadPerYard','shortLoadFlatFee','sawCutPerLF','baseGravelPerCubicYard','baseExcavationGradingPerSqft','formingLaborPerLF','isolationJointPerLF','winterConcreteChargePerUnit'];
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
export const CONCRETE_FIELDS = [...CONCRETE_MONEY_FIELDS,'readyMixUnit','shortLoadBands','winterConcreteStart','winterConcreteEnd','thickenedEdgeExtraDepthInches','thickenedEdgeWidthInches','basePrepLaborPercent','shortLoadThresholdCubicYards','controlJointPricing','controlJointSpacingFt','slabLaborMinThicknessInches','slabLaborMaxThicknessInches','placementFlat','placementPerCubicYard','defaultPlacementMethod','uncertainPlacementMethod','baseDepthInches','baseCompactionAllowance','baseGravelOrderIncrementCubicYards','formingLaborPricing','isolationJointPricing','concreteMixDescription','wireMeshDescription','rebarDescription',...CONCRETE_SPEC_FIELDS];
// Owner text that states what the slab price includes. Shown on the quote.
export const CONCRETE_TEXT_FIELDS = ['concreteMixDescription','wireMeshDescription','rebarDescription'];
// Decisions every concrete price book states before it quotes. They show with
// the required prices, not the optional ones.
export const CONCRETE_REQUIRED_DECISIONS = ['slabLaborMinThicknessInches','slabLaborMaxThicknessInches','formingLaborPricing','isolationJointPricing','concreteMixDescription'];
export const SOD_FIELDS = [...SOD_MONEY_FIELDS,'groundPrepLaborPercent','topsoilTargetDepthInches','topsoilTypicalImportDepthInches','topsoilOrderIncrementCubicYards'];
export const FIELD_COPY = {
  readyMixUnit:{label:'Ready-mix unit',help:'The unit your ready-mix price, order increment, short-load threshold, short-load fees and order-size bands, winter concrete charge, and placement charge by volume are entered in. New Canadian services start in cubic metres. If Canadian prices were saved without a unit, confirm the unit they were entered in to keep those numbers. Changing a known unit clears amounts entered in it.',type:'select',options:['cubic_yard','cubic_metre'],optionLabels:{cubic_yard:'Cubic yards',cubic_metre:'Cubic metres'}},
  shortLoadThresholdCubicYards:{label:'Supplier short-load threshold (cubic yards)',help:'Orders below this quantity incur your chosen flat or per-unit short-load fee, after the ready-mix order increment. Enter either a per-unit-short fee or a flat fee. Order-size bands use their own limits instead.'},
  shortLoadPerYard:{label:'Short-load fee ($ per cubic yard short)',help:'Supplier charge for each cubic yard below the threshold. Leave the flat fee and the order-size bands blank. Blank adds no per-unit short-load charge.'},
  shortLoadFlatFee:{label:'Short-load flat fee ($ per job)',help:'Supplier charge once when the ordered quantity is below the threshold. Leave the per-unit-short fee and the order-size bands blank. Blank adds no flat short-load charge.'},
  shortLoadBands:{label:'Short-load charges by order size',help:'Optional stepped supplier charges, for example one charge for orders up to 2 cubic metres and another up to 4. An order up to and including a band\'s limit (and over the band below it) pays that band\'s charge once; an order larger than every band pays none. Use bands instead of the flat or per-unit short-load fee.',type:'json',tree:{depth:2,keyLabel:'Order-size band',leafKeys:['upToQuantity','charge'],leafLabels:{upToQuantity:'Orders up to (cubic yards)',charge:'Charge ($ per job)'},leafMoneyKinds:{charge:'fixed_amount'},positiveLeafKeys:['upToQuantity'],allowEmpty:true,emptyHelp:'No order-size bands entered. Add a band for each supplier short-load step, for example small_loads.'}},
  thickenedEdgeExtraDepthInches:{label:'Thickened edge extra depth (inches)',help:'How much deeper than the slab your standard thickened edge is, for example 4. Set the edge width too. Ready-mix is added for a band of this width around the slab perimeter: (perimeter × edge width − 4 × edge width²) × extra depth, then waste and the order increment apply to the total. Blank means no thickened edge.'},
  thickenedEdgeWidthInches:{label:'Thickened edge width (inches)',help:'How far in from the slab edge your standard thickened edge runs, for example 12. Set the extra depth too. Blank means no thickened edge.'},
  winterConcreteChargePerUnit:{label:'Winter concrete charge ($ per cubic yard)',help:'Optional charge on the ordered ready-mix, for example your supplier\'s winter heat charge, for pours between the start and end dates below. It applies when the month the customer wants the work done falls in that period, even in part. When the customer is not sure of the month, it is included and the quote says so. If you also charge a busy-season rate and none of your busy months fall in that period, a customer who is not sure gets the busy-season price without the winter charge, and the quote says the charge is added for a winter pour. Blank adds no winter charge.'},
  winterConcreteStart:{label:'Winter concrete charge start date',help:'First day the winter concrete charge applies, for example November 1.',type:'text',maxLength:5,monthDay:true,format:'MM-DD, the month and day as two digits each, for example 11-01 for November 1'},
  winterConcreteEnd:{label:'Winter concrete charge end date',help:'Last day the winter concrete charge applies, for example April 15. The period may run over the new year.',type:'text',maxLength:5,monthDay:true,format:'MM-DD, the month and day as two digits each, for example 04-15 for April 15'},
  basePrepLaborPercent:{label:'Labor share of the combined base preparation price (%)',help:'The part of your Base preparation price that is labor, from 0 to 100. The slab access multiplier applies to that part: at 60% and a 1.25 access multiplier, $1.75 per square foot becomes $1.75 × (1 + 0.60 × 0.25) = $2.0125. Until it is set, a job that needs an access adjustment and uses the combined price goes to you for review.'},
  formingLaborPricing:{label:'Forming labor',help:'Setting, staking and stripping forms is driven by the length of open slab edge, not the area. Choose per linear foot to charge it on the measured open edges, or included if your square-foot labor already covers it.',type:'select',options:['per_linear_foot','included_in_slab_labor'],optionLabels:{per_linear_foot:'Priced per linear foot of form',included_in_slab_labor:'Included in my square-foot slab labor'}},
  formingLaborPerLF:{label:'Forming labor ($ per linear foot of form)',help:'Labor to set, stake and strip forms on each linear foot of open slab edge, using the slab access adjustment. Edges against a foundation or existing concrete are not formed.'},
  isolationJointPricing:{label:'Isolation joints where a slab meets a foundation or existing concrete',help:'NRMCA separates a new slab from walls, foundations and existing slabs with an isolation joint. Choose per linear foot to charge it on the adjoining edges, or included if your other prices cover it.',type:'select',options:['per_linear_foot','included'],optionLabels:{per_linear_foot:'Priced per linear foot',included:'Included in my other prices'}},
  isolationJointPerLF:{label:'Isolation joint ($ per linear foot)',help:'Joint filler and installation for each linear foot of edge against a foundation or existing concrete.'},
  concreteMixDescription:{label:'Concrete mix you pour',help:'The ready-mix your concrete price is for, with its strength and air content, for example 32 MPa air-entrained, or 4,000 psi with 5 to 7 percent air. It is shown on the quote. Quotes go to you for review until it is set.',type:'text',maxLength:120},
  wireMeshDescription:{label:'Wire mesh you install',help:'The mesh your wire mesh price is for, with its size and how it is supported, for example 6x6 W2.9/W2.9 welded wire on chairs. It is shown on the quote. Quotes with wire mesh go to you for review until it is set.',type:'text',maxLength:120},
  rebarDescription:{label:'Rebar you install',help:'The bar size and spacing your rebar price is for, for example #3 bars (US) or 10M bars (Canada) at 18 inches each way on chairs. It is shown on the quote. Quotes with rebar go to you for review until it is set.',type:'text',maxLength:120},
  controlJointPricing:{label:'Control joints in slab labor',help:'State whether your slab labor includes saw-cut control joints. A separate saw-cut price applies only when you choose Excluded.',type:'select',options:['included','excluded'],optionLabels:{included:'Included',excluded:'Excluded'}},
  controlJointSpacingFt:{label:'Control-joint spacing (feet)',help:'Maximum spacing used to lay out saw cuts, with panels no longer than 1.5 times their width. Rectangles use their stated length and width. A measured outline is split into rectangles at each inside corner, with a joint from each inside corner. A slab given only as area and perimeter uses the rectangle with that area and perimeter, or a square of the same area when no rectangle has them. Joint length is an allowance confirmed on site.'},
  sawCutPerLF:{label:'Saw-cut control joints ($ per linear foot)',help:'Optional separate labor price when control joints are excluded from slab labor, using the slab labor access adjustment. Blank adds no saw-cut line; the quote states that control joints are extra.'},
  slabLaborMinThicknessInches:{label:'Slab labor minimum thickness (inches)',help:'Thinnest slab covered by your slab labor price. Set both ends of the range; a request outside it goes to you for review instead of quoting.'},
  slabLaborMaxThicknessInches:{label:'Slab labor maximum thickness (inches)',help:'Thickest slab covered by your slab labor price. Thicker slabs take more labor per square foot, so a request above this goes to you for review.'},
  placementFlat:{label:'Placement flat charge ($ per job)',help:'Optional charge for each offered placement method. Add a per-yard charge if both apply. Blank methods are not offered. Uses your Additional work category settings; no slab-access multiplier is added.',type:'json',tree:{depth:1,rootKeys:PLACEMENT_METHODS,keyLabel:'Placement method',leafLabels:PLACEMENT_LABELS,allowEmpty:true}},
  placementPerCubicYard:{label:'Placement charge ($ per cubic yard ordered)',help:'Optional charge on ready-mix quantity after waste and the order increment. Added to any flat charge for the selected method using your Additional work category settings.',type:'json',tree:{depth:1,rootKeys:PLACEMENT_METHODS,keyLabel:'Placement method',leafLabels:PLACEMENT_LABELS,allowEmpty:true}},
  defaultPlacementMethod:{label:'Placement when the chute cannot reach',help:'Choose an offered method for No. With one priced method it is selected automatically; with several and no default the customer chooses.',type:'select',options:PLACEMENT_METHODS,optionLabels:PLACEMENT_LABELS},
  uncertainPlacementMethod:{label:'Placement allowance for Not sure',help:'Optional offered method to price when chute access is uncertain. Blank quotes without placement and states that placement other than the chute is extra.',type:'select',options:PLACEMENT_METHODS,optionLabels:PLACEMENT_LABELS},
  defaultSlabThicknessInches:{label:'New slab thickness (inches)',help:'The thickness you pour for this service, for example 4 for a patio or walk and 5 to 6 for a driveway. When set, customers are not asked. Blank asks the customer.'},
  defaultReinforcement:{label:'New slab reinforcement',help:'The reinforcement you use for this service. When set, customers are not asked. Blank asks the customer.',type:'select',options:['none','wire_mesh','rebar'],optionLabels:{none:'None',wire_mesh:'Wire mesh',rebar:'Rebar'}},
  newSlabBase:{label:'Compacted gravel base on new slabs',help:'Whether every new slab gets your base preparation. When set, customers are not asked. Blank asks the customer.',type:'select',options:['included','not_included'],optionLabels:{included:'Included on every new slab',not_included:'Not included'}},
  baseDepthInches:{label:'Compacted base depth (inches)',help:'Owner-set base depth for this service or price option, stated in quotes using separate base pricing.'},
  baseCompactionAllowance:{ownerInputUnit:'percent',label:'Base gravel compaction allowance (%)',help:'Additional gravel for compaction, as a percent; enter 20 for 20%. Gravel quantity is slab area times base depth divided by 324, then multiplied by one plus this allowance.'},
  baseGravelOrderIncrementCubicYards:{label:'Base gravel order increment (cubic yards)',help:'The smallest amount your supplier delivers, for example 1 for whole yards or 0.5 for half yards. Base gravel is priced on the calculated amount, compaction allowance included, rounded up to this increment. Blank prices the exact calculated amount.'},
  baseGravelPerCubicYard:{label:'Base gravel ($ per cubic yard)',help:'Optional gravel material price. Any separate base price replaces the old combined Base preparation line. Enter excavation and grading separately if offered.'},
  baseExcavationGradingPerSqft:{label:'Base excavation and grading labor ($ per square foot)',help:'Optional labor price with the same access adjustment as slab labor. Any separate base price replaces the old combined Base preparation line; gravel is charged only when separately priced.'},
  sodRemovalPerSqft:{label:'Old-lawn removal with disposal ($ per square foot)',help:'Optional preparation labor including removal, loading and disposal of the old lawn. Uses sod slope and access adjustments. With a combined Ground preparation price, existing lawns keep that package until old-lawn removal and grading each have their own price.'},
  sodGradingPerSqft:{label:'Sod grading labor ($ per square foot)',help:'Optional grading labor using sod slope and access adjustments. Bare ground with no lawn to remove is graded at this price; with only the combined price, a bare-ground request goes to you for review until this price is set. With a combined Ground preparation price, existing lawns keep that package until old-lawn removal and grading each have their own price. Bare ground uses this grading price.'},
  groundPrepLaborPercent:{label:'Labor share of the combined Ground preparation price (%)',help:'The part of your Ground preparation price that is labor, from 0 to 100. The sod slope and access multipliers apply to that part: at 60%, a steep 1.35 and a difficult 1.25, $0.50 per square foot becomes $0.50 × (1 + 0.60 × (1.35 × 1.25 − 1)) = $0.70625. Until it is set, a job that needs a slope or access adjustment and uses the combined price goes to you for review.'},
  topsoilPerCubicYard:{label:'Imported topsoil ($ per cubic yard)',help:'Optional material price for only the depth missing from your target. When the customer is not sure, use your typical import depth as an allowance confirmed on site. Charged on its own line whenever ground preparation is requested, in addition to a combined Ground preparation price.'},
  topsoilTargetDepthInches:{label:'Target usable topsoil depth (inches)',help:'Total usable topsoil depth wanted before sod installation. Existing usable topsoil is deducted; no topsoil charge applies when the target is already met.'},
  topsoilOrderIncrementCubicYards:{label:'Topsoil order increment (cubic yards)',help:'The smallest amount your supplier delivers, for example 1 for whole yards or 0.5 for half yards. Imported topsoil is priced on the calculated amount rounded up to this increment. Blank prices the exact calculated amount.'},
  topsoilTypicalImportDepthInches:{label:'Typical topsoil import depth (inches)',help:'Depth to import as an allowance when the customer does not know the usable topsoil depth. Set explicitly, including zero when appropriate.'},
  plantSizes:{label:'Owner-defined plant sizes',help:'Optional named shrub and tree sizes. Define shrubs by container number and trees by caliper or height, with stock type. Enter labor and material allowance for each size in the matching price rows. Blank retains Small, Medium and Large.',type:'scope_configuration'}
};
export const CUSTOMER_COPY = {
  existingLawnToRemove:{label:'Is there an existing lawn to remove?'},
  chuteAccess:{label:'Can the concrete truck get its chute to the pour?',options:{yes:'Yes',no:'No',unknown:'Not sure'}},
  placementMethod:{label:'Which offered placement method is needed?'},
  usableTopsoilDepthInches:{label:'About how many inches of usable topsoil are already there?',help:'Your confirmed best estimate is accepted. Choose Not sure to use the business’s typical import allowance.'}
};
export const JOINT_SITE_NOTE = 'The control-joint length is an allowance based on a square of the same area and will be confirmed on site.';
export const JOINT_RECTANGLE_SITE_NOTE = 'The control-joint length is an allowance based on a rectangle with the same area and perimeter and will be confirmed on site.';
export const JOINT_EXTRA_NOTE = 'Saw-cut control joints are not included in this price; the business will confirm their price on site.';
export const PLACEMENT_SITE_NOTE = 'Concrete placement is an allowance and will be confirmed on site.';
export const PLACEMENT_EXTRA_NOTE = "This price assumes the concrete truck's chute can reach the pour. Pumping or other placement is not included and would be priced on site.";
export const TOPSOIL_SITE_NOTE = 'Imported topsoil is an allowance using the business’s typical import depth and will be confirmed on site.';
export const separateBase = p => ['baseGravelPerCubicYard','baseExcavationGradingPerSqft'].some(k=>present(p[k]));
// An existing lawn keeps the combined package until removal and grading, the
// work that package covers, both have their own prices. Imported topsoil with
// its own price is a separate line either way, so adding a price never drops scope.
export function separateSodPrep(p, existingLawnToRemove) {
  if (existingLawnToRemove !== false && present(p.groundPrepPerSqft) &&
      !(present(p.sodRemovalPerSqft) && present(p.sodGradingPerSqft))) return false;
  return SOD_MONEY_FIELDS.some(key => present(p[key]));
}
export const offeredPlacement = p => PLACEMENT_METHODS.filter(k=>present(p.placementFlat?.[k])||present(p.placementPerCubicYard?.[k]));
// A blank chute answer is not a yes: it is priced and disclosed as Not sure.
export const chuteAccessUncertain=c=>c.chuteAccess!=='yes'&&c.chuteAccess!=='no';
export function placementFor(c,p){
  if(chuteAccessUncertain(c))return p.uncertainPlacementMethod;
  if(c.chuteAccess!=='no')return undefined;
  const offered=offeredPlacement(p);
  return c.placementMethod||p.defaultPlacementMethod||(offered.length===1?offered[0]:undefined);
}
// Ready-mix unit. The ready-mix price, order increment, short-load threshold,
// per-unit short-load fee, order-size bands and winter charge are in the
// owner's unit; blank is cubic metres for a business in Canada, else cubic
// yards. Volumes are worked out in cubic yards from feet and inches and stated
// in the owner's unit exactly: 1 cubic yard = 0.9144^3 = 0.764554857984 m^3.
export const READY_MIX_UNITS=['cubic_yard','cubic_metre'];
export const READY_MIX_UNIT_FIELDS=['concreteCostPerCubicYard','readyMixOrderIncrementCubicYards','shortLoadThresholdCubicYards','shortLoadPerYard','shortLoadBands','winterConcreteChargePerUnit','placementPerCubicYard'];
export const CUBIC_METRES_PER_CUBIC_YARD=0.764554857984;
export function readyMixUnitOf(p={},businessCountry,tiers=[]) {
  if (READY_MIX_UNITS.includes(p.readyMixUnit)) return p.readyMixUnit;
  if (businessCountry !== 'CA') return 'cubic_yard';
  // Before the unit selector existed, every saved rate was per cubic yard.
  // Later Canadian drafts could also have a blank unit while showing metres.
  const hasUnitValues=prices=>READY_MIX_UNIT_FIELDS.some(key=>present(prices?.[key]));
  return hasUnitValues(p) || tiers.some(tier=>hasUnitValues(tier?.overrides)) ? null : 'cubic_metre';
}
export const readyMixUnitWords=unit=>unit===null?{one:'supplier unit',many:'supplier units'}:unit==='cubic_metre'?{one:'cubic metre',many:'cubic metres'}:{one:'cubic yard',many:'cubic yards'};
export const cubicYardsInUnit=(yards,unit)=>unit==='cubic_metre'?exactMultiply(yards,CUBIC_METRES_PER_CUBIC_YARD):exactDecimal(yards);
// The owner's labels follow the unit the values are entered in.
export function readyMixUnitPresentationCopy(definition,serviceType,pricing={},businessCountry){
  if(typeof serviceType!=='string'||!serviceType.startsWith('CONCRETE_')||!READY_MIX_UNIT_FIELDS.includes(definition?.field))return definition;
  const {one,many}=readyMixUnitWords(readyMixUnitOf(pricing,businessCountry));
  const text=value=>typeof value==='string'?value.replace(/cubic yards/g,many).replace(/cubic yard/g,one):value;
  return {...definition,label:text(definition.label),...(definition.title?{title:text(definition.title)}:{}),help:text(definition.help),...(definition.unit?{unit:text(definition.unit)}:{}),...(definition.tree?.leafLabels?{tree:{...definition.tree,leafLabels:Object.fromEntries(Object.entries(definition.tree.leafLabels).map(([key,value])=>[key,text(value)]))}}:{})};
}
// Thickened edges: a band of the owner's width around the perimeter, deeper by
// the owner's extra depth. For a rectangle, or a slab known only by its area
// and perimeter, the area is perimeter * w - 4 * w^2; a band as wide as half
// the narrowest side covers the whole slab. A measured outline gets its band
// along its own edges (outlineEdgeBandSqft): only the parts of it no wider than
// two band widths are thickened through (November 22, 2026).
const finitePositive=value=>typeof value==='number'&&Number.isFinite(value)&&value>0;
export const thickenedEdgeSet=p=>finitePositive(p.thickenedEdgeExtraDepthInches)&&finitePositive(p.thickenedEdgeWidthInches);
export function thickenedEdgeAreaSqft(c,areaSqft,perimeterLF,p){
  const w=exactDivide(p.thickenedEdgeWidthInches,12);
  const outline=c.dimensionMethod==='measured_outline'&&Array.isArray(c.outlinePoints)&&c.outlinePoints.length;
  const adjoiningLF=c.adjoinsExistingConcrete===true&&typeof c.adjoiningEdgeLF==='number'&&c.adjoiningEdgeLF>0?c.adjoiningEdgeLF:0;
  // Edges against a foundation or existing concrete get an isolation joint,
  // not a thickened turn-down. The caller gives their total length; the run
  // of connected slab edges with that length is taken as the adjoining edges
  // (one wall, an L-corner, three sides), and the band is the slab within the
  // edge width of the other, free edges. With several such runs the largest
  // band is ordered (Neon v49 NEW-5).
  if(adjoiningLF){
    const points=outline?c.outlinePoints:c.dimensionMethod==='exact'&&Number.isFinite(c.length)&&Number.isFinite(c.width)?[{x:0,y:0},{x:c.length,y:0},{x:c.length,y:c.width},{x:0,y:c.width},{x:0,y:0}]:null;
    const runs=points?adjoiningEdgeRuns(points,adjoiningLF):[];
    if(runs.length){
      const band=runs.map(run=>outlineEdgeBandSqft(points,w,run)).reduce((a,b)=>exactCompare(b,a)>0?b:a);
      return exactCompare(band,areaSqft)>0?exactDecimal(areaSqft):band;
    }
    // A length that is no run of whole edges: the free length times the
    // width, less two free corners, from the outline's full band.
    if(outline){
      const band=exactAdd(exactSubtract(outlineEdgeBandSqft(c.outlinePoints,w),exactMultiply(adjoiningLF,w)),exactMultiply(2,w,w));
      return exactCompare(band,0)<=0?exactDecimal(0):exactCompare(band,areaSqft)>0?exactDecimal(areaSqft):band;
    }
  }
  if(outline)return outlineEdgeBandSqft(c.outlinePoints,w);
  const narrowest=concreteNarrowestSideFt(c);
  // A narrow slab is thickened through only when every edge is free; against
  // a wall it takes the free-edge band below (Neon audit of v50, V50-4).
  if(!adjoiningLF&&narrowest!==undefined&&exactCompare(exactMultiply(2,w),narrowest)>=0)return exactDecimal(areaSqft);
  // Free edges only, two corners where free edges meet (Neon audit of v48
  // #10); used when the adjoining length is no run of whole edges.
  const adjoining=adjoiningLF;
  const band=adjoining?exactSubtract(exactMultiply(exactSubtract(perimeterLF,adjoining),w),exactMultiply(2,w,w)):exactSubtract(exactMultiply(perimeterLF,w),exactMultiply(4,w,w));
  return exactCompare(band,0)<=0?exactDecimal(0):exactCompare(band,areaSqft)>0?exactDecimal(areaSqft):band;
}
// The slab within w of its edges: the outline minus the points whose square of
// half-width w lies inside it (the slab shrunk by w on every side). Both
// outlines are made of lines at the vertex coordinates and those coordinates
// plus or minus w, so a grid on those lines splits the slab into cells that are
// each wholly in the band or wholly out of it; the band is the sum of its cells.
// Each cell is tested at its centre: inside the outline (ray count over the
// vertical edges) and, if inside, whether any edge passes within w of it. A
// part of the slab no wider than 2w has no points left once shrunk, so it is
// thickened through; a wider part is thickened only along its edges.
// Each run of connected edges of a closed outline whose lengths add up to
// lengthLF exactly, as a set of edge indexes (edge i runs from point i to i+1).
export function adjoiningEdgeRuns(points,lengthLF){
  // Exact edge lengths: 20.4 - 10.1 in floating point is 10.299999999999999
  // (Neon audit of v50, V50-4).
  const length=(a,b)=>{const d=exactSubtract(b,a);return exactCompare(d,0)<0?exactSubtract(0,d):d;};
  const edges=[];for(let i=0;i+1<points.length;i++)edges.push(exactAdd(length(points[i].x,points[i+1].x),length(points[i].y,points[i+1].y)));
  const n=edges.length,runs=[];
  // A run may be every edge: a slab bounded on all sides has no free edge.
  for(let start=0;start<n;start++){
    let sum=exactDecimal(0);
    for(let count=1;count<=n;count++){
      sum=exactAdd(sum,edges[(start+count-1)%n]);
      const order=exactCompare(sum,lengthLF);
      if(order===0)runs.push(new Set(Array.from({length:count},(_,k)=>(start+k)%n)));
      if(order>=0)break;
    }
  }
  return runs;
}
export function outlineEdgeBandSqft(points,w,fixedEdges=new Set()){
  const key=v=>{const x=exactDecimal(v);return x.numerator+'/'+x.denominator;};
  const lines=values=>{const seen=new Map();for(const v of values)seen.set(key(v),exactDecimal(v));return [...seen.values()].sort(exactCompare);};
  const verticals=[],horizontals=[];
  for(let i=0;i+1<points.length;i++){
    const a=points[i],b=points[i+1];
    const free=!fixedEdges.has(i);
    if(a.x===b.x)verticals.push({x:exactDecimal(a.x),lo:exactDecimal(Math.min(a.y,b.y)),hi:exactDecimal(Math.max(a.y,b.y)),free});
    else horizontals.push({y:exactDecimal(a.y),lo:exactDecimal(Math.min(a.x,b.x)),hi:exactDecimal(Math.max(a.x,b.x)),free});
  }
  const xs=lines(points.flatMap(q=>[q.x,exactAdd(q.x,w),exactSubtract(q.x,w)])),ys=lines(points.flatMap(q=>[q.y,exactAdd(q.y,w),exactSubtract(q.y,w)]));
  const between=(v,lo,hi)=>exactCompare(v,lo)>0&&exactCompare(v,hi)<0;
  const overlaps=(lo,hi,a,b)=>exactCompare(lo,b)<0&&exactCompare(a,hi)<0;
  let band=exactDecimal(0);
  for(let j=0;j+1<ys.length;j++){
    const cy=exactDivide(exactAdd(ys[j],ys[j+1]),2),height=exactSubtract(ys[j+1],ys[j]);
    const low=exactSubtract(cy,w),high=exactAdd(cy,w);
    const crossing=verticals.filter(e=>between(cy,e.lo,e.hi));
    // Only free edges are thickened; every edge still bounds the slab.
    const nearVertical=verticals.filter(e=>e.free&&overlaps(e.lo,e.hi,low,high));
    const nearHorizontal=horizontals.filter(e=>e.free&&between(e.y,low,high));
    for(let i=0;i+1<xs.length;i++){
      const cx=exactDivide(exactAdd(xs[i],xs[i+1]),2);
      if(crossing.filter(e=>exactCompare(e.x,cx)>0).length%2===0)continue;
      const left=exactSubtract(cx,w),right=exactAdd(cx,w);
      const near=nearVertical.some(e=>between(e.x,left,right))||nearHorizontal.some(e=>overlaps(e.lo,e.hi,left,right));
      if(near)band=exactAdd(band,exactMultiply(exactSubtract(xs[i+1],xs[i]),height));
    }
  }
  return band;
}
// Order-size bands: an order up to and including a band's limit, and over the
// next smaller limit, pays that band's charge once; larger orders pay none.
export const shortLoadBandsSet=p=>record(p.shortLoadBands)&&Object.keys(p.shortLoadBands).length>0;
export function shortLoadBandFor(p,quantity){
  const bands=Object.entries(p.shortLoadBands).map(([key,band])=>({key,...band})).sort((a,b)=>exactCompare(a.upToQuantity,b.upToQuantity));
  return bands.find(band=>exactCompare(quantity,band.upToQuantity)<=0)||null;
}
// Winter concrete charge period, by month and day ("MM-DD"), possibly over the
// new year. A work month applies when any of its days falls in the period.
const MONTH_NAMES=['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTH_DAYS=[31,29,31,30,31,30,31,31,30,31,30,31];
export function parseMonthDay(value){
  const match=typeof value==='string'?/^(\d{2})-(\d{2})$/.exec(value):null;
  if(!match)return null;
  const month=Number(match[1]),day=Number(match[2]);
  return month>=1&&month<=12&&day>=1&&day<=MONTH_DAYS[month-1]?{month,day}:null;
}
export const monthDayText=value=>{const d=parseMonthDay(value);return d?MONTH_NAMES[d.month-1]+' '+d.day:'';};
export const winterChargeSet=p=>present(p.winterConcreteChargePerUnit)&&p.winterConcreteChargePerUnit>0;
export function winterMonthApplies(p,month){
  const start=parseMonthDay(p.winterConcreteStart),end=parseMonthDay(p.winterConcreteEnd);
  const key=d=>d.month*100+d.day,inside=d=>key(start)<=key(end)?key(d)>=key(start)&&key(d)<=key(end):key(d)>=key(start)||key(d)<=key(end);
  for(let day=1;day<=MONTH_DAYS[month-1];day++)if(inside({month,day}))return true;
  return false;
}
// A concrete service with a winter charge in its base prices or any price
// option asks the work month.
export function winterChargeConfigured(raw,p={}){
  if(typeof raw?.serviceType!=='string'||!raw.serviceType.startsWith('CONCRETE_'))return false;
  return winterChargeSet(p)||(Array.isArray(raw.tiers)&&raw.tiers.some(tier=>record(tier?.overrides)&&winterChargeSet({...p,...tier.overrides})));
}
export const WINTER_WORK_MONTH_DETAIL='The winter concrete charge follows the month the concrete is poured. If you are not sure, it is included.';
// With a busy season as well, a customer who is not sure gets the busy-season
// price, and the winter charge only when a busy month is in the winter period.
export const WINTER_WORK_MONTH_DETAIL_WITH_BUSY_SEASON='The winter concrete charge follows the month the concrete is poured. If you are not sure, the quote says whether it is included.';
// A combined preparation price adjusted for slope or access needs its labor
// share; the factor is the one its itemized labor uses. Returns the factor and
// the share setting.
// A factor that is not a finite number is left to the factor's own owner diagnostic.
const finiteFactor=value=>typeof value==='number'&&Number.isFinite(value)?value:undefined;
export function combinedPrepLabor(type,c,p){
  if(type.startsWith('CONCRETE_'))return {field:'basePrepLaborPercent',factor:finiteFactor(p.accessMultiplier?.[c.accessDifficulty])};
  if(type==='LANDSCAPING_SOD'){const slope=finiteFactor(p.slopeMultiplier?.[c.slope]),access=finiteFactor(p.accessMultiplier?.[c.accessDifficulty]);return {field:'groundPrepLaborPercent',factor:slope!==undefined&&access!==undefined?exactMultiply(slope,access):undefined};}
  return null;
}
export function combinedPrepUsed(type,c,p){
  if(type.startsWith('CONCRETE_'))return c.baseNeeded===true&&!separateBase(p)&&present(p.basePrepPerSqft);
  if(type==='LANDSCAPING_SOD')return c.groundPrepNeeded===true&&c.existingLawnToRemove!==false&&!separateSodPrep(p)&&present(p.groundPrepPerSqft);
  return false;
}
export const laborShareSet=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=100;
// The share setting a request is missing, or null.
export function combinedPrepLaborGap(type,c,p){
  if(typeof type!=='string'||!combinedPrepUsed(type,c,p))return null;
  const {field,factor}=combinedPrepLabor(type,c,p);
  return factor!==undefined&&exactCompare(factor,1)!==0&&!laborShareSet(p[field])?field:null;
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
// The rectangle with a given area and perimeter: length + width = perimeter / 2
// and length * width = area, so the sides are (h +/- sqrt(h^2 - 4 * area)) / 2
// with h = perimeter / 2. None exists when h^2 < 4 * area (a circle, say).
// A side is r + k * sqrt(d) for rationals r, k; every comparison is exact.
function bigSqrtFloor(n){if(n<2n)return n;let x=1n<<BigInt(Math.ceil(n.toString(2).length/2));for(;;){const y=(x+n/x)/2n;if(y>=x)return x;x=y;}}
function rationalSqrt(value){
  const v=exactDecimal(value),n=bigSqrtFloor(v.numerator),d=bigSqrtFloor(v.denominator);
  return n*n===v.numerator&&d*d===v.denominator?exactDivide({numerator:n,denominator:1n},{numerator:d,denominator:1n}):null;
}
function surdSign(x,d){
  const sr=exactCompare(x.r,0),sk=exactCompare(x.k,0);
  if(sk===0||exactCompare(d,0)===0)return sr;
  if(sr===0||sr===sk)return sk;
  const c=exactCompare(exactMultiply(x.r,x.r),exactMultiply(x.k,x.k,d));
  return c===0?0:c>0?sr:sk;
}
const surdApprox=(x,d)=>exactToNumber(x.r)+exactToNumber(x.k)*Math.sqrt(exactToNumber(d));
const surdScale=(x,m)=>({r:exactMultiply(x.r,m),k:exactMultiply(x.k,m)});
// Smallest whole n >= 1 with n * y >= x (y > 0).
function surdCeilDiv(x,y,d){
  const ok=n=>surdSign({r:exactSubtract(exactMultiply(n,y.r),x.r),k:exactSubtract(exactMultiply(n,y.k),x.k)},d)>=0;
  let n=Math.max(1,Math.ceil(surdApprox(x,d)/surdApprox(y,d)));
  while(n>1&&ok(n-1))n--;
  while(!ok(n))n++;
  return n;
}
// Nearest whole number, halves up.
function surdRound(x,d){
  const ok=m=>surdSign({r:exactSubtract(exactAdd(x.r,0.5),m),k:x.k},d)>=0;
  let m=Math.max(0,Math.floor(surdApprox(x,d)+0.5));
  while(m>0&&!ok(m))m--;
  while(ok(m+1))m++;
  return m;
}
export function solvedRectangle(area,perimeter){
  const h=exactDivide(perimeter,2),d=exactSubtract(exactMultiply(h,h),exactMultiply(4,area));
  if(exactCompare(d,0)<0)return null;
  const root=rationalSqrt(d);
  if(root!==null)return {d,length:exactDivide(exactAdd(h,root),2),width:exactDivide(exactSubtract(h,root),2)};
  return {d,surd:true,length:{r:exactDivide(h,2),k:exactDecimal(0.5)},width:{r:exactDivide(h,2),k:exactDecimal(-0.5)}};
}
// The rectangle rule (rectangleJointLayout) on sides that are not rational:
// the same panel counts, decided exactly; the joint length rounded once to 0.01 LF.
function surdRectangleJointLayout(L,W,d,spacing){
  const S={r:exactDecimal(spacing),k:exactDecimal(0)};
  let a=surdCeilDiv(L,S,d),b=surdCeilDiv(W,S,d);
  for(let round=0;round<20;round++){
    const nextA=Math.max(a,surdCeilDiv(surdScale(L,2*b),surdScale(W,3),d));
    const nextB=Math.max(b,surdCeilDiv(surdScale(W,2*nextA),surdScale(L,3),d));
    if(nextA===a&&nextB===b){
      const joints={r:exactAdd(exactMultiply(a-1,W.r),exactMultiply(b-1,L.r)),k:exactAdd(exactMultiply(a-1,W.k),exactMultiply(b-1,L.k))};
      return {panelsAlongLength:a,panelsAlongWidth:b,joints:exactDivide(surdRound(surdScale(joints,100),d),100)};
    }
    a=nextA;b=nextB;
  }
  throw new RangeError('The joint layout did not settle.');
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
  // Area and perimeter: the rectangle with that area and perimeter, as an
  // allowance confirmed on site.
  if(c.dimensionMethod==='measured_area_perimeter'&&Number.isFinite(c.perimeterLF)){
    const rectangle=solvedRectangle(area,c.perimeterLF);
    if(rectangle&&!rectangle.surd){const layout=rectangleJointLayout(rectangle.length,rectangle.width,spacing);return {quantity:layout.joints,length:exactToNumber(rectangle.length),width:exactToNumber(rectangle.width),rectangle:false,solvedRectangle:true,panelsAlongLength:layout.panelsAlongLength,panelsAlongWidth:layout.panelsAlongWidth};}
    if(rectangle){const layout=surdRectangleJointLayout(rectangle.length,rectangle.width,rectangle.d,spacing);return {quantity:layout.joints,length:surdApprox(rectangle.length,rectangle.d),width:surdApprox(rectangle.width,rectangle.d),rectangle:false,solvedRectangle:true,rounded:true,panelsAlongLength:layout.panelsAlongLength,panelsAlongWidth:layout.panelsAlongWidth};}
  }
  // No rectangle has this area and perimeter: an allowance from a square of
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
  const required=exactMultiply(exactDivide(exactMultiply(c.sodSqft,depth),324),exactAdd(1,overage));
  // Bulk soil is delivered in the owner's order increment (for example whole or
  // half yards); with one set, the order rounds up to it. Blank prices the
  // exact quantity.
  const increment=typeof p.topsoilOrderIncrementCubicYards==='number'&&p.topsoilOrderIncrementCubicYards>0?p.topsoilOrderIncrementCubicYards:undefined;
  if(increment===undefined||exactCompare(required,0)<=0)return {unknown,depth,overage,requiredQuantity:required,quantity:required};
  const ratio=exactDecimal(exactDivide(required,increment)),orders=(ratio.numerator+ratio.denominator-1n)/ratio.denominator;
  return {unknown,depth,overage,increment,requiredQuantity:required,quantity:exactMultiply(Number(orders),increment)};
}
// Describe the pricing method that will actually apply to an existing lawn.
export function sodPreparationNotice(p={}){
  if (present(p.groundPrepPerSqft) && !separateSodPrep(p,true)) {
    const removal=present(p.sodRemovalPerSqft),grading=present(p.sodGradingPerSqft),topsoil=present(p.topsoilPerCubicYard);
    if (!removal && !grading && !topsoil) return null;
    return ['Existing lawns use your combined Ground preparation price'+(topsoil?', with imported topsoil charged on its own line.':'.'),
      removal?'Your old-lawn removal price is not used until grading also has its own price.':null,
      grading?(topsoil?'Bare ground uses your grading and topsoil prices.':'Bare ground uses your grading price; imported topsoil is extra.')
        :topsoil?'Bare ground uses your topsoil price; grading is left for the site visit until it has its own price.':null].filter(Boolean).join(' ');
  }
  if(!separateSodPrep(p))return null;
  const left=[['sodRemovalPerSqft','old-lawn removal'],['sodGradingPerSqft','grading'],['topsoilPerCubicYard','imported topsoil']].filter(([key])=>!present(p[key])).map(([,name])=>name);
  const list=left.length>1?left.slice(0,-1).join(', ')+' and '+left.at(-1):left[0];
  return [present(p.groundPrepPerSqft)?'Your combined Ground preparation price is not used while a separate preparation price is set.':null,
    left.length?`Quotes leave ${list} out and estimate ${left.length>1?'them':'it'} at the site visit until ${left.length>1?'each has':'it has'} a separate price.`:null].filter(Boolean).join(' ')||null;
}
export function concreteLandscapeNotices(type,p={}){
  if(type==='LANDSCAPING_SOD')return [sodPreparationNotice(p)].filter(Boolean);
  if(typeof type!=='string'||!type.startsWith('CONCRETE_'))return [];
  const notices=[];
  if(!present(p.controlJointPricing))notices.push('State whether saw-cut control joints are included in the slab labor price.');
  const thickness=present(p.slabLaborMinThicknessInches)?p.slabLaborMinThicknessInches:4;
  if(p.controlJointPricing==='excluded'&&p.controlJointSpacingFt>jointSpacingCap(thickness))notices.push(`Control-joint spacing of ${p.controlJointSpacingFt} feet exceeds ${jointSpacingCap(thickness)} feet for a ${thickness}-inch slab. NRMCA recommends a maximum of 24 to 36 times the slab thickness (about 10 feet for a 4-inch slab) and never more than 15 feet. A quote for a slab too thin for this spacing (more than 36 times its thickness) goes to you for review.`);
  return notices;
}
export const concreteTextValid=value=>typeof value==='string'&&value.trim()!==''&&value.length<=120&&!/[<>\u0000-\u001f]/.test(value);
export function concreteLandscapeDiagnostics(type,p={}){
  const out=[],bad=(path,message)=>out.push({type:'invalid',kind:'concrete_landscape_pricing',path,message});
  const numeric=(key,min,max=Number.MAX_SAFE_INTEGER,integer=false)=>{if(present(p[key])&&(typeof p[key]!=='number'||!Number.isFinite(p[key])||p[key]<min||p[key]>max||integer&&!Number.isSafeInteger(p[key])))bad(key,`${FIELD_COPY[key]?.label||key}: enter a ${integer?'whole-number ':''}value from ${min} to ${max}.`);};
  if(type.startsWith('CONCRETE_')){
    for(const key of CONCRETE_MONEY_FIELDS)numeric(key,0,Number.MAX_SAFE_INTEGER,key==='shortLoadFlatFee');
    numeric('shortLoadThresholdCubicYards',0.01,1_000_000);
    // NRMCA CIP 6: joint spacing never more than 15 ft.
    numeric('controlJointSpacingFt',0.01,15);
    for(const key of ['slabLaborMinThicknessInches','slabLaborMaxThicknessInches'])numeric(key,2,24);
    numeric('baseDepthInches',0.01,120);numeric('baseCompactionAllowance',0,5);numeric('baseGravelOrderIncrementCubicYards',0.01,1_000);
    numeric('defaultSlabThicknessInches',2,24);
    if(present(p.defaultSlabThicknessInches)&&present(p.slabLaborMinThicknessInches)&&present(p.slabLaborMaxThicknessInches)&&(p.defaultSlabThicknessInches<p.slabLaborMinThicknessInches||p.defaultSlabThicknessInches>p.slabLaborMaxThicknessInches))bad('defaultSlabThicknessInches','The new slab thickness must be inside the thickness range your slab labor covers.');
    if(present(p.defaultReinforcement)&&!['none','wire_mesh','rebar'].includes(p.defaultReinforcement))bad('defaultReinforcement','Choose none, wire mesh or rebar.');
    if(present(p.newSlabBase)&&!['included','not_included'].includes(p.newSlabBase))bad('newSlabBase','Choose whether the base is included on every new slab.');
    // The editor saves {} after the last band is deleted: no bands are set
    // (audit f1501ff #11, November 24, 2026). A non-record value is still a
    // set (invalid) value and is reported below.
    const bandsSet=shortLoadBandsSet(p)||(present(p.shortLoadBands)&&!record(p.shortLoadBands));
    if([present(p.shortLoadPerYard),present(p.shortLoadFlatFee),bandsSet].filter(Boolean).length>1)bad(present(p.shortLoadFlatFee)?'shortLoadFlatFee':'shortLoadBands','Choose one short-load charge: a flat fee, a fee per unit short, or order-size bands.');
    if(present(p.readyMixUnit)&&!READY_MIX_UNITS.includes(p.readyMixUnit))bad('readyMixUnit','Choose cubic yards or cubic metres.');
    if(present(p.shortLoadBands)){
      if(!record(p.shortLoadBands)||Object.keys(p.shortLoadBands).length>12)bad('shortLoadBands','Enter at most 12 order-size bands, each with a limit and a charge.');
      else{
        const limits=new Set();
        for(const [key,band] of Object.entries(p.shortLoadBands)){
          const path='shortLoadBands.'+key;
          if(!/^[a-z][a-z0-9_]{0,99}$/.test(key)||['constructor','prototype','__proto__'].includes(key)||!record(band)||Object.keys(band).some(k=>!['upToQuantity','charge'].includes(k))){bad(path,'Each order-size band has only a limit and a charge.');continue;}
          if(typeof band.upToQuantity!=='number'||!Number.isFinite(band.upToQuantity)||band.upToQuantity<=0||band.upToQuantity>1_000_000)bad(path+'.upToQuantity','Enter each band\'s order-size limit as a number above 0, up to 1,000,000.');
          else if(limits.has(band.upToQuantity))bad(path+'.upToQuantity','Give every order-size band a different limit.');
          else limits.add(band.upToQuantity);
          if(!Number.isSafeInteger(band.charge)||band.charge<0)bad(path+'.charge','Enter each band\'s charge as a non-negative amount in whole cents.');
        }
      }
    }
    for(const key of ['thickenedEdgeExtraDepthInches','thickenedEdgeWidthInches'])numeric(key,0.01,120);
    if(present(p.thickenedEdgeExtraDepthInches)!==present(p.thickenedEdgeWidthInches))bad(present(p.thickenedEdgeExtraDepthInches)?'thickenedEdgeWidthInches':'thickenedEdgeExtraDepthInches','Set both the thickened edge extra depth and width, or leave both blank.');
    for(const key of ['winterConcreteStart','winterConcreteEnd'])if(present(p[key])&&!parseMonthDay(p[key]))bad(key,`${FIELD_COPY[key].label}: choose a month and a day in that month.`);
    if(winterChargeSet(p))for(const key of ['winterConcreteStart','winterConcreteEnd'])if(!present(p[key]))bad(key,`${FIELD_COPY[key].label}: set it to use the winter concrete charge.`);
    numeric('basePrepLaborPercent',0,100);
    if(present(p.controlJointPricing)&&!['included','excluded'].includes(p.controlJointPricing))bad('controlJointPricing','Choose Included or Excluded for control joints.');
    if(present(p.formingLaborPricing)&&!['per_linear_foot','included_in_slab_labor'].includes(p.formingLaborPricing))bad('formingLaborPricing','Choose per linear foot or included in slab labor for forming labor.');
    if(present(p.isolationJointPricing)&&!['per_linear_foot','included'].includes(p.isolationJointPricing))bad('isolationJointPricing','Choose per linear foot or included for isolation joints.');
    for(const key of CONCRETE_TEXT_FIELDS)if(present(p[key])&&!concreteTextValid(p[key]))bad(key,`${FIELD_COPY[key].label}: describe it in 120 characters or fewer.`);
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
    numeric('groundPrepLaborPercent',0,100);
    for(const key of ['topsoilTargetDepthInches','topsoilTypicalImportDepthInches'])numeric(key,0,120);
    numeric('topsoilOrderIncrementCubicYards',0.01,1_000);
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
