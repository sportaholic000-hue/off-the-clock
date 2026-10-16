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
function priorEntries(service){
  const byService=new Map(),byTierName=new Map(),byTierIndex=new Map();
  for(const entry of service?ownerMoneyEntries(service):[]){
    if(entry.scope==='service')byService.set(entry.path,entry);
    else {
      if(entry.tierName)byTierName.set(entry.tierName+'\u0000'+entry.path,entry);
      byTierIndex.set(entry.tierIndex+'\u0000'+entry.path,entry);
    }
  }
  return {find(entry){
    if(entry.scope==='service')return byService.get(entry.path);
    return entry.tierName&&byTierName.get(entry.tierName+'\u0000'+entry.path)||byTierIndex.get(entry.tierIndex+'\u0000'+entry.path);
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
    const oldEntries=priorEntries(old);
    const nextEntries=ownerMoneyEntries(service);
    // Rebuild only entries that still have an explicit monetary leaf. Removing
    // a price removes its provenance; unrelated leaves and tiers are untouched.
    service.priceMetadata={};
    for(const tier of Array.isArray(service.tiers)?service.tiers:[])if(record(tier))tier.priceMetadata={};
    for(const entry of nextEntries){
      const priorEntry=oldEntries.find(entry),prior=record(priorEntry?.metadata)?priorEntry.metadata:{};
      const submitted=incomingRecord(nextBook.services[index],entry);
      const unchanged=Boolean(priorEntry)&&same(entry.value,priorEntry.value);
      const sourceNote=note(Object.hasOwn(submitted,'sourceNote')?submitted.sourceNote:prior.sourceNote);
      let aiPlaceholder;
      if(submitted.acceptedAsOwnerPrice===true)aiPlaceholder=false;
      else if(unchanged)aiPlaceholder=typeof prior.aiPlaceholder==='boolean'?prior.aiPlaceholder:AI_SOURCES.has(old?.source);
      else aiPlaceholder=!old&&AI_SOURCES.has(service.source);
      const row={};
      if(unchanged&&validInstant(prior.changedAt))row.changedAt=prior.changedAt;
      else if(!priorEntry||!unchanged)row.changedAt=now;
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
    const changedAt=entry.metadata?.changedAt,changed=validInstant(changedAt)?new Date(changedAt):null;
    if(changed&&instant.getTime()-changed.getTime()<=thresholdMs)return [];
    return [{
      path:entry.path,
      displayPath:entry.scope==='tier'?`tiers.${entry.tierIndex}.overrides.${entry.path}`:entry.path,
      tierName:entry.tierName||null,
      changedAt:changedAt||null,
      dateLabel:dateLabel(changedAt),
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
