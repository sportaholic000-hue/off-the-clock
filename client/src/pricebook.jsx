import {ServiceStatusNotices} from './quoteDoneControls.jsx';
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
import { humanPricingKey, productKeyFromName, DUPLICATE_NAME_MESSAGE } from './pricebookFormatting.js';
import { ExactNumericInput, WastePercentInput } from './pricebookInputs.jsx';
import { editBusinessDefault, addPriceTier, renameTierOverride, servicePricing, serviceFieldValue, editServiceField, editServiceTiers, editorServiceKey, editorServices, mergeSavedApproval, previewFeeContext, reconcilePreviewFees } from './pricebookEditing.js';
import { moneyKindForField, validatePricebookNumericDraft } from '../../server/priceBookMoney.js';
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


function ShapedMapField({ definition, value, onChange, incompleteOfferings = [] }) {
  const domain = definition.shapedKeys;
  const service = useContext(PricingContext);
  const kind = definition.moneyKind ?? moneyKindForField(service.serviceType, definition.field, servicePricing(service));
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
          Turn on only the {String(domain.keyLabel || 'type').toLowerCase()}s you actually sell.
          Anything left off is treated as not offered — never as free.
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
                const offered = offeredKeys.includes(key);
                const incomplete = incompleteOfferings.includes(key);
                return (
                  <tr key={key} className={offered ? '' : 'row-not-offered'}>
                    <th scope="row">
                      <label className="offered-toggle">
                        <input type="checkbox" checked={offered}
                          onChange={() => toggleOffered(key, !offered)} />
                        <span>{humanPricingKey(key)}</span>
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
                      ) : <span className="matrix-off mono">NOT OFFERED</span>}
                    </td>
                    <td className="matrix-status">
                      {!offered ? <span className="chip chip-quiet">NOT OFFERED</span>
                        : incomplete || !map[key] ? <span className="chip chip-need">NEEDS PRICE</span>
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
                          {domain.nestedCopy?.[nestedKey]?.unit === 'hours' ? 'h' : '$'}
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
              <th scope="col">Price ({domain.leafUnit || '$'})</th>
              {!fixed && <th scope="col" className="matrix-status" />}
            </tr>
          </thead>
          <tbody>
            {keys.map(key => (
              <tr key={key}>
                <th scope="row">{humanPricingKey(key)}</th>
                <td>
                  <div className="matrix-input">
                    <span className="matrix-prefix mono">$</span>
                    <ExactNumericInput kind={kind}
                      aria-label={`${humanPricingKey(key)} price`}
                      value={map[key]}
                      onChange={number => setLeaf(key, null, number)} />
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
              onChange={child => onChange({ ...current, [key]:child })}
            />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="factor-value">
      {wastePercent?<WastePercentInput aria-label={label} value={value === undefined ? defaultValue : value} onChange={onChange}/>:<ExactNumericInput aria-label={label} value={value === undefined ? defaultValue : value} onChange={onChange} />}
      <small>{wastePercent?'%':unit}</small>
    </div>
  );
}

function OwnerField({ definition, value, onChange, compact = false, incompleteOfferings = [] }) {
  const service = useContext(PricingContext);
  const kind = service.serviceType === 'CUSTOM' && ['price','low','high'].includes(definition.field)
    ? moneyKindForField(service.serviceType, definition.field, servicePricing(service))
    : definition.moneyKind ?? moneyKindForField(service.serviceType, definition.field, servicePricing(service));
  let control;
  if (definition.type === 'boolean') {
    control = <Toggle checked={Boolean(value)} onChange={onChange} label={value ? 'YES' : 'NO'} />;
  } else if (definition.type === 'select') {
    control = (
      <Select value={value || ''} onChange={event => onChange(event.target.value || undefined)}>
        <option value="">Choose</option>
        {(definition.options || []).map(option => <option key={option} value={option}>{definition.optionLabels?.[option] || 'Pricing option'}</option>)}
      </Select>
    );
  } else if (definition.type === 'json') {
    control = definition.tree ? <PricingTree value={value} onChange={onChange} definition={definition}/> : definition.shapedKeys
      ? <ShapedMapField definition={definition} value={value} onChange={onChange} incompleteOfferings={incompleteOfferings} />
      : <JsonEditor value={value} onChange={onChange} />;
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
    const field = definitions.find(item => !Object.hasOwn(tier.overrides || {}, item.field))?.field;
    if (!field) return;
    patchTier(index, { overrides:{ ...(tier.overrides || {}), [field]:undefined } });
  }
  function renameOverride(index, oldField, nextField) {
    const tier = tiers[index];
    if(!definitions.some(item=>item.field===nextField))return;
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
        {tiers.map((tier, index) => (
          <PricingContext.Provider key={index} value={{ ...service, pricing:{ ...servicePricing(service), ...tier.overrides } }}>
          <article className="tier-row">
            <div className="tier-heading">
              <TextInput value={tier.name} onChange={event => patchTier(index, { name:event.target.value })} aria-label={`Tier ${index + 1} name`} />
              <Button icon={Trash2} variant="icon" aria-label="Remove tier" title="Remove tier" onClick={() => removeTier(index)} />
            </div>
            <div className="override-list">
              {Object.entries(tier.overrides || {}).map(([field,value]) => {
                const definition = definitions.find(item => item.field === field) || definitions[0];
                return (
                  <div className="override-row" key={field}>
                    <Select value={field} onChange={event => renameOverride(index, field, event.target.value)}>
                      {definitions.map(item => <option key={item.field} value={item.field} disabled={item.field!==field&&Object.hasOwn(tier.overrides||{},item.field)}>{item.label}</option>)}
                    </Select>
                    {definition && <OwnerField definition={definition} value={value} onChange={next => setOverride(index, field, next)} compact />}
                    <Button icon={X} variant="icon" aria-label="Remove override" title="Remove override" onClick={() => removeOverride(index, field)} />
                  </div>
                );
              })}
            </div>
            <Button icon={Plus} variant="quiet" onClick={() => addOverride(index)}>Override a field</Button>
          </article>
          </PricingContext.Provider>
        ))}
      </div>
    </section>
  );
}

function Preview({ preview, loading, status }) {
  // Reference: design-reference/pricebook-editor/index.html "THE SIGNATURE
  // MOMENT" — the customer-facing estimate is the hero of the right rail.
  // Owner-only markup, margin and internal rates are never rendered here.
  const partial = preview?.resultType === 'PARTIAL_ESTIMATE_READY';
  const estimate = partial ? preview.pricedEstimate : preview;
  const ready = !loading && ['INSTANT_ESTIMATE_READY','PARTIAL_ESTIMATE_READY'].includes(preview?.resultType);
  const review = !loading && preview?.resultType === 'ESTIMATE_REQUIRES_REVIEW';
  const [tierIndex, setTierIndex] = useState(0);
  const options = ready ? (estimate.options || []) : [];
  const active = options[Math.min(tierIndex, Math.max(0, options.length - 1))] || null;

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
            <span className="eyebrow">What your customer hears</span>
          </span>
          <span className="mono quote-preview-note">UPDATES AS YOU TYPE</span>
        </div>
        <p className="quote-preview-sub">
          This is what the estimate will sound like on a call. Nothing saves until you save.
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
              emptyLabel={preview.reviewReason || 'Complete the required pricing before previewing this quote.'}
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

            <div className="quote-range">
              <div className="mono quote-range-label">RANGE YOUR CUSTOMER HEARS</div>
              <div className="quote-range-values">
                <span className="quote-low">${active.lowEstimate.toLocaleString()}</span>
                <span className="mono quote-dash">–</span>
                <span className="quote-high">${active.highEstimate.toLocaleString()}</span>
                {active.priceUnit&&<span className="quote-price-unit">{active.priceUnit}</span>}
              </div>
              {active.taxTreatment&&<p className="quote-tax-treatment">{active.taxTreatment}</p>}
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
              <div className="quote-midpoint-row">
                <span>Midpoint estimate</span>
                <span className="mono quote-midpoint-value">${active.midEstimate.toLocaleString()}{active.priceUnit ? ` ${active.priceUnit}` : ''}</span>
              </div>
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

            {status && (
              <div className={`quote-issue-state${status.status === 'QUOTING LIVE' ? ' live' : ''}`}>
                <StatusChip status={status.status} />
                <span>
                  {status.status === 'QUOTING LIVE'
                    ? 'This service can issue quotes on a live call.'
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

  async function load() {
    const [dash, state, meta] = await Promise.all([
      api('/api/dashboard'),
      api('/api/onboarding/state'),
      api('/api/pricebook/meta')
    ]);
    const canQuote = ['QuoteDone','Scale'].includes(state.account.plan);
    const loadedBook = canQuote ? await api(`/api/pricebook/${dash.ownerId}`) : { services:[], defaults:{} };
    setLocked(!canQuote);
    const activeTypes = state.profile.businessTypes || [];
    const services = editorServices(loadedBook.services, meta.services, activeTypes);
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
    if (!book || locked) return;
    // Do NOT clear statuses here. Clearing on every keystroke made every
    // service chip fall back to NEEDS PRICING mid-typing, including services
    // already proven QUOTING LIVE. The previous confirmed result stays on
    // screen until a completed validation replaces it.
    const seq = validationSeq.current + 1;
    validationSeq.current = seq;
    setValidating(true);
    const timer = setTimeout(() => {
      api('/api/pricebook/validate', { method:'POST', body:book })
        .then(result => {
          // Out-of-order guard: ignore anything but the newest request.
          if (validationSeq.current !== seq) return;
          setStatuses(result.statuses || []);
          setDraftValidationErrors(result.validationErrors || []);
          setValidating(false);
        })
        .catch(nextError => {
          if (validationSeq.current !== seq) return;
          // A failed validation must be visible and must never leave the UI
          // claiming the draft is valid. Surface the error, but do not
          // fabricate NEEDS PRICING for every service -- the last confirmed
          // statuses remain, and the error banner states the draft is unverified.
          setDraftValidationErrors([nextError.message]);
          setValidating(false);
        });
    }, 250);
    return () => { clearTimeout(timer); };
  }, [book, locked]);

  useEffect(() => {
    // Every response, rejection and completion belongs to this exact draft.
    // Cleanup invalidates already-running requests as well as the debounce.
    let current = true;
    setPreview(null);
    if(revisionConflict){setPreviewLoading(false);setPreview({resultType:'ESTIMATE_REQUIRES_REVIEW',reviewReason:revisionConflict});return () => {current=false;};}
    if (!selected || !selectedMeta || !book || locked) {
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
        body:{ serviceId:selected.id, revision:book.revision, service:selected, defaults:book.defaults, customerInputs:selected.validationInputs || selectedMeta.sampleInputs, customerFeeSelections }
      }).then(result => { if (current) setPreview(result); })
        .catch(nextError => { if (current) setPreview({ resultType:'ESTIMATE_REQUIRES_REVIEW', reviewReason:nextError.message }); })
        .finally(() => { if (current) setPreviewLoading(false); });
    }, 350);
    return () => { current = false; clearTimeout(timer); };
  }, [selected, selectedMeta, book?.defaults, book?.revision, locked, customerFeeSelections, revisionConflict]);

  function replaceSelected(next) {
    setBook({ ...book, services:book.services.map((service, index) => editorServiceKey(service, index) === selectedType ? next : service) });
  }

  const aiSourced = selected && ['AI_SUGGESTED','AI_INTERVIEW'].includes(selected.source);

  function updateField(field, value) {
    replaceSelected(editServiceField(selected, field, value));
  }

  function confirmField(field, value) {
    replaceSelected({ ...selected, confirmedFields:{ ...(selected.confirmedFields || {}), [field]:value } });
  }

  function updateDefault(field, value) {
    setBook({ ...book, defaults:editBusinessDefault(book.defaults,field,value) });
  }

  function resetClass2(field) {
    updateField(field, clone(selectedMeta.class2Defaults[field]));
  }

  async function save() {
    setSaving(true); setError(null);
    try {
      if(!contract.engineVersion)validatePricebookNumericDraft(book);else if(document.querySelector('[aria-invalid="true"]'))throw Error('Correct invalid numeric inputs before saving or previewing.');
      const result = await api('/api/pricebook/save', { method:'POST', body:book });
      setStatuses(result.statuses || []);
      const loaded = await api(`/api/pricebook/${dashboard.ownerId}`);
      const selectedIndex = book.services.findIndex((service, index) => editorServiceKey(service, index) === selectedType);
      setBook({ ...book, ...loaded });
      if (loaded.services?.[selectedIndex]) setSelectedType(editorServiceKey(loaded.services[selectedIndex], selectedIndex));
    } catch (nextError) { setError(nextError); }
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

  function addSuggestion(item) {
    const existingIndex = book.services.findIndex(service => service.serviceType === item.serviceType);
    const draftFields = item.fields || {};
    const next = {
      serviceType:item.serviceType, service:item.service, ...draftFields,
      tiers:[], source:'AI_SUGGESTED', confirmedFields:{},
      validationInputs:clone(metadata.find(meta => meta.serviceType === item.serviceType)?.sampleInputs || {})
    };
    const services=[...book.services,{...next,active:false}];
    setBook({...book,services});
    setSelectedType(editorServiceKey(services[services.length-1],services.length-1));
  }

  if (error && !book) return <div className="center-state"><ErrorMessage error={error} /></div>;
  if (!book || !dashboard || !onboarding) return <Loading label="LOADING PRICE BOOK" />;
  if (locked) {
    return (
      <AppShell activePath="/pricebook" operator={dashboard.operator}>
        <main className="pricebook-page">
          <PageHeader eyebrow="QUOTEDONE" title="Price book" description="Upgrade to QuoteDone or Scale to give callers prices from your own book." />
          <section className="locked-pricebook">
            <div><p className="eyebrow">QUOTE REQUESTS CAPTURED</p><strong className="mono">{dashboard.quoteRequestCount}</strong></div>
            <Notice>Operator keeps answering, booking, and capturing every pricing request without guessing.</Notice>
            <Button onClick={() => go('/onboarding?step=1')}>Choose QuoteDone</Button>
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
  const allFields = (selectedMeta?.fields || []).filter(field=>!['installedMaterialsPercent','installedLaborPercent'].includes(field.field)&&!['offering_configuration','scope_configuration'].includes(field.type)&&(!offeringSetup||field.field==='minimumJob')).map(field=>offeringSetup&&field.field==='minimumJob'?{...field,label:'Minimum job price',title:'Minimum job price',help:'Minimum for this offering; zero means no service minimum.',reviewOnly:false}:field);
  const requiredFields = allFields.filter(field => field.requiredAtBase);
  const optionalFields = allFields.filter(field => !field.requiredAtBase);
  const missingSet = new Set(selectedStatus.missingOwnerFields || []);
  const requiredMissing = requiredFields.filter(field => missingSet.has(field.field));
  const optionalMissing = optionalFields.filter(field => missingSet.has(field.field));
  const optionalSet = optionalFields.filter(field => serviceFieldValue(selected, field.field) !== undefined).length;
  const class2Overridden = (selectedMeta?.class2Fields || []).filter(field =>
    JSON.stringify(serviceFieldValue(selected, field.field) === undefined ? field.defaultValue : serviceFieldValue(selected, field.field)) !== JSON.stringify(field.defaultValue)).length;

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
          actions={<><Button icon={Sparkles} variant="secondary" disabled={saving||approvalPending} onClick={() => go('/onboarding?step=7')}>Build it with your AI</Button><Button icon={Sparkles} variant="secondary" disabled={saving||approvalPending||suggesting} onClick={suggest}>{suggesting?'Generating draft…':'Suggest a starter book'}</Button></>}
        />
        <fieldset disabled={saving||approvalPending} style={{border:0,padding:0,margin:0,minWidth:0}} aria-label="Price book editor">
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
          <aside className="service-list"><Select aria-label="New service type" value={newServiceType} onChange={e=>setNewServiceType(e.target.value)}><option value="">Choose service type</option>{metadata.map(m=><option key={m.serviceType} value={m.serviceType}>{m.name}</option>)}</Select><Button variant="secondary" disabled={!newServiceType} onClick={()=>{const m=metadata.find(m=>m.serviceType===newServiceType);const service={serviceType:m.serviceType,service:m.name,source:'MANUAL',active:false,pricing:{},tiers:[],validationInputs:{}};const index=book.services.length;setBook({...book,services:[...book.services,service]});setSelectedType(editorServiceKey(service,index));}}>Add service</Button>
            <p className="eyebrow">SERVICES</p>
            {book.services.map((service, index) => {
              const meta = metadata.find(item => item.serviceType === service.serviceType);
              const status = displayStatus(service);
              const missing = status?.missingOwnerLabels || (meta?.fields.filter(field => field.requiredAtBase && serviceFieldValue(service, field.field) === undefined).map(field => field.label) || []);
              return (
                <button key={editorServiceKey(service, index)} className={selectedType === editorServiceKey(service, index) ? 'service-pick active' : 'service-pick'} type="button" onClick={() => setSelectedType(editorServiceKey(service, index))}>
                  <span><strong>{service.service || meta?.name || 'Service'}</strong></span>
                  <StatusChip status={status.status} pending={validating} />
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

                  <Field label="Offering name" help="Use a distinct name for each height, product or scope you offer."><TextInput aria-label="Offering name" maxLength={40} value={selected.service||''} onChange={event=>replaceSelected({...selected,service:event.target.value})}/></Field>
                  {selectedMeta.offeringCustomerFields&&<OfferingEditor key={selectedType} service={selected} meta={selectedMeta} onChange={replaceSelected}/>}
                  <ServiceStatusNotices status={selectedStatus}/>
                  {selectedStatus.productCoverage?.some(product=>!product.configurationComplete)&&<section className="scope-coverage" aria-label={selectedStatus.productCoverage.some(product=>product.selection.surfaceCondition)?'Surface condition pricing':'Product pricing coverage'}>
                    <h3>{selectedStatus.productCoverage.some(product=>product.selection.surfaceCondition)?'Surface condition pricing':'Product pricing coverage'}</h3>
                    <ul>{selectedStatus.productCoverage.map((product,index)=><li key={index}>
                      <strong>{[product.tierName,...Object.values(product.selection).map(humanPricingKey)].filter(Boolean).join(' · ')}</strong>
                      <span>{product.coverageMessage||(product.configurationComplete?'Ready to quote':'Needs setup: '+product.ownerDiagnostics.map(item=>item.message).join(' '))}</span>
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
                        <OwnerField definition={definition} value={serviceFieldValue(selected, definition.field)} onChange={value => updateField(definition.field, value)} incompleteOfferings={selectedStatus.incompleteOfferings || []} />
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
                </section>

                {selectedMeta.supportsScopeConfiguration&&<div className="editor-optional" data-editor-section="scope"><Disclosure key={'scope-'+selectedType} title="Additional priced scope" subtitle="Set up removal, preparation and other measured work you offer." summaryChip={selectedStatus.scopeCoverage?.some(scope=>!scope.configurationComplete)?'SETUP NEEDED':'REVIEW SCOPE'}><ScopeEditor service={selected} onChange={replaceSelected}/></Disclosure></div>}
                {contract.engineVersion&&<>
                  <InstalledMaterialsEditor service={selected} onChange={replaceSelected}/>
                  <Disclosure key={'rules-'+selectedType} title="Quote configuration" subtitle="Labor, materials, taxes, minimums and pricing rules."><ServiceRules service={selected} services={book.services} meta={selectedMeta} categories={contract.categories} feeNames={contract.feeNames} feeModes={contract.feeModes} defaults={book.defaults} onService={replaceSelected} onDefault={updateDefault}/></Disclosure>
                  <div className="editor-optional"><SavedApproval meta={selectedMeta} key={selectedType+book.revision} ownerId={dashboard.ownerId} serviceId={selected.id} draft={book} onBusyChange={setApprovalPending} onRevisionConflict={problem=>setRevisionConflict(problem.message)} onApproved={({before,after,serviceId,revision})=>{const next=mergeSavedApproval(book,before,after,serviceId,revision);setPreview(null);setStatuses(null);setBook(next);}}/></div>
                </>}

                {/* OPTIONAL PRICES — collapsed until relevant. */}
                {optionalFields.length > 0 && (
                  <Disclosure
                    title="Optional prices and add-on charges"
                    subtitle="Missing scope prices require review. Unpriced optional extras are excluded from the estimate and disclosed to the customer; see each field for details."
                    summaryChip={`${optionalSet} OF ${optionalFields.length} SET`}
                    blockerCount={optionalMissing.length && aiSourced ? optionalMissing.length : 0}
                  >
                    {optionalFields.map(definition => (
                      <div key={definition.field} id={`field-${definition.field}`}
                        className={aiSourced ? 'field-confirm-row' : undefined}>
                        <OwnerField definition={definition} value={serviceFieldValue(selected, definition.field)} onChange={value => updateField(definition.field, value)} incompleteOfferings={selectedStatus.incompleteOfferings || []} />
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

                {/* CLASS 2 QUANTITY ASSUMPTIONS — collapsed, defaults applied. */}
                {(selectedMeta.class2Fields || []).length > 0 && (
                  <Disclosure
                    title="Quantity assumptions"
                    subtitle="Defaults are already being applied. Adjust only if your jobs differ."
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
                    {(selectedMeta.class2Fields || []).map(definition => {
                      const current = serviceFieldValue(selected, definition.field) === undefined ? definition.defaultValue : serviceFieldValue(selected, definition.field);
                      const wastePercent=/WasteFactor$|^wasteFactor$/.test(definition.field);
                      const isStructured = definition.defaultValue && typeof definition.defaultValue === 'object';
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
                              onChange={value => updateField(definition.field, value)}
                            />
                          </div>
                        );
                      }
                      return (
                        <AssumptionRow
                          key={definition.field}
                          label={definition.label}
                          explanation={definition.help}
                          unit={wastePercent?'%':definition.unit}
                          value={current}
                          defaultValue={wastePercent?String(definition.defaultValue*100):JSON.stringify(definition.defaultValue).replace(/"/g, '')}
                          overridden={JSON.stringify(current) !== JSON.stringify(definition.defaultValue)}
                          inputControl={wastePercent?<WastePercentInput aria-label={definition.label} value={current} onChange={value => updateField(definition.field,value)}/>:<ExactNumericInput aria-label={definition.label} value={current} onChange={value => updateField(definition.field, value)} />}
                          onReset={() => resetClass2(definition.field)}
                        />
                      );
                    })}
                  </Disclosure>
                )}

                {!!selectedMeta.legacyClass2Fields?.length&&<Disclosure title="Retained legacy settings" subtitle="These values retain their saved meaning and location. They are not used by current quoting rules.">{selectedMeta.legacyClass2Fields.filter(d=>serviceFieldValue(selected,d.field)!==undefined).map(d=><Field key={d.field} label={d.label}><ExactNumericInput value={serviceFieldValue(selected,d.field)} onChange={v=>updateField(d.field,v)}/></Field>)}</Disclosure>}
                {/* GOOD / BETTER / BEST — collapsed until the owner opts in. */}
                <Disclosure
                  title="Good / Better / Best tiers"
                  subtitle="Offer up to three options on one quote."
                  summaryChip={(selected.tiers || []).length ? `${(selected.tiers || []).length} SET` : 'NOT USED'}
                  defaultOpen={(selected.tiers || []).length > 0}
                >
                  <TierBuilder tiers={selected.tiers || []} definitions={offeringTierFields(selectedMeta,selected)}
                    onChange={tiers => replaceSelected(editServiceTiers(selected, tiers))} />
                </Disclosure>

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
                </div>
              </div>
              <div className="preview-tools"><Disclosure key={'preview-'+selectedType} title="Project measurements for preview" subtitle="Enter a job to check the customer estimate."><section className="preview-measurements"><h2>Project measurements for preview</h2><p>Enter measured facts. Unknown or unsupported scope returns review.</p>{configuredMode&&<Button variant="secondary" onClick={()=>replaceSelected({...selected,validationInputs:{}})}>Reset preview details</Button>}<CustomerFeePreview service={selected} feeNames={contract.feeNames} value={customerFeeSelections} onChange={values=>setPreviewFeeDraft({context:feeContext,serviceKey:selectedType,rules:{...selected.feeRules},values})}/><CustomerMeasurements fields={offeringPreviewFields(selectedMeta,selected)} knownOfferings={selected.knownOfferings} value={selected.validationInputs||{}} onChange={validationInputs=>replaceSelected({...selected,validationInputs})}/></section></Disclosure><Preview preview={preview} loading={previewLoading} status={selectedStatus} /></div>
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
          <StatusChip status={selectedStatus.status} pending={validating} />
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
