import React, { useState } from 'react';
import { api } from './api.js';
import { Button, Field, Notice, Select, TextInput } from './ui.jsx';
import { TAX_MODE_OPTIONS, countryChangeTaxPrefill, countryChangeTaxReady, countryChangeTaxBody } from './countryChangeTax.js';

// The server asks once before a country change when services are approved. The
// confirmation names the old country, the new one and the price-book revision
// shown; a concurrent edit makes it stale and the server asks again. It also
// asks for the sales tax for the new country, prefilled from that country and
// region's preset when there is one and blank otherwise; confirming saves it.
export const countryChangeRequested = error => ['COUNTRY_CHANGE_CONFIRMATION_REQUIRED','COUNTRY_CHANGE_CONFIRMATION_STALE','COUNTRY_CHANGE_TAX_REQUIRED'].includes(error?.code) && !!error?.details?.countryChange;
export function CountryChangeConfirmation({ pending, onConfirm, busy = false }) {
  if (!pending) return null;
  // Kept while the owner edits; a confirmation for another country starts over.
  return <CountryChangeTaxConfirmation key={`${pending.countryChange?.to}:${JSON.stringify(pending.tax ?? null)}`} pending={pending} onConfirm={onConfirm} busy={busy} />;
}
function CountryChangeTaxConfirmation({ pending, onConfirm, busy }) {
  const [tax, setTax] = useState(() => countryChangeTaxPrefill(pending));
  return <Notice tone="warning">
    <p>{pending.message}</p>
    <Field label="Sales tax on customer invoices"><Select aria-label="Sales tax on customer invoices" value={tax.taxMode} onChange={event => setTax({ ...tax, taxMode: event.target.value })}><option value="">Choose</option>{TAX_MODE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field>
    {tax.taxMode && tax.taxMode !== 'TAX_NONE' && <Field label="Sales tax rate (%)"><TextInput aria-label="Sales tax rate" type="number" min="0" max="100" step="0.001" value={tax.taxPercent} onChange={event => setTax({ ...tax, taxPercent: event.target.value })} /></Field>}
    <Button disabled={busy || !countryChangeTaxReady(tax)} onClick={() => onConfirm(countryChangeTaxBody(tax))}>{pending.action || 'Change country'}</Button>
  </Notice>;
}

// Starter accounts skip the country at sign-up. The price book asks once,
// through the same jurisdiction route. A change with approved services saves the
// sales tax confirmed in the confirmation step.
export function BusinessCountryPrompt({ defaults = {}, onSaved }) {
  const [form, setForm] = useState({ country: '', region: '' });
  const [error, setError] = useState(null), [pending, setPending] = useState(null), [busy, setBusy] = useState(false);
  const taxKnown = ['TAX_NONE', 'TAX_MATERIALS', 'TAX_ALL'].includes(defaults.taxMode);
  const [tax, setTax] = useState({ taxMode: taxKnown ? defaults.taxMode : '', taxPercent: taxKnown && defaults.taxMode !== 'TAX_NONE' ? String(defaults.taxPercent ?? '') : '' });
  async function save(confirmation, confirmedTax) {
    setBusy(true); setError(null);
    try {
      await api('/api/business/jurisdiction', { method: 'POST', body: { ...form, ...countryChangeTaxBody(tax), ...(confirmation ? { countryChange: confirmation, ...confirmedTax } : {}) } });
      setPending(null);
      await onSaved?.();
    } catch (nextError) { if (countryChangeRequested(nextError)) setPending(nextError.details); else setError(nextError); }
    finally { setBusy(false); }
  }
  const ready = form.country && /^[A-Z]{2}$/.test(form.region) && tax.taxMode && (tax.taxMode === 'TAX_NONE' || Number(tax.taxPercent) > 0);
  return <Notice tone="warning">
    <p><strong>Business country.</strong> Your quotes use this country for sales tax, for which jobs you quote directly, for lead-paint screening on painting jobs and for your roofing building code. Services go live once it is saved.</p>
    <Field label="Country"><Select aria-label="Business country" value={form.country} onChange={event => setForm({ country: event.target.value, region: '' })}><option value="">Choose</option><option value="CA">Canada</option><option value="US">United States</option></Select></Field>
    {form.country && <Field label={form.country === 'US' ? 'State code' : 'Province code'}><TextInput aria-label="Business region" maxLength="2" value={form.region} onChange={event => setForm({ ...form, region: event.target.value.toUpperCase() })} /></Field>}
    {form.country && !taxKnown && <>
      <Field label="Sales tax on customer invoices"><Select aria-label="Sales tax on customer invoices" value={tax.taxMode} onChange={event => setTax({ ...tax, taxMode: event.target.value })}><option value="">Choose</option>{TAX_MODE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field>
      {tax.taxMode && tax.taxMode !== 'TAX_NONE' && <Field label="Sales tax rate (%)"><TextInput aria-label="Sales tax rate" value={tax.taxPercent} onChange={event => setTax({ ...tax, taxPercent: event.target.value })} /></Field>}
    </>}
    <CountryChangeConfirmation pending={pending} busy={busy} onConfirm={confirmedTax => save(pending.countryChange, confirmedTax)} />
    {error && <p role="alert" className="field-error">{error.message}</p>}
    <Button disabled={!ready || busy} onClick={() => save()}>Save business country</Button>
  </Notice>;
}
