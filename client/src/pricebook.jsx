import {PRICE_BOOK_UNAVAILABLE} from './planDescriptions.js';
import {SurfacePricingEditor} from './surfacePricingEditor.jsx';
import {ownerValidationMessages,ownerMessage,ownerDiagnosticLabels} from './pricebookDiagnostics.js';
import {quoteMoneyFormatter} from '../../server/quoteMoneyFormat.js';
import {ServiceStatusNotices,priceOptionChipText} from './quoteDoneControls.jsx';
import {InstalledMaterialsEditor} from './installedMaterialsEditor.jsx';
import {quoteDisplayDisclaimer} from './quotePresentation.js';
import {ScopeEditor} from './scopeEditor.jsx';
import {PricingTree,CustomerMeasurements,CustomerFeePreview,ServiceRules,SavedApproval} from './quoteDoneControls.jsx';
import {OfferingEditor,offeringPreviewFields,offeringTierFields} from './offeringEditor.jsx';
import {QuoteAccess} from './quotedone.jsx';
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Check, Plus, RotateCcw, Sparkles, Trash2, X } from 'lucide-react';
import { api, go } from './api.js';
import {consumePricebookTransfer} from './pricebookDrafts.js';
import {PricebookConflict} from './pricebookConflict.jsx';
import {isRevisionConflict, pricebookPayload, reconcilePricebook, reconciliationErrors, withClientServiceIds} from './pricebookConflict.js';
import { humanPricingKey, productKeyFromName, DUPLICATE_NAME_MESSAGE } from './pricebookFormatting.js';
import { ExactNumericInput, WastePercentInput } from './pricebookInputs.jsx';
import { editBusinessDefault, addPriceTier, renameTierOverride, servicePricing, serviceFieldValue, editServiceField, editServiceTiers, editorServiceKey, editorServices, mergeSavedApproval, previewFeeContext, reconcilePreviewFees } from './pricebookEditing.js';
import {roofMaterialPresentationCopy} from '../../server/priceBookCopy.js';
import {serviceNameProblem,validateServiceName} from '../../server/serviceName.js';
import { moneyKindForField, validatePricebookNumericDraft, ownerMoneyEntries } from '../../server/priceBookMoney.js';
import {markEditedPriceMetadata} from './pricebookPriceMetadata.js';
import {installedPriceDefinitions} from '../../server/installedPriceConfiguration.js';
import {mergePricingVNext} from '../../server/quote-engine-vnext/pricingMerge.js';
import {describeInterviewConfiguration} from '../../server/interviewConfiguration.js';
import {FLOORING_PATTERN_FIELDS} from '../../server/quote-engine-vnext/flooringPricing.js';
import {customPlantSizes} from '../../server/quote-engine-vnext/concreteLandscapePricing.js';
import {PlantSizesEditor,PlantSizePrices} from './PlantSizesEditor.jsx';
const PricingContext = createContext({});
import {
  AppShell, Button, ErrorMessage, Field, Loading, Notice, PageHeader,
  Select, StatusChip, Textarea, TextInput, Toggle
} from './ui.jsx';
import { AssumptionRow, BlockerChecklist, Disclosure } from './reference.jsx';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function JsonEditor({value,onChange}) {
  const text=v=>v===undefined||v===null?'':typeof v==='string'?v:JSON.stringify(v,null,2);
  const [raw,setRaw]=useState(text(value)),[invalid,setInvalid]=useState(false);
  const emitted=useRef(value);
  useEffect(()=>{if(value!==emitted.current){emitted.current=value;setRaw(text(value));}},[value]);
  function change(raw){setRaw(raw);if(!raw.trim()){setInvalid(false);emitted.current=undefined;onChange(undefined);return;}try{const parsed=JSON.parse(raw);setInvalid(false);emitted.current=parsed;onChange(parsed);}catch{setInvalid(true);emitted.current=raw;onChange(raw);}}
  return <><Textarea aria-invalid={invalid} rows="6" value={raw} onChange={e=>change(e.target.value)}/>{invalid&&<span className="field-error">Enter valid JSON before saving.</span>}</>;
}

function MoneyInput({ value, onChange, money, kind, wholeCents }) {
  return (
    <div className={money ? 'money-input' : ''}>
      {money && <span>$</span>}
      <ExactNumericInput value={value} onChange={onChange} kind={kind} wholeCents={wholeCents} />
    </div>
  );
}


function priceStatusDiagnostics(status={}) {
  return [status,...(status.failedTierDiagnostics||[]),...(status.productCoverage||[])]
    .flatMap(row=>row?.ownerDiagnostics||[]);
}

function zeroClassifiesPrice(service,path) {
  const policy=service.zeroPricePolicy;
  if(!policy||typeof policy!=='object')return false;
  if(typeof policy.includedPrices?.[path]==='string')return true;
  const tiers=Array.isArray(service.tiers)?service.tiers:[];
  if(!tiers.length)return policy.freeCompleteService===true;
  const [field,key]=path.split('.');
  return tiers.every(tier=>{
    const override=tier?.overrides?.[field]?.[key];
    const effective=override===undefined?0:override;
    return (typeof effective==='number'&&Number.isFinite(effective)&&effective>0)||policy.freeTiers?.includes(tier?.name);
  });
}

export function shapedPriceRowStatus({service,definition,key,value,offered,status,incomplete=false}) {
  if(!offered)return 'NOT OFFERED';
  const path=definition.field+'.'+key;
  const diagnostics=priceStatusDiagnostics(status);
  const exactProblem=diagnostics.some(d=>d?.path===path);
  if(typeof value!=='number'||!Number.isFinite(value)||value<0||exactProblem||incomplete)return 'NEEDS PRICE';
  if(value>0)return 'READY';
  const policyProblem=diagnostics.some(d=>d?.path==='zeroPricePolicy'||d?.path==='zeroPricePolicy.includedPrices.'+path);
  return zeroClassifiesPrice(service,path)&&!policyProblem?'READY':'NEEDS PRICE';
}

const PRODUCT_PRICE_FIELDS=['laborPerSqft','materialPerSqft'];
const PRODUCT_PRICE_LABELS={laborPerSqft:'labor',materialPerSqft:'material'};

function valueMap(value) {
  return value&&typeof value==='object'&&!Array.isArray(value)?value:{};
}

function tierNameList(names) {
  if(names.length<2)return names[0]||'';
  if(names.length===2)return names.join(' and ');
  return names.slice(0,-1).join(', ')+', and '+names.at(-1);
}

// A cleared base pair does not clear tier overrides. Describe only tier
// availability that is structurally complete, explicitly classifies zero, and
// is accepted by the same draft validation that controls quote readiness.
function productTierAvailability(service,key,status={}) {
  const policy=service.zeroPricePolicy&&typeof service.zeroPricePolicy==='object'?service.zeroPricePolicy:{};
  const validNames=Array.isArray(status.validTierNames)?new Set(status.validTierNames):null;
  const failedNames=new Set((status.failedTierDiagnostics||[]).map(row=>row?.tierName));
  const available=[],needs=[];
  for(const tier of Array.isArray(service.tiers)?service.tiers:[]){
    const maps=Object.fromEntries(PRODUCT_PRICE_FIELDS.map(field=>[field,valueMap(tier?.overrides?.[field])]));
    if(!PRODUCT_PRICE_FIELDS.some(field=>Object.hasOwn(maps[field],key)))continue;
    const complete=PRODUCT_PRICE_FIELDS.every(field=>{
      if(!Object.hasOwn(maps[field],key))return false;
      const value=maps[field][key];
      if(typeof value!=='number'||!Number.isFinite(value)||value<0)return false;
      if(value>0)return true;
      const path=field+'.'+key;
      return policy.freeTiers?.includes(tier?.name)||typeof policy.includedPrices?.[path]==='string';
    });
    const accepted=!failedNames.has(tier?.name)&&(!validNames||validNames.has(tier?.name));
    (complete&&accepted?available:needs).push(tier?.name||'Unnamed');
  }
  if(!available.length&&!needs.length)return {status:'NOT OFFERED',message:''};
  const availableMessage=available.length?'Available in '+tierNameList(available)+' price option'+(available.length===1?'':'s')+'.':'';
  const needsMessage=needs.length?tierNameList(needs)+' price option'+(needs.length===1?' still needs':'s still need')+' complete pricing.':'';
  return {
    status:needs.length?'TIER NEEDS PRICE':'TIER ONLY',
    message:[availableMessage,needsMessage].filter(Boolean).join(' ')
  };
}

// Null is the in-memory marker for a newly enabled product component. It is
// serializable, unlike undefined, but it must never cross the save boundary as
// a made-up price. Existing legacy partial pairs have no marker and continue to
// follow the server's ordinary validation/recovery path.
function enabledProductDraftProblem(book,metadata) {
  const selectableTypes=new Set((metadata||[]).filter(meta=>PRODUCT_PRICE_FIELDS.every(field=>(meta.fields||[]).some(definition=>definition.field===field&&definition.shapedKeys?.ownerSelectable===true))).map(meta=>meta.serviceType));
  for(const service of book?.services||[]){
    if(!selectableTypes.has(service.serviceType))continue;
    const pricing=servicePricing(service),maps=Object.fromEntries(PRODUCT_PRICE_FIELDS.map(field=>[field,valueMap(pricing[field])]));
    const markedKeys=new Set(PRODUCT_PRICE_FIELDS.flatMap(field=>Object.keys(maps[field]).filter(key=>maps[field][key]===null)));
    for(const key of markedKeys){
      const missing=PRODUCT_PRICE_FIELDS.filter(field=>typeof maps[field][key]!=='number'||!Number.isFinite(maps[field][key]));
      if(!missing.length)continue;
      const product=humanPricingKey(key);
      const needed=missing.length===2?'the labor and material prices':'the '+PRODUCT_PRICE_LABELS[missing[0]]+' price';
      return product+' base pricing is incomplete. Enter '+needed+', or turn '+product+' base pricing off before saving.';
    }
  }
  return null;
}

function ShapedMapField({ definition, value, onChange, incompleteOfferings = [], status, onToggleOffering }) {
  const domain = definition.shapedKeys;
  const service = useContext(PricingContext);
  const pricing = servicePricing(service);
  const kind = definition.moneyKind ?? moneyKindForField(service.serviceType, definition.field, pricing);
  const money=Boolean(kind),valueHeading=money?'Price':'Value',valueUnit=domain.leafUnit||(money?'$':definition.unit||'number');
  const map = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const fixed = Array.isArray(domain.keys);
  const selectable = domain.ownerSelectable === true;
  const keys = fixed ? domain.keys : Object.keys(map);
  const [newKey, setNewKey] = useState('');
  const [keyError, setKeyError] = useState('');

  function write(next) { onChange(Object.keys(next).length ? next : undefined); }

  function setLeaf(key, nestedKey, number) {
    const next = { ...map };
    if (domain.nested) {
      const row = { ...(next[key] && typeof next[key] === 'object' ? next[key] : {}) };
      if (number === undefined) delete row[nestedKey]; else row[nestedKey] = number;
      if (Object.keys(row).length) next[key] = row; else delete next[key];
    } else if (number === undefined) { delete next[key]; } else { next[key] = number; }
    write(next);
  }

  function removeKey(key) {
    const next = { ...map };
    delete next[key];
    write(next);
  }

  function addKey() {
    const { key, error } = productKeyFromName(newKey);
    if (error) { setKeyError(error); return; }
    if (map[key] !== undefined) { setKeyError(DUPLICATE_NAME_MESSAGE); return; }
    write({ ...map, [key]: domain.nested ? {} : 0 });
    setNewKey('');
    setKeyError('');
  }

  // Owner-selectable product offerings: an absent key means NOT OFFERED, never
  // free. Toggling a product off removes its pricing entirely, which is what
  // the corrected activation logic reads as "not offered".
  function toggleOffered(key, offered) {
    if(onToggleOffering){onToggleOffering(key,offered);return;}
    if (offered) {
      write({ ...map, [key]: domain.nested ? {} : 0 });
    } else {
      removeKey(key);
    }
  }

  if (selectable && !domain.nested) {
    const offeredKeys = Object.keys(map);
    return (
      <div className="shaped-map">
        <p className="offering-note">
          These switches control paired base labor and material prices. Turning a base price off keeps Good / Better / Best overrides; a product with complete option pricing remains available through those options. A product with no base or option pricing is not offered — never free.
        </p>
        <div className="matrix-scroll">
          <table className="pricing-matrix">
            <thead>
              <tr>
                <th scope="col">{domain.keyLabel || 'Type'}</th>
                <th scope="col">Price ({domain.leafUnit || '$'})</th>
                <th scope="col" className="matrix-status">Status</th>
              </tr>
            </thead>
            <tbody>
              {keys.map(key => {
                const incomplete = incompleteOfferings.includes(key);
                // Product offering is shared by its labor and material maps.
                // If either component exists, keep a missing companion row
                // editable and label it NEEDS PRICE. Only absence from both
                // maps means NOT OFFERED.
                const companionOffered=PRODUCT_PRICE_FIELDS.some(field=>{
                  const prices=pricing[field];
                  return prices&&typeof prices==='object'&&!Array.isArray(prices)&&Object.hasOwn(prices,key);
                });
                // A paired product checkbox is controlled only by the current
                // draft maps. Validation can lag behind a click, so a stale
                // incomplete-offering diagnostic must not keep it checked
                // after both price components were removed.
                const offered = onToggleOffering ? companionOffered : offeredKeys.includes(key)||incomplete||companionOffered;
                const tierAvailability=onToggleOffering&&!offered?productTierAvailability(service,key,status):{status:'NOT OFFERED',message:''};
                const rowStatus=offered?shapedPriceRowStatus({service,definition,key,value:map[key],offered,status,incomplete}):tierAvailability.status;
                return (
                  <tr key={key} className={rowStatus==='NOT OFFERED' ? 'row-not-offered' : ''}>
                    <th scope="row">
                      <label className="offered-toggle">
                        <input type="checkbox" checked={offered}
                          aria-label={`${humanPricingKey(key)} base pricing`}
                          onChange={() => toggleOffered(key, !offered)} />
                        <span><span className="matrix-row-title">{humanPricingKey(key)}</span><span className="matrix-row-unit">Base price</span></span>
                      </label>
                    </th>
                    <td>
                      {offered ? (
                        <div className="matrix-input">
                          <span className="matrix-prefix mono">$</span>
                          <ExactNumericInput kind={kind}
                            aria-label={`${humanPricingKey(key)} price`}
                            value={map[key]}
                            onChange={number => setLeaf(key, null, number)} />
                        </div>
                      ) : rowStatus==='NOT OFFERED' ? <span className="matrix-off mono">NOT OFFERED</span>
                        : <div><span className="matrix-off mono">BASE PRICE OFF</span><small className="matrix-row-unit">{tierAvailability.message}</small></div>}
                    </td>
                    <td className="matrix-status">
                      {rowStatus==='NOT OFFERED' ? <span className="chip chip-quiet">NOT OFFERED</span>
                        : rowStatus==='NEEDS PRICE' ? <span className="chip chip-need">NEEDS PRICE</span>
                        : rowStatus==='TIER NEEDS PRICE' ? <span className="chip chip-need">TIER NEEDS PRICE</span>
                        : rowStatus==='TIER ONLY' ? <span className="chip chip-live">TIER ONLY</span>
                        : <span className="chip chip-live">READY</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // Nested shapes (Small / Medium / Large): shared column headings, no repeated
  // size label in every cell.
  if (domain.nested) {
    const nestedKeys = domain.nested;
    return (
      <div className="shaped-map">
        <div className="matrix-scroll">
          <table className="pricing-matrix">
            <thead>
              <tr>
                <th scope="col">{domain.keyLabel || 'Type'}</th>
                {nestedKeys.map(nestedKey => (
                  <th scope="col" key={nestedKey}>
                    {domain.nestedCopy?.[nestedKey]?.label || humanPricingKey(nestedKey)}
                  </th>
                ))}
                {!fixed && <th scope="col" className="matrix-status" />}
              </tr>
            </thead>
            <tbody>
              {keys.map(key => (
                <tr key={key}>
                  <th scope="row">
                    <span className="matrix-row-title">{humanPricingKey(key)}</span>
                    {domain.nestedUnit && <span className="matrix-row-unit mono">{domain.nestedUnit}</span>}
                  </th>
                  {nestedKeys.map(nestedKey => (
                    <td key={nestedKey}>
                      <div className="matrix-input">
                        <span className="matrix-prefix mono">
                          {definition.field==='debrisPricing'?(nestedKey==='disposalFlat'?'$':nestedKey==='sqftPerLoad'?'sq ft':'×'):domain.nestedCopy?.[nestedKey]?.unit === 'hours' ? 'h' : '$'}
                        </span>
                        <ExactNumericInput kind={definition.field === 'debrisPricing' && nestedKey === 'disposalFlat' ? 'fixed_amount' : kind}
                          aria-label={`${humanPricingKey(key)} ${domain.nestedCopy?.[nestedKey]?.label || nestedKey}`}
                          value={map[key]?.[nestedKey] ?? ''}
                          onChange={number => setLeaf(key, nestedKey, number)} />
                      </div>
                    </td>
                  ))}
                  {!fixed && (
                    <td className="matrix-status">
                      <Button variant="quiet" onClick={() => removeKey(key)}>Remove</Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!fixed && (
          <div className="shaped-map-add">
            <TextInput value={newKey} aria-label={`Add ${domain.keyLabel || 'pricing type'}`}
              placeholder={`Add ${String(domain.keyLabel || 'pricing type').toLowerCase()}`}
              onChange={event => { setNewKey(event.target.value); setKeyError(''); }} />
            <Button variant="secondary" onClick={addKey}>Add</Button>
            {keyError && <span className="field-error" role="alert">{keyError}</span>}
          </div>
        )}
      </div>
    );
  }

  // Open single-level domains (e.g. membrane types, mulch types).
  return (
    <div className="shaped-map">
      <div className="matrix-scroll">
        <table className="pricing-matrix">
          <thead>
            <tr>
              <th scope="col">{domain.keyLabel || 'Type'}</th>
              <th scope="col">{valueHeading} ({valueUnit})</th>
              {!fixed && <th scope="col" className="matrix-status" />}
            </tr>
          </thead>
          <tbody>
            {keys.map(key => (
              <tr key={key}>
                <th scope="row">{humanPricingKey(key)}</th>
                <td>
                  <div className="matrix-input">
                    {money&&<span className="matrix-prefix mono">$</span>}
                    {definition.ownerInputUnit==='percent'?<WastePercentInput
                      aria-label={`${humanPricingKey(key)} ${definition.label}`}
                      value={map[key]} onChange={number=>setLeaf(key,null,number)}/>:<ExactNumericInput kind={kind}
                      aria-label={`${humanPricingKey(key)} ${money?'price':definition.label}`}
                      value={map[key]}
                      onChange={number => setLeaf(key, null, number)} />}
                  </div>
                </td>
                {!fixed && (
                  <td className="matrix-status">
                    <Button variant="quiet" onClick={() => removeKey(key)}>Remove</Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!fixed && (
        <div className="shaped-map-add">
          <TextInput value={newKey} aria-label={`Add ${domain.keyLabel || 'pricing type'}`}
            placeholder={`Add ${String(domain.keyLabel || 'pricing type').toLowerCase()}`}
            onChange={event => { setNewKey(event.target.value); setKeyError(''); }} />
          <Button variant="secondary" onClick={addKey}>Add</Button>
          {keyError && <span className="field-error" role="alert">{keyError}</span>}
        </div>
      )}
    </div>
  );
}

function StructuredFactorField({ value, defaultValue, onChange, unit, wastePercent = false, label = '' }) {
  if (defaultValue && typeof defaultValue === 'object') {
    const current = value && typeof value === 'object' && !Array.isArray(value)
      ? value
      : defaultValue;
    return (
      <div className="factor-map">
        {Object.entries(defaultValue).map(([key, childDefault]) => (
          <div className="factor-map-row" key={key}>
            <span>{humanPricingKey(key)}</span>
            <StructuredFactorField
              value={current[key]}
              defaultValue={childDefault}
              unit={unit}
              wastePercent={wastePercent}
              label={label+' '+humanPricingKey(key)}
              onChange={(child,path) => onChange({ ...current, [key]:child },[key,...path])}
            />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="factor-value">
      {wastePercent?<WastePercentInput aria-label={label} value={value === undefined ? defaultValue : value} onChange={next=>onChange(next,[])}/>:<ExactNumericInput aria-label={label} value={value === undefined ? defaultValue : value} onChange={next=>onChange(next,[])} />}
      <small>{wastePercent?'%':unit}</small>
    </div>
  );
}

function OwnerField({ definition, value, onChange, compact = false, incompleteOfferings = [], status, onToggleOffering }) {
  const service = useContext(PricingContext);
  const pricing=servicePricing(service);
  if(['installedLaborPercent','installedMaterialsPercent'].includes(definition.field))definition={...definition,tree:{...(definition.tree||{}),leafKeys:service.serviceType==='CUSTOM'&&definition.field==='installedMaterialsPercent'?['price']:Object.keys(installedPriceDefinitions(service.serviceType,pricing)).sort()}};
  definition=definition.field==='materialCostPerSquare'
    ?roofMaterialPresentationCopy(definition,service,pricing,{pricesInDollars:true,leafHelp:compact,tierName:service.pricingTierName})
    :definition.copyByAccessoryPricingMode?.[pricing.accessoryPricingMode]
      ?{...definition,...definition.copyByAccessoryPricingMode[pricing.accessoryPricingMode]}
      :definition;
  const kind = service.serviceType === 'CUSTOM' && ['price','low','high'].includes(definition.field)
    ? moneyKindForField(service.serviceType, definition.field, pricing)
    : definition.moneyKind ?? moneyKindForField(service.serviceType, definition.field, pricing);
  let control;
  if(typeof service.serviceType==='string'&&service.serviceType.startsWith('CONCRETE_')&&['placementFlat','placementPerCubicYard'].includes(definition.field)){
    control=<div className="field-stack">{definition.tree.rootKeys.map(method=><Field key={method} label={definition.tree.leafLabels[method]}><ExactNumericInput aria-label={definition.label+' '+definition.tree.leafLabels[method]} value={value?.[method]} kind={kind} wholeCents={definition.wholeCents} onChange={v=>{const next={...(value||{})};if(v===undefined)delete next[method];else next[method]=v;onChange(Object.keys(next).length?next:undefined);}}/></Field>)}</div>;
  } else if(definition.field==='plantSizes'){
    control=<PlantSizesEditor value={value} onChange={onChange}/>;
  } else if(service.serviceType==='LANDSCAPING_PLANTING'&&customPlantSizes(pricing)&&['plantingLaborPerPlant','plantMaterialAllowance'].includes(definition.field)){
    control=<PlantSizePrices pricing={pricing} field={definition} value={value} onChange={onChange}/>;
  } else if (definition.type === 'boolean') {
    control = <Toggle checked={Boolean(value)} onChange={onChange} label={value ? 'YES' : 'NO'} />;
  } else if (definition.type === 'select') {
    control = (
      <Select value={value || ''} onChange={event => onChange(event.target.value || undefined)}>
        <option value="">Choose</option>
        {(definition.options || []).map(option => <option key={option} value={option}>{definition.optionLabels?.[option] || 'Pricing option'}</option>)}
      </Select>
    );
  } else if (definition.type === 'json') {
    // Flat owner-selectable product maps use the product matrix: it is the
    // only editor that distinguishes offered, not-offered, and price status.
    // Nested/open pricing trees keep their established generic editor.
    // Offering switches belong to the base product pair. Tier editors inherit
    // that offering and edit only their explicit price overrides, so rendering
    // a second offering switch there would promise a deletion the tier merge
    // cannot represent.
    const productRows=!compact&&(service.serviceType.startsWith('FLOORING_')||service.serviceType==='SIDING_REPLACEMENT')&&
      PRODUCT_PRICE_FIELDS.includes(definition.field)&&definition.shapedKeys?.ownerSelectable===true;
    control = productRows
      ? <ShapedMapField definition={definition} value={value} onChange={onChange} incompleteOfferings={incompleteOfferings} status={status} onToggleOffering={onToggleOffering} />
      : FLOORING_PATTERN_FIELDS.includes(definition.field) ? <ShapedMapField definition={definition} value={value} onChange={onChange}/>
      : definition.tree ? <PricingTree value={value} onChange={onChange} definition={definition}/>
      : definition.shapedKeys ? <ShapedMapField definition={definition} value={value} onChange={onChange} incompleteOfferings={incompleteOfferings} status={status} />
      : <JsonEditor value={value} onChange={onChange} />;
  } else if(definition.type==='preserved_configuration') {
    let summary;
    try{summary=describeInterviewConfiguration(service.serviceType,definition.field,value,pricing);}catch{summary='Retained structured configuration. Remove this override explicitly if it no longer applies.';}
    control=<div className="owner-field-preserved" role="note">{summary}</div>;
  } else {
    control = <MoneyInput value={value} onChange={onChange} money={definition.money} kind={kind} wholeCents={definition.wholeCents} />;
  }
  if (compact) return control;
  // Approved label ruling: concise trade-specific title is the primary label;
  // the complete authoritative definition sits immediately beneath it as
  // supporting copy, preserving all units, inclusions and exclusions.
  // Approved label ruling: where a concise trade-specific title exists it is the
  // primary control label and the complete authoritative definition (definition.label,
  // preserved verbatim server-side) sits immediately beneath as supporting copy.
  // Fields whose label is already concise keep it as the primary label.
  const hasTitle = Boolean(definition.title);
  return (
    <div className="owner-field">
      <span className="owner-field-title">{hasTitle ? definition.title : definition.label}</span>
      {hasTitle ? (
        // Titled fields already carry the full authoritative definition as the
        // supporting line. Rendering `help` as well produced two supporting
        // lines saying overlapping things, which read as one merged paragraph.
        // The authoritative wording wins; help is redundant here.
        <span className="owner-field-definition">
          {definition.label}{definition.minimumAllowsZero ? ' $0 is valid and means no minimum.' : ''}
        </span>
      ) : (
        <span className="owner-field-help">
          {definition.help}{definition.minimumAllowsZero ? ' $0 is valid and means no minimum.' : ''}
        </span>
      )}
      <div className="owner-field-control">{control}</div>
    </div>
  );
}

function TierBuilder({ tiers, definitions, onChange }) {
  const service = useContext(PricingContext);
  const definitionsFor=tier=>typeof definitions==='function'?definitions(tier.overrides||{}):definitions;
  function addTier() {
    if (tiers.length >= 3) return;
    onChange(addPriceTier(tiers));
  }
  function patchTier(index, patch) {
    onChange(tiers.map((tier, tierIndex) => tierIndex === index ? { ...tier, ...patch } : tier));
  }
  function removeTier(index) {
    onChange(tiers.filter((_, tierIndex) => tierIndex !== index));
  }
  function addOverride(index) {
    const tier = tiers[index];
    const field = definitionsFor(tier).find(item => item.type!=='preserved_configuration'&&!Object.hasOwn(tier.overrides || {}, item.field))?.field;
    if (!field) return;
    patchTier(index, { overrides:{ ...(tier.overrides || {}), [field]:undefined } });
  }
  function renameOverride(index, oldField, nextField) {
    const tier = tiers[index];
    if(!definitionsFor(tier).some(item=>item.field===nextField&&item.type!=='preserved_configuration'))return;
    const next = renameTierOverride(tier.overrides||{},oldField,nextField);
    patchTier(index, { overrides:next });
  }
  function setOverride(index, field, value) {
    const tier = tiers[index];
    patchTier(index, { overrides:{ ...(tier.overrides || {}), [field]:value } });
  }
  function removeOverride(index, field) {
    const tier = tiers[index];
    const next = { ...(tier.overrides || {}) };
    delete next[field];
    patchTier(index, { overrides:next });
  }

  return (
    <section className="editor-section">
      <div className="section-title">
        <div><p className="eyebrow">OPTIONS</p><h2>Good / Better / Best tiers</h2><span>Offer up to three named options. Each tier inherits the base service unless you override a field.</span></div>
        <Button icon={Plus} variant="secondary" onClick={addTier} disabled={tiers.length >= 3}>Add tier</Button>
      </div>
      {!tiers.length && <Notice>One default option will use the base service prices.</Notice>}
      <div className="tier-list">
        {tiers.map((tier, index) => {
          const tierDefinitions=definitionsFor(tier),effective=mergePricingVNext(servicePricing(service),tier.overrides||{});
          return <PricingContext.Provider key={index} value={{ ...service, pricing:effective, pricingTierName:tier.name }}>
          <article className="tier-row">
            <div className="tier-heading">
              <TextInput value={tier.name} onChange={event => patchTier(index, { name:event.target.value })} aria-label={`Tier ${index + 1} name`} />
              <Button icon={Trash2} variant="icon" aria-label="Remove tier" title="Remove tier" onClick={() => removeTier(index)} />
            </div>
            <div className="override-list">
              {Object.entries(tier.overrides || {}).map(([field,value]) => {
                const definition = tierDefinitions.find(item => item.field === field)||{field,label:'Retained '+humanPricingKey(field),type:'preserved_configuration',help:'This retained structured override has no current direct editor. It remains unchanged unless you remove it explicitly.'};
                return (
                  <div className="override-row" key={field}>
                    <Select value={field} disabled={definition.type==='preserved_configuration'} onChange={event => renameOverride(index, field, event.target.value)}>
                      {!tierDefinitions.some(item=>item.field===field)&&<option value={field}>{definition.label}</option>}
                      {tierDefinitions.map(item => <option key={item.field} value={item.field} disabled={item.field!==field&&(item.type==='preserved_configuration'||Object.hasOwn(tier.overrides||{},item.field))}>{item.label}</option>)}
                    </Select>
                    {definition && <OwnerField definition={definition} value={value} onChange={next => setOverride(index, field, next)} compact />}
                    <Button icon={X} variant="icon" aria-label="Remove override" title="Remove override" onClick={() => removeOverride(index, field)} />
                  </div>
                );
              })}
            </div>
            <Button icon={Plus} variant="quiet" onClick={() => addOverride(index)}>Override a field</Button>
          </article>
          </PricingContext.Provider>;
        })}
      </div>
    </section>
  );
}

function RoofDependentLineNotice({service,onConfirm}) {
  const rows=service?.serviceType==='ROOFING_REPLACEMENT'
    ?Object.entries(service.dependentLineState||{}).filter(([,row])=>row?.confirmed!==true)
    :[];
  if(!rows.length)return null;
  const pending=new Set(service.dependentLineActions?.confirmIds||[]);
  return <Notice tone="warning"><strong>Flashing and vent prices are not active yet.</strong> Only confirmed materials and price options offer these measurements. For each material at the base price and in every overriding price option, re-enter the applicable field-material price knowing it excludes ice and water barrier, valley work, step flashing, pipe jacks and ridge vent, then confirm that wording. A base-price confirmation does not confirm an overriding price option.{rows.map(([id,row])=>{
    const target=humanPricingKey(row.basePricePath.split('.').at(-1))+' — '+(row.tierName||'Base price'),waiting=pending.has(id);
    return <React.Fragment key={id}> <Button variant="secondary" disabled={waiting} onClick={()=>onConfirm(id)}>{waiting?'CONFIRM ON SAVE — '+target:'I re-entered and confirm '+target}</Button></React.Fragment>;
  })}</Notice>;
}

function Preview({ preview, loading, status, plan }) {
  // Reference: design-reference/pricebook-editor/index.html "THE SIGNATURE
  // MOMENT" — the customer-facing estimate is the hero of the right rail.
  // Owner-only markup, margin and internal rates are never rendered here.
  const partial = preview?.resultType === 'PARTIAL_ESTIMATE_READY';
  const estimate = partial ? preview.pricedEstimate : preview;
  const ready = !loading && ['INSTANT_ESTIMATE_READY','PARTIAL_ESTIMATE_READY'].includes(preview?.resultType);
  const review = !loading && preview?.resultType === 'ESTIMATE_REQUIRES_REVIEW';
  const [tierIndex, setTierIndex] = useState(0);
  const options = ready ? (estimate.options || []) : [];
  const money=quoteMoneyFormatter(options.flatMap(option=>[option.lowEstimate,option.highEstimate,option.midEstimate,...(option.firstVisit?[option.firstVisit.lowEstimate,option.firstVisit.highEstimate,option.firstVisit.midEstimate]:[])]));
  const active = options[Math.min(tierIndex, Math.max(0, options.length - 1))] || null;
  const firstVisit=active?.firstVisit;
  const recurringUnit=active?.priceUnit||estimate?.priceUnit;
  const recurringTax=active?.taxTreatment||estimate?.taxTreatment;
  const firstVisitUnit=firstVisit?.priceUnit||recurringUnit;
  const firstVisitTax=firstVisit?.taxTreatment||recurringTax;

  // The quote engine's canonical customer view is sanitizeForCustomer(), which
  // strips lineItems entirely and exposes priceDrivers: human-readable,
  // customer-safe strings (e.g. "Siding labor", "Membrane type unconfirmed -
  // average pricing used"). Owner-only line items (labor/material rates,
  // markup, margin, minimum adjustments, surcharges, tax) all carry
  // customerVisible:false and must never appear here. So the preview renders
  // priceDrivers, never raw lineItems.
  const priceDrivers = active?.priceDrivers || [];

  return (
    <aside className="preview-column">
      <section className={`quote-preview${ready ? ' ready' : ''}`}>
        <div className="quote-preview-head">
          <span className="quote-preview-eyebrow">
            <span className="live-dot" aria-hidden="true" />
            <span className="eyebrow">What your customer gets</span>
          </span>
          <span className="mono quote-preview-note">UPDATES AS YOU TYPE</span>
        </div>
        <p className="quote-preview-sub">
          This is the estimate your customer will get. Changes here aren't saved until you press Save &amp; validate.
        </p>

        {loading && <div className="preview-empty mono">CALCULATING</div>}
        {!loading && partial && <Notice title="Additional work for on-site estimate"><p>This estimate is for {preview.pricedScope.service} only.</p><ul>{preview.additionalWork.map((item,index)=><li key={index}>{item.description}</li>)}</ul><p>{preview.customerMessage}</p><p>Total for all requested work: not yet available.</p></Notice>}

        {!loading && !preview && (
          <div className="preview-empty">Enter the required prices to see the customer estimate.</div>
        )}

        {review && (
          <div className="preview-review">
            <StatusChip status="NEEDS PRICING" />
            <p className="preview-review-title">This job would go to you for review.</p>
            <BlockerChecklist
              items={(preview.missingOwnerLabels || []).map((label, index) => ({
                field: preview.missingOwnerFields?.[index] || String(index),
                label
              }))}
              emptyLabel={ownerMessage(preview.reviewReason, 'Complete the required pricing before previewing this quote.')}
            />
          </div>
        )}

        {ready && active && (
          <>
            {options.length > 1 && (
              <div className="tier-switch" role="tablist" aria-label="Quote tiers">
                {options.map((option, index) => (
                  <button
                    key={option.tierName || index}
                    type="button"
                    role="tab"
                    aria-selected={index === tierIndex}
                    className={index === tierIndex ? 'selected' : ''}
                    onClick={() => setTierIndex(index)}
                  >
                    {option.tierName || `Option ${index + 1}`}
                  </button>
                ))}
              </div>
            )}
            {(estimate.optionAvailabilityNotice||preview.optionAvailabilityNotice)&&<Notice tone="warning">{estimate.optionAvailabilityNotice||preview.optionAvailabilityNotice}</Notice>}

            <div className="quote-range">
              <div className="mono quote-range-label">{firstVisit?'RECURRING RANGE YOUR CUSTOMER GETS':'RANGE YOUR CUSTOMER GETS'}</div>
              <div className="quote-range-values">
                <span className="quote-low">{money.amount(active.lowEstimate)}</span>
                {active.lowEstimate!==active.highEstimate&&<><span className="mono quote-dash">–</span>
                <span className="quote-high">{money.amount(active.highEstimate)}</span></>}
                {recurringUnit&&<span className="quote-price-unit">{recurringUnit}</span>}
              </div>
              {recurringTax&&<p className="quote-tax-treatment">{firstVisit?'Recurring: ':''}{recurringTax}</p>}
              {firstVisit&&<div className="quote-first-visit-range">
                <div className="mono quote-range-label">FIRST-VISIT RANGE YOUR CUSTOMER GETS</div>
                <div className="quote-range-values">
                  <span className="quote-first-visit-low">{money.amount(firstVisit.lowEstimate)}</span>
                  {firstVisit.lowEstimate!==firstVisit.highEstimate&&<><span className="mono quote-first-visit-dash">–</span><span className="quote-first-visit-high">{money.amount(firstVisit.highEstimate)}</span></>}
                  {firstVisitUnit&&<span className="quote-price-unit">{firstVisitUnit}</span>}
                </div>
                {firstVisitTax&&<p className="quote-tax-treatment">First visit: {firstVisitTax}</p>}
              </div>}
              {active.tierName && <span className="mono quote-tier-name">{active.tierName}</span>}
            </div>

            {/* Customer-facing price drivers from the engine's sanitized output.
                These are the same strings a customer would hear. No owner-only
                amounts, rates, markup or margin are shown. Tax treatment is stated. */}
            <div className="quote-drivers">
              <span className="mono quote-drivers-label">WHAT GOES INTO THIS ESTIMATE</span>
              {priceDrivers.length > 0 ? (
                <ul className="quote-driver-list">
                  {priceDrivers.map((driver, index) => (
                    <li key={`${active.tierName}-${index}`}>{driver}</li>
                  ))}
                </ul>
              ) : (
                <p className="quote-driver-empty">Labor and materials for the job as described.</p>
              )}
              {active.lowEstimate!==active.highEstimate&&<div className="quote-midpoint-row">
                <span>{firstVisit?'Recurring midpoint estimate':'Midpoint estimate'}</span>
                <span className="mono quote-midpoint-value">{money.amount(active.midEstimate)}{recurringUnit ? ` ${recurringUnit}` : ''}</span>
              </div>}
              {firstVisit&&firstVisit.lowEstimate!==firstVisit.highEstimate&&<div className="quote-midpoint-row quote-first-visit-midpoint-row">
                <span>First-visit midpoint estimate</span>
                <span className="mono quote-midpoint-value">{money.amount(firstVisit.midEstimate)}{firstVisitUnit ? ` ${firstVisitUnit}` : ''}</span>
              </div>}
            </div>

            {active.skippedAddons?.length > 0 && (
              <div className="skipped-addons">
                <span className="mono skipped-addons-label">NOT INCLUDED — PRICE THESE TO ADD THEM</span>
                <ul className="skipped-addon-list">
                  {active.skippedAddons.map(addon => (
                    <li key={`${active.tierName}-skip-${addon}`}>{addon}</li>
                  ))}
                </ul>
              </div>
            )}
            {active.disclaimer && (
              <p className="quote-disclaimer">{quoteDisplayDisclaimer(active.disclaimer,active)}</p>
            )}
            {firstVisit?.disclaimer&&firstVisit.disclaimer!==active.disclaimer&&(
              <p className="quote-disclaimer quote-first-visit-disclaimer"><strong>First visit:</strong> {quoteDisplayDisclaimer(firstVisit.disclaimer,firstVisit)}</p>
            )}

            {status && (
              <div className={`quote-issue-state${status.status === 'QUOTING LIVE' ? ' live' : ''}`}>
                <StatusChip status={status.status} label={priceOptionChipText(status)} />
                <span>
                  {status.status === 'QUOTING LIVE'
                    ? (plan === 'Operator' ? 'This service can issue quotes on your website widget.' : 'This service can issue quotes on a live call.')
                    : status.status === 'DISABLED' ? 'Quoting is disabled for this service. This preview does not enable it.' : 'This service still needs pricing before it can quote.'}
                </span>
              </div>
            )}
          </>
        )}
      </section>
    </aside>
  );
}

// Blank uses the starting description. Text is customer-facing: no numbers,
// prices, percentages or codes (the server rejects them on save).
function AnswerDefinitionsEditor({service,fields,onChange}) {
  const saved=service.answerDefinitions||{};
  const update=(name,value,text)=>{
    const next={...saved,[name]:{...(saved[name]||{}),[value]:text}};
    if(!text.trim())delete next[name][value];
    if(!Object.keys(next[name]).length)delete next[name];
    const updated={...service,answerDefinitions:next};
    if(!Object.keys(next).length)delete updated.answerDefinitions;
    onChange(updated);
  };
  return <div className="field-stack">{fields.map(field=><fieldset key={field.name} aria-label={field.label}><legend className="field-label">{field.label}</legend>
    {field.choices.map(choice=><Field key={choice.value} label={choice.label} help={'Blank uses: '+choice.startingDefinition}><TextInput aria-label={field.label+' '+choice.label+' description'} maxLength={160} placeholder={choice.startingDefinition} value={saved[field.name]?.[choice.value]||''} onChange={event=>update(field.name,choice.value,event.target.value)}/></Field>)}
  </fieldset>)}</div>;
}

export default function PriceBook() {
  const [dashboard, setDashboard] = useState(null);
  const [onboarding, setOnboarding] = useState(null);
  const [metadata, setMetadata] = useState([]);
  const [book, setBook] = useState(null);
  const [selectedType, setSelectedType] = useState(null);
  const [statuses, setStatuses] = useState(null);
  // True while a draft validation is in flight. Statuses are NOT cleared during
  // validation -- the last confirmed result stays visible so a QUOTING LIVE
  // service does not flash to NEEDS PRICING on every keystroke.
  const [validating, setValidating] = useState(false);
  // Monotonic sequence: a response is applied only if it belongs to the most
  // recent request, so a slow earlier response cannot overwrite a newer one.
  const validationSeq = useRef(0);
  const [draftValidationErrors, setDraftValidationErrors] = useState([]);
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [suggestions, setSuggestions] = useState(null);
  const [suggesting,setSuggesting] = useState(false);
  const [suggestionError,setSuggestionError] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [approvalPending, setApprovalPending] = useState(false);
  const [locked, setLocked] = useState(false);
  const [contract,setContract] = useState({});
  const [newServiceType,setNewServiceType] = useState('');
  const [transferNotice,setTransferNotice] = useState(null);
  const [previewFeeDraft,setPreviewFeeDraft] = useState({context:null,values:{}});
  const [revisionConflict,setRevisionConflict] = useState(null);
  const basePricebook = useRef(null);
  const draftRef = useRef(book);
  draftRef.current = book;
  const conflictGeneration = useRef(0);
  const [conflictChoices, setConflictChoices] = useState({});
  const conflictMerge = useMemo(() => {
    if (!revisionConflict?.remote || !book || !basePricebook.current) return null;
    try { return reconcilePricebook(basePricebook.current, book, revisionConflict.remote, conflictChoices); }
    catch (problem) { return {problem}; }
  }, [book, revisionConflict?.remote, conflictChoices]);
  useEffect(() => () => { conflictGeneration.current++; validationSeq.current++; }, []);

  // Invalidate immediately, before React can flush the busy state. Late
  // background replies from our own preceding revision are no longer current.
  const mutationGeneration = useRef(0);
  function beginMutation() { mutationGeneration.current++; validationSeq.current++; setValidating(false); }
  function approvalBusy(busy) { if(busy)beginMutation(); setApprovalPending(busy); }

  async function recoverConflict(problem) {
    const generation = ++conflictGeneration.current;
    validationSeq.current++;
    setValidating(false);
    setError(null);
    setDraftValidationErrors([]);
    setConflictChoices({});
    setRevisionConflict({isOpen:true, phase:'loading', remote:null, error:null, errors:[]});
    try {
      const remote = problem?.remoteBook || await api(`/api/pricebook/${dashboard.ownerId}`);
      if (generation !== conflictGeneration.current) return;
      setRevisionConflict({isOpen:true, phase:'checking', remote:clone(remote), error:null, errors:[]});
    } catch (error) {
      if (generation === conflictGeneration.current) setRevisionConflict({isOpen:true, phase:'failed', remote:null, error, errors:[]});
    }
  }

  useEffect(() => {
    if (!revisionConflict?.isOpen || !conflictMerge) return;
    if (conflictMerge.problem) {
      setRevisionConflict(current => ({...current, phase:'failed', error:conflictMerge.problem}));
      return;
    }
    if (conflictMerge.unresolved.length) {
      setRevisionConflict(current => ({...current, phase:'choosing', error:null, errors:[]}));
      return;
    }
    let current = true;
    const generation = conflictGeneration.current;
    setRevisionConflict(state => ({...state, phase:'validating', error:null, errors:[]}));
    (async () => {
      try {
        const payload = pricebookPayload(conflictMerge.draft);
        validatePricebookNumericDraft(payload);
        const validation = await api('/api/pricebook/validate', {method:'POST', body:payload});
        const errors = reconciliationErrors(validation);
        if (current && generation === conflictGeneration.current) setRevisionConflict(state => ({...state, phase:'ready', errors, validation, validatedDraft:conflictMerge.draft}));
      } catch (problem) {
        if (!current || generation !== conflictGeneration.current) return;
        if (isRevisionConflict(problem)) recoverConflict(problem);
        else setRevisionConflict(state => ({...state, phase:'failed', error:problem}));
      }
    })();
    return () => { current = false; };
  }, [conflictMerge, revisionConflict?.isOpen]);

  function useRecoveredBook(next, baseline, validation) {
    conflictGeneration.current++;
    validationSeq.current++;
    basePricebook.current = clone(baseline);
    const services = withClientServiceIds(next.services);
    setBook({...next, services});
    if (!services.some((service, index) => editorServiceKey(service, index) === selectedType)) setSelectedType(services.length ? editorServiceKey(services[0], 0) : null);
    setStatuses(validation?.statuses || null);
    setDraftValidationErrors(validation ? ownerValidationMessages(validation,next,metadata) : []);
    setRevisionConflict(null);
    setConflictChoices({});
    setError(null);
  }
  function acceptRecoveredDraft() {
    if (revisionConflict?.phase !== 'ready' || revisionConflict.errors?.length || !conflictMerge || conflictMerge.problem || conflictMerge.unresolved.length || revisionConflict.validatedDraft !== conflictMerge.draft) return;
    useRecoveredBook(conflictMerge.draft, revisionConflict.remote, revisionConflict.validation);
  }

  async function load() {
    const [dash, state, meta] = await Promise.all([
      api('/api/dashboard'),
      api('/api/onboarding/state'),
      api('/api/pricebook/meta')
    ]);
    const canQuote = ['Operator','QuoteDone','Scale'].includes(state.account.plan);
    const loadedBook = canQuote ? await api(`/api/pricebook/${dash.ownerId}`) : { services:[], defaults:{} };
    basePricebook.current = clone(loadedBook);
    setLocked(!canQuote);
    const activeTypes = state.profile.businessTypes || [];
    let services = editorServices(loadedBook.services, meta.services, activeTypes);
    const transferredDraft = consumePricebookTransfer('draft',dash.ownerId);
    const transferredSuggestions = consumePricebookTransfer('suggestions',dash.ownerId);
    setTransferNotice([transferredDraft.notice,transferredSuggestions.notice].filter(Boolean).join(' '));
    const draft = transferredDraft.value;
    if (draft?.services) {
      for (const incoming of draft.services) {
        // Interview values are DRAFT: on-screen field-by-field confirmation
        // starts from zero here regardless of the verbal confirmation.
        services.push({serviceType:incoming.serviceType,service:incoming.service,pricing:incoming.pricing||incoming.fields||{},source:'AI_INTERVIEW',active:false,knownOfferings:incoming.knownOfferings||{},tiers:incoming.tiers||[],confirmedFields:{}});
      }
    }
    const starter = transferredSuggestions.value;
    if (starter) {
      setSuggestions(starter);
    }
    services = withClientServiceIds(services);
    setDashboard(dash);
    setOnboarding(state);
    setMetadata(meta.services || []);
    setContract(meta);
    setBook({ ...loadedBook, services, defaults:{
      markupPercent:30, markupMode:'markup', taxMode:'TAX_NONE', taxPercent:0,
      rangeBufferPercent:10, ...(loadedBook.defaults || {})
    }});
    setStatuses(null);
    setDraftValidationErrors([]);
    setSelectedType(services.length ? editorServiceKey(services[0], 0) : null);
  }

  useEffect(() => { load().catch(setError); }, []);

  const selected = book?.services.find((service, index) => editorServiceKey(service, index) === selectedType);
  const selectedMeta = metadata.find(service => service.serviceType === selected?.serviceType);
  const feeContext = previewFeeContext(selectedType,selected?.feeRules);
  const customerFeeSelections = useMemo(() => reconcilePreviewFees(previewFeeDraft,selectedType,selected?.feeRules).values,[previewFeeDraft,feeContext]);
  useEffect(() => {
    setPreviewFeeDraft(previous=>reconcilePreviewFees(previous,selectedType,selected?.feeRules));
  },[feeContext]);


  useEffect(() => {
    if (!book || locked || revisionConflict || saving || approvalPending) return;
    // Do NOT clear statuses here. Clearing on every keystroke made every
    // service chip fall back to NEEDS PRICING mid-typing, including services
    // already proven QUOTING LIVE. The previous confirmed result stays on
    // screen until a completed validation replaces it.
    const seq = validationSeq.current + 1;
    validationSeq.current = seq;
    setValidating(true);
    const timer = setTimeout(() => {
      api('/api/pricebook/validate', { method:'POST', body:pricebookPayload(book) })
        .then(result => {
          // Out-of-order guard: ignore anything but the newest request.
          if (validationSeq.current !== seq) return;
          setStatuses(result.statuses || []);
          setDraftValidationErrors(ownerValidationMessages(result,book,metadata));
          setValidating(false);
        })
        .catch(nextError => {
          if (validationSeq.current !== seq) return;
          if (isRevisionConflict(nextError)) { recoverConflict(nextError); return; }
          // A failed validation must be visible and must never leave the UI
          // claiming the draft is valid. Surface the error, but do not
          // fabricate NEEDS PRICING for every service -- the last confirmed
          // statuses remain, and the error banner states the draft is unverified.
          setDraftValidationErrors([ownerMessage(nextError.message)]);
          setValidating(false);
        });
    }, 250);
    return () => { clearTimeout(timer); if (validationSeq.current === seq) validationSeq.current++; };
  }, [book, locked, !!revisionConflict, saving, approvalPending]);

  useEffect(() => {
    // Every response, rejection and completion belongs to this exact draft.
    // Cleanup invalidates already-running requests as well as the debounce.
    let current = true;
    const generation = mutationGeneration.current;
    const isCurrent = () => current && generation === mutationGeneration.current;
    setPreview(null);
    if(revisionConflict){setPreviewLoading(false);setPreview({resultType:'ESTIMATE_REQUIRES_REVIEW',reviewReason:'Reconcile your unsaved changes with the latest saved price book before previewing.'});return () => {current=false;};}
    if (!selected || !selectedMeta || !book || locked || saving || approvalPending) {
      setPreviewLoading(false);
      return () => { current = false; };
    }
    try { if(!contract.engineVersion)validatePricebookNumericDraft(book);else if(document.querySelector('[aria-invalid="true"]'))throw Error('Correct invalid numeric inputs before saving or previewing.'); }
    catch (problem) {
      setPreviewLoading(false);
      setPreview({ resultType:'ESTIMATE_REQUIRES_REVIEW', reviewReason:problem.message });
      return () => { current = false; };
    }
    setPreviewLoading(true);
    const timer = setTimeout(() => {
      api('/api/pricebook/preview', {
        method:'POST',
        body:pricebookPayload({ serviceId:selected.id, revision:book.revision, service:selected, defaults:book.defaults, customerInputs:selected.validationInputs || selectedMeta.sampleInputs, customerFeeSelections })
      }).then(result => { if (isCurrent()) setPreview(result); })
        .catch(nextError => { if (isCurrent()) { if (isRevisionConflict(nextError)) recoverConflict(nextError); else setPreview({ resultType:'ESTIMATE_REQUIRES_REVIEW', reviewReason:nextError.message }); } })
        .finally(() => { if (isCurrent()) setPreviewLoading(false); });
    }, 350);
    return () => { current = false; clearTimeout(timer); };
  }, [selected, selectedMeta, book?.defaults, book?.revision, locked, customerFeeSelections, revisionConflict, saving, approvalPending]);

  function replaceSelected(next) {
    setBook({ ...book, services:book.services.map((service, index) => editorServiceKey(service, index) === selectedType ? next : service) });
  }

  const aiSourced = selected && ['AI_SUGGESTED','AI_INTERVIEW'].includes(selected.source);

  function updateField(field, value, ownerEnteredPath=field) {
    let next=markEditedPriceMetadata(selected,editServiceField(selected, field, value));
    const leafValue=(source,path)=>path.slice(field.length+1).split('.').reduce((current,key)=>current?.[key],source);
    const optionalMap=ownerEnteredPath===field&&selectedMeta.class2Fields.some(definition=>definition.field===field&&definition.startingValueOnly);
    const paths=Object.keys(selected.startingValueState||{}).filter(path=>(path===ownerEnteredPath||path.startsWith(ownerEnteredPath+'.'))&&(!optionalMap||(Number.isFinite(leafValue(value,path))&&!Object.is(leafValue(value,path),leafValue(serviceFieldValue(selected,field),path)))));
    if(paths.length){
      const actions=next.startingValueActions||{};
      next={...next,startingValueActions:{...actions,ownerEnteredPaths:[...new Set([...(actions.ownerEnteredPaths||[]),...paths])],confirmPaths:(actions.confirmPaths||[]).filter(path=>!paths.includes(path))}};
    }
    replaceSelected(next);
  }

  function confirmStartingValue(path) {
    const actions=selected.startingValueActions||{};
    replaceSelected({...selected,startingValueActions:{...actions,confirmPaths:[...new Set([...(actions.confirmPaths||[]),path])],ownerEnteredPaths:(actions.ownerEnteredPaths||[]).filter(item=>item!==path)}});
  }

  function confirmRoofDependentLine(id) {
    const actions=selected.dependentLineActions||{};
    replaceSelected({...selected,dependentLineActions:{reenteredIds:[...new Set([...(actions.reenteredIds||[]),id])],confirmIds:[...new Set([...(actions.confirmIds||[]),id])]}});
  }

  function updatePriceMetadata(entry,patch) {
    const next=clone(selected);
    const target=entry.scope==='tier'?next.tiers[entry.tierIndex]:next;
    target.priceMetadata={...(target.priceMetadata||{}),[entry.path]:{...(target.priceMetadata?.[entry.path]||{}),...patch}};
    replaceSelected(next);
  }

  function toggleProductOffering(key, offered) {
    let next=selected;
    for(const field of PRODUCT_PRICE_FIELDS){
      const current=serviceFieldValue(next,field);
      const map=current&&typeof current==='object'&&!Array.isArray(current)?current:{};
      const prices={...map};
      if(offered){
        // Null survives an in-memory JSON clone as an explicit incomplete-draft
        // marker. Save rejects that marker until the owner enters a number or
        // turns the paired base price back off; it never becomes a free zero.
        if(!Object.hasOwn(prices,key))prices[key]=null;
      }else delete prices[key];
      next=editServiceField(next,field,Object.keys(prices).length?prices:undefined);
    }
    replaceSelected(next);
  }

  function confirmField(field, value) {
    replaceSelected({ ...selected, confirmedFields:{ ...(selected.confirmedFields || {}), [field]:value } });
  }

  function updateDefault(field, value) {
    setBook({ ...book, defaults:editBusinessDefault(book.defaults,field,value) });
  }

  function resetClass2(field) {
    replaceSelected(editServiceField(selected,field,clone(selectedMeta.class2Defaults[field])));
  }

  async function save() {
    if (revisionConflict) { await recoverConflict(); return; }
    const productProblem=enabledProductDraftProblem(book,metadata);
    if(productProblem){setError(Error(productProblem));return;}
    beginMutation(); setSaving(true); setError(null);
    try {
      for(const service of book.services)if(service.service!==undefined)validateServiceName(service.service);
      if(!contract.engineVersion)validatePricebookNumericDraft(book);else if(document.querySelector('[aria-invalid="true"]'))throw Error('Correct invalid numeric inputs before saving or previewing.');
      const result = await api('/api/pricebook/save', { method:'POST', body:pricebookPayload(book) });
      setStatuses(result.statuses || []);
      const loaded = await api(`/api/pricebook/${dashboard.ownerId}`);
      basePricebook.current = clone(loaded);
      const selectedIndex = book.services.findIndex((service, index) => editorServiceKey(service, index) === selectedType);
      setBook({ ...book, ...loaded });
      if (loaded.services?.[selectedIndex]) setSelectedType(editorServiceKey(loaded.services[selectedIndex], selectedIndex));
    } catch (nextError) { if (isRevisionConflict(nextError)) await recoverConflict(nextError); else setError(nextError); }
    finally { setSaving(false); }
  }

  async function suggest() {
    if(suggesting)return;
    setSuggesting(true);setError(null);setSuggestionError(null);
    try {
      const industry = (onboarding.profile.businessTypes || []).join(', ');
      const result = await api('/api/pricebook/suggest', { method:'POST', body:{ industry, serviceTypes:(onboarding.profile.businessTypes || []) } });
      setSuggestions(result);
    } catch (nextError) { setSuggestionError(nextError); }
    finally {setSuggesting(false);}
  }

  async function adoptStartingValues(group) {
    const savedService=basePricebook.current?.services?.find(service=>service.id===selected.id);
    if(!savedService||JSON.stringify(savedService)!==JSON.stringify(selected)){setError(Error('Save or discard editor changes before adopting the new pricing rules.'));return;}
    beginMutation();setSaving(true);setError(null);
    try{
      const result=await api('/api/pricebook/services/'+selected.id+'/approve',{method:'POST',body:{revision:book.revision,adoptStartingValueGroup:group}});
      const loaded=await api(`/api/pricebook/${dashboard.ownerId}`);basePricebook.current=clone(loaded);setBook(loaded);setStatuses(result.statuses||[]);
    }catch(nextError){if(isRevisionConflict(nextError))await recoverConflict(nextError);else setError(nextError);}
    finally{setSaving(false);}
  }

  function addSuggestion(item) {
    const existingIndex = book.services.findIndex(service => service.serviceType === item.serviceType);
    const draftFields = item.fields || {};
    const next = {
      serviceType:item.serviceType, service:item.service, ...draftFields,
      tiers:[], source:'AI_SUGGESTED', confirmedFields:{},
      validationInputs:clone(metadata.find(meta => meta.serviceType === item.serviceType)?.sampleInputs || {})
    };
    const services=withClientServiceIds([...book.services,{...next,active:false}]);
    setBook({...book,services});
    setSelectedType(editorServiceKey(services[services.length-1],services.length-1));
  }

  if (error && !book) return <div className="center-state"><ErrorMessage error={error} /></div>;
  if (!book || !dashboard || !onboarding) return <Loading label="LOADING PRICE BOOK" />;
  if (locked) {
    return (
      <AppShell activePath="/pricebook" operator={dashboard.operator}>
        <main className="pricebook-page">
          <PageHeader eyebrow="PRICE BOOK" title="Price book" description={PRICE_BOOK_UNAVAILABLE} />
          <section className="locked-pricebook">
            <div><p className="eyebrow">QUOTE REQUESTS CAPTURED</p><strong className="mono">{dashboard.quoteRequestCount}</strong></div>
            <Notice>Starter keeps answering and capturing every pricing request for owner review.</Notice>
            <Button onClick={() => go('/settings/billing')}>Choose Operator or QuoteDone</Button>
          </section>
        </main>
      </AppShell>
    );
  }
  // Validation returns one status per service in the submitted array order.
  // Before the first validation completes nothing is known yet. That is a
  // genuinely unknown state, not a failing one, so it must not read as
  // NEEDS PRICING.
  const unknownStatus = {
    status:'CHECKING',
    missingOwnerFields:[],
    missingOwnerLabels:[]
  };
  function displayStatus(service) {
    if (!service) return unknownStatus;
    const index = book.services.indexOf(service);
    return statuses?.[index]?.serviceType === service.serviceType ? statuses[index] : unknownStatus;
  }
  const selectedStatus = displayStatus(selected);
  // Split required from optional so required pricing stays open and dominant
  // while optional charges collapse. requiredAtBase comes from the server's
  // activation field list, so this mirrors real activation requirements.
  const configuredMode=servicePricing(selected||{}).offeringMode;
  const offeringSetup=!!configuredMode||selectedMeta?.requiresOffering;
  const allFields = (selectedMeta?.fields || []).filter(field=>!['installedMaterialsPercent','installedLaborPercent'].includes(field.field)&&(!['offering_configuration','scope_configuration','surface_configuration'].includes(field.type)||field.field==='plantSizes')&&(!offeringSetup||field.field==='minimumJob')).map(field=>{
    if(offeringSetup&&field.field==='minimumJob')return {...field,label:'Minimum job price',title:'Minimum job price',help:'Minimum for this offering; zero means no service minimum.',reviewOnly:false};
    return field;
  });
  const requiredFields = allFields.filter(field => field.requiredAtBase);
  const optionalFields = allFields.filter(field => !field.requiredAtBase);
  const missingSet = new Set(selectedStatus.missingOwnerFields || []);
  const requiredMissing = requiredFields.filter(field => missingSet.has(field.field));
  const optionalMissing = optionalFields.filter(field => missingSet.has(field.field));
  const optionalSet = optionalFields.filter(field => serviceFieldValue(selected, field.field) !== undefined).length;
  const class2Overridden = (selectedMeta?.class2Fields || []).filter(field => !field.startingValueOnly&&
    JSON.stringify(serviceFieldValue(selected, field.field) === undefined ? field.defaultValue : serviceFieldValue(selected, field.field)) !== JSON.stringify(field.defaultValue)).length;
  const selectedMoneyFields=selected?ownerMoneyEntries(selected):[];

  const markup = Number(book.defaults.markupPercent || 0);
  const equivalence = book.defaults.markupMode === 'markup'
    ? `${markup}% markup = ${(markup / (100 + markup) * 100).toFixed(1)}% margin`
    : `${markup}% margin = ${markup >= 100 ? 'invalid' : (markup / (100 - markup) * 100).toFixed(1)}% markup`;

  return (
    <AppShell activePath="/pricebook" operator={dashboard.operator}>
      <main className="pricebook-page">
        <PageHeader
          eyebrow="QUOTEDONE"
          title="Price book"
          description="Your prices drive every quote."
          actions={<><Button icon={Sparkles} variant="secondary" disabled={saving||approvalPending||!!revisionConflict} onClick={() => go('/onboarding?step=7')}>Build it with your AI</Button><Button icon={Sparkles} variant="secondary" disabled={saving||approvalPending||suggesting||!!revisionConflict} onClick={suggest}>{suggesting?'Generating draft…':'Suggest a starter book'}</Button></>}
        />
        {revisionConflict && <Notice tone="warning">Your draft has unsaved changes against an older saved version. Preview is paused until recovery is accepted.{!revisionConflict.isOpen && <Button variant="secondary" onClick={() => recoverConflict()}>Recover unsaved changes</Button>}</Notice>}
        {revisionConflict?.isOpen && <PricebookConflict state={revisionConflict} merge={conflictMerge?.problem ? null : conflictMerge} metadata={metadata} onChoice={(key, value) => setConflictChoices(current => ({...current, [key]:value}))} onAccept={acceptRecoveredDraft} onEdit={() => {conflictGeneration.current++;setRevisionConflict(current => ({...current, isOpen:false}));}} onRetry={() => recoverConflict()} onDiscard={() => useRecoveredBook(revisionConflict.remote, revisionConflict.remote)}/>}
        <fieldset disabled={saving||approvalPending||revisionConflict?.isOpen} style={{border:0,padding:0,margin:0,minWidth:0}} aria-label="Price book editor">
        {suggesting&&<p role="status">AI is preparing unconfirmed suggestions. You can keep editing prices manually.</p>}
        <ErrorMessage error={suggestionError} />
        {suggestions && (
          <section className="starter-panel">
            <div className="section-title"><Notice tone="warning">{suggestions.warning}</Notice><Button icon={X} variant="icon" onClick={() => setSuggestions(null)} aria-label="Close suggestions" /></div>
            <div className="starter-grid">
              {suggestions.suggestions.map(item => (
                <article key={`${item.serviceType}-${item.service}`}>
                  <strong>{item.service}</strong>
                  <span className="mono">{Object.keys(item.fields || {}).length} DRAFT values · confirm each before quoting</span>
                  <Button variant="quiet" onClick={() => addSuggestion(item)}>Use as draft</Button>
                </article>
              ))}
            </div>
          </section>
        )}
        <div className="pricebook-layout">
          <aside className="service-list"><Select aria-label="New service type" value={newServiceType} onChange={e=>setNewServiceType(e.target.value)}><option value="">Choose service type</option>{metadata.map(m=><option key={m.serviceType} value={m.serviceType}>{m.name}</option>)}</Select><Button variant="secondary" disabled={!newServiceType} onClick={()=>{const m=metadata.find(m=>m.serviceType===newServiceType);const [service]=withClientServiceIds([{serviceType:m.serviceType,service:m.name,source:'MANUAL',active:false,pricing:{},tiers:[],validationInputs:{}}]);const index=book.services.length;setBook({...book,services:[...book.services,service]});setSelectedType(editorServiceKey(service,index));}}>Add service</Button>
            <p className="eyebrow">SERVICES</p>
            {book.services.map((service, index) => {
              const meta = metadata.find(item => item.serviceType === service.serviceType);
              const status = displayStatus(service);
              const missing = status?.missingOwnerLabels || (meta?.fields.filter(field => field.requiredAtBase && serviceFieldValue(service, field.field) === undefined).map(field => field.label) || []);
              return (
                <button key={editorServiceKey(service, index)} className={selectedType === editorServiceKey(service, index) ? 'service-pick active' : 'service-pick'} type="button" onClick={() => setSelectedType(editorServiceKey(service, index))}>
                  <span><strong>{service.service || meta?.name || 'Service'}</strong></span>
                  <StatusChip status={status.status} label={priceOptionChipText(status)} pending={validating} />
                  <small className="mono service-compact-status">
                    {status.status === 'CHECKING'
                      ? 'Checking'
                      : status.status === 'DISABLED'
                        ? 'Disabled by you'
                        : status.status === 'QUOTING LIVE'
                          ? (status.scopeCoverage?.some(scope => !scope.configurationComplete)||status.laborAdjustmentCoverage?.length) ? 'Standard jobs ready · more scope needs setup' : 'Ready to quote'
                          : missing.length > 0
                            ? `${missing.length} ${missing.length === 1 ? 'price needed' : 'prices needed'}`
                            : 'Review configuration'}
                  </small>
                </button>
              );
            })}
          </aside>
          {selected && selectedMeta ? (
            <PricingContext.Provider value={selected}>
            <div className="editor-grid">
              <div className="editor-column">

                {/* REQUIRED PRICING — open and visually dominant.
                    Reference: pricebook-editor "ESSENTIALS" card. */}
                <section className="editor-section essentials">
                  <div className="section-title">
                    <div>
                      <p className="eyebrow">Your prices · required</p>
                      <h2>{selected.service || selectedMeta.name}</h2>
                      <span>Off The Clock never guesses these. Complete these prices and choose whether quoting is enabled for this service.</span>
                    </div>
                    <span className="mono set-count">
                      {requiredFields.length - requiredMissing.length} / {requiredFields.length} SET
                    </span>
                  </div>

                  <Field label="Offering name" help="Use a distinct name for each height, product or scope you offer. Names may contain up to 80 characters and are never silently shortened."><TextInput aria-label="Offering name" aria-invalid={!!serviceNameProblem(selected.service)} value={selected.service||''} onChange={event=>replaceSelected({...selected,service:event.target.value})}/>{serviceNameProblem(selected.service)&&<Notice tone="warning">{serviceNameProblem(selected.service)}</Notice>}</Field>
                  {selectedMeta.offeringCustomerFields&&<OfferingEditor key={selectedType} service={selected} meta={selectedMeta} onChange={replaceSelected}/>}
                  <SurfacePricingEditor service={selected} onChange={replaceSelected}/>
                  <ServiceStatusNotices status={selectedStatus}/>
                  {!!selectedStatus.stalePrices?.length&&<Notice tone="warning" title="Prices to check"><ul>{selectedStatus.stalePrices.map(row=><li key={row.displayPath}><strong>{humanPricingKey(row.path)}</strong>{row.tierName?' · '+row.tierName:''}: {row.dateLabel}{row.sourceNote?' · '+row.sourceNote:''}</li>)}</ul></Notice>}
                  {!!selectedStatus.aiPlaceholderPrices?.length&&<Notice tone="warning" title="AI placeholder prices"><p>Confirmation does not verify cost. These values remain marked until you enter a different number or choose “This is my price.”</p><ul>{selectedStatus.aiPlaceholderPrices.map(row=><li key={row.displayPath}>{humanPricingKey(row.path)}{row.tierName?' · '+row.tierName:''} — AI placeholder</li>)}</ul></Notice>}
                  {selectedStatus.productCoverage?.some(product=>!product.configurationComplete)&&<section className="scope-coverage" aria-label={selectedStatus.productCoverage.some(product=>product.selection.surfaceCondition)?'Surface condition pricing':'Product pricing coverage'}>
                    <h3>{selectedStatus.productCoverage.some(product=>product.selection.surfaceCondition)?'Surface condition pricing':'Product pricing coverage'}</h3>
                    <ul>{selectedStatus.productCoverage.map((product,index)=><li key={index}>
                      <strong>{[product.tierName,...Object.values(product.selection).map(humanPricingKey)].filter(Boolean).join(' · ')}</strong>
                      <span>{!product.configurationComplete&&product.missingOwnerLabels?.length?'Prices needed: '+product.missingOwnerLabels.join('; '):product.coverageMessage||(product.configurationComplete?'Ready to quote':'Needs setup: '+ownerDiagnosticLabels(product,selected,selectedMeta).join('; '))}</span>
                    </li>)}</ul>
                  </section>}
                  {!!selectedStatus.laborAdjustmentCoverage?.length&&<section className="scope-coverage" aria-label="Labor adjustment coverage"><h3>Conditions that still need a labor portion</h3><ul>{selectedStatus.laborAdjustmentCoverage.map((row,index)=><li key={index}><strong>{[row.tierName,...Object.entries(row.selection).map(([key,value])=>key==='stories'?value+'-story building':humanPricingKey(value)+' '+(key==='terrainSlope'?'ground':'walls'))].filter(Boolean).join(' · ')}</strong><span>{row.message} {row.components.map(humanPricingKey).join('; ')}.</span></li>)}</ul><p>Enter the percentages under Labor and materials in installed prices. Supported jobs remain available to quote.</p></section>}
                  {!!selectedStatus.scopeCoverage?.length && <section className="scope-coverage" aria-label="Requests that need scope setup">
                    <h3>Which requests can be quoted?</h3>
                    <p>Configured work can quote. These additional requests need the listed setup before they can be included.</p>
                    <ul>{selectedStatus.scopeCoverage.map(scope => <li key={scope.key}><strong>{scope.label}</strong><span>{scope.message}</span></li>)}</ul>
                    {selectedStatus.scopeCoverage.some(scope => !scope.configurationComplete || scope.variants.some(variant => !variant.configurationComplete)) && <p>Enter optional rates under <strong>Optional prices and add-on charges</strong>, and product or scope details under <strong>Additional priced scope</strong>. Unconfigured requests arrive as leads for your estimate.</p>}
                  </section>}

                  <Toggle checked={selected.active === true} onChange={active => replaceSelected({ ...selected, active })} label="Enable quoting for this service" />

                  {requiredMissing.length > 0 && (
                    <div className="blocker-drawer">
                      <p className="mono blocker-drawer-title">
                        {requiredMissing.length} {requiredMissing.length === 1 ? 'PRICE NEEDED' : 'PRICES NEEDED'}
                      </p>
                      <BlockerChecklist
                        items={requiredMissing.map(field => ({
                          field: field.field,
                          label: field.label,
                          service: selected.service || selectedMeta.name
                        }))}
                        onNavigate={item => {
                          const node = document.getElementById(`field-${item.field}`);
                          if (node) {
                            node.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            node.querySelector('input, select, textarea, button')?.focus();
                          }
                        }}
                      />
                    </div>
                  )}

                  {aiSourced && (
                    <Notice tone="warning">AI-captured values are DRAFT. Confirm each price and its tier overrides below — this service cannot go live until every required field is confirmed as yours.</Notice>
                  )}

                  <div className="field-stack">
                    {requiredFields.map(definition => (
                      <div key={definition.field} id={`field-${definition.field}`}
                        className={aiSourced ? 'field-confirm-row' : undefined}>
                        <OwnerField definition={definition} value={serviceFieldValue(selected, definition.field)} onChange={value => updateField(definition.field, value)} incompleteOfferings={selectedStatus.incompleteOfferings || []} status={selectedStatus} onToggleOffering={toggleProductOffering} />
                        {aiSourced && (
                          <Toggle
                            checked={selected.confirmedFields?.[definition.field] === true}
                            onChange={value => confirmField(definition.field, value)}
                            label={selected.confirmedFields?.[definition.field] === true ? 'CONFIRMED' : 'CONFIRM THIS VALUE'}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                  {!!selectedMoneyFields.length&&<Disclosure title="Price dates and sources" subtitle="See when each price last changed and optionally record its supplier or quote reference." summaryChip={`${selectedMoneyFields.length} PRICES`}>
                    <div className="field-stack">
                      {selectedMoneyFields.map(entry=>{
                        const adopted=entry.metadata?.acceptedAsOwnerPrice===true,placeholder=(entry.metadata?.aiPlaceholder===true||(aiSourced&&entry.metadata?.aiPlaceholder!==false))&&!adopted;
                        const date=entry.metadata?.changedAt?new Intl.DateTimeFormat('en-US',{timeZone:'UTC',month:'long',day:'numeric',year:'numeric'}).format(new Date(entry.metadata.changedAt)):'Date not recorded';
                        return <div className="owner-field" key={(entry.scope==='tier'?'tier-'+entry.tierIndex+'-':'base-')+entry.path}>
                          <span className="owner-field-title">{entry.tierName?entry.tierName+' · ':''}{humanPricingKey(entry.path)}</span>
                          <span className="owner-field-definition">Last changed: {date}{placeholder?' · AI placeholder':''}</span>
                          <Field label="Price source (optional)" help="Supplier name, quote number, or another short reference."><TextInput aria-label={(entry.tierName?entry.tierName+' ':'')+humanPricingKey(entry.path)+' price source'} value={entry.metadata?.sourceNote||''} onChange={event=>updatePriceMetadata(entry,{sourceNote:event.target.value})}/></Field>
                          {placeholder&&<Button variant="secondary" onClick={()=>updatePriceMetadata(entry,{acceptedAsOwnerPrice:true})}>This is my price</Button>}
                        </div>;
                      })}
                    </div>
                  </Disclosure>}
                </section>

                {selectedMeta.supportsScopeConfiguration&&<div className="editor-optional" data-editor-section="scope"><Disclosure key={'scope-'+selectedType} title="Additional priced scope" subtitle="Set up removal, preparation and other measured work you offer." summaryChip={selectedStatus.scopeCoverage?.some(scope=>!scope.configurationComplete)?'SETUP NEEDED':'REVIEW SCOPE'}><ScopeEditor service={selected} onChange={replaceSelected}/></Disclosure></div>}
                {!!selectedStatus.answerDefinitionFields?.length&&<div className="editor-optional" data-editor-section="answer-definitions"><Disclosure key={'answers-'+selectedType} title="Answer descriptions" subtitle="One line per choice, shown in the widget and read by the receptionist when a caller is unsure."><AnswerDefinitionsEditor service={selected} fields={selectedStatus.answerDefinitionFields} onChange={replaceSelected}/></Disclosure></div>}
                {contract.engineVersion&&<>
                  <InstalledMaterialsEditor service={selected} onChange={replaceSelected}/>
                  <Disclosure key={'rules-'+selectedType} title="Quote configuration" subtitle="Labor, materials, taxes, minimums and pricing rules."><ServiceRules service={selected} services={book.services} meta={selectedMeta} categories={contract.categories} feeNames={contract.feeNames} feeModes={contract.feeModes} defaults={book.defaults} onService={replaceSelected} onDefault={updateDefault}/></Disclosure>
                  <div className="editor-optional"><SavedApproval meta={selectedMeta} key={selectedType+book.revision} ownerId={dashboard.ownerId} serviceId={selected.id} draft={pricebookPayload(book)} onBusyChange={approvalBusy} onRevisionConflict={recoverConflict} onApproved={({before,after,serviceId,revision})=>{const next=mergeSavedApproval(draftRef.current,before,after,serviceId,revision);basePricebook.current=clone(after);setPreview(null);setStatuses(null);setBook(next);}}/></div>
                </>}

                {/* OPTIONAL PRICES — collapsed until relevant. */}
                {optionalFields.length > 0 && (
                  <Disclosure
                    title="Optional prices and add-on charges"
                    subtitle="Selected scope needs its configured price; missing pricing returns review."
                    summaryChip={`${optionalSet} OF ${optionalFields.length} SET`}
                    blockerCount={optionalMissing.length && aiSourced ? optionalMissing.length : 0}
                  >
                    {optionalFields.map(definition => (
                      <div key={definition.field} id={`field-${definition.field}`}
                        className={aiSourced ? 'field-confirm-row' : undefined}>
                        <OwnerField definition={definition} value={serviceFieldValue(selected, definition.field)} onChange={value => updateField(definition.field, value)} incompleteOfferings={selectedStatus.incompleteOfferings || []} status={selectedStatus} onToggleOffering={toggleProductOffering} />
                        {aiSourced && (
                          <Toggle
                            checked={selected.confirmedFields?.[definition.field] === true}
                            onChange={value => confirmField(definition.field, value)}
                            label={selected.confirmedFields?.[definition.field] === true ? 'CONFIRMED' : 'CONFIRM THIS VALUE'}
                          />
                        )}
                      </div>
                    ))}
                  </Disclosure>
                )}

                <RoofDependentLineNotice service={selected} onConfirm={confirmRoofDependentLine}/>

                {/* CLASS 2 QUANTITY ASSUMPTIONS — collapsed, defaults applied. */}
                {(selectedMeta.class2Fields || []).length > 0 && (
                  <Disclosure
                    title="Quantity assumptions"
                    subtitle="Review the assumptions used for your service. Sourced starting values need your confirmation or adoption."
                    summaryChip={class2Overridden > 0 ? `${class2Overridden} CHANGED` : 'DEFAULTS APPLIED'}
                  >
                    <div className="assumption-toolbar">
                      <span className="assumption-note">
                        These change how much material or labor a job is assumed to need. They are not prices.
                      </span>
                      <Button icon={RotateCcw} variant="secondary" onClick={() => {
                        let next = selected;
                        for (const [field, value] of Object.entries(selectedMeta.class2Defaults || {})) next = editServiceField(next, field, clone(value));
                        replaceSelected(next);
                      }}>Reset all to default</Button>
                    </div>
                    {[...new Set((selectedMeta.class2Fields||[]).map(field=>field.startingValueGroup).filter(group=>selected.startingValueAdoptions?.[group]?.mode==='legacy'))].map(group=>{const trade=group==='painting_coats_20261017'?'painting':group==='flooring_patterns_20261017'?'flooring':'roofing';return <Notice key={group} tone="warning"><strong>New {trade} starting values are available.</strong> This service is still using its previously approved pricing rules. Review the sources and assumptions below, then use one owner action to confirm these values and switch this service to the new rules. Existing owner values stay unchanged. <Button variant="secondary" onClick={()=>adoptStartingValues(group)}>Adopt new {trade} rules and starting values</Button></Notice>;})}
                    {(selectedMeta.class2Fields || []).filter(d=>!(servicePricing(selected).fenceOfferings&&d.field==='postSpacingLF')).map(definition => {
                      const current = serviceFieldValue(selected, definition.field) === undefined ? definition.defaultValue : serviceFieldValue(selected, definition.field);
                      const wastePercent=definition.ownerInputUnit==='percent';
                      const isStructured = definition.defaultValue && typeof definition.defaultValue === 'object';
                      const startingEntries=Object.entries(selected.startingValueState||{}).filter(([path])=>path===definition.field||path.startsWith(definition.field+'.'));
                      const startingNotice=startingEntries.length?<div className="starting-value-note">
                        <strong>{startingEntries.every(([,row])=>row.pendingAdoption)?'Starting values — available after adoption':startingEntries.every(([,row])=>row.confirmed===true)?'Starting value — confirmed':'Starting value — waiting for your confirmation'}</strong>
                        <p><strong>Source:</strong> {definition.startingValueSource||startingEntries[0][1].source}</p>
                        <p><strong>Assumption:</strong> {definition.startingValueAssumption||startingEntries[0][1].assumption}</p>
                        {startingEntries.map(([path,row])=>{
                          const queued=selected.startingValueActions?.confirmPaths?.includes(path),confirmed=row.confirmed===true;
                          return <div key={path}><span>{humanPricingKey(path.split('.').at(-1))}: {definition.startingValueOnly&&definition.unit==='decimal fraction'?`${(row.value*100).toLocaleString('en-US',{maximumSignificantDigits:12})} percentage points`:row.value} </span>{!row.pendingAdoption&&<Button variant="secondary" disabled={confirmed||queued} onClick={()=>confirmStartingValue(path)}>{confirmed?'CONFIRMED':queued?'CONFIRM ON SAVE':'Confirm '+humanPricingKey(path.split('.').at(-1))}</Button>}</div>;
                        })}
                      </div>:null;
                      if(definition.startingValueOnly)return <div className="assumption-row" key={definition.field}><span className="assumption-label">{definition.label}</span><p className="assumption-explanation">Edit these values in the service fields above. Existing owner values are preserved.</p>{startingNotice||<><p><strong>Source:</strong> {definition.startingValueSource}</p><p><strong>Assumption:</strong> {definition.startingValueAssumption}</p></>}</div>;
                      if (isStructured) {
                        return (
                          <div className="assumption-row" key={definition.field}>
                            <div className="assumption-head">
                              <span className="assumption-label">{definition.label}</span>
                              <Button icon={RotateCcw} variant="icon" title="Reset to default"
                                aria-label={`Reset ${definition.label}`} onClick={() => resetClass2(definition.field)} />
                            </div>
                            <p className="assumption-explanation">{definition.help}</p>
                            <StructuredFactorField
                              value={current}
                              defaultValue={definition.defaultValue}
                              unit={definition.unit}
                              wastePercent={wastePercent}
                              label={definition.label}
                              onChange={(value,path) => updateField(definition.field,value,[definition.field,...path].join('.'))}
                            />
                            {startingNotice}
                          </div>
                        );
                      }
                      return (<React.Fragment key={definition.field}>
                        <AssumptionRow
                          label={definition.label}
                          explanation={definition.help}
                          unit={wastePercent?'%':definition.unit}
                          value={current}
                          defaultValue={wastePercent?String(definition.defaultValue*100):JSON.stringify(definition.defaultValue).replace(/"/g, '')}
                          overridden={JSON.stringify(current) !== JSON.stringify(definition.defaultValue)}
                          inputControl={wastePercent?<WastePercentInput aria-label={definition.label} value={current} onChange={value => updateField(definition.field,value)}/>:<ExactNumericInput aria-label={definition.label} value={current} onChange={value => updateField(definition.field, value)} />}
                          onReset={() => resetClass2(definition.field)}
                        />
                        {startingNotice}
                      </React.Fragment>);
                    })}
                  </Disclosure>
                )}

                {!!selectedMeta.legacyClass2Fields?.length&&<Disclosure title="Retained legacy settings" subtitle="These values retain their saved meaning and location. They are not used by current quoting rules.">{selectedMeta.legacyClass2Fields.filter(d=>serviceFieldValue(selected,d.field)!==undefined).map(d=><Field key={d.field} label={d.label}><ExactNumericInput value={serviceFieldValue(selected,d.field)} onChange={v=>updateField(d.field,v)}/></Field>)}</Disclosure>}
                {/* GOOD / BETTER / BEST — collapsed until the owner opts in. */}
                {!selected.serviceType.startsWith('FENCING_')&&<Disclosure
                  title="Good / Better / Best tiers"
                  subtitle="Offer up to three options on one quote."
                  summaryChip={(selected.tiers || []).length ? `${(selected.tiers || []).length} SET` : 'NOT USED'}
                  defaultOpen={(selected.tiers || []).length > 0}
                >
                  <TierBuilder tiers={selected.tiers || []} definitions={overrides=>offeringTierFields(selectedMeta,selected,overrides)}
                    onChange={tiers => replaceSelected(markEditedPriceMetadata(selected,editServiceTiers(selected, tiers)))} />
                </Disclosure>}

                {/* BUSINESS-WIDE — must not compete with service pricing. */}
                <div className="business-wide">
                  <p className="eyebrow business-wide-eyebrow">Business-wide · applies to every service</p>
                  <Disclosure
                    title="Markup and margin"
                    subtitle={equivalence}
                    summaryChip={`${markup}%`}
                  >
                    <div className="segmented">
                      <button type="button" className={book.defaults.markupMode === 'markup' ? 'selected' : ''} onClick={() => updateDefault('markupMode','markup')}>MARKUP</button>
                      <button type="button" className={book.defaults.markupMode === 'margin' ? 'selected' : ''} onClick={() => updateDefault('markupMode','margin')}>MARGIN</button>
                    </div>
                    <Field label={book.defaults.markupMode === 'markup' ? 'Markup (%)' : 'Margin (%)'}>
                      <ExactNumericInput value={book.defaults.markupPercent} onChange={value => updateDefault('markupPercent', value)} />
                    </Field>
                    <div className="equivalence mono">{equivalence}</div>
                  </Disclosure>

                  <Disclosure
                    title="Tax"
                    subtitle={book.defaults.taxMode === 'TAX_NONE'
                      ? 'No tax line on quotes'
                      : `${book.defaults.taxMode === 'TAX_MATERIALS' ? 'Materials' : 'Entire job'} taxed at ${book.defaults.taxPercent}%`}
                    summaryChip={book.defaults.taxMode === 'TAX_NONE' ? 'NO TAX' : 'SET'}
                  >
                    <Field label="Tax mode">
                      <Select value={book.defaults.taxMode} onChange={event => updateDefault('taxMode',event.target.value)}>
                        <option value="TAX_NONE">No tax line</option>
                        <option value="TAX_MATERIALS">Tax materials</option>
                        <option value="TAX_ALL">Tax entire job</option>
                      </Select>
                    </Field>
                    {book.defaults.taxMode !== 'TAX_NONE' && (
                      <Field label="Tax rate (%)">
                        <ExactNumericInput value={book.defaults.taxPercent} onChange={value => updateDefault('taxPercent', value)} />
                      </Field>
                    )}
                    <Notice>Tax materials uses the categories you explicitly mark taxable in Quote configuration, except installed prices with a materials share: their materials share is taxed whatever their category, and the rest is not. Tax entire job taxes all categories. Review these selections before approval. Tax settings are your responsibility. Off The Clock applies the mode and rate you set — it does not provide tax advice.</Notice>
                  </Disclosure>
                  <Disclosure title="Price freshness and quote validity" subtitle="Optional reminders and customer validity wording." summaryChip={book.defaults.stalePriceThresholdDays||book.defaults.quoteValidityDays?'SET':'OFF'}>
                    <Field label="Flag prices older than (days)" help="Leave blank to turn this reminder off. Material and cost-basis prices with no recorded date are also flagged."><ExactNumericInput aria-label="Flag prices older than days" value={book.defaults.stalePriceThresholdDays} onChange={value=>updateDefault('stalePriceThresholdDays',value)}/></Field>
                    <Field label="Quotes valid for (days)" help="Leave blank for no validity statement. The end date is counted from the quote date in your business time zone."><ExactNumericInput aria-label="Quotes valid for days" value={book.defaults.quoteValidityDays} onChange={value=>updateDefault('quoteValidityDays',value)}/></Field>
                  </Disclosure>
                </div>
              </div>
              <div className="preview-tools"><Disclosure key={'preview-'+selectedType} title="Project measurements for preview" subtitle="Enter a job to check the customer estimate."><section className="preview-measurements"><h2>Project measurements for preview</h2><p>Enter measured facts. Unknown or unsupported scope returns review.</p>{configuredMode&&<Button variant="secondary" onClick={()=>replaceSelected({...selected,validationInputs:{}})}>Reset preview details</Button>}<CustomerFeePreview service={selected} feeNames={contract.feeNames} value={customerFeeSelections} onChange={values=>setPreviewFeeDraft({context:feeContext,serviceKey:selectedType,rules:{...selected.feeRules},values})}/><CustomerMeasurements fields={offeringPreviewFields(selectedMeta,selected)} knownOfferings={selected.knownOfferings} value={selected.validationInputs||{}} onChange={validationInputs=>replaceSelected({...selected,validationInputs})}/></section></Disclosure><Preview preview={preview} loading={previewLoading} status={selectedStatus} plan={onboarding.account.plan} /></div>
            </div>
            </PricingContext.Provider>
          ) : <Notice>Add a business type in onboarding to start a service editor.</Notice>}
        </div>
        {transferNotice&&<Notice tone="warning">{transferNotice}</Notice>}
        {contract.engineVersion&&<QuoteAccess/>}<ErrorMessage error={error} />
        {draftValidationErrors.length > 0 && (
          <Notice tone="warning">{draftValidationErrors.join(' ')}</Notice>
        )}
        <div className="save-bar">
          <StatusChip status={selectedStatus.status} label={priceOptionChipText(selectedStatus)} pending={validating} />
          {validating && (
            <span className="validating-note" role="status">
              <span className="validating-dot" aria-hidden="true" />
              Checking your changes
            </span>
          )}
          <Button icon={Check} onClick={save} disabled={saving}>{saving ? 'Saving' : 'Save & validate'}</Button>
          {approvalPending&&<span role="status">Updating saved approval…</span>}
          <span className="mono">SAVES PRICES | CHECKS EVERY SERVICE | UPDATES QUOTING STATUS</span>
        </div>
        </fieldset>
      </main>
    </AppShell>
  );
}
