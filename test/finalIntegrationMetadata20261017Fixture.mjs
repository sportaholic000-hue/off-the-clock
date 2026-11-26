import assert from 'node:assert/strict';
import {ENGINE_VERSION} from '../server/quote-engine-vnext/engine.js';
import {CONCRETE_OWNER_DECISIONS} from './ownerDecisionsFixture.mjs';
import {PACKAGE_PURCHASE_TYPES} from '../server/quote-engine-vnext/packagePurchasing.js';
import {REMOVAL_AGE_TYPES} from '../server/quote-engine-vnext/buildingAgeRules.js';
import {withLaneDAnswers} from '../verification/engine-independent/fixtures.mjs';
import {offeringDisclosures} from '../server/quote-engine-vnext/configuredOfferings.js';

// Nonbehavioral expectation reconciliation against exact base 56e19419.
// The original everytrade fixture is retained. Never alter prices, quantities,
// customer copy, eligibility, or input scope here: only the private evidence
// representation already approved on the painting/flooring branches differs.
export function integratedBaselineExpectation(row) {
  const result=structuredClone(row.result),type=row.input.serviceType;
  // The frozen v7 evidence stays intact. Only these known live-result metadata
  // paths advance; every price, scope and other assertion still compares fully.
  assert.equal(ENGINE_VERSION,'quote-engine-vnext-accuracy-20261126-v59');
  const advanceVersion=record=>{
    assert.equal(record.engineVersion,'quote-engine-vnext-date-context-20261006-v7');
    record.engineVersion=ENGINE_VERSION;
  };
  advanceVersion(result);
  if(result.calculationRecord)advanceVersion(result.calculationRecord);
  // Tile and carpet answers (fixes D1 and D3, November 19, 2026): the pinned jobs
  // answer what the floor is built on and the room sizes (withLaneDAnswers), and
  // the quote echoes those answers. Only the echoed answers advance; every
  // price, review reason and other field still compares fully.
  const floorAnswers=type.startsWith('FLOORING_')?withLaneDAnswers(row.input).customerInputs:null;
  const floorAdded=floorAnswers?Object.keys(floorAnswers).filter(k=>!Object.hasOwn(row.input.customerInputs,k)):[],floorRemoved=floorAnswers?Object.keys(row.input.customerInputs).filter(k=>!Object.hasOwn(floorAnswers,k)):[];
  const echoFloor=(inputs,normalized)=>{if(!floorAnswers||!inputs||typeof inputs!=='object')return;for(const k of floorAdded)inputs[k]=structuredClone(floorAnswers[k]);for(const k of floorRemoved)delete inputs[k];
    // The engine names the room route it read the carpet from.
    if(normalized&&floorAdded.includes('carpetRooms'))inputs.carpetMeasurementMethod='rooms';};
  echoFloor(result.submittedCustomerInputs,false);
  // A pinned review result also echoes them in its normalized scope and lists
  // carpet room sizes among its validated measurements.
  for(const holder of [result,...(result.failedTierDiagnostics||[])]){
    if(holder.normalizedScope)echoFloor(holder.normalizedScope,true);
    if(floorAnswers&&Array.isArray(holder.validatedMeasurements)&&floorAdded.includes('carpetRooms'))holder.validatedMeasurements.push({name:'carpetRooms',value:structuredClone(floorAnswers.carpetRooms),unit:'feet'});
  }
  if(!result.options)return result;
  for(const option of result.options)advanceVersion(option.calculationRecord);
  for(const record of result.calculationRecord.options)advanceVersion(record);
  const records=[...result.options.map(o=>o.calculationRecord),...result.calculationRecord.options];
  for(const record of records)echoFloor(record.normalizedCustomerInputs,false);
  if(type.startsWith('FLOORING_'))for(const record of records){
    assert.equal(row.input.customerInputs.layoutPattern,'straight');
    const at=record.quantityDerivations.findIndex(d=>d.name==='averageRoomSqft');
    assert.ok(at>=0);
    record.quantityDerivations.splice(at,0,{evidenceVariant:'derived_quantity',name:'flooringPatternLaborAdjustment',formula:'selected owner pattern labor adjustment',inputs:{factorPath:'layoutLaborMultiplier.straight'},result:1,exactResult:{numerator:'1',denominator:'1'},unit:'multiplier',usedBy:['Flooring labor']});
  }
  if(type==='INTERIOR_PAINTING'||type==='EXTERIOR_PAINTING'){
    const mode=row.input.ownerPricing.pricing.offeringMode;
    const lines=[...result.lineItems,...result.options.flatMap(o=>o.lineItems),...records.flatMap(r=>[...r.lineItems,...Object.values(r.scenarios).flatMap(s=>s.lineItems)])];
    if(mode==='installed'&&type==='INTERIOR_PAINTING')for(const line of lines)if(['offeringRates.installedWallPerSqft','offeringRates.installedCeilingPerSqft'].includes(line.calculation.ratePath))line.surfaceHeightBand='standard';
    if(mode==='itemized'){
      for(const line of lines)for(const factor of line.calculation.multipliers||[])if(/^offeringRates\.(wallLabor|primerLabor|ceilingLabor|ceilingPrimerLabor)PerSqftPerCoat$/.test(line.calculation.ratePath)&&factor.path==='wallHeightLaborMultiplier.standard'){
        assert.equal(factor.name,'Labor adjustment');assert.equal(factor.value,1);factor.name='Wall-height labor';
      }
      for(const record of records){
        const labor=record.quantityDerivations.filter(d=>/^(wallLabor|primerLabor|ceilingLabor|ceilingPrimerLabor)PerSqftPerCoatQuantity$/.test(d.name));
        for(const d of labor)assert.equal(d.formula,'measuredAreaSqft * definedCoats');
        record.measurements=[...labor.map(d=>({name:d.name.replace(/Quantity$/,''),value:d.result,unit:d.unit,source:'confirmed_offering_scope'})),...record.measurements];
        record.quantityDerivations=record.quantityDerivations.filter(d=>!labor.includes(d));
      }
    }
  }
  // Wall area driver (fix E6, November 19, 2026): the driver states the measured
  // wall area, not paintable wall area. Only that text advances; prices are unchanged.
  if(type==='INTERIOR_PAINTING'||type==='EXTERIOR_PAINTING'){
    const wallArea=value=>{if(Array.isArray(value))value.forEach((v,i)=>{if(typeof v==='string'&&/^\S+ measured square feet of paintable wall area$/.test(v))value[i]=v.replace(' of paintable wall area',' of wall area');else wallArea(v);});else if(value&&typeof value==='object')for(const [k,v] of Object.entries(value)){if(typeof v==='string'&&/^\S+ measured square feet of paintable wall area$/.test(v))value[k]=v.replace(' of paintable wall area',' of wall area');else wallArea(v);}};
    wallArea(result);
  }
  // Waste-adjusted quantity labels (October 27, 2026 audit fix): only the unit
  // text of lines whose recorded derivation applied an owner waste factor, and
  // of that derivation, advances. Quantities and amounts still compare fully.
  const wasteUnit=unit=>'waste-adjusted '+unit.replace(/^measured /,'');
  const wasted=new Set(records.flatMap(record=>(record.quantityDerivations||[]).filter(d=>d.formula==='measured quantity * (1 + owner material waste)'&&d.inputs?.wastePath).map(d=>{d.unit=wasteUnit(d.unit);return d.usedBy[0];})));
  const allLines=[...(result.lineItems||[]),...result.options.flatMap(o=>o.lineItems||[]),...records.flatMap(r=>[...(r.lineItems||[]),...Object.values(r.scenarios||{}).flatMap(s=>s.lineItems||[])])];
  for(const line of allLines)if(wasted.has(line.name)&&typeof line.calculation?.unit==='string')line.calculation.unit=wasteUnit(line.calculation.unit);
  // Fence post formula text (October 28, 2026): the printed total-length
  // formula now states the count the engine uses. The count is unchanged.
  const fenceFormula='ceil(total length / spacing) - 1 + 2 * open runs + corners + 2 * gates without included posts';
  const walk=value=>{if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')for(const [k,v] of Object.entries(value)){if(k==='formula'&&v==='ceil(total length / spacing) + 1 + corners + separate gate posts + 2 * (runs - 1)')value[k]=fenceFormula;else walk(v);}};
  if(type.startsWith('FENCING_'))walk(result);
  // Fence allowance note (fix D6, November 19, 2026): an installed fence price
  // does not count posts, so it no longer carries the post-quantity allowance
  // note. Only that sentence goes; prices are unchanged.
  if(type.startsWith('FENCING_')&&row.input.ownerPricing.pricing.offeringMode==='installed'&&row.input.customerInputs.fenceRuns===undefined){
    const sentence=/^Post quantities use the total-length allowance for \d+ separate fence run\(s\)\.$/,inText=/Post quantities use the total-length allowance for \d+ separate fence run\(s\)\. /;
    const drop=value=>{if(Array.isArray(value)){for(let i=value.length-1;i>=0;i--){if(typeof value[i]==='string'&&sentence.test(value[i]))value.splice(i,1);else drop(value[i]);}}
      else if(value&&typeof value==='object')for(const [k,v] of Object.entries(value)){if(typeof v==='string'&&inText.test(v))value[k]=v.replace(inText,'');else drop(v);}};
    drop(result);
  }
  // Fence wording (second audit of v51, November 26, 2026): the gate and
  // post-quantity sentences read naturally. Only the words change; prices and
  // every other field still compare fully.
  if(type.startsWith('FENCING_')){
    const reword=text=>text
      .replace(/Post and panel quantities use the total-length allowance for (\d+) separate fence run\(s\); both counts are confirmed on site\./g,(m,n)=>`Post and panel quantities are estimated from the total fence length for ${n} separate fence run${n==='1'?'':'s'} and are confirmed on site.`)
      .replace(/Post quantities use the total-length allowance for (\d+) separate fence run\(s\)\./g,(m,n)=>`Post quantities are estimated from the total fence length for ${n} separate fence run${n==='1'?'':'s'} and are confirmed on site.`)
      .replace(/(\d+) (\d+(?:\.\d+)?) ft gate\(s\): /g,(m,count,width)=>count==='1'?`1 gate, ${width} ft wide: `:`${count} gates, ${width} ft wide each: `)
      // Third audit of v51: the removal sentence ends with the on-site check.
      .replace(/(Removal: .*?(?:Disposal is included\.|Disposal is not included in the removal price\.))(?! A different existing fence)/g,'$1 A different existing fence is confirmed on site.');
    const walkText=value=>{if(Array.isArray(value)){value.forEach((v,i)=>{if(typeof v==='string')value[i]=reword(v);else walkText(v);});}
      else if(value&&typeof value==='object')for(const [k,v] of Object.entries(value)){if(typeof v==='string')value[k]=reword(v);else walkText(v);}};
    walkText(result);
  }
  // Flat-roof detail disclosure (October 29, 2026 audit fix): a flat-roof
  // replacement now names the roof details its price leaves out. These pinned
  // books price none of them, so every detail is listed. Prices are unchanged.
  if(type==='FLAT_ROOF_REPLACEMENT'){
    const notice='Not included; confirmed and priced on site: perimeter edge metal or coping, wall and parapet base flashing, pipe flashings and other penetrations, curbs, drains, deck replacement.';
    const add=value=>{if(Array.isArray(value))value.forEach(add);else if(value&&typeof value==='object'){
      if(Array.isArray(value.disclosures)){assert.deepEqual(value.disclosures,[]);value.disclosures=[notice];}
      if(typeof value.disclaimer==='string'){assert.ok(value.disclaimer.endsWith(' No tax added.'));value.disclaimer=value.disclaimer.replace(/ No tax added\.$/,' '+notice+' No tax added.');}
      for(const [k,v] of Object.entries(value))if(k!=='disclosures')add(v);
    }};
    add(result);
  }
  // Concrete owner decisions (October 29, 2026): the pinned book quotes with
  // the thickness range, forming and isolation choices that keep its pricing;
  // the internal record echoes them. Prices are unchanged.
  if(type.startsWith('CONCRETE_')){
    const echo=value=>{if(Array.isArray(value))value.forEach(echo);else if(value&&typeof value==='object'){if(value.ownerConfiguration?.pricing)Object.assign(value.ownerConfiguration.pricing,CONCRETE_OWNER_DECISIONS);for(const v of Object.values(value))echo(v);}};
    echo(result);
    // A blank chute answer is priced and disclosed as Not sure (October 29, 2026).
    if(row.input.customerInputs.chuteAccess===undefined&&result.resultType==='INSTANT_ESTIMATE_READY'){
      const note="This price assumes the concrete truck's chute can reach the pour. Pumping or other placement is not included and would be priced on site.";
      const add=value=>{if(Array.isArray(value))value.forEach(add);else if(value&&typeof value==='object'){
        if(Array.isArray(value.disclosures)){assert.deepEqual(value.disclosures,[]);value.disclosures=[note];}
        // Recorded as the calculation's assumption too (November 15, 2026).
        if(Array.isArray(value.assumptions)){assert.deepEqual(value.assumptions,[]);value.assumptions=[{name:'chutePlacement',statement:note,inputs:{chuteAccess:null}}];}
        if(typeof value.disclaimer==='string'){assert.ok(value.disclaimer.endsWith(' No tax added.'));value.disclaimer=value.disclaimer.replace(/ No tax added\.$/,' '+note+' No tax added.');}
        for(const [k,v] of Object.entries(value))if(k!=='disclosures')add(v);
      }};
      add(result);
    }
  }
  // Roof tear-off is quoted with testing for asbestos and lead paint excluded,
  // stated last before the tax sentence (November 17, 2026). Prices are unchanged.
  if(['ROOFING_REPLACEMENT','FLAT_ROOF_REPLACEMENT'].includes(type)&&result.resultType==='INSTANT_ESTIMATE_READY'){
    const note='Removal does not include testing for or removing asbestos or lead paint. Older roofing can contain them; if found, that work is priced separately.';
    const tearOff=JSON.stringify(result).includes('"ratePath":"tearOffPer');
    const add=value=>{if(Array.isArray(value))value.forEach(add);else if(value&&typeof value==='object'){
      if(Array.isArray(value.disclosures))value.disclosures=[...value.disclosures,note];
      if(typeof value.disclaimer==='string'){const m=value.disclaimer.match(/ (No tax added\.|Includes applicable tax\.)$/);assert.ok(m,value.disclaimer);value.disclaimer=value.disclaimer.slice(0,m.index)+' '+note+m[0];}
      for(const [k,v] of Object.entries(value))if(k!=='disclosures')add(v);
    }};
    if(tearOff)add(result);
  }
  // Re-audit fixes (October 30, 2026). The pinned books quote with the owner
  // choices that keep their pricing (exact quantity for materials bought in
  // packages; removal quoted with testing excluded), and the internal record
  // echoes them. Prices are unchanged.
  const echoPricing=fields=>{const walk=value=>{if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object'){if(value.ownerConfiguration?.pricing)Object.assign(value.ownerConfiguration.pricing,fields);for(const v of Object.values(value))walk(v);}};walk(result);};
  if(PACKAGE_PURCHASE_TYPES.includes(type))echoPricing({partialPackagePricing:'exact_quantity'});
  if(REMOVAL_AGE_TYPES.includes(type))echoPricing({olderMaterialRemoval:'exclude'});
  // Fix B10 (Lane B, November 19, 2026): the pinned flat-roof books predate the
  // "Insulation and cover board waste" quantity assumption; they quote with its 7%
  // starting value filled, as the price book fills it at load. It applies only to
  // itemized insulation and cover board material, which these books do not price.
  if(type==='FLAT_ROOF_REPLACEMENT')echoPricing({insulationWasteFactor:0.07});
  // A concrete quote states the owner's mix, before the finish.
  if(type.startsWith('CONCRETE_')&&result.resultType==='INSTANT_ESTIMATE_READY'){
    const walk=value=>{if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object'){
      if(Array.isArray(value.priceDrivers)){const at=value.priceDrivers.indexOf('broom finish');assert.ok(at>=0);value.priceDrivers.splice(at,0,'Concrete mix: '+CONCRETE_OWNER_DECISIONS.concreteMixDescription);}
      for(const [k,v] of Object.entries(value))if(k!=='priceDrivers')walk(v);
    }};
    walk(result);
  }
  // Flat-roof details priced on site make the quote partial: each is a
  // skipped add-on with its applied rule. The disclosure is unchanged.
  if(type==='FLAT_ROOF_REPLACEMENT'){
    const labels=['Perimeter edge metal or coping','Wall and parapet base flashing','Pipe flashings and other penetrations','Curbs','Drains','Deck replacement'];
    for(const option of result.options){assert.deepEqual(option.skippedAddons,[]);option.skippedAddons=[...labels];}
    for(const record of records){assert.deepEqual(record.customerProjection.skippedAddons,[]);record.customerProjection.skippedAddons=[...labels];}
    assert.deepEqual(result.appliedRules,[]);result.appliedRules=labels.map(label=>label+' excluded: confirmed and priced on site');
  }
  // Painting year-built question (October 29, 2026): the pinned books quote
  // with prices that cover lead-safe work, and the internal record echoes that
  // choice. Prices are unchanged.
  if(type==='INTERIOR_PAINTING'||type==='EXTERIOR_PAINTING'){
    const echo=value=>{if(Array.isArray(value))value.forEach(echo);else if(value&&typeof value==='object'){if(value.ownerConfiguration?.pricing)value.ownerConfiguration.pricing={leadSafePainting:'included',...value.ownerConfiguration.pricing};for(const v of Object.values(value))echo(v);}};
    echo(result);
  }
  // Control joints (third audit of v51, November 26, 2026): a concrete book
  // with no control-joint setting now tells the customer they are included,
  // just before the chute sentence. Prices are unchanged.
  // Since the new-issues audit of v53 an explicit 'included' setting says so too.
  if(type.startsWith('CONCRETE_')&&row.input.ownerPricing.pricing.controlJointPricing!=='excluded'){
    const joint='Control joints are included in the slab price.',chute="This price assumes the concrete truck's chute";
    const addJoint=value=>{if(Array.isArray(value)){const at=value.findIndex(v=>typeof v==='string'&&v.startsWith(chute));if(at>=0&&!value.includes(joint))value.splice(at,0,joint);value.forEach(addJoint);}
      else if(value&&typeof value==='object')for(const [k,v] of Object.entries(value)){if(k==='disclaimer'&&typeof v==='string'&&v.includes(chute)&&!v.includes(joint))value[k]=v.replace(chute,joint+' '+chute);else addJoint(v);}};
    addJoint(result);
  }
  // Quote wording (new-issues audit of v53): coat counts read "1 coat" or
  // "2 coats", and an offering sentence typed without an ending period is
  // followed by one in the joined quote text. Prices are unchanged.
  {
    const coats=text=>text.replace(/(\d+) ((?:wall |ceiling )?(?:finish|primer)) coat\(s\)/g,(m,n,kind)=>n+' '+kind+' coat'+(n==='1'?'':'s'));
    const parts=['INTERIOR_PAINTING','EXTERIOR_PAINTING','FENCING_INSTALL','FENCING_REPLACEMENT'].includes(type)&&row.input.ownerPricing.pricing.offeringDetails
      ?offeringDisclosures(type,row.input.ownerPricing.pricing,row.input.customerInputs).map(part=>String(part).trim()).filter(part=>part&&!/[.!?]$/.test(part)):[];
    const punctuate=text=>parts.reduce((t,part)=>t.split(part+' ').join(part+'. ').replace(new RegExp(part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$'),part+'.'),text);
    const walk=value=>{if(Array.isArray(value))value.forEach((v,i)=>{if(typeof v==='string')value[i]=coats(v);else walk(v);});
      else if(value&&typeof value==='object')for(const [k,v] of Object.entries(value)){if(typeof v==='string')value[k]=k==='disclaimer'?punctuate(coats(v)):coats(v);else walk(v);}};
    walk(result);
  }
  return result;
}
