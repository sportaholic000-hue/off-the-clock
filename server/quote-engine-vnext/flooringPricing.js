import {exactAdd,exactCompare,exactDecimal,exactDivide,exactMultiply,exactSubtract,exactToNumber} from './exactMath.js';
import {SUBSTRATE_CLASSES,FLOATABLE_SUBSTRATES,FLOAT_OVER_FIELDS,FLOAT_CONDITIONS,LEGACY_FLOAT_CONDITION_KEYS,substrateContradiction} from '../scopeConfiguration.js';
const SUBSTRATE_NAMES={wood:'wood',resilient_sheet:'sheet vinyl or linoleum',resilient_tile_plank:'vinyl tile, VCT or vinyl plank',laminate:'laminate',ceramic_stone_tile:'ceramic or stone tile',concrete:'concrete',cushioned_or_floating:'cushioned or floating',carpet:'carpet'};

export const FLOORING_PATTERN_FIELDS=['diagonalWasteAdderByType','diagonalLaborMultiplierByType','herringboneWasteAdderByType','herringboneLaborMultiplierByType'];
export const FLOORING_ADDONS=[
  {rate:'baseboardReinstallPerLF',input:'baseboardReinstallLF',label:'Baseboard or quarter-round removal and reinstall',question:'How many linear feet of baseboard or quarter-round need removal and reinstall?',unit:'linear feet',category:'labor'},
  {rate:'transitionPriceEach',input:'transitionCount',label:'Transitions',question:'How many transitions are needed?',unit:'transitions',integer:true,category:'addon',installed:true},
  {rate:'furnitureMovingPrice',input:'furnitureMovingRoomCount',label:'Furniture moving',question:'How many rooms need furniture moved?',unit:'rooms',integer:true,category:'labor'},
  {rate:'toiletPullResetEach',input:'toiletPullResetCount',label:'Toilet pull and reset',question:'How many toilets need to be pulled and reset?',unit:'toilets',integer:true,category:'labor'},
  {rate:'floorLevelingPerSqft',input:'floorLevelingSqft',label:'Floor leveling',question:'About how many square feet need floor leveling?',unit:'square feet',category:'prep',installed:true}
];
export const FLOORING_OPTIONAL_FIELDS=[...FLOORING_PATTERN_FIELDS,...FLOORING_ADDONS.map(a=>a.rate),'floorLevelingMaxDepthInches','furnitureMovingPriceUnit','carpetRollWidthFt','carpetPatternRepeatFt','carpetCrossgrainSeams','carpetPriceUnit','vinylPlankInstallMethod','existingFloorSubstrate','laminateFloatsOver','vinylPlankFloatsOver','laminateInstallInstructions','vinylPlankInstallInstructions','laminateFloatConditions','vinylPlankFloatConditions'];
export const FLOORING_FIELD_COPY={
  diagonalWasteAdderByType:{label:'Diagonal additional waste by flooring type',help:'Optional additional material fraction for each hard flooring type. Blank uses your saved diagonal/pattern waste addition.',unit:'decimal fraction',ownerInputUnit:'percent'},
  diagonalLaborMultiplierByType:{label:'Diagonal labor adjustment by flooring type',help:'Optional labor multiplier for each hard flooring type. Blank uses your saved diagonal/pattern labor adjustment.',unit:'multiplier'},
  herringboneWasteAdderByType:{label:'Herringbone or chevron additional waste by flooring type',help:'Optional additional material fraction. Blank uses that flooring type’s diagonal waste addition.',unit:'decimal fraction',ownerInputUnit:'percent'},
  herringboneLaborMultiplierByType:{label:'Herringbone or chevron labor adjustment by flooring type',help:'Before adoption, blank uses your saved diagonal labor adjustment. New or adopted services offer sourced starting values for hardwood, laminate and vinyl plank; confirm them in Quantity assumptions. Tile herringbone or chevron needs your own labor adjustment.',unit:'multiplier'},
  baseboardReinstallPerLF:{label:'Baseboard or quarter-round removal and reinstall ($ per linear foot)',help:'Labor to remove and refit existing baseboard or quarter-round. New trim material is separate work.'},
  transitionPriceEach:{label:'Transitions ($ each)',help:'Installed price for one transition, including its piece and installation. Record the labor/material split in Quote configuration for materials-only tax or seasonal labor pricing.'},
  furnitureMovingPrice:{label:'Furniture moving price',help:'Your labor charge per room or flat per job, according to Furniture moving price unit. Blank means this extra is not offered in the quote.'},
  furnitureMovingPriceUnit:{label:'Furniture moving price unit',help:'Choose whether the furniture moving price applies to each room or once to the job.'},
  toiletPullResetEach:{label:'Toilet pull and reset ($ each)',help:'Labor to pull and reset one toilet. Repairs, a replacement toilet and separately purchased parts are additional work.'},
  floorLevelingPerSqft:{label:'Floor leveling ($ per square foot)',help:'Installed leveling price per affected square foot for a new flooring installation. Record its labor/material split in Quote configuration.'},
  carpetRollWidthFt:{label:'Carpet roll width (feet)',help:'Full roll width for this carpet product or price option, for example 12, 13.5 or 15 feet. Room-based carpet quotes need this owner-entered width.'},
  carpetPatternRepeatFt:{label:'Carpet pattern-repeat allowance (feet)',help:'Optional extra cut length for pattern matching on every piece. Blank means no extra repeat allowance.'},
  vinylPlankInstallMethod:{label:'Vinyl plank installation method',help:'Floating (click-lock) vinyl plank goes over an existing floor only as its installation instructions allow: the substrates and conditions you set for it decide that, and a compatible install quotes without an overlay price. An overlay or preparation price is separately priced work; it never makes an incompatible install quote. Glue-down plank is not floated, so keeping the existing floor needs your overlay rule. Blank asks you to choose before vinyl plank can be quoted over an existing floor.'},
  existingFloorSubstrate:{label:'What each registered existing floor is',help:'Say what each registered existing floor is made of, so a floating floor is quoted over it only when your product allows that material: wood; sheet vinyl or linoleum; vinyl tile, VCT or vinyl plank; laminate; ceramic or stone tile; concrete; a floor known to float or be cushioned; or carpet. Whether it is glued, nailed or floating is the customer’s answer, not the name. A few names with an unambiguous material are recognized without a classification (for example tile, porcelain, marble, sheet vinyl, linoleum, VCT, vinyl plank, hardwood, engineered hardwood, oak, maple, laminate, concrete, carpet). Any other name, including compounds such as vinyl tile or cork tile, needs a classification; until then a floating floor over it is quoted as a partial estimate with the existing floor left for the site visit.'},
  laminateFloatsOver:{label:'Substrates your laminate may float over',help:'From your laminate product’s installation instructions: wood, sheet vinyl or linoleum, vinyl tile or plank, laminate, ceramic or stone tile, concrete. New laminate is quoted only as a floating install. Yes is quoted as an ordinary install once its conditions are met; No is never quoted, whatever overlay or preparation price you have. A blank entry quotes as a partial estimate that leaves whether the existing floor can stay for the site visit. Carpet and cushioned or floating floors are never allowed. The customer still confirms the floor is firmly attached, flat and not cushioned.'},
  vinylPlankFloatsOver:{label:'Substrates your floating vinyl plank may float over',help:'From your vinyl plank product’s installation instructions; used only when the vinyl plank installation method is Floating. Yes is quoted as an ordinary install once its conditions are met; No is never quoted, whatever overlay or preparation price you have. A blank entry quotes as a partial estimate that leaves whether the existing floor can stay for the site visit. Carpet and cushioned or floating floors are never allowed.'},
  laminateInstallInstructions:{label:'Laminate product and instruction revision these substrates come from',help:'Name the laminate product or variant and the revision of its installation instructions, for example a product name and its instructions dated 2025. Required once you set its substrates or conditions. Shown on the quote; changing it means re-approving the service. 160 characters or fewer.',type:'text',maxLength:160},
  vinylPlankInstallInstructions:{label:'Vinyl plank product and instruction revision these substrates come from',help:'Name the vinyl plank product or variant and the revision of its installation instructions. Required once you set its substrates or conditions. Shown on the quote; changing it means re-approving the service. 160 characters or fewer.',type:'text',maxLength:160},
  laminateFloatConditions:{label:'Conditions your laminate instructions set',help:'Turn on only the ones your product’s instructions state. The customer is asked the matching question, with Not sure: one layer of existing sheet vinyl or linoleum only; no wood floor glued directly to concrete; no wood floor or wood subfloor laid on or fastened directly over concrete; no sleeper construction. A Not sure answer, or a construction a condition does not decide, gives a partial estimate; an answer that breaks a condition is not quoted.'},
  vinylPlankFloatConditions:{label:'Conditions your floating vinyl plank instructions set',help:'Turn on only the ones your product’s instructions state. The customer is asked the matching question, with Not sure: one layer of existing sheet vinyl or linoleum only; no wood floor glued directly to concrete; no wood floor or wood subfloor laid on or fastened directly over concrete; no sleeper construction. A Not sure answer, or a construction a condition does not decide, gives a partial estimate; an answer that breaks a condition is not quoted.'},
  carpetCrossgrainSeams:{label:'Crossgrain seams in carpet fills',help:'Blank or Not allowed buys whole roll widths, so seams run the length of the room (CRI 105: seams run the length of the area and are kept to a minimum). Allowed fills the strip beside full roll widths with up to 3 pieces joined end to end (2 crossgrain seams), all the same pile direction; use it only where your installation practice accepts crossgrain seams.'},
  floorLevelingMaxDepthInches:{label:'Deepest floor leveling your price covers (inches)',help:'Self-leveling compound per square foot covers a stated depth. The quote says leveling deeper than this is confirmed on site.'},
  carpetPriceUnit:{label:'Carpet labor and material prices are per',help:'Carpet is usually sold per square yard. Choose square yard to enter your carpet labor and carpet material prices per square yard; the quote converts exactly (9 square feet = 1 square yard). Changing this converts your saved carpet labor and material prices exactly; a change that cannot be stated exactly in the new unit is refused and nothing is changed. Pad is priced separately as carpet underlayment.'}
};
export const CARPET_QUANTITY_NOTE='The carpet quantity is confirmed on site from the seaming diagram.';
export const LEVELING_UNKNOWN_NOTE='Floor leveling is additional work; the business will confirm its area and price on site.';
export const CLEANUP_BAG_WARNING="Customers who don't know their bag count will go to review. Add a per-load price and area per load to estimate it from the yard size.";
export const flooringAddonOffered=(p,rules,path)=>pricePresent(p[path])||p[path]===0&&typeof rules?.zeroPricePolicy?.includedPrices?.[path]==='string';
export const flooringAddonConfigured=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
export const pricePresent=v=>typeof v==='number'&&Number.isFinite(v)&&v>0;
const own=(o,k)=>Object.hasOwn(o||{},k);
const present=v=>v!==undefined&&v!==null&&v!=='';
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);

export function flooringLayoutValue(c,p,kind){
  const type=c.newFlooringType,pattern=c.layoutPattern||'straight';
  if(type==='carpet'&&c.carpetRooms!==undefined)return {value:kind==='waste'?0:1,path:null};
  const legacy=kind==='waste'?'patternWasteAdder':'layoutLaborMultiplier';
  if(pattern==='straight')return {value:p[legacy]?.straight,path:legacy+'.straight'};
  // Area-only legacy carpet requests retain their exact old pricing. The new
  // carpet room/roll method above never uses hard-floor pattern allowances.
  if(type==='carpet')return pattern==='diagonal_or_pattern'?{value:p[legacy]?.diagonal_or_pattern,path:legacy+'.diagonal_or_pattern'}:{value:kind==='waste'?0:1,path:null};
  const diagonal=kind==='waste'?'diagonalWasteAdderByType':'diagonalLaborMultiplierByType';
  const herring=kind==='waste'?'herringboneWasteAdderByType':'herringboneLaborMultiplierByType';
  if(pattern==='herringbone_or_chevron'&&present(p[herring]?.[type]))return {value:p[herring][type],path:herring+'.'+type};
  if(present(p[diagonal]?.[type]))return {value:p[diagonal][type],path:diagonal+'.'+type};
  return {value:p[legacy]?.diagonal_or_pattern,path:legacy+'.diagonal_or_pattern'};
}

function inputError(message,field='carpetRooms'){throw Object.assign(new TypeError(message),{flooringField:field});}
// Room lengths and widths: carpet rooms (carpetRooms) or hard-floor rooms
// (floorRooms). The same checks apply; messages name the field's rooms.
export function carpetRoomMeasurements(rooms,connections,field='carpetRooms'){
  const noun=field==='floorRooms'?'room':'carpet room',nouns=noun+'s';
  if(!Array.isArray(rooms)||rooms.length<1||rooms.length>1000||Object.keys(rooms).length!==rooms.length)inputError(`Supply between 1 and 1,000 ${nouns} with a length and width for each.`,field);
  let area=exactDecimal(0);
  for(const room of rooms){
    if(!record(room)||Object.keys(room).some(k=>!['lengthFt','widthFt'].includes(k)))inputError(`Each ${noun} uses only its front-to-back length and side-to-side width.`,field);
    for(const key of ['lengthFt','widthFt'])if(typeof room[key]!=='number'||!Number.isFinite(room[key])||room[key]<=0||room[key]>1_000_000)inputError(`Give a positive length and width for every ${noun}; your best estimate is accepted.`,field);
    area=exactAdd(area,exactMultiply(room.lengthFt,room.widthFt));
  }
  if(exactCompare(area,1)<0||exactCompare(area,1_000_000)>0)inputError(`${noun[0].toUpperCase()+noun.slice(1)} areas must total between 1 and 1,000,000 square feet.`,field);
  const parent=rooms.map((_,i)=>i),find=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
  const join=(a,b)=>{parent[find(b)]=find(a);};
  if(connections===undefined||connections==='unknown')for(let i=1;i<rooms.length;i++)join(0,i);
  else{
    if(!Array.isArray(connections)||connections.length>1000||Object.keys(connections).length!==connections.length)inputError('List connected carpet room groups, or choose Not sure.','carpetConnectedAreas');
    for(const group of connections){
      if(!Array.isArray(group)||!group.length||group.length>rooms.length||Object.keys(group).length!==group.length||group.some(i=>!Number.isSafeInteger(i)||i<1||i>rooms.length))inputError('Connected areas must name existing room numbers.','carpetConnectedAreas');
      for(const i of group)join(group[0]-1,i-1);
    }
  }
  const groups=new Map();for(let i=0;i<rooms.length;i++){const key=find(i);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(i);}
  return {exactArea:area,areaSqft:exactToNumber(area),roomCount:rooms.length,groups:[...groups.values()]};
}

// The measured rooms for this flooring type, or undefined for a total-area quote.
export const flooringRoomList=c=>c?.newFlooringType==='carpet'?c.carpetRooms:c?.floorRooms;

export function normalizeFlooringInputs(c){
  const carpet=c.newFlooringType==='carpet',rooms=flooringRoomList(c);
  if(rooms===undefined)return c;
  const field=carpet?'carpetRooms':'floorRooms',methodField=carpet?'carpetMeasurementMethod':'floorMeasurementMethod',roomMethod=carpet?'rooms':'room_dimensions';
  if(c[methodField]!==undefined&&c[methodField]!==roomMethod)inputError('Choose room measurements or total area only; remove the conflicting measurements.',methodField);
  const measured=carpetRoomMeasurements(rooms,carpet?c.carpetConnectedAreas:undefined,field);
  if(c.sqft!==undefined&&(typeof c.sqft!=='number'||!Number.isFinite(c.sqft)||exactCompare(c.sqft,measured.exactArea)!==0))inputError(`The total flooring area must agree with the supplied ${carpet?'carpet ':''}room measurements.`,'sqft');
  if(c.sqftMethod!==undefined&&c.sqftMethod!=='exact')inputError('Room dimensions conflict with the selected total-area measurement method.','sqftMethod');
  return {...c,[methodField]:roomMethod,sqft:measured.areaSqft,sqftMethod:'exact',roomCount:measured.roomCount,...(carpet?{layoutPattern:c.layoutPattern||'straight'}:{})};
}

function ceiling(value){const x=exactDecimal(value);return Number((x.numerator+x.denominator-1n)/x.denominator);}
function floor(value){const x=exactDecimal(value);return Number(x.numerator/x.denominator);}
export function carpetRollPurchase(c,p){
  const measured=carpetRoomMeasurements(c.carpetRooms,c.carpetConnectedAreas);
  const width=p.carpetRollWidthFt,repeat=present(p.carpetPatternRepeatFt)?p.carpetPatternRepeatFt:0;
  if(!pricePresent(width)||width>1_000_000)throw Object.assign(new TypeError('Set the carpet roll width for this product in the price book.'),{flooringOwnerField:'carpetRollWidthFt'});
  if(typeof repeat!=='number'||!Number.isFinite(repeat)||repeat<0||repeat>1_000_000)throw Object.assign(new TypeError('Set a non-negative carpet pattern-repeat allowance.'),{flooringOwnerField:'carpetPatternRepeatFt'});
  // Trim (0.5 ft) goes on every cut length and across the room; pattern repeat
  // goes on every cut length. Every piece in a
  // room runs the same pile direction (CRI 105 section 5.2). Full-width drops
  // run the room's length; the leftover strip is filled from one cut of the roll
  // split lengthwise into strips of the fill width plus 0.5 ft trim, joined end
  // to end: at most 3 pieces, 2 crossgrain seams (CFI). The cheaper of that fill
  // or one more full width is bought, then the cheaper room direction. Products
  // the owner marks "no crossgrain seams" buy whole widths only.
  // CRI 105 5.1: seams run the length of the area and are kept to a minimum.
  // Crossgrain fills only when the owner allows them.
  const fillsAllowed=p.carpetCrossgrainSeams==='allowed';
  const cuts=(group,turned)=>group.map(index=>{
    const room=c.carpetRooms[index],across=turned?room.lengthFt:room.widthFt,along=turned?room.widthFt:room.lengthFt;
    // At least 3 inches along each wall for trimming (CRI 105 section 5.3):
    // 0.5 ft on the cut length and 0.5 ft across the room.
    const length=exactAdd(along,0.5,repeat),coverAcross=exactAdd(across,0.5),pieces=ceiling(exactDivide(coverAcross,width));
    const whole={room:index+1,pieces,rollWidthFt:width,cutLengthFt:exactToNumber(length),exactArea:exactMultiply(pieces,width,length)};
    const drops=pieces-1,fillWidth=exactSubtract(coverAcross,exactMultiply(drops,width));
    const strips=Math.min(3,floor(exactDivide(width,fillWidth)));
    if(!fillsAllowed||drops<1||strips<2)return whole;
    const fillCut=exactDivide(exactAdd(along,exactMultiply(strips,exactAdd(0.5,repeat))),strips);
    const area=exactAdd(exactMultiply(drops,width,length),exactMultiply(width,fillCut));
    if(exactCompare(area,whole.exactArea)>=0)return whole;
    return {room:index+1,pieces:drops,rollWidthFt:width,cutLengthFt:whole.cutLengthFt,fill:{pieces:strips,crossgrainSeams:strips-1,widthFt:exactToNumber(fillWidth),cutLengthFt:exactToNumber(fillCut)},exactArea:area};
  });
  const chosen=[],areaChoices=[];
  for(const group of measured.groups){
    const a=cuts(group,false),b=cuts(group,true),sum=rows=>exactAdd(...rows.map(r=>r.exactArea));
    const turned=exactCompare(sum(b),sum(a))<0,rows=turned?b:a;
    chosen.push(...rows);areaChoices.push({rooms:group.map(i=>i+1),direction:turned?'side_to_side':'front_to_back'});
  }
  return {...measured,purchasedQuantity:exactAdd(...chosen.map(r=>r.exactArea)),cuts:chosen.map(({exactArea,...row})=>({...row,boughtSqft:exactToNumber(exactArea)})),areaChoices,repeatFt:repeat,rollWidthFt:width};
}

export function cleanupDisposalWarning(p={}){
  return pricePresent(p.disposalPerBag)&&(!pricePresent(p.disposalPerLoad)||['light','moderate','heavy'].some(level=>!pricePresent(p.debrisPricing?.[level]?.sqftPerLoad)))?CLEANUP_BAG_WARNING:null;
}

export function flooringPricingDiagnostics(p){
  const out=[],bad=(path,message)=>out.push({type:'invalid',kind:'flooring_pricing',path,message});
  for(const key of FLOORING_PATTERN_FIELDS)if(own(p,key)){
    const waste=key.includes('Waste');
    if(!record(p[key])){bad(key,'Use a map of hard flooring types.');continue;}
    for(const [type,value] of Object.entries(p[key]))if(!['hardwood','laminate','vinyl_plank','tile'].includes(type)||typeof value!=='number'||!Number.isFinite(value)||value<(waste?0:0.1)||value>(waste?0.5:5))bad(key+'.'+type,waste?'Waste addition must be from 0% to 50% for a supported hard flooring type.':'Labor adjustment must be from 0.1 to 5 for a supported hard flooring type.');
  }
  for(const key of ['carpetRollWidthFt','carpetPatternRepeatFt'])if(own(p,key)&&(typeof p[key]!=='number'||!Number.isFinite(p[key])||p[key]<(key==='carpetRollWidthFt'?Number.MIN_VALUE:0)||p[key]>1_000_000))bad(key,'Enter a finite carpet dimension within the supported range.');
  if(own(p,'vinylPlankInstallMethod')&&!['floating','glue_down'].includes(p.vinylPlankInstallMethod))bad('vinylPlankInstallMethod','Choose floating or glue-down for vinyl plank.');
  if(own(p,'existingFloorSubstrate')){
    if(!record(p.existingFloorSubstrate))bad('existingFloorSubstrate','Classify existing floors by their registered names.');
    else for(const [name,value] of Object.entries(p.existingFloorSubstrate))if(!/^[a-z0-9][a-z0-9_]{0,99}$/.test(name)||!SUBSTRATE_CLASSES.includes(value))bad('existingFloorSubstrate.'+name,'Choose wood, sheet vinyl or linoleum, vinyl tile or plank, laminate, ceramic or stone tile, concrete, cushioned or floating, or carpet.');
  }
  if(record(p.existingFloorSubstrate))for(const name of Object.keys(p.existingFloorSubstrate)){
    const conflict=substrateContradiction(name,p);
    if(conflict)bad('existingFloorSubstrate.'+name,`The registered name ${name.replaceAll('_',' ')} is a recognized ${SUBSTRATE_NAMES[conflict.recognized]} floor but is classified as ${SUBSTRATE_NAMES[conflict.stated]}. Register the floor under a name that matches what it is, or remove this classification.`);
  }
  for(const [product,set,instructions] of [['laminate','laminateFloatConditions','laminateInstallInstructions'],['vinyl_plank','vinylPlankFloatConditions','vinylPlankInstallInstructions']]){
    if(own(p,set)){
      if(!record(p[set]))bad(set,'Turn each condition on or off.');
      else for(const [key,value] of Object.entries(p[set]))if(!(Object.hasOwn(FLOAT_CONDITIONS,key)||Object.hasOwn(LEGACY_FLOAT_CONDITION_KEYS,key))||typeof value!=='boolean')bad(set+'.'+key,'Only the listed conditions can be set, with yes or no.');
    }
    const rules=own(p,FLOAT_OVER_FIELDS[product])||own(p,set);
    if(rules&&!(typeof p[instructions]==='string'&&p[instructions].trim()))bad(instructions,'Name the product or variant and the instruction revision these rules come from.');
  }
  for(const key of ['laminateInstallInstructions','vinylPlankInstallInstructions'])if(own(p,key)&&(typeof p[key]!=='string'||!p[key].trim()||p[key].length>160||/[<>\u0000-\u001f]/.test(p[key])))bad(key,'Name the installation instructions in 160 characters or fewer.');
  for(const key of ['laminateFloatsOver','vinylPlankFloatsOver'])if(own(p,key)){
    if(!record(p[key]))bad(key,'Choose yes or no for each substrate.');
    else for(const [name,value] of Object.entries(p[key]))if(!FLOATABLE_SUBSTRATES.includes(name)||typeof value!=='boolean')bad(key+'.'+name,'Only wood, sheet vinyl or linoleum, vinyl tile or plank, laminate, ceramic or stone tile, and concrete can be allowed, with yes or no.');
  }
  if(own(p,'carpetCrossgrainSeams')&&!['allowed','not_allowed'].includes(p.carpetCrossgrainSeams))bad('carpetCrossgrainSeams','Choose allowed or not allowed for crossgrain seams in carpet fills.');
  if(own(p,'carpetPriceUnit')&&!['square_foot','square_yard'].includes(p.carpetPriceUnit))bad('carpetPriceUnit','Choose square foot or square yard for carpet prices.');
  if(own(p,'floorLevelingMaxDepthInches')&&!(typeof p.floorLevelingMaxDepthInches==='number'&&p.floorLevelingMaxDepthInches>0&&p.floorLevelingMaxDepthInches<=12))bad('floorLevelingMaxDepthInches','Enter a leveling depth from just above 0 to 12 inches.');
  if(own(p,'furnitureMovingPriceUnit')&&!['per_room','flat'].includes(p.furnitureMovingPriceUnit))bad('furnitureMovingPriceUnit','Choose per room or flat per job for furniture moving.');
  if(pricePresent(p.furnitureMovingPrice)&&!['per_room','flat'].includes(p.furnitureMovingPriceUnit))bad('furnitureMovingPriceUnit','Choose per room or flat per job for furniture moving.');
  return out;
}
