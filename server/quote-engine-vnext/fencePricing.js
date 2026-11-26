import {exactAdd,exactCompare,exactDecimal,exactDivide,exactToNumber} from './exactMath.js';
import {mergePricingForValidationVNext} from './pricingMerge.js';
import {formatFenceHeight} from './configuredOfferings.js';
import {keyLabel} from '../productNames.js';

const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const own=(v,k)=>Object.hasOwn(v||{},k);
const positive=v=>typeof v==='number'&&Number.isFinite(v)&&v>0;
const slug=v=>typeof v==='string'&&/^[a-z][a-z0-9_]*$/.test(v)&&!['constructor','prototype','__proto__'].includes(v);
const count=v=>Number.isSafeInteger(v)&&v>=1&&v<=1_000_000;
export const fenceType=type=>['FENCING_INSTALL','FENCING_REPLACEMENT'].includes(type);
export const FENCE_RUN_QUESTION='How many separate fence runs?';
export const FENCE_CLOSED_QUESTION='Does this run connect back to where it starts?';
export const FENCE_CLOSED_COUNT_QUESTION='How many of those runs connect back to where they start?';
export const FENCE_SECTION_QUESTION='Length of each straight section, in feet, between ends, corners and gates';
// Asked only for a section with a gate after it.
export const FENCE_GATE_CORNER_QUESTION='Does the fence turn a corner right after this gate?';
// Asked only for a run that does not connect back to where it starts.
export const FENCE_START_GATE_QUESTION='Is there a gate at the start of this run, before the first section?';
export const FENCE_POST_RATES={
  terminalPostMaterialEach:['Terminal post materials','material'],
  terminalFootingLaborEach:['Terminal post-hole and footing labor','labor'],
  terminalFootingMaterialEach:['Terminal footing materials','material'],
  linePostMaterialEach:['Line post materials','material'],
  lineFootingLaborEach:['Line post-hole and footing labor','labor'],
  lineFootingMaterialEach:['Line footing materials','material'],
};
export const fenceCatalog=p=>record(p?.fenceOfferings);
export const fenceHasRows=p=>own(p,'fenceOfferings')||own(p,'heightRows');
export function fenceHeightPrecision(feet){
  if(!positive(feet))return false;
  for(let k=0;k<=2;k++){const scaled=feet*12*10**k,whole=Math.round(scaled);if(Number.isSafeInteger(whole)&&whole>0&&Math.abs(scaled-whole)<=Math.abs(scaled)*1e-12)return true;}
  return false;
}

export function exactFenceHeight(feet){
  for(let k=0;k<=6;k++){
    const scale=12*10**k,scaled=feet*scale,whole=Math.round(scaled);
    if(Number.isSafeInteger(whole)&&whole>0&&Math.abs(scaled-whole)<=Math.abs(scaled)*1e-12)return exactDivide(whole,scale);
  }
  return exactDecimal(feet);
}
export function fenceRowCovers(row,height){
  if(!record(row)||!positive(height))return false;
  const h=exactFenceHeight(height);
  if(own(row,'exactHeight'))return positive(row.exactHeight)&&exactCompare(h,exactFenceHeight(row.exactHeight))===0;
  return typeof row.minimumHeight==='number'&&Number.isFinite(row.minimumHeight)&&row.minimumHeight>=0&&positive(row.maximumHeight)&&
    exactCompare(h,exactFenceHeight(row.minimumHeight))>0&&exactCompare(h,exactFenceHeight(row.maximumHeight))<=0;
}
export function fenceHeightRows(p){
  if(own(p,'heightRows'))return record(p.heightRows)?p.heightRows:{};
  if(positive(p?.offeringDetails?.fenceHeight))return {saved_height:{exactHeight:p.offeringDetails.fenceHeight,postSpacingLF:p.postSpacingLF,offeringRates:{...p.offeringRates}}};
  return {};
}
export function fenceOfferingEntries(p){
  return fenceCatalog(p)?Object.entries(p.fenceOfferings):p?.offeringDetails?.fenceType?[[p.offeringDetails.fenceType,p]]:[];
}
// Post spacing by fence type (new-issues audit of v53): every fence at least
// 3 ft; chain link at most 10 ft (ASTM F567 and F1043 line-post spacing);
// other types at most 12 ft, which keeps split rail (posts about 10 ft 3 in
// apart for 10.5 ft rails) quotable. The fence type is the owner's own name.
// Cyclone and hurricane fence are trade names for chain link; mesh is not
// recognized (it also names welded-wire products).
export const chainLinkFenceType=type=>typeof type==='string'&&/chain|cyclone|hurricane/i.test(type);
export function fencePostSpacingProblem(type,spacing){
  const max=chainLinkFenceType(type)?10:12;
  if(typeof spacing!=='number'||!Number.isFinite(spacing))return null;
  if(spacing>=3&&spacing<=max)return null;
  return (max===10?'Chain link line posts are set at most 10 feet apart. ':'')+'Enter a post spacing from 3 to '+max+' feet.';
}
export function fenceRowsDiagnostics(p,path='pricing'){
  const errors=[],bad=(at,message,kind='fence_height_rows')=>errors.push({type:'invalid',kind,path:at,message});
  for(const [type,offer] of fenceOfferingEntries(p)){
    const at=fenceCatalog(p)?path+'.fenceOfferings.'+type:path;
    if(!slug(type)||!record(offer)){bad(at,'Each fence type needs one named offering.');continue;}
    const rows=fenceHeightRows(offer);
    if(!Object.keys(rows).length){bad(at+'.heightRows','Add a priced height row for this fence type.');continue;}
    const valid=[];
    for(const [key,row] of Object.entries(rows)){
      const r=at+'.heightRows.'+key;
      if(!slug(key)||!record(row)){bad(r,'Each height row needs a stable name.');continue;}
      const exact=own(row,'exactHeight');
      if(exact?(!positive(row.exactHeight)||own(row,'minimumHeight')||own(row,'maximumHeight')):
        !(typeof row.minimumHeight==='number'&&Number.isFinite(row.minimumHeight)&&row.minimumHeight>=0&&positive(row.maximumHeight)&&exactCompare(exactFenceHeight(row.minimumHeight),exactFenceHeight(row.maximumHeight))<0)){
        bad(r,'Set an exact height, or a maximum height greater than the exclusive lower height.');continue;
      }
      if((exact?[row.exactHeight]:[row.minimumHeight,row.maximumHeight]).some(v=>v!==0&&!fenceHeightPrecision(v)))bad(r,'Enter height limits in feet and inches with inches to at most 2 decimal places.');
      if(!positive(row.postSpacingLF))bad(r+'.postSpacingLF','Enter the post spacing for this height row.');
      else{const problem=fencePostSpacingProblem(type,row.postSpacingLF);if(problem)bad(r+'.postSpacingLF',problem.replace(/\.$/,' for this height row.'));}
      if(!record(row.offeringRates))bad(r+'.offeringRates','Enter the prices for this height row.');
      for(const name of Object.keys(row))if(!['exactHeight','minimumHeight','maximumHeight','postSpacingLF','offeringRates','installedLaborPercent','installedMaterialsPercent'].includes(name))bad(r+'.'+name,'Unsupported fence height-row field.');
      for(const prior of valid){
        const a=prior.row,b=row;
        const overlaps=own(a,'exactHeight')?fenceRowCovers(b,a.exactHeight):own(b,'exactHeight')?fenceRowCovers(a,b.exactHeight):
          exactCompare(exactFenceHeight(a.minimumHeight),exactFenceHeight(b.maximumHeight))<0&&exactCompare(exactFenceHeight(b.minimumHeight),exactFenceHeight(a.maximumHeight))<0;
        if(overlaps)bad(r,`Fence height rows ${prior.key} and ${key} cover the same height. Rows must not overlap.`,'fence_height_overlap');
      }
      valid.push({key,row});
    }
  }
  return errors;
}
export function fenceSelection(p,c={}){
  if(own(p,'fenceOfferings')&&!fenceCatalog(p))return {error:'Define the fence-type offerings before quoting.',field:'fenceType'};
  const offer=fenceCatalog(p)?p.fenceOfferings[c.fenceType]:p;
  if(!record(offer)||offer.offeringDetails?.fenceType!==c.fenceType)return {error:'No offering is set for '+keyLabel(String(c.fenceType||'the requested fence type'))+'.',field:'fenceType'};
  // A height not given yet is asked, never formatted into an error (a missing
  // height threw here; audit f1501ff, found by the FORM_CANNOT_ASK harness).
  if(typeof c.fenceHeight!=='number'||!Number.isFinite(c.fenceHeight)||c.fenceHeight<=0)return {error:'Enter the fence height.',field:'fenceHeight'};
  const matches=Object.entries(fenceHeightRows(offer)).filter(([,r])=>fenceRowCovers(r,c.fenceHeight));
  if(matches.length!==1)return {error:matches.length?'More than one price covers this fence height. Review the overlapping height rows.':`No price is set for a fence at ${formatFenceHeight(c.fenceHeight)}.`,field:'fenceHeight'};
  return {type:c.fenceType,offer,rowKey:matches[0][0],row:matches[0][1]};
}
// Selection never borrows another height's or another fence type's prices.
// The full catalog stays in the retained configuration for reproduction.
export function resolvedFencePricing(p,c){
  const selection=fenceSelection(p,c);
  if(selection.error)throw Object.assign(new RangeError(selection.error),{fenceField:selection.field});
  const {offer,row}=selection;
  if(!fenceHasRows(p))return p;
  const {tiers,heightRows,...settings}=offer;
  return {...p,...settings,offeringDetails:{...offer.offeringDetails,fenceHeight:row.exactHeight??row.maximumHeight},offeringRates:{...row.offeringRates},postSpacingLF:row.postSpacingLF,
    installedLaborPercent:{...(offer.installedLaborPercent||{}),...(row.installedLaborPercent||{})},
    installedMaterialsPercent:{...(offer.installedMaterialsPercent||{}),...(row.installedMaterialsPercent||{})},
    ...(heightRows?{heightRows}:{}),...(fenceCatalog(p)?{fenceOfferings:p.fenceOfferings}:{})};
}
// Selected-row paths keep explicit zero classifications local to that row.
export function fenceRatePrefix(p){
  if(!fenceHasRows(p)||!p.offeringDetails?.fenceType)return '';
  const selected=fenceSelection(p,{fenceType:p.offeringDetails.fenceType,fenceHeight:p.offeringDetails.fenceHeight});
  return selected.error?'':(fenceCatalog(p)?'fenceOfferings.'+selected.type+'.':'')+'heightRows.'+selected.rowKey+'.';
}
export const qualifiedFenceRatePath=(p,path)=>path?.startsWith('offeringRates.')?fenceRatePrefix(p)+path:path;
export const localFenceRatePath=(p,path)=>fenceRatePrefix(p)&&path?.startsWith(fenceRatePrefix(p))?path.slice(fenceRatePrefix(p).length):path;
export function fenceTierKeys(p){
  return fenceCatalog(p)?Object.entries(p.fenceOfferings).flatMap(([type,o])=>(Array.isArray(o?.tiers)?o.tiers:[]).map(t=>({key:type+'/'+t.name,label:keyLabel(type)+' — '+t.name}))):[];
}
export function fenceQuoteTiers(p,c,legacyTiers=[]){
  if(!fenceCatalog(p))return Array.isArray(legacyTiers)&&legacyTiers.length?legacyTiers:[{name:null,overrides:{}}];
  const offer=p.fenceOfferings[c.fenceType];
  if(!record(offer)||!Array.isArray(offer.tiers)||!offer.tiers.length)return [{name:null,overrides:{}}];
  return offer.tiers.map(tier=>({name:tier.name,overrides:{fenceOfferings:{[c.fenceType]:tier.overrides}}}));
}
export function fenceCatalogVariants(p,legacyTiers=[]){
  const variants=[];
  for(const [type,offer] of fenceOfferingEntries(p)){
    const tiers=fenceCatalog(p)?offer.tiers:legacyTiers;
    for(const tier of Array.isArray(tiers)&&tiers.length?tiers:[{name:null,overrides:{}}]){
      const effective=mergePricingForValidationVNext(offer,tier.overrides||{});
      for(const [rowKey,row] of Object.entries(fenceHeightRows(effective))){
        const height=row?.exactHeight??row?.maximumHeight;
        const catalog=fenceCatalog(p)?{...p,fenceOfferings:{...p.fenceOfferings,[type]:effective}}:effective;
        // An unfinished row (no height yet) or overlapping rows cannot be
        // priced. Skip them here: the structure diagnostics already block the
        // service, and readiness must never throw for the whole book
        // (audit f1501ff #1, November 24, 2026).
        let pricing;
        try{pricing=resolvedFencePricing(catalog,{fenceType:type,fenceHeight:height});}catch{continue;}
        variants.push({type,tierName:tier.name,rowKey,row,height,pricing});
      }
    }
  }
  return variants;
}
const ceilSpans=(length,spacing)=>{const r=exactDecimal(exactDivide(length,spacing));return Number((r.numerator+r.denominator-1n)/r.denominator);};

function measuredFenceRuns(c,p){
  if(!Array.isArray(c.fenceRuns)||!c.fenceRuns.length||c.fenceRuns.length>1000)throw new RangeError('Supply the measured sections for every fence run.');
  if(c.lfMethod!==undefined&&c.lfMethod!=='exact')throw new RangeError('The section layout requires measured section lengths.');
  if(c.fenceRunCount!==undefined&&c.fenceRunCount!==c.fenceRuns.length)throw new RangeError('The fence run count does not match the measured runs.');
  let length=exactDecimal(0),corners=0,openRuns=0,sections=0,endGates=0;
  const gates={};
  const offeredGate=key=>typeof key==='string'&&own(p.offeringDetails?.gates,key)&&positive(p.offeringDetails.gates[key]?.widthLF);
  for(const run of c.fenceRuns){
    if(!record(run)||Object.keys(run).some(k=>!['closed','sections','gateBefore'].includes(k))||typeof run.closed!=='boolean'||!Array.isArray(run.sections)||!run.sections.length||run.sections.length>1000)throw new RangeError('Each run needs Yes/No for its connection and its straight section lengths.');
    if(!run.closed)openRuns++;
    // A gate can also start an open run (for example at a house wall), so a
    // straight run can have a gate at each end. Like a gate that ends a run,
    // its post is the run's end post and is not counted twice. A closed run has
    // no start: its gate goes after the section before it.
    if(own(run,'gateBefore')){
      if(run.closed)throw new RangeError('A run that connects back to where it starts has no first end; place its gate after the section before it.');
      if(!offeredGate(run.gateBefore))throw new RangeError('Choose an offered gate for the gate at the start of the run.');
      endGates++;gates[run.gateBefore]=(gates[run.gateBefore]||0)+1;
    }
    for(const [i,section] of run.sections.entries()){
      if(!record(section)||Object.keys(section).some(k=>!['lengthLF','gateAfter','cornerAfterGate'].includes(k))||!positive(section.lengthLF)||section.lengthLF>1_000_000)throw new RangeError('Every straight section needs a positive measured length in feet.');
      // The corner answer belongs to a placed gate only. A corner right after a
      // gate shares the gate's post, so it adds no post of its own.
      if(own(section,'cornerAfterGate')&&(typeof section.cornerAfterGate!=='boolean'||!own(section,'gateAfter')))throw new RangeError('The corner question applies only to a section with a gate after it, and the answer must be Yes or No.');
      length=exactAdd(length,section.lengthLF);sections++;
      const boundary=i<run.sections.length-1||run.closed;
      if(own(section,'gateAfter')){
        // A gate may also end an open run (for example at a house wall); the
        // run's end post is then that gate's post, so it is not counted twice.
        if(!boundary)endGates++;
        if(!offeredGate(section.gateAfter))throw new RangeError('Place each gate after a measured section using an offered gate.');
        gates[section.gateAfter]=(gates[section.gateAfter]||0)+1;
      }else if(boundary)corners++;
    }
  }
  const linearFeet=exactToNumber(length);
  if(!Number.isFinite(linearFeet)||linearFeet>1_000_000||sections>10_000)throw new RangeError('The measured fence layout exceeds the supported project size.');
  if(c.linearFeet!==undefined&&(!positive(c.linearFeet)||exactCompare(c.linearFeet,length)!==0))throw new RangeError('The total fence length does not match the measured sections.');
  if(c.cornerCount!==undefined&&c.cornerCount!==corners)throw new RangeError('Corners come from the section boundaries; the supplied corner count does not match.');
  if(c.gates!==undefined){
    if(!record(c.gates)||Object.keys(c.gates).some(k=>!own(p.offeringDetails?.gates,k))||Object.values(c.gates).some(n=>!Number.isSafeInteger(n)||n<0)||Object.keys({...gates,...c.gates}).some(k=>(gates[k]||0)!==(c.gates[k]||0)))throw new RangeError('The gate counts do not match their places in the measured sections.');
  }
  return {linearFeet,cornerCount:corners,gates,fenceRunCount:c.fenceRuns.length,openRuns,endGates};
}
// Public layout eligibility also requires a non-degenerate closed polygon.
export function fenceLayout(c,p){
  const measured=measuredFenceRuns(c,p);
  for(const run of c.fenceRuns)if(run.closed){
    const sides=[];let side=exactDecimal(0);
    for(const section of run.sections){
      side=exactAdd(side,section.lengthLF);
      if(section.gateAfter)side=exactAdd(side,p.offeringDetails.gates[section.gateAfter].widthLF);
      // A side ends at a corner: a boundary without a gate, or a gate followed by a corner.
      if(!section.gateAfter||section.cornerAfterGate===true){sides.push(side);side=exactDecimal(0);}
    }
    // A gate whose corner question was left blank is read as "no corner".
    // When that makes the closed run impossible, ask the question instead of
    // reporting the shape (Neon audit of v48 #12: an ordinary closed yard with
    // a gate just before a corner was refused). Layouts that already work
    // are unchanged.
    const unanswered=run.sections.some(section=>section.gateAfter&&!own(section,'cornerAfterGate'));
    const shapeError=message=>new RangeError(unanswered?'Say whether the fence turns a corner right after each gate on a run that connects back to where it starts.':message);
    if(sides.length<3)throw shapeError('A closed fence run needs at least three straight sides joined at corners.');
    sides[0]=exactAdd(sides[0],side);
    const perimeter=exactAdd(...sides);
    if(sides.some(value=>exactCompare(exactAdd(value,value),perimeter)>=0))throw shapeError('A closed fence side must be shorter than all the other sides combined, including the configured gate openings.');
  }
  return measured;
}
export function fencePostQuantities(c,p){
  if(fenceHasRows(p))p=resolvedFencePricing(p,c);
  if(!positive(p.postSpacingLF))throw new RangeError('Enter a positive post spacing for the selected fence height.');
  // Post takeoff counts positions; customer validation separately checks physical closure.
  const measured=c.fenceRuns!==undefined?measuredFenceRuns(c,p):null;
  const inputs=measured?{...c,...measured}:c;
  const runs=inputs.fenceRunCount??1;
  if(!count(runs)||!Number.isSafeInteger(inputs.cornerCount)||inputs.cornerCount<0||!positive(inputs.linearFeet))throw new RangeError('Supply a positive length, whole run count and whole corner count.');
  let gates=0,included=0;
  for(const [key,n] of Object.entries(inputs.gates||{})){
    if(!Number.isSafeInteger(n)||n<0||!own(p.offeringDetails?.gates,key))throw new RangeError('Supply whole counts for offered gates.');
    gates+=n;if(p.offeringDetails.gates[key].postsAndFootingsIncluded)included+=n;
  }
  // Total length only: section lengths are unknown, so line posts use the
  // largest count any split of that length can need (each section needs fewer
  // than its length / spacing), never fewer than the real layout. A run that
  // connects back to where it starts has no end posts.
  const closed=measured?0:inputs.closedRunCount??0;
  if(!measured&&(!Number.isSafeInteger(closed)||closed<0||closed>runs))throw new RangeError('Closed runs must be a whole number no larger than the number of runs.');
  const openRuns=measured?measured.openRuns:runs-closed;
  const line=measured?c.fenceRuns.reduce((sum,run)=>sum+run.sections.reduce((s,section)=>s+ceilSpans(section.lengthLF,p.postSpacingLF)-1,0),0):ceilSpans(inputs.linearFeet,p.postSpacingLF)-1;
  const terminal=2*openRuns+inputs.cornerCount+2*(gates-included)-(measured?measured.endGates:0);
  const total=line+terminal;
  // Bays between posts: one per spacing in each straight section. From a total
  // length alone, every section boundary (corner, gate, run end) can add one.
  const bays=measured?c.fenceRuns.reduce((sum,run)=>sum+run.sections.reduce((s,section)=>s+ceilSpans(section.lengthLF,p.postSpacingLF),0),0):line+inputs.cornerCount+gates+openRuns;
  if([line,terminal,total,bays].some(n=>!Number.isSafeInteger(n)||n<0))throw new RangeError('Fence post quantity is outside the supported range.');
  return {total,terminal,line,bays,method:measured?'sections':'total_length_allowance',inputs};
}

// Explicit editor migration; ordinary reads/quotes do not rewrite saved books.
export function fenceOfferingFromLegacy(p,tiers=[]){
  const offer={offeringMode:p.offeringMode,offeringDetails:structuredClone(p.offeringDetails||{})};
  const row={exactHeight:p.offeringDetails?.fenceHeight,postSpacingLF:p.postSpacingLF,offeringRates:{...p.offeringRates},
    ...(p.installedLaborPercent?{installedLaborPercent:{...p.installedLaborPercent}}:{}),...(p.installedMaterialsPercent?{installedMaterialsPercent:{...p.installedMaterialsPercent}}:{})};
  if(p.offeringMode==='itemized'){
    for(const [legacy,terminal,line] of [['postMaterialEach','terminalPostMaterialEach','linePostMaterialEach'],['footingLaborEach','terminalFootingLaborEach','lineFootingLaborEach'],['footingMaterialEach','terminalFootingMaterialEach','lineFootingMaterialEach']]){
      if(own(row.offeringRates,legacy)){row.offeringRates[terminal]=row.offeringRates[legacy];row.offeringRates[line]=row.offeringRates[legacy];delete row.offeringRates[legacy];}
    }
  }
  delete offer.offeringDetails.fenceHeight;
  return {...offer,...(own(p,'minimumJob')?{minimumJob:p.minimumJob}:{}),heightRows:p.heightRows||{saved_height:row},tiers:tiers.map(t=>{const {tiers:unused,...effective}=fenceOfferingFromLegacy(mergePricingForValidationVNext(p,t.overrides||{}));return {name:t.name,overrides:effective};})};
}
