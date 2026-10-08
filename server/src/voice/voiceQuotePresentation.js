import {quoteMoneyFormatter} from '../../quoteMoneyFormat.js';
// Customer-safe phone projection. Full written disclosures remain intact and
// separate from the short spoken summary; no price is recalculated or rounded.
export const VOICE_WRITTEN_LIMIT = 65_536;
export const VOICE_SUMMARY_LIMIT = 4_000;
export const VOICE_RESULT_BYTES = 262_144;
export const VOICE_SCOPE_FACT_LIMIT = 4_000;
export const VOICE_SCOPE_DETAIL_COUNT = 100;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, maximum = VOICE_WRITTEN_LIMIT) => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || value.length > maximum) throw new TypeError('Invalid voice disclosure.');
  return value.trim() || undefined;
};
const list = (value, maximum = 30) => {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > maximum) throw new TypeError('Invalid voice qualification list.');
  return value.map(item => text(item, 1000)).filter(Boolean);
};
const money = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;

// Validate the owner's presentation envelope before saving or approving it.
// Reserve space for measurements, engine disclosures, tax/currency and prices;
// count every possible scope detail so a later selection cannot exceed it.
export function voiceConfigurationIssues(service, definition) {
  const fields=definition?.customerFields||[];
  const details=[...new Set(fields.flatMap(field=>(field.presentationVariants||[]).flatMap(variant=>variant.details||[])))];
  const labels=fields.flatMap(field=>[field.label,...(field.presentationVariants||[]).map(variant=>variant.label)]).filter(Boolean);
  const names=[service.service,...(Array.isArray(service.tiers)?service.tiers:[]).map(tier=>tier?.name)].filter(value=>value!==undefined);
  const disclaimer=service.disclaimer||'';
  const issues=[];
  if(names.some(value=>typeof value!=='string'||value.length>200))issues.push('Keep service and price option names within 200 characters for the call and saved quote.');
  if(fields.length>64||labels.some(value=>typeof value!=='string'||value.length>VOICE_SCOPE_FACT_LIMIT)||details.length>VOICE_SCOPE_DETAIL_COUNT||details.some(value=>typeof value!=='string'||!value.trim()||value.length>VOICE_SCOPE_FACT_LIMIT))issues.push('The configured scope details exceed the complete call and saved-quote presentation limits. Split this work into separate services.');
  if(typeof disclaimer==='string'){
    const ownerText=[...details,...(definition?.offeringSummary||[])];
    const written=[...ownerText,...ownerText,...ownerText,...ownerText,...labels,...names,disclaimer,disclaimer,disclaimer,disclaimer].join(' ');
    if(written.length+16_384>VOICE_WRITTEN_LIMIT||Buffer.byteLength(written,'utf8')*3+65_536>VOICE_RESULT_BYTES)issues.push('The complete scope details and quote qualifications are too long for the call and saved quote. Shorten them or split this work into separate services; nothing will be truncated.');
  }
  return issues;
}
const scopeFacts = scope => {
  if(!record(scope)||!Array.isArray(scope.facts)||scope.facts.length>64)throw new TypeError('Invalid saved scope.');
  return [scope.service,...scope.facts.map(fact=>{
    if(!record(fact)||!text(fact.label,VOICE_SCOPE_FACT_LIMIT)||!['string','number','boolean'].includes(typeof fact.value))throw new TypeError('Invalid saved scope fact.');
    return text(fact.label+': '+String(fact.value),VOICE_SCOPE_FACT_LIMIT);
  })].filter(Boolean);
};
const scopeDetails = scope => {
  const details=[...new Set(scope.facts.flatMap(fact=>fact.details||[]))];
  if(details.length>VOICE_SCOPE_DETAIL_COUNT)throw new TypeError('Too many scope details.');
  return details.map(detail=>text(detail,VOICE_SCOPE_FACT_LIMIT)).filter(Boolean);
};

function optionProjection(option, index, parent = {}) {
  if (!record(option) || !money(option.lowEstimate) || !money(option.highEstimate) || option.lowEstimate > option.highEstimate) throw new TypeError('Invalid voice quote range.');
  const output = { tierName: text(option.tierName, 200) || 'Option ' + (index + 1), lowEstimate: option.lowEstimate, highEstimate: option.highEstimate };
  if (money(option.midEstimate)) output.midEstimate = option.midEstimate;
  // Each spoken option carries its own currency, tax and unit context; inherit
  // the quote-level value when the engine states it once for all options.
  for (const key of ['currency', 'taxTreatment', 'priceUnit']) {
    const value = text(option[key], 200) || text(parent?.[key], 200);
    if (value) output[key] = value;
  }
  output.skippedAddons = list(option.skippedAddons);
  const written = text(option.writtenDisclosure ?? option.disclaimer);
  if (written) output.writtenDisclosure = option.writtenDisclosure ?? option.disclaimer;
  return output;
}

export function conciseVoiceSummary(result) {
  const options = result.options?.length ? result.options : money(result.lowEstimate) && money(result.highEstimate) ? [result] : [];
  if (!options.length) return text(result.customerMessage, VOICE_SUMMARY_LIMIT) || 'The business needs to check the job details before giving an estimate.';
  const format=quoteMoneyFormatter(options.flatMap(option=>[option.lowEstimate,option.highEstimate]));
  const clean=value=>String(value||'').trim().replace(/[.!?]+$/, '');
  const sentence=value=>clean(value)?clean(value)+'.':'';
  const parts = options.map((option, index) => {
    const name = options.length > 1 ? (option.tierName || 'Option ' + (index + 1)) + ': ' : '';
    const price=[name+format.range(option.lowEstimate,option.highEstimate,' to '),clean(option.currency||result.currency),clean(option.priceUnit||result.priceUnit)].filter(Boolean).join(' ');
    const tax=sentence(option.taxTreatment||result.taxTreatment);
    const exclusions=option.skippedAddons?.length?sentence('Not included: '+option.skippedAddons.map(clean).join('; ')):'';
    return [sentence(price),tax,exclusions].filter(Boolean).join(' ');
  });
  parts.push('This is a preliminary estimate for the described work, not a final whole-job price. Final pricing is confirmed before work starts; changed scope or unforeseen conditions may change it.');
  if(result.optionAvailabilityNotice)parts.push(result.optionAvailabilityNotice);
  if (result.resultType === 'PARTIAL_ESTIMATE_READY' || result.additionalWork?.length) parts.push('Separate additional work is excluded and needs its own on-site estimate. A total for all requested work is not available.');
  parts.push('The full written estimate retains the scope qualifications and allowances for each option.');
  const summary = parts.join(' ');
  if (summary.length > VOICE_SUMMARY_LIMIT) throw new TypeError('Voice summary exceeds its bounded contract.');
  return summary;
}

export function projectVoiceQuote(response, quoteHandle, followUps = []) {
  const estimate = response?.resultType === 'PARTIAL_ESTIMATE_READY' ? response.pricedEstimate : response;
  const released = ['INSTANT_ESTIMATE_READY', 'PARTIAL_ESTIMATE_READY'].includes(response?.resultType);
  const output = { status: released ? 'quoted' : 'needs_details', quoteHandle, resultType: response?.resultType || 'ESTIMATE_REQUIRES_REVIEW' };
  if (released) {
    if(text(estimate?.optionAvailabilityNotice,2000))output.optionAvailabilityNotice=estimate.optionAvailabilityNotice;
    for (const key of ['lowEstimate', 'midEstimate', 'highEstimate']) if (money(estimate?.[key])) output[key] = estimate[key];
    for (const key of ['currency', 'taxTreatment', 'priceUnit']) if (text(estimate?.[key], 200)) output[key] = estimate[key];
    if (Array.isArray(estimate?.options) && estimate.options.length) {
      if (estimate.options.length > 3) throw new TypeError('At most three quote options are supported.');
      output.options = estimate.options.map((option, index) => optionProjection(option, index, estimate));
    }
    output.priceDrivers = list(estimate?.priceDrivers);
    output.skippedAddons = list(estimate?.skippedAddons);
  }
  const written = text(estimate?.disclaimer);
  if (written) output.writtenDisclosure = estimate.disclaimer;
  if (text(response?.customerMessage, 2000)) output.customerMessage = response.customerMessage;
  if (text(response?.additionalWorkStatus, 200)) output.additionalWorkStatus = response.additionalWorkStatus;
  if (Array.isArray(response?.additionalWork)) output.additionalWork = list(response.additionalWork.map(item => typeof item === 'string' ? item : item.description));
  if (followUps.length) output.followUps = list(followUps);
  if (record(response?.pricedScope)) {
    output.pricedScope = scopeFacts(response.pricedScope);
    output.scopeDetails = scopeDetails(response.pricedScope);
  }
  output.voiceSummary = conciseVoiceSummary(output);
  output.disclaimer = output.voiceSummary;
  if(released)output.quoteNarration=quoteNarration(output,response);
  if (Buffer.byteLength(JSON.stringify(output), 'utf8') > VOICE_RESULT_BYTES) throw new TypeError('Voice result exceeds its transport limit.');
  return output;
}

export function projectVoiceOptions(options) {
  if (!Array.isArray(options) || options.length === 0 || options.length > 3) throw new TypeError('Invalid voice quote options.');
  return options.map(optionProjection);
}

// Replay only frozen customer-facing facts. Never recalculate a historical
// quote, truncate its qualifications, or copy the owner's financial record.
export function projectSavedQuoteContext(response) {
  if(!record(response))throw new TypeError('Invalid saved quote.');
  const partial=response.resultType==='PARTIAL_ESTIMATE_READY';
  const range=partial?response.pricedEstimate:response;
  const out={};
  if(text(response.resultType,120))out.resultType=response.resultType;
  if(!['INSTANT_ESTIMATE_READY','PARTIAL_ESTIMATE_READY'].includes(response.resultType))return out;
  if(!record(range))throw new TypeError('Missing saved priced scope.');
  const prices=value=>{
    const view={};
    for(const key of ['lowEstimate','midEstimate','highEstimate'])if(money(value[key]))view[key]=value[key];
    for(const key of ['currency','tierName','taxTreatment','priceUnit']){
      const item=text(value[key],key==='taxTreatment'?2000:200);if(item)view[key]=item;
    }
    if(value.skippedAddons!==undefined)view.skippedAddons=list(value.skippedAddons);
    const written=value.writtenDisclosure??value.disclaimer;
    if(text(written))view.writtenDisclosure=written;
    return view;
  };
  Object.assign(out,prices(range));
  if(text(range.optionAvailabilityNotice,2000))out.optionAvailabilityNotice=range.optionAvailabilityNotice;
  if(Array.isArray(range.options)){
    const options=range.options.filter(record);
    if(options.length>5)throw new TypeError('Too many saved options.');
    out.options=options.map(option=>prices({...option,...Object.fromEntries(['currency','taxTreatment','priceUnit'].filter(key=>option[key]===undefined&&range[key]!==undefined).map(key=>[key,range[key]]))}));
  }else if(range.options!==undefined)throw new TypeError('Invalid saved options.');
  for(const key of ['customerMessage','additionalWorkStatus','scopeNotice'])if(text(response[key],key==='scopeNotice'?VOICE_WRITTEN_LIMIT:2000))out[key]=response[key];
  if(response.additionalWork!==undefined){
    if(!Array.isArray(response.additionalWork))throw new TypeError('Invalid saved additional work.');
    out.additionalWork=list(response.additionalWork.map(item=>{
      const description=typeof item==='string'?item:item?.description;
      if(!text(description,1000))throw new TypeError('Missing saved additional work description.');
      return description;
    }));
  }
  if(response.pricedScope!==undefined){
    out.pricedScope=scopeFacts(response.pricedScope);
    out.scopeDetails=scopeDetails(response.pricedScope);
  }
  if(partial)out.fullJobTotal=null;
  if(Buffer.byteLength(JSON.stringify(out),'utf8')>VOICE_RESULT_BYTES-16384)throw new TypeError('Saved quote exceeds voice budget.');
  return out;
}

// One complete script is presented on the call and frozen for email delivery.
function quoteNarration(projected,response) {
  if (projected.status !== 'quoted') return 'Your pricing request has been saved for review. No price has been confirmed.';
  const parts = [projected.voiceSummary];
  if (projected.pricedScope?.length) parts.push('Priced scope: ' + projected.pricedScope.join('; ') + '.');
  if (projected.scopeDetails?.length) parts.push('Scope details: ' + projected.scopeDetails.join('; ') + '.');
  if (projected.additionalWork?.length) parts.push('Separately unpriced work: ' + projected.additionalWork.join('; ') + '.');
  if (projected.customerMessage) parts.push(projected.customerMessage);
  if (text(response?.scopeNotice)) parts.push(response.scopeNotice);
  if (projected.writtenDisclosure) parts.push(projected.writtenDisclosure);
  for (const option of projected.options || []) {
    if (option.writtenDisclosure && option.writtenDisclosure !== projected.writtenDisclosure) {
      parts.push((projected.options.length > 1 ? option.tierName + ': ' : '') + option.writtenDisclosure);
    }
  }
  const narration=parts.join(' ');
  if(narration.length>VOICE_WRITTEN_LIMIT)throw new TypeError('Quote narration exceeds its bounded contract.');
  return narration;
}
