import {quoteMoneyFormatter} from '../../quoteMoneyFormat.js';
import {customerReceiptPresentation,validCustomerQuoteRange} from '../quoteScopeDisclosure.js';
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
const hasAmounts = value => ['lowEstimate','midEstimate','highEstimate'].some(key=>value[key]!==undefined);

// Validate the owner's presentation envelope before saving or approving it.
// Reserve space for measurements, engine disclosures, tax/currency and prices;
// count every possible scope detail so a later selection cannot exceed it.
export function voiceConfigurationIssues(service, definition) {
  const fields=definition?.customerFields||[];
  const details=[...new Set(fields.flatMap(field=>(field.presentationVariants||[]).flatMap(variant=>variant.details||[])))];
  const labels=fields.flatMap(field=>[field.label,...(field.presentationVariants||[]).map(variant=>variant.label)]).filter(Boolean);
  const names=[service.service,...(Array.isArray(service.tiers)?service.tiers:[]).map(tier=>tier?.name),...Object.values(service.pricing?.fenceOfferings||{}).flatMap(offer=>(offer.tiers||[]).map(t=>t?.name))].filter(value=>value!==undefined);
  const gateChoices=[...new Set(fields.filter(field=>field.type==='offering_counts').flatMap(field=>[...Object.values(field.options||{}),...(field.choiceVariants||[]).flatMap(v=>Object.values(v.options||{}))]))];
  const disclaimer=service.disclaimer||'';
  const issues=[];
  if(names.some(value=>typeof value!=='string'||value.length>200))issues.push('Keep service and price option names within 200 characters for the call and saved quote.');
  if(fields.length>64||labels.some(value=>typeof value!=='string'||value.length>VOICE_SCOPE_FACT_LIMIT)||details.length>VOICE_SCOPE_DETAIL_COUNT||details.some(value=>typeof value!=='string'||!value.trim()||value.length>VOICE_SCOPE_FACT_LIMIT))issues.push('The configured scope details exceed the complete call and saved-quote presentation limits. Split this work into separate services.');
  if(gateChoices.some(value=>typeof value!=='string'||!value.trim()||value.length>VOICE_SCOPE_FACT_LIMIT))issues.push('The complete gate choices exceed the call presentation limits. Shorten them or split this work into separate services; nothing will be truncated.');
  if(typeof disclaimer==='string'){
    const ownerText=[...details,...(definition?.offeringSummary||[])];
    // Selected gates appear in both the measured scope and its qualification.
    // Include every offered choice, not just the preview's one-gate scenarios.
    const written=[...ownerText,...ownerText,...ownerText,...ownerText,...gateChoices,...gateChoices,...labels,...names,disclaimer,disclaimer,disclaimer,disclaimer].join(' ');
    if(written.length+16_384>VOICE_WRITTEN_LIMIT||Buffer.byteLength(written,'utf8')*3+65_536>VOICE_RESULT_BYTES)issues.push('The complete scope details and quote qualifications are too long for the call and saved quote. Shorten them or split this work into separate services; nothing will be truncated.');
  }
  return issues;
}
const scopeLines = scope => {
  if(!record(scope)||!Array.isArray(scope.facts)||scope.facts.length>64)throw new TypeError('Invalid saved scope.');
  return [text(scope.service,VOICE_SCOPE_FACT_LIMIT),...scope.facts.map(fact=>{
    if(!record(fact)||!text(fact.label,VOICE_SCOPE_FACT_LIMIT)||!['string','number','boolean'].includes(typeof fact.value))throw new TypeError('Invalid saved scope fact.');
    return text(fact.label+': '+String(fact.value));
  })].filter(Boolean);
};
const scopeFacts = scope => {
  const parts=scopeLines(scope).flatMap(line=>{
    const chunks=[];
    for(let start=0;start<line.length;){
      let end=Math.min(start+VOICE_SCOPE_FACT_LIMIT,line.length);
      // The transport trims each string. Break inside text, away from spaces
      // and UTF-16 pairs, so it cannot discard a boundary character.
      while(end<line.length&&end>start&&
        (!line[end-1].trim()||!line[end].trim()||/[\uD800-\uDBFF]/.test(line[end-1])&&/[\uDC00-\uDFFF]/.test(line[end])))end--;
      if(end===start)throw new TypeError('Saved scope cannot be split without losing text.');
      chunks.push(line.slice(start,end));start=end;
    }
    return chunks;
  });
  if(parts.length>65)throw new TypeError('Saved scope exceeds the voice fact count.');
  return parts;
};
const scopeDetails = scope => {
  const details=[...new Set(scope.facts.flatMap(fact=>fact.details||[]))];
  if(details.length>VOICE_SCOPE_DETAIL_COUNT)throw new TypeError('Too many scope details.');
  return details.map(detail=>text(detail,VOICE_SCOPE_FACT_LIMIT)).filter(Boolean);
};

function optionProjection(option, index, parent = {}) {
  if (!validCustomerQuoteRange(option)) throw new TypeError('Invalid voice quote range.');
  const output = { tierName: text(option.tierName, 200) || 'Option ' + (index + 1), lowEstimate: option.lowEstimate, highEstimate: option.highEstimate };
  if (money(option.midEstimate)) output.midEstimate = option.midEstimate;
  // Each spoken option carries its own currency, tax and unit context; inherit
  // the quote-level value when the engine states it once for all options.
  for (const key of ['currency', 'taxTreatment', 'priceUnit']) {
    const value = text(option[key], 200) || text(parent?.[key], 200);
    if (value) output[key] = value;
  }
  if(option.firstVisit!==undefined){if(!record(option.firstVisit)||Object.hasOwn(option.firstVisit,'firstVisit'))throw new TypeError('Invalid first-visit quote.');output.firstVisit=optionProjection(option.firstVisit,index,parent);}
  output.skippedAddons = list(option.skippedAddons);
  const written = text(option.writtenDisclosure ?? option.disclaimer);
  if (written) output.writtenDisclosure = option.writtenDisclosure ?? option.disclaimer;
  return output;
}

export function conciseVoiceSummary(result) {
  const options = result.options?.length ? result.options : money(result.lowEstimate) && money(result.highEstimate) ? [result] : [];
  if (!options.length) return text(result.customerMessage, VOICE_SUMMARY_LIMIT) || 'The business needs to check the job details before giving an estimate.';
  const format=quoteMoneyFormatter(options.flatMap(option=>[option.lowEstimate,option.highEstimate,...(option.firstVisit?[option.firstVisit.lowEstimate,option.firstVisit.highEstimate]:[])]));
  const clean=value=>String(value||'').trim().replace(/[.!?]+$/, '');
  const sentence=value=>clean(value)?clean(value)+'.':'';
  const parts = options.map((option, index) => {
    const name = options.length > 1 ? (option.tierName || 'Option ' + (index + 1)) + ': ' : '';
    const price=[name+(option.firstVisit?'Recurring: ':'')+format.range(option.lowEstimate,option.highEstimate,' to '),clean(option.currency||result.currency),clean(option.priceUnit||result.priceUnit)].filter(Boolean).join(' ');
    const tax=sentence(option.taxTreatment||result.taxTreatment);
    const exclusions=option.skippedAddons?.length?sentence('Not included: '+option.skippedAddons.map(clean).join('; ')):'';
    const first=option.firstVisit,firstPrice=first?sentence(['First visit: '+format.range(first.lowEstimate,first.highEstimate,' to '),clean(first.currency||option.currency||result.currency)].filter(Boolean).join(' ')):'';
    return [sentence(price),firstPrice,tax,exclusions].filter(Boolean).join(' ');
  });
  if(options.some(option=>String(option.writtenDisclosure||option.disclaimer||'').includes('The load count is estimated from yard size')))parts.push('The load count is estimated from yard size and will be confirmed on site.');
  if(result.callerMeasurementsEstimated===true)parts.push('This price is based on the measurements you gave us. The business will confirm them on site.');
  parts.push('This is a preliminary estimate for the described work, not a final whole-job price. Final pricing is confirmed before work starts; changed scope or unforeseen conditions may change it.');
  if(result.optionAvailabilityNotice)parts.push(result.optionAvailabilityNotice);
  if (result.resultType === 'PARTIAL_ESTIMATE_READY' || result.additionalWork?.length) parts.push('Separate additional work is excluded and needs its own on-site estimate. A total for all requested work is not available.');
  parts.push('The full written estimate retains the scope qualifications and allowances for each option.');
  const summary = parts.join(' ');
  if (summary.length > VOICE_SUMMARY_LIMIT) throw new TypeError('Voice summary exceeds its bounded contract.');
  return summary;
}

// The short script a caller hears. Built only from the engine's own projected
// fields (amounts, tax treatment, currency, unit, exclusions, drivers); the full
// written quoteNarration stays the email and dashboard copy.
const SPOKEN_TAX=Object.freeze({
  'Includes applicable tax.':{single:'tax included',group:'with tax included'},
  'Tax excluded; added to the invoice.':{single:'plus tax',group:'plus tax'},
  'No tax added.':{single:'with no tax added',group:'with no tax added'}
});
const CURRENCY_NAMES=Object.freeze({CAD:'Canadian dollars',USD:'US dollars'});
const ENGINE_UNPRICED_WORK=new Set(['unpriced_surface_work','unpriced_requested_work']);
// Owner wording (2026-11-12). Travel: the customer quote carries no travel
// amount, so the confirmation sentence is the only travel sentence. Work month:
// the engine's busy-season note when no work month was given.
const SPOKEN_NOTES=Object.freeze([
  {written:/\bthe business will confirm the travel charge\b/,spoken:'The travel charge for your area gets confirmed by the business.'},
  {written:/\bPriced at the busy-season rate because no work month was given\. The price is lower if the work is scheduled outside [^.]+\./,spoken:'The price is lower outside the busy months.'}
]);
const spokenClean=value=>String(value||'').trim().replace(/[.!?;:,]+$/,'').trim();
// Lower-case only an ordinary capitalized first word, so "Base gravel" reads
// mid-sentence while acronyms and codes keep their capitals.
const midSentence=value=>/^[A-Z][a-z]/.test(value)?value[0].toLowerCase()+value.slice(1):value;
const spokenList=items=>items.length<2?items.join(''):items.slice(0,-1).join(', ')+' and '+items.at(-1);
function spokenAmount(value){return quoteMoneyFormatter([value]).amount(value);}
function spokenRange(option){
  const range=option.lowEstimate===option.highEstimate?spokenAmount(option.lowEstimate):spokenAmount(option.lowEstimate)+' to '+spokenAmount(option.highEstimate);
  const unit=spokenClean(option.priceUnit);
  return unit&&unit!=='per job'?range+' '+unit:range;
}
function spokenTax(option,result){
  const value=text(option.taxTreatment,2000)||text(result.taxTreatment,2000);
  return value?{value,phrase:SPOKEN_TAX[value]}:null;
}
export function spokenVoiceQuote(result,{businessCurrency,measured=false}={}) {
  const options=result.options?.length?result.options:[result];
  if(!options.length||options.length>3||options.some(option=>!validCustomerQuoteRange(option)))throw new TypeError('Invalid spoken quote range.');
  const many=options.length>1,sentences=[];
  const taxes=options.map(option=>spokenTax(option,result));
  const sameTax=taxes.every(tax=>tax?.value===taxes[0]?.value);
  // A treatment without a spoken phrase is still said, word for word.
  const unspokenTaxes=[...new Set(taxes.filter(tax=>tax&&!tax.phrase).map(tax=>tax.value))];
  if(!many){
    const tax=taxes[0]?.phrase?', '+taxes[0].phrase.single:'';
    sentences.push("For that, you're looking at "+spokenRange(options[0])+tax+'.');
  }else{
    const prices=options.map((option,index)=>{
      const name=spokenClean(option.tierName)||'Option '+(index+1);
      return name+' is '+spokenRange(option)+(!sameTax&&taxes[index]?.phrase?' '+taxes[index].phrase.group:'');
    });
    const group=sameTax&&taxes[0]?.phrase?', '+(options.length===2?'both':'all')+' '+taxes[0].phrase.group:'';
    sentences.push('I can do that '+(options.length===2?'two':'three')+' ways. '+spokenList(prices)+group+'.');
  }
  sentences.push(...unspokenTaxes.map(value=>spokenClean(value)+'.'));
  const firstVisits=options.map((option,index)=>option.firstVisit&&validCustomerQuoteRange(option.firstVisit)?{name:spokenClean(option.tierName)||'Option '+(index+1),price:spokenRange({...option.firstVisit,priceUnit:undefined})}:null).filter(Boolean);
  if(!many&&!firstVisits.length&&result.firstVisit&&validCustomerQuoteRange(result.firstVisit))firstVisits.push({price:spokenRange({...result.firstVisit,priceUnit:undefined})});
  if(firstVisits.length)sentences.push('The first visit is '+(many?spokenList(firstVisits.map(visit=>visit.price+' for '+visit.name)):firstVisits[0].price)+'.');
  // Dollars are said without a currency code unless the quote is in a
  // currency other than the business's own default.
  const foreign=[...new Set(options.map(option=>text(option.currency,200)||text(result.currency,200)).filter(code=>code&&businessCurrency&&code!==businessCurrency))];
  if(foreign.length){
    const name=code=>CURRENCY_NAMES[code]||code;
    if(!many)sentences.push("That's in "+name(foreign[0])+'.');
    else if(foreign.length===1&&options.every(option=>(text(option.currency,200)||text(result.currency,200))===foreign[0]))sentences.push('Those are in '+name(foreign[0])+'.');
    else sentences.push(...options.flatMap((option,index)=>{const code=text(option.currency,200)||text(result.currency,200);return code&&code!==businessCurrency?[(spokenClean(option.tierName)||'Option '+(index+1))+' is in '+name(code)+'.']:[];}));
  }
  const estimated=result.callerMeasurementsEstimated===true;
  if(many)sentences.push(estimated?"That's all based on the measurements you gave me, and it all gets confirmed on site before any work starts.":'It all gets confirmed on site before any work starts.');
  else sentences.push(estimated||measured?"That's based on the measurements you gave me, and it gets confirmed on site before any work starts.":'It gets confirmed on site before any work starts.');
  const spoken={spokenPrice:sentences.join(' ')};
  // Exclusions: work the caller asked for that this price leaves out. Engine
  // labels are named; separate work the caller described is not repeated in
  // anyone's words.
  const optionExclusions=options.map(option=>[...new Set((option.skippedAddons||[]).map(spokenClean).filter(Boolean))]);
  const shared=optionExclusions[0].filter(item=>optionExclusions.every(items=>items.includes(item)));
  // The engine states exclusions per option; a quote without options is its own single option.
  const whole=[...new Set([...shared,...(result.engineAdditionalWork||[]).map(spokenClean)].filter(Boolean))];
  const exclusions=[];
  if(whole.length)exclusions.push("Just so you know, that doesn't include "+spokenList(whole.map(midSentence))+'.');
  if(many)options.forEach((option,index)=>{
    const own=optionExclusions[index].filter(item=>!whole.includes(item));
    if(own.length)exclusions.push('Just so you know, '+(spokenClean(option.tierName)||'Option '+(index+1))+" doesn't include "+spokenList(own.map(midSentence))+'.');
  });
  if(result.callerDeclaredWork===true)exclusions.push("Just so you know, that doesn't include the other work you mentioned.");
  if(exclusions.length)spoken.spokenExclusions=exclusions.join(' ');
  // Notes: fixed sentences, each said only when the engine's written quote
  // carries that note. The written wording itself is never read on the call.
  const written=[result.writtenDisclosure,...options.flatMap(option=>[option.writtenDisclosure,option.firstVisit?.writtenDisclosure])].filter(value=>typeof value==='string');
  const notes=SPOKEN_NOTES.filter(note=>written.some(value=>note.written.test(value))).map(note=>note.spoken);
  if(notes.length)spoken.spokenNotes=notes.join(' ');
  // Drivers: at most two of the engine's ranked factors. Full-sentence
  // disclosures in that list are qualifications, not factors.
  const drivers=(result.priceDrivers||[]).map(value=>String(value).trim()).filter(value=>value&&!/[.!?;]$/.test(value)).slice(0,2).map(value=>midSentence(spokenClean(value)));
  if(drivers.length)spoken.spokenDrivers=drivers.length===1?'The biggest factor is '+drivers[0]+'.':'The biggest factors are '+drivers[0]+' and '+drivers[1]+'.';
  for(const value of Object.values(spoken))if(value.length>VOICE_SUMMARY_LIMIT)throw new TypeError('Spoken quote exceeds its bounded contract.');
  return spoken;
}

export function projectVoiceQuote(response, quoteHandle, followUps = [], {callerMeasurementsEstimated=false,businessCurrency,measured=false}={}) {
  response=customerReceiptPresentation(response);
  const estimate = response?.resultType === 'PARTIAL_ESTIMATE_READY' ? response.pricedEstimate : response;
  const released = ['INSTANT_ESTIMATE_READY', 'PARTIAL_ESTIMATE_READY'].includes(response?.resultType);
  const output = { status: released ? 'quoted' : 'needs_details', quoteHandle, resultType: response?.resultType || 'ESTIMATE_REQUIRES_REVIEW' };
  if(callerMeasurementsEstimated===true)output.callerMeasurementsEstimated=true;
  if (released) {
    if(!record(estimate)||hasAmounts(estimate)&&!validCustomerQuoteRange(estimate))throw new TypeError('Invalid voice quote range.');
    if(estimate.options!==undefined&&!Array.isArray(estimate.options))throw new TypeError('Invalid voice quote options.');
    if(text(estimate?.optionAvailabilityNotice,2000))output.optionAvailabilityNotice=estimate.optionAvailabilityNotice;
    for (const key of ['lowEstimate', 'midEstimate', 'highEstimate']) if (money(estimate?.[key])) output[key] = estimate[key];
    for (const key of ['currency', 'taxTreatment', 'priceUnit']) if (text(estimate?.[key], 200)) output[key] = estimate[key];
    if (Array.isArray(estimate?.options) && estimate.options.length) {
      if (estimate.options.length > 3) throw new TypeError('At most three quote options are supported.');
      output.options = estimate.options.map((option, index) => optionProjection(option, index, estimate));
    }
    if(!validCustomerQuoteRange(estimate)&&!output.options?.length)throw new TypeError('Missing voice quote range.');
    if(estimate?.firstVisit!==undefined)output.firstVisit=optionProjection(estimate.firstVisit,0,estimate);
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
  if(released){
    const work=Array.isArray(response?.additionalWork)?response.additionalWork:[];
    const engineWork=work.filter(item=>record(item)&&ENGINE_UNPRICED_WORK.has(item.source)).map(item=>item.description);
    output.spokenQuote=spokenVoiceQuote({...output,engineAdditionalWork:engineWork,callerDeclaredWork:work.length>engineWork.length},{businessCurrency,measured});
  }
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
  response=customerReceiptPresentation(response);
  const partial=response.resultType==='PARTIAL_ESTIMATE_READY';
  const range=partial?response.pricedEstimate:response;
  const out={};
  if(text(response.resultType,120))out.resultType=response.resultType;
  if(!['INSTANT_ESTIMATE_READY','PARTIAL_ESTIMATE_READY'].includes(response.resultType))return out;
  if(!record(range))throw new TypeError('Missing saved priced scope.');
  const prices=(value,required=false)=>{
    if((required||hasAmounts(value))&&!validCustomerQuoteRange(value))throw new TypeError('Invalid saved quote range.');
    const view={};
    for(const key of ['lowEstimate','midEstimate','highEstimate'])if(money(value[key]))view[key]=value[key];
    for(const key of ['currency','tierName','taxTreatment','priceUnit']){
      const item=text(value[key],key==='taxTreatment'?2000:200);if(item)view[key]=item;
    }
    if(value.firstVisit!==undefined){if(!record(value.firstVisit)||Object.hasOwn(value.firstVisit,'firstVisit'))throw new TypeError('Invalid saved first visit.');view.firstVisit=prices(value.firstVisit,true);}
    if(value.skippedAddons!==undefined)view.skippedAddons=list(value.skippedAddons);
    const written=value.writtenDisclosure??value.disclaimer;
    if(text(written))view.writtenDisclosure=written;
    return view;
  };
  Object.assign(out,prices(range));
  if(text(range.optionAvailabilityNotice,2000))out.optionAvailabilityNotice=range.optionAvailabilityNotice;
  if(Array.isArray(range.options)){
    // D15: ignore non-record optional junk, but never publish a malformed range
    // from a record that purports to be a priced option.
    const options=range.options.filter(record);
    if(options.length>5)throw new TypeError('Too many saved options.');
    out.options=options.map(option=>prices({...option,...Object.fromEntries(['currency','taxTreatment','priceUnit'].filter(key=>option[key]===undefined&&range[key]!==undefined).map(key=>[key,range[key]]))},true));
  }else if(range.options!==undefined)throw new TypeError('Invalid saved options.');
  if(!validCustomerQuoteRange(range)&&!out.options?.length)throw new TypeError('Missing saved quote range.');
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
  // The transport may split a long fact; the frozen script keeps its exact
  // original text without inserting punctuation inside a gate description.
  if (projected.pricedScope?.length) parts.push('Priced scope: ' + scopeLines(response.pricedScope).join('; ') + '.');
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
