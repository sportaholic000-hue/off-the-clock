import {exactAdd,exactCompare,exactDecimal,exactDivide,exactMultiply,exactToNumber} from './exactMath.js';

export const FLOORING_PATTERN_FIELDS=['diagonalWasteAdderByType','diagonalLaborMultiplierByType','herringboneWasteAdderByType','herringboneLaborMultiplierByType'];
export const FLOORING_ADDONS=[
  {rate:'baseboardReinstallPerLF',input:'baseboardReinstallLF',label:'Baseboard or quarter-round removal and reinstall',question:'How many linear feet of baseboard or quarter-round need removal and reinstall?',unit:'linear feet',category:'labor'},
  {rate:'transitionPriceEach',input:'transitionCount',label:'Transitions',question:'How many transitions are needed?',unit:'transitions',integer:true,category:'addon',installed:true},
  {rate:'furnitureMovingPrice',input:'furnitureMovingRoomCount',label:'Furniture moving',question:'How many rooms need furniture moved?',unit:'rooms',integer:true,category:'labor'},
  {rate:'toiletPullResetEach',input:'toiletPullResetCount',label:'Toilet pull and reset',question:'How many toilets need to be pulled and reset?',unit:'toilets',integer:true,category:'labor'},
  {rate:'floorLevelingPerSqft',input:'floorLevelingSqft',label:'Floor leveling',question:'About how many square feet need floor leveling?',unit:'square feet',category:'prep',installed:true}
];
export const FLOORING_OPTIONAL_FIELDS=[...FLOORING_PATTERN_FIELDS,...FLOORING_ADDONS.map(a=>a.rate),'furnitureMovingPriceUnit','carpetRollWidthFt','carpetPatternRepeatFt'];
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
  carpetPatternRepeatFt:{label:'Carpet pattern-repeat allowance (feet)',help:'Optional extra cut length for pattern matching on every piece. Blank means no extra repeat allowance.'}
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
export function carpetRoomMeasurements(rooms,connections){
  if(!Array.isArray(rooms)||rooms.length<1||rooms.length>1000||Object.keys(rooms).length!==rooms.length)inputError('Supply between 1 and 1,000 carpet rooms with a length and width for each.');
  let area=exactDecimal(0);
  for(const room of rooms){
    if(!record(room)||Object.keys(room).some(k=>!['lengthFt','widthFt'].includes(k)))inputError('Each carpet room uses only its front-to-back length and side-to-side width.');
    for(const key of ['lengthFt','widthFt'])if(typeof room[key]!=='number'||!Number.isFinite(room[key])||room[key]<=0||room[key]>1_000_000)inputError('Give a positive length and width for every carpet room; your best estimate is accepted.');
    area=exactAdd(area,exactMultiply(room.lengthFt,room.widthFt));
  }
  if(exactCompare(area,1)<0||exactCompare(area,1_000_000)>0)inputError('Carpet room areas must total between 1 and 1,000,000 square feet.');
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

export function normalizeFlooringInputs(c){
  if(c.newFlooringType!=='carpet'||c.carpetRooms===undefined)return c;
  if(c.carpetMeasurementMethod!==undefined&&c.carpetMeasurementMethod!=='rooms')inputError('Choose room measurements or total area only; remove the conflicting measurements.','carpetMeasurementMethod');
  const measured=carpetRoomMeasurements(c.carpetRooms,c.carpetConnectedAreas);
  if(c.sqft!==undefined&&(typeof c.sqft!=='number'||!Number.isFinite(c.sqft)||exactCompare(c.sqft,measured.exactArea)!==0))inputError('The total flooring area must agree with the supplied carpet room measurements.','sqft');
  if(c.sqftMethod!==undefined&&c.sqftMethod!=='exact')inputError('Room dimensions conflict with the selected total-area measurement method.','sqftMethod');
  return {...c,carpetMeasurementMethod:'rooms',sqft:measured.areaSqft,sqftMethod:'exact',roomCount:measured.roomCount,layoutPattern:c.layoutPattern||'straight'};
}

function ceiling(value){const x=exactDecimal(value);return Number((x.numerator+x.denominator-1n)/x.denominator);}
export function carpetRollPurchase(c,p){
  const measured=carpetRoomMeasurements(c.carpetRooms,c.carpetConnectedAreas);
  const width=p.carpetRollWidthFt,repeat=present(p.carpetPatternRepeatFt)?p.carpetPatternRepeatFt:0;
  if(!pricePresent(width)||width>1_000_000)throw Object.assign(new TypeError('Set the carpet roll width for this product in the price book.'),{flooringOwnerField:'carpetRollWidthFt'});
  if(typeof repeat!=='number'||!Number.isFinite(repeat)||repeat<0||repeat>1_000_000)throw Object.assign(new TypeError('Set a non-negative carpet pattern-repeat allowance.'),{flooringOwnerField:'carpetPatternRepeatFt'});
  const cuts=(group,turned)=>group.map(index=>{
    const room=c.carpetRooms[index],across=turned?room.lengthFt:room.widthFt,along=turned?room.widthFt:room.lengthFt;
    const pieces=ceiling(exactDivide(exactAdd(across,0.5),width)),length=exactAdd(along,0.5,repeat);
    return {room:index+1,pieces,rollWidthFt:width,cutLengthFt:exactToNumber(length),exactArea:exactMultiply(pieces,width,length)};
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
  if(own(p,'furnitureMovingPriceUnit')&&!['per_room','flat'].includes(p.furnitureMovingPriceUnit))bad('furnitureMovingPriceUnit','Choose per room or flat per job for furniture moving.');
  if(pricePresent(p.furnitureMovingPrice)&&!['per_room','flat'].includes(p.furnitureMovingPriceUnit))bad('furnitureMovingPriceUnit','Choose per room or flat per job for furniture moving.');
  return out;
}
