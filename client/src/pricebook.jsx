import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, Check, Plus, RotateCcw, Sparkles, Trash2, X } from 'lucide-react';
import { api, go } from './api.js';
import {
  AppShell, Button, ErrorMessage, Field, Loading, Notice, PageHeader,
  Select, StatusChip, Textarea, TextInput, Toggle
} from './ui.jsx';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function JsonEditor({ value, onChange }) {
  const [raw, setRaw] = useState(value !== undefined && value !== null ? JSON.stringify(value, null, 2) : '');
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    setRaw(value !== undefined && value !== null ? JSON.stringify(value, null, 2) : '');
  }, [value]);
  function commit() {
    if (!raw.trim()) { setInvalid(false); onChange(undefined); return; }
    try {
      onChange(JSON.parse(raw));
      setInvalid(false);
    } catch {
      setInvalid(true);
    }
  }
  return (
    <>
      <Textarea className={invalid ? 'invalid' : ''} rows="6" value={raw} onChange={event => setRaw(event.target.value)} onBlur={commit} />
      {invalid && <span className="field-error">Enter valid JSON before saving.</span>}
    </>
  );
}

function MoneyInput({ value, onChange, money }) {
  return (
    <div className={money ? 'money-input' : ''}>
      {money && <span>$</span>}
      <TextInput
        type="number"
        step="0.01"
        value={value ?? ''}
        onChange={event => onChange(event.target.value === '' ? undefined : Number(event.target.value))}
      />
    </div>
  );
}

function OwnerField({ definition, value, onChange, compact = false }) {
  let control;
  if (definition.type === 'boolean') {
    control = <Toggle checked={Boolean(value)} onChange={onChange} label={value ? 'YES' : 'NO'} />;
  } else if (definition.type === 'select') {
    control = (
      <Select value={value || ''} onChange={event => onChange(event.target.value || undefined)}>
        <option value="">Choose</option>
        {(definition.options || []).map(option => <option key={option} value={option}>{option}</option>)}
      </Select>
    );
  } else if (definition.type === 'json') {
    control = <JsonEditor value={value} onChange={onChange} />;
  } else {
    control = <MoneyInput value={value} onChange={onChange} money={definition.money} />;
  }
  if (compact) return control;
  return (
    <Field
      label={definition.label}
      help={definition.minimumAllowsZero ? '$0 is valid and means no minimum.' : definition.requiredAtBase ? 'Required before this service can quote.' : 'Used only when this scope or add-on is selected.'}
    >
      {control}
    </Field>
  );
}

function TierBuilder({ tiers, definitions, onChange }) {
  function addTier() {
    if (tiers.length >= 3) return;
    onChange([...tiers, { name:['Good','Better','Best'][tiers.length], overrides:{} }]);
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
    const next = { ...(tier.overrides || {}) };
    const value = next[oldField];
    delete next[oldField];
    next[nextField] = value;
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
          <article className="tier-row" key={index}>
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
                      {definitions.map(item => <option key={item.field} value={item.field}>{item.field}</option>)}
                    </Select>
                    {definition && <OwnerField definition={definition} value={value} onChange={next => setOverride(index, field, next)} compact />}
                    <Button icon={X} variant="icon" aria-label="Remove override" title="Remove override" onClick={() => removeOverride(index, field)} />
                  </div>
                );
              })}
            </div>
            <Button icon={Plus} variant="quiet" onClick={() => addOverride(index)}>Override a field</Button>
          </article>
        ))}
      </div>
    </section>
  );
}

function Preview({ preview, loading }) {
  return (
    <aside className="preview-column">
      <section className="live-preview">
        <div className="preview-title"><span className="live-dot" /><p className="eyebrow">LIVE SAMPLE QUOTE</p><small>UPDATES AS YOU TYPE</small></div>
        {loading && <div className="preview-empty mono">CALCULATING</div>}
        {!loading && !preview && <div className="preview-empty">Enter the required prices to see every tier.</div>}
        {!loading && preview?.resultType === 'ESTIMATE_REQUIRES_REVIEW' && (
          <div className="preview-empty">
            <StatusChip status="NEEDS PRICING" />
            <span className="mono">{(preview.missingOwnerFields || []).join(', ') || preview.reviewReason}</span>
          </div>
        )}
        {!loading && preview?.resultType === 'INSTANT_ESTIMATE_READY' && (
          <div className="preview-options">
            {preview.options.map((option, index) => (
              <article className="preview-option" key={option.tierName || index}>
                <div><strong>{option.tierName || 'Base option'}</strong><StatusChip status="QUOTING LIVE" /></div>
                <p><span>${option.lowEstimate.toLocaleString()}</span><small>to</small><span>${option.highEstimate.toLocaleString()}</span></p>
                <dl>
                  <div><dt>Midpoint</dt><dd>${option.midEstimate.toLocaleString()}</dd></div>
                  {(option.lineItems || []).map(item => <div key={`${option.tierName}-${item.name}`}><dt>{item.name}</dt><dd>${(item.amountCents / 100).toLocaleString(undefined,{maximumFractionDigits:2})}</dd></div>)}
                </dl>
                {option.skippedAddons?.length > 0 && <Notice tone="warning">{option.disclaimer}</Notice>}
              </article>
            ))}
          </div>
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
  const [statuses, setStatuses] = useState([]);
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [suggestions, setSuggestions] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    const [dash, state, meta] = await Promise.all([
      api('/api/dashboard'),
      api('/api/onboarding/state'),
      api('/api/pricebook/meta')
    ]);
    const loadedBook = await api(`/api/pricebook/${dash.ownerId}`);
    const activeTypes = state.profile.businessTypes || [];
    const existing = new Map((loadedBook.services || []).map(service => [service.serviceType, service]));
    const services = meta.services
      .filter(service => activeTypes.includes(service.serviceType) || existing.has(service.serviceType))
      .map(service => existing.get(service.serviceType) || {
        serviceType:service.serviceType,
        service:service.name,
        tiers:[],
        validationInputs:clone(service.sampleInputs)
      });
    const draft = JSON.parse(sessionStorage.getItem('otc_pricebook_draft') || 'null');
    if (draft?.services) {
      for (const incoming of draft.services) {
        const index = services.findIndex(service => service.serviceType === incoming.serviceType);
        if (index >= 0) services[index] = { ...services[index], ...incoming, source:'AI_INTERVIEW_DRAFT' };
        else services.push(incoming);
      }
      sessionStorage.removeItem('otc_pricebook_draft');
    }
    const starter = JSON.parse(sessionStorage.getItem('otc_pricebook_suggestions') || 'null');
    if (starter) {
      setSuggestions(starter);
      sessionStorage.removeItem('otc_pricebook_suggestions');
    }
    setDashboard(dash);
    setOnboarding(state);
    setMetadata(meta.services || []);
    setBook({ ...loadedBook, services, defaults:{
      markupPercent:30, markupMode:'markup', taxMode:'TAX_NONE', taxPercent:0,
      rangeBufferPercent:10, ...(loadedBook.defaults || {})
    }});
    setStatuses(dash.pricebookStatuses || []);
    setSelectedType(services[0]?.serviceType || null);
  }

  useEffect(() => { load().catch(setError); }, []);

  const selected = book?.services.find(service => service.serviceType === selectedType);
  const selectedMeta = metadata.find(service => service.serviceType === selectedType);

  useEffect(() => {
    if (!selected || !selectedMeta || !book) return;
    setPreviewLoading(true);
    const timer = setTimeout(() => {
      api('/api/pricebook/preview', {
        method:'POST',
        body:{ service:selected, defaults:book.defaults, customerInputs:selected.validationInputs || selectedMeta.sampleInputs }
      }).then(setPreview).catch(nextError => setPreview({ resultType:'ESTIMATE_REQUIRES_REVIEW', reviewReason:nextError.message })).finally(() => setPreviewLoading(false));
    }, 350);
    return () => clearTimeout(timer);
  }, [selected, selectedMeta, book?.defaults]);

  function replaceSelected(next) {
    setBook({ ...book, services:book.services.map(service => service.serviceType === selectedType ? next : service) });
  }

  function updateField(field, value) {
    replaceSelected({ ...selected, [field]:value, ...(selected.source === 'AI_SUGGESTED' ? { ownerConfirmed:false } : {}) });
  }

  function updateDefault(field, value) {
    setBook({ ...book, defaults:{ ...book.defaults, [field]:value } });
  }

  function resetClass2(field) {
    updateField(field, clone(selectedMeta.class2Defaults[field]));
  }

  async function save() {
    setSaving(true); setError(null);
    try {
      const result = await api('/api/pricebook/save', { method:'POST', body:book });
      setStatuses(result.statuses || []);
      const loaded = await api(`/api/pricebook/${dashboard.ownerId}`);
      setBook({ ...book, ...loaded });
    } catch (nextError) { setError(nextError); }
    finally { setSaving(false); }
  }

  async function suggest() {
    setError(null);
    try {
      const industry = (onboarding.profile.businessTypes || []).join(', ');
      const result = await api('/api/pricebook/suggest', { method:'POST', body:{ industry } });
      setSuggestions(result);
    } catch (nextError) { setError(nextError); }
  }

  function addSuggestion(item) {
    const existingIndex = book.services.findIndex(service => service.serviceType === item.serviceType);
    const next = { ...item, tiers:[], validationInputs:clone(metadata.find(meta => meta.serviceType === item.serviceType)?.sampleInputs || {}) };
    const services = existingIndex >= 0
      ? book.services.map((service,index) => index === existingIndex ? { ...service, starterSuggestion:item, source:'AI_SUGGESTED', ownerConfirmed:false } : service)
      : [...book.services, next];
    setBook({ ...book, services });
    setSelectedType(item.serviceType);
  }

  if (error && !book) return <div className="center-state"><ErrorMessage error={error} /></div>;
  if (!book || !dashboard || !onboarding) return <Loading label="LOADING PRICE BOOK" />;
  const statusMap = new Map(statuses.map(status => [status.serviceType, status]));
  const localRequired = selectedMeta?.fields.filter(field => field.requiredAtBase).map(field => field.field) || [];
  const selectedStatus = statusMap.get(selectedType) || {
    status:localRequired.every(field => {
      const value = selected?.[field];
      return field === 'postsIncludedInMaterial' ? value !== undefined : value !== undefined && value !== null && (['minimumJob','repairMinimum','minimumServiceCharge'].includes(field) || value !== 0);
    }) ? 'QUOTING LIVE' : 'NEEDS PRICING',
    missingOwnerFields:localRequired.filter(field => selected?.[field] === undefined || selected?.[field] === null)
  };
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
          actions={<><Button icon={Sparkles} variant="secondary" onClick={() => go('/onboarding?step=7')}>Build it with your AI</Button><Button icon={Sparkles} variant="secondary" onClick={suggest}>Suggest a starter book</Button></>}
        />
        {suggestions && (
          <section className="starter-panel">
            <div className="section-title"><Notice tone="warning">{suggestions.warning}</Notice><Button icon={X} variant="icon" onClick={() => setSuggestions(null)} aria-label="Close suggestions" /></div>
            <div className="starter-grid">
              {suggestions.suggestions.map(item => (
                <article key={`${item.serviceType}-${item.service}`}>
                  <strong>{item.service}</strong>
                  <span className="mono">${item.low} to ${item.high} · {item.unit}</span>
                  <Button variant="quiet" onClick={() => addSuggestion(item)}>Use as draft</Button>
                </article>
              ))}
            </div>
          </section>
        )}
        <div className="pricebook-layout">
          <aside className="service-list">
            <p className="eyebrow">SERVICES</p>
            {book.services.map(service => {
              const status = statusMap.get(service.serviceType);
              const meta = metadata.find(item => item.serviceType === service.serviceType);
              const missing = status?.missingOwnerFields || (meta?.fields.filter(field => field.requiredAtBase && service[field.field] === undefined).map(field => field.field) || []);
              return (
                <button key={service.serviceType} className={selectedType === service.serviceType ? 'service-row active' : 'service-row'} type="button" onClick={() => setSelectedType(service.serviceType)}>
                  <span><strong>{service.service || meta?.name || service.serviceType}</strong><small className="mono">{service.serviceType}</small></span>
                  <StatusChip status={status?.status || (missing.length ? 'NEEDS PRICING' : 'QUOTING LIVE')} />
                  {missing.length > 0 && <small className="missing-list mono">{missing.join(', ')}</small>}
                </button>
              );
            })}
          </aside>
          {selected && selectedMeta ? (
            <div className="editor-grid">
              <div className="editor-column">
                <section className="editor-section essentials">
                  <div className="section-title">
                    <div><p className="eyebrow">YOUR PRICES · REQUIRED</p><h2>{selected.service || selectedMeta.name}</h2><span>Off The Clock never guesses these. Complete the required fields and save to activate this service.</span></div>
                    <StatusChip status={selectedStatus.status} />
                  </div>
                  {selectedStatus.missingOwnerFields?.length > 0 && <Notice tone="warning">Missing: <span className="mono">{selectedStatus.missingOwnerFields.join(', ')}</span></Notice>}
                  <div className="field-stack">
                    {selectedMeta.fields.map(definition => (
                      <OwnerField key={definition.field} definition={definition} value={selected[definition.field]} onChange={value => updateField(definition.field, value)} />
                    ))}
                  </div>
                  {selected.source === 'AI_SUGGESTED' && (
                    <Toggle checked={selected.ownerConfirmed === true} onChange={value => replaceSelected({ ...selected, ownerConfirmed:value })} label="I replaced the placeholder ranges with my own prices" />
                  )}
                </section>
                <section className="editor-section">
                  <div className="section-title">
                    <div><p className="eyebrow">CLASS 2</p><h2>Quantity factors</h2><span>Engine defaults are shown. Reset restores the current spec value.</span></div>
                    <Button icon={RotateCcw} variant="secondary" onClick={() => {
                      const next = { ...selected };
                      for (const [field,value] of Object.entries(selectedMeta.class2Defaults || {})) next[field] = clone(value);
                      replaceSelected(next);
                    }}>Reset all</Button>
                  </div>
                  <div className="factor-list">
                    {Object.entries(selectedMeta.class2Defaults || {}).map(([field,defaultValue]) => (
                      <div className="factor-row" key={field}>
                        <Field label={field}>
                          {typeof defaultValue === 'object'
                            ? <JsonEditor value={selected[field] ?? defaultValue} onChange={value => updateField(field, value)} />
                            : <TextInput type="number" step="0.01" value={selected[field] ?? defaultValue} onChange={event => updateField(field, Number(event.target.value))} />}
                        </Field>
                        <Button icon={RotateCcw} variant="icon" title="Reset to default" aria-label={`Reset ${field}`} onClick={() => resetClass2(field)} />
                      </div>
                    ))}
                    {!Object.keys(selectedMeta.class2Defaults || {}).length && <Notice>No Class 2 factors for this service.</Notice>}
                  </div>
                </section>
                <TierBuilder tiers={selected.tiers || []} definitions={selectedMeta.fields} onChange={tiers => replaceSelected({ ...selected, tiers })} />
                <section className="editor-section">
                  <div className="section-title"><div><p className="eyebrow">MARKUP & MARGIN</p><h2>Price treatment</h2></div></div>
                  <div className="segmented">
                    <button type="button" className={book.defaults.markupMode === 'markup' ? 'selected' : ''} onClick={() => updateDefault('markupMode','markup')}>MARKUP</button>
                    <button type="button" className={book.defaults.markupMode === 'margin' ? 'selected' : ''} onClick={() => updateDefault('markupMode','margin')}>MARGIN</button>
                  </div>
                  <Field label={book.defaults.markupMode === 'markup' ? 'Markup (%)' : 'Margin (%)'}><TextInput type="number" min="0" max={book.defaults.markupMode === 'margin' ? 99.99 : undefined} step="0.1" value={book.defaults.markupPercent} onChange={event => updateDefault('markupPercent', Number(event.target.value))} /></Field>
                  <div className="equivalence mono">{equivalence}</div>
                </section>
                <section className="editor-section">
                  <div className="section-title"><div><p className="eyebrow">TAX</p><h2>Jurisdiction-aware tax</h2></div></div>
                  <Field label="Tax mode">
                    <Select value={book.defaults.taxMode} onChange={event => updateDefault('taxMode',event.target.value)}>
                      <option value="TAX_NONE">No tax line</option>
                      <option value="TAX_MATERIALS">Tax materials</option>
                      <option value="TAX_ALL">Tax entire job</option>
                    </Select>
                  </Field>
                  {book.defaults.taxMode !== 'TAX_NONE' && <Field label="Tax rate (%)"><TextInput type="number" min="0" max="100" step="0.01" value={book.defaults.taxPercent} onChange={event => updateDefault('taxPercent',Number(event.target.value))} /></Field>}
                  <Notice>Tax settings are your responsibility. Off The Clock applies the mode and rate you set. It does not provide tax advice.</Notice>
                </section>
              </div>
              <Preview preview={preview} loading={previewLoading} />
            </div>
          ) : <Notice>Add a business type in onboarding to start a service editor.</Notice>}
        </div>
        <ErrorMessage error={error} />
        <div className="save-bar">
          <StatusChip status={selectedStatus.status} />
          <Button icon={Check} onClick={save} disabled={saving}>{saving ? 'Saving' : 'Save & validate'}</Button>
          <span className="mono">SAVES IN CENTS · RE-RUNS ENGINE VALIDATION · RETURNS EACH SERVICE STATUS</span>
        </div>
      </main>
    </AppShell>
  );
}
