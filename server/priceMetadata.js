import {ownerMoneyEntries} from './priceBookMoney.js';

const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const clone=value=>structuredClone(value);
const AI_SOURCES=new Set(['AI_SUGGESTED','AI_INTERVIEW']);
const validInstant=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(value)&&Number.isFinite(Date.parse(value));
const same=(left,right)=>Object.is(left,right);

function note(value){
  if(value===undefined||value===null||value==='')return undefined;
  if(typeof value!=='string'||!value.trim()||value.length>500)throw Object.assign(new TypeError('A price source note must be 500 characters or fewer.'),{statusCode:400,code:'PRICEBOOK_INVALID'});
  return value.trim();
}
// Which earlier tier each submitted tier continues, as next index -> earlier
// index. A tier is matched by its name. An unnamed tier falls back to the
// earlier tier in its position. A renamed tier continues the earlier tier whose
// name is gone only when it carries a change date the server recorded for that
// tier (the editor keeps a tier's records with it). No earlier tier is matched
// twice, so a new tier never takes another tier's records.
function tierMatches(nextTiers,priorTiers){
  const next=Array.isArray(nextTiers)?nextTiers:[],prior=Array.isArray(priorTiers)?priorTiers:[];
  const named=tier=>record(tier)&&typeof tier.name==='string'&&tier.name!=='';
  const used=new Set(),out=new Map(),claim=(i,j)=>{used.add(j);out.set(i,j);};
  next.forEach((tier,i)=>{
    if(!named(tier))return;
    const j=prior.findIndex((candidate,k)=>!used.has(k)&&named(candidate)&&candidate.name===tier.name);
    if(j>=0)claim(i,j);
  });
  next.forEach((tier,i)=>{if(record(tier)&&!named(tier)&&i<prior.length&&record(prior[i])&&!used.has(i))claim(i,i);});
  const nextNames=new Set(next.filter(named).map(tier=>tier.name));
  next.forEach((tier,i)=>{
    if(!named(tier)||out.has(i)||!record(tier.priceMetadata))return;
    const carried=tier.priceMetadata;
    const j=[i,...prior.keys()].find(k=>k<prior.length&&!used.has(k)&&named(prior[k])&&!nextNames.has(prior[k].name)&&record(prior[k].priceMetadata)&&
      Object.entries(prior[k].priceMetadata).some(([path,row])=>validInstant(row?.changedAt)&&record(carried[path])&&carried[path].changedAt===row.changedAt));
    if(j!==undefined)claim(i,j);
  });
  return out;
}
function priorEntries(service,tierMatch,nextService){
  const byService=new Map(),byServicePath=new Map(),byTierIndex=new Map();
  // Named rows inside a service (fence offering price options) have an identity
  // that follows their name; a row still present under its name is never the
  // history of another row that now sits in its old place.
  const nextIdentities=new Set(nextService?ownerMoneyEntries(nextService).filter(entry=>entry.scope==='service'&&entry.identity).map(entry=>entry.identity):[]);
  for(const entry of service?ownerMoneyEntries(service):[]){
    if(entry.scope==='service'){
      byService.set(entry.identity||entry.path,entry);
      byServicePath.set(entry.path,entry);
    }
    else byTierIndex.set(entry.tierIndex+'\u0000'+(entry.identity||entry.path),entry);
  }
  return {find(entry){
    if(entry.scope==='service'){
      const own=byService.get(entry.identity||entry.path);
      if(own)return own;
      const atPath=byServicePath.get(entry.path);
      return atPath?.identity&&atPath.identity!==entry.identity&&nextIdentities.has(atPath.identity)?undefined:atPath;
    }
    const priorIndex=tierMatch.get(entry.tierIndex);
    return priorIndex===undefined?undefined:byTierIndex.get(priorIndex+'\u0000'+(entry.identity||entry.path));
  }};
}
function metadataTarget(service,entry){
  if(entry.scope==='tier'){
    const tier=service.tiers?.[entry.tierIndex];
    if(!record(tier.priceMetadata))tier.priceMetadata={};
    return tier.priceMetadata;
  }
  if(!record(service.priceMetadata))service.priceMetadata={};
  return service.priceMetadata;
}
function incomingRecord(service,entry){
  const source=entry.scope==='tier'?service.tiers?.[entry.tierIndex]?.priceMetadata:service.priceMetadata;
  if(entry.identity&&record(source)){
    const matched=Object.values(source).find(row=>record(row)&&row.identity===entry.identity);
    if(matched)return matched;
  }
  return record(source?.[entry.path])?source[entry.path]:{};
}
function cleanEmptyMetadata(service){
  if(record(service.priceMetadata)&&!Object.keys(service.priceMetadata).length)delete service.priceMetadata;
  for(const tier of Array.isArray(service.tiers)?service.tiers:[])if(record(tier?.priceMetadata)&&!Object.keys(tier.priceMetadata).length)delete tier.priceMetadata;
}

// This is the authoritative save-time transition. The caller supplies the
// previous durable book and one server timestamp for the whole operation, but
// each changed leaf receives its own retained record. Owner-supplied timestamps
// are never trusted.
export function applyPriceMetadata(nextBook,previousBook,now){
  if(!record(nextBook)||!Array.isArray(nextBook.services))throw new TypeError('A price book is required.');
  if(!validInstant(now))throw new TypeError('A valid server save time is required.');
  const next=clone(nextBook),previousServices=Array.isArray(previousBook?.services)?previousBook.services:[];
  for(const [index,service] of next.services.entries()){
    if(!record(service))continue;
    const old=previousServices.find(candidate=>typeof candidate?.id==='string'&&typeof service.id==='string'&&candidate.id.toLowerCase()===service.id.toLowerCase())||
      (service.id===undefined&&previousServices[index]?.id===undefined?previousServices[index]:undefined);
    const oldEntries=priorEntries(old,tierMatches(nextBook.services[index]?.tiers,old?.tiers),service);
    const nextEntries=ownerMoneyEntries(service);
    // Rebuild only entries that still have an explicit monetary leaf. Removing
    // a price removes its provenance; unrelated leaves and tiers are untouched.
    service.priceMetadata={};
    for(const tier of Array.isArray(service.tiers)?service.tiers:[])if(record(tier))tier.priceMetadata={};
    for(const entry of nextEntries){
      const priorEntry=oldEntries.find(entry),prior=record(priorEntry?.metadata)?priorEntry.metadata:{};
      let submitted=incomingRecord(nextBook.services[index],entry);
      if(entry.identity&&priorEntry&&priorEntry.path!==entry.path&&submitted.identity!==entry.identity)submitted=prior;
      const unchanged=Boolean(priorEntry)&&same(entry.value,priorEntry.value);
      // A changed amount drops the earlier check date and source note: the
      // note stays only when the owner re-checks the price or submits a
      // different note with the new amount.
      const submittedNote=Object.hasOwn(submitted,'sourceNote')?note(submitted.sourceNote):undefined;
      const sourceNote=unchanged||!priorEntry?(Object.hasOwn(submitted,'sourceNote')?submittedNote:note(prior.sourceNote))
        :submitted.reverified===true?(Object.hasOwn(submitted,'sourceNote')?submittedNote:note(prior.sourceNote))
        :submittedNote!==undefined&&submittedNote!==note(prior.sourceNote)?submittedNote:undefined;
      let aiPlaceholder;
      if(submitted.acceptedAsOwnerPrice===true)aiPlaceholder=false;
      else if(unchanged)aiPlaceholder=typeof prior.aiPlaceholder==='boolean'?prior.aiPlaceholder:AI_SOURCES.has(old?.source);
      else aiPlaceholder=!old&&AI_SOURCES.has(service.source);
      const row={};
      if(entry.identity)row.identity=entry.identity;
      if(unchanged&&validInstant(prior.changedAt))row.changedAt=prior.changedAt;
      else if(!priorEntry||!unchanged)row.changedAt=now;
      // Re-checking an unchanged price with a supplier is its own server-dated
      // event; the change date keeps recording when the amount last changed.
      if(submitted.reverified===true)row.verifiedAt=now;
      else if(unchanged&&validInstant(prior.verifiedAt))row.verifiedAt=prior.verifiedAt;
      if(sourceNote!==undefined)row.sourceNote=sourceNote;
      if(aiPlaceholder===true)row.aiPlaceholder=true;
      else if(AI_SOURCES.has(service.source)||prior.aiPlaceholder===true)row.aiPlaceholder=false;
      // An unchanged legacy manual price has no recorded date or provenance.
      // Keep that absence intact instead of adding an empty metadata shell;
      // status still reports it as "Date not recorded" through the entry view.
      if(Object.keys(row).length)metadataTarget(service,entry)[entry.path]=row;
    }
    cleanEmptyMetadata(service);
  }
  return next;
}

function dateLabel(instant){
  if(!validInstant(instant))return 'Date not recorded';
  return new Intl.DateTimeFormat('en-US',{timeZone:'UTC',month:'long',day:'numeric',year:'numeric'}).format(new Date(instant));
}
export function staleOwnerPrices(service,thresholdDays,now=new Date()){
  if(thresholdDays===undefined||thresholdDays===null||thresholdDays==='')return [];
  if(!Number.isInteger(thresholdDays)||thresholdDays<=0)throw new TypeError('Price age threshold must be a positive whole number of days.');
  const instant=now instanceof Date?now:new Date(now);
  if(!Number.isFinite(instant.getTime()))throw new TypeError('A valid comparison time is required.');
  const thresholdMs=thresholdDays*86_400_000;
  return ownerMoneyEntries(service).filter(entry=>entry.material||entry.costBasis).flatMap(entry=>{
    // Price age runs from the later of the last change and the last re-check.
    const changedAt=entry.metadata?.changedAt,verifiedAt=entry.metadata?.verifiedAt;
    const times=[changedAt,verifiedAt].filter(validInstant).map(value=>Date.parse(value));
    const changed=times.length?new Date(Math.max(...times)):null;
    if(changed&&instant.getTime()-changed.getTime()<=thresholdMs)return [];
    return [{
      path:entry.path,
      displayPath:entry.scope==='tier'?`tiers.${entry.tierIndex}.overrides.${entry.path}`:entry.path,
      tierName:entry.tierName||null,
      changedAt:changedAt||null,
      dateLabel:dateLabel(changed?changed.toISOString():changedAt),
      verifiedAt:validInstant(verifiedAt)?verifiedAt:null,
      sourceNote:entry.metadata?.sourceNote||null,
      category:entry.category,
      reason:changed?'Older than '+thresholdDays+' days':'Date not recorded'
    }];
  }).sort((left,right)=>left.displayPath.localeCompare(right.displayPath));
}

export function aiPlaceholderPrices(service){
  const legacyAi=AI_SOURCES.has(service?.source);
  return ownerMoneyEntries(service).filter(entry=>entry.metadata?.acceptedAsOwnerPrice!==true&&(entry.metadata?.aiPlaceholder===true||(legacyAi&&entry.metadata?.aiPlaceholder!==false))).map(entry=>({
    path:entry.path,
    displayPath:entry.scope==='tier'?`tiers.${entry.tierIndex}.overrides.${entry.path}`:entry.path,
    tierName:entry.tierName||null,
    label:'AI placeholder'
  })).sort((left,right)=>left.displayPath.localeCompare(right.displayPath));
}
