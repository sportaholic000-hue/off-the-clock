import { registeredProductKey, productIdentityRequired } from '../../productNames.js';
import {createHmac} from 'node:crypto';
import {customerFieldForInputs,customerFieldVisible} from '../../scopeConfiguration.js';

const own = (value, key) => Object.hasOwn(value || {}, key);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
const FIELD = /^[a-zA-Z][a-zA-Z0-9_]{0,99}$/;
const FEES = ['travel', 'disposal', 'permit', 'overhead'];
const TYPES = new Set(['number', 'boolean', 'string', 'slug', 'enum', 'integer_or_unknown', 'number_or_unknown', 'orthogonal_outline', 'offering_counts', 'plant_counts', 'fence_runs','carpet_rooms','carpet_connections']);
const safeText = (value, max = 240) => typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : null;
const human = value => String(value).replaceAll('_', ' ');

function publicCondition(value, depth = 0) {
  if (depth > 4) return undefined;
  if (value === null || typeof value === 'boolean' || typeof value === 'string' || typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value) && value.length <= 32) return value.map(item => publicCondition(item, depth + 1));
  if (!record(value) || Object.keys(value).length > 32) return undefined;
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (!FIELD.test(key) || ['constructor', 'prototype', '__proto__'].includes(key)) return undefined;
    const child = publicCondition(item, depth + 1);
    if (child === undefined) return undefined;
    out[key] = child;
  }
  return out;
}

const scopeField = field => field.type === 'boolean' && field.presentationVariants?.some(v=>v.details?.length);
function selectedPresentations(field, inputs) {
  return (field.presentationVariants || []).filter(v=>customerFieldVisible({visibleWhen:v.visibleWhen},inputs));
}
function scopeToken(service, field, inputs, authority) {
  const selected=selectedPresentations(field,inputs);
  if(!authority?.secret || !selected.length)return undefined;
  return createHmac('sha256',authority.secret).update(JSON.stringify([authority.binding,service.id,field.name,selected])).digest('base64url');
}

export function voiceQuestionContract(service, definition, inputs = {}, authority) {
  const fields = (Array.isArray(definition?.customerFields) ? definition.customerFields : [])
    .filter(field => FIELD.test(field.name) && TYPES.has(field.type) && !field.evidenceOnly);
  if (fields.length > 64) throw new TypeError('Voice measurement contract exceeds its bounded field limit.');
  const questions = fields.map(original => {
    const field=customerFieldForInputs(original,inputs);
    const pending=scopeField(original)&&!selectedPresentations(original,inputs).length;
    const question = { field: field.name, label: pending?'Confirm the selected work after supplying its measurements':safeText(field.label,4000) || human(field.name), type: field.type };
    if(!pending&&field.details?.length)question.details=field.details.map(value=>{
      if(!safeText(value,4000))throw new TypeError('Invalid scope description.');return value;
    });
    if(scopeField(original)){
      question.scopeConfirmationRequired=true;
      const token=scopeToken(service,original,inputs,authority);
      if(token)question.confirmationToken=token;
    }
    if (safeText(field.unit, 160)) question.unit = field.unit;
    if (typeof field.required === 'boolean') question.required = field.required;
    if(field.type==='number_or_unknown'){question.unknownAllowed=true;question.unknownLabel='Not sure';if(field.integer)question.integer=true;}
    if(field.type==='carpet_rooms'){
      question.details=['Give each room as {lengthFt, widthFt}: length is front to back and width is side to side, measured in the same directions for every room. Accept the caller’s confirmed best estimate.'];
    }
    if(field.type==='carpet_connections'){
      question.details=['Give arrays of connected room numbers, such as [[1,2],[3]]. Rooms not listed together are separate. If not sure, use "unknown"; all rooms then share one direction.'];
      question.unknownAllowed=true;question.unknownLabel='Not sure';
    }
    for (const name of ['min', 'max']) if (typeof field[name] === 'number' && Number.isFinite(field[name])) question[name] = field[name];
    for (const name of ['showWhen', 'requiredWhen', 'applicableWhen', 'visibleWhen']) {
      const condition = publicCondition(field[name]);
      if (condition !== undefined) question[name] = condition;
    }
    const exemptValues = field.type === 'slug' && !productIdentityRequired(field.name, 'none') ? ['none'] : [];
    const values = field.type === 'slug' ? [...new Set([...exemptValues, ...Object.keys(service.knownOfferings?.[field.name] || {})])] : field.values;
    if (Array.isArray(values)) {
      question.choices = values.slice(0, 32).filter(value => typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
        .map(value => {
          if(field.name!=='gates'||field.type!=='offering_counts'){
            return {value,label:safeText(field.options?.[value])||safeText(field.optionLabels?.[value])||human(value)};
          }
          // Width and installation scope are part of a gate's identity. The
          // supported question transport accepts complete 4,000-char labels.
          const label=field.options?.[value]??field.optionLabels?.[value];
          if(label!==undefined&&!safeText(label,4000))throw new TypeError('Invalid complete voice choice.');
          return {value,label:safeText(label,4000)||human(value)};
        });
      if (values.length > 32) question.moreChoicesAvailable = true;
    }
    if (field.type === 'slug') question.productConfirmationRequired = true;
    if(field.type==='fence_runs'){
      question.details=[field.closedQuestion,field.sectionQuestion].map(v=>{if(!safeText(v,4000))throw new TypeError('Invalid fence measurement question.');return v;});
      question.choices=(field.gateChoices||[]).slice(0,32).map(g=>{
        if(!safeText(g.value)||!safeText(g.label,4000))throw new TypeError('Invalid complete fence gate choice.');
        return {value:g.value,label:g.label};
      });
      if((field.gateChoices||[]).length>32)question.moreChoicesAvailable=true;
    }
    if (exemptValues.length) question.productConfirmationExemptValues = exemptValues;
    return question;
  });
  const customerFees = FEES.filter(fee => authority?.requiredCustomerFees?.includes(fee) && service.feeRules?.[fee] === 'customer_selected')
    .map(fee => ({ field: fee, label: 'Apply the ' + fee + ' charge?', type: 'boolean' }));
  return { fields: questions, customerFees };
}

export function bindVoiceQuoteInputs(service, definition, args, authority) {
  if (!record(args.customerInputs) || own(args.customerInputs, 'confirmedFacts')) {
    return { followUps: ['Supply the current job measurements and confirm the named products; product identities are resolved by the business.'] };
  }
  const customerInputs = structuredClone(args.customerInputs);
  if(customerInputs.newFlooringType==='carpet'&&Array.isArray(customerInputs.carpetRooms))customerInputs.carpetMeasurementMethod='rooms';
  if(typeof customerInputs.carpetConnectedAreas==='string'&&['not sure','unknown'].includes(customerInputs.carpetConnectedAreas.trim().toLowerCase()))customerInputs.carpetConnectedAreas='unknown';
  const fields = Array.isArray(definition?.customerFields) ? definition.customerFields : [];
  // "exact" selects numeric input rather than a size-category allowance. It
  // does not certify a survey. Retain the caller's estimate flag separately.
  if(args.customerConfirmed===true&&args.callerMeasurementsEstimated===true){
    for(const field of fields)if(customerInputs[field.name]==='assumption'&&field.type==='enum'){
      if(field.values?.includes('exact'))customerInputs[field.name]='exact';
      else if(field.name==='roofSizeMethod'&&field.values?.includes('roof_measured'))customerInputs[field.name]='roof_measured';
    }
  }
  const confirmations = record(args.productConfirmations) ? args.productConfirmations : {};
  const confirmedFacts = {};
  const followUps = [];
  for (const key of Object.keys(confirmations)) {
    if (!fields.some(field => field.name === key && field.type === 'slug')) followUps.push('Confirm only a product requested for this service.');
  }
  for (const field of fields) {
    if (!own(customerInputs, field.name) || customerInputs[field.name] === null || customerInputs[field.name] === '') continue;
    if(field.type==='number_or_unknown'&&typeof customerInputs[field.name]==='string'&&['not sure','unknown'].includes(customerInputs[field.name].trim().toLowerCase()))customerInputs[field.name]='unknown';
    if (field.type === 'slug') {
      if (!productIdentityRequired(field.name, customerInputs[field.name])) continue;
      const registered = service.knownOfferings?.[field.name] || {};
      const key = registeredProductKey(customerInputs[field.name], Object.keys(registered));
      if (!key || confirmations[field.name] !== true) {
        followUps.push('Identify and confirm the exact ' + (safeText(field.label) || human(field.name)) + '.');
        continue;
      }
      customerInputs[field.name] = key;
      confirmedFacts[field.name] = { status: 'identified', field: field.name, value: key, offeringId: registered[key] };
    } else if (field.type === 'offering_counts' && record(customerInputs[field.name])) {
      const selected=customerFieldForInputs(field,customerInputs);
      const normalized = {};
      for (const [name, count] of Object.entries(customerInputs[field.name])) {
        const key = registeredProductKey(name, selected.values || []);
        if (!key || own(normalized, key)) { followUps.push('Confirm each distinct gate offering and its count.'); continue; }
        normalized[key] = count;
      }
      customerInputs[field.name] = normalized;
    } else if (field.type === 'enum' && typeof customerInputs[field.name] === 'string') {
      const key = registeredProductKey(customerInputs[field.name], (field.values || []).filter(value => typeof value === 'string'));
      if (key) customerInputs[field.name] = key;
    }
  }
  for(const field of fields)if(field.type==='fence_runs'&&Array.isArray(customerInputs[field.name])){
    const choices=customerFieldForInputs(field,customerInputs).gateChoices||[];
    for(const run of customerInputs[field.name])if(record(run)&&Array.isArray(run.sections))for(const section of run.sections)if(record(section)&&own(section,'gateAfter')){
      const key=registeredProductKey(section.gateAfter,choices.map(g=>g.value));
      if(key)section.gateAfter=key;else followUps.push('Identify the offered gate at each measured section boundary.');
    }
  }
  const scopeConfirmations=record(args.scopeConfirmations)?args.scopeConfirmations:{};
  for(const key of Object.keys(scopeConfirmations))if(!fields.some(field=>field.name===key&&scopeField(field)))followUps.push('Confirm only a scope requested for this service.');
  for(const field of fields)if(scopeField(field)&&(customerInputs[field.name]===true||selectedPresentations(field,customerInputs).length)){
    const expected=scopeToken(service,field,customerInputs,authority);
    if(customerInputs[field.name]!==true||!expected||scopeConfirmations[field.name]!==expected){
      const view=customerFieldForInputs(field,customerInputs);
      followUps.push('Please confirm the current scope: '+view.label+'.');
    }
  }
  if (Object.keys(confirmedFacts).length) customerInputs.confirmedFacts = confirmedFacts;
  const selections = record(args.customerFeeSelections) ? args.customerFeeSelections : {};
  for (const [fee, value] of Object.entries(selections)) {
    if (!FEES.includes(fee) || service.feeRules?.[fee] !== 'customer_selected' || typeof value !== 'boolean') followUps.push('Answer only the current customer-selected fee questions.');
  }
  for (const fee of FEES) if (authority?.requiredCustomerFees?.includes(fee) && service.feeRules?.[fee] === 'customer_selected' && !own(selections, fee)) followUps.push('Should the ' + fee + ' charge apply? Answer Yes or No.');
  // Do not assume No. The engine decides whether selected scope replaces a
  // common fee. No duplicated fee amounts or fee arithmetic live here.
  return { customerInputs, customerFeeSelections: structuredClone(selections), followUps: [...new Set(followUps)] };
}
