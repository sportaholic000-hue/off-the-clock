import React, { useState } from 'react';
import { api } from './api.js';
import { Button, Field, Notice, Select, TextInput } from './ui.jsx';

// The server asks once before a country change when services are approved. The
// confirmation names the old country, the new one and the price-book revision
// shown; a concurrent edit makes it stale and the server asks again.
export const countryChangeRequested = error => ['COUNTRY_CHANGE_CONFIRMATION_REQUIRED','COUNTRY_CHANGE_CONFIRMATION_STALE'].includes(error?.code) && !!error?.details?.countryChange;
export function CountryChangeConfirmation({ pending, onConfirm }) {
  if (!pending) return null;
  return <Notice tone="warning"><p>{pending.message}</p><Button onClick={onConfirm}>{pending.action || 'Change country'}</Button></Notice>;
}

// Starter accounts skip the country at sign-up. The price book asks once,
// through the same jurisdiction route, keeping the book's tax settings.
export function BusinessCountryPrompt({ defaults = {}, onSaved }) {
  const [form, setForm] = useState({ country: '', region: '' });
  const [error, setError] = useState(null), [pending, setPending] = useState(null), [busy, setBusy] = useState(false);
  const taxKnown = ['TAX_NONE', 'TAX_MATERIALS', 'TAX_ALL'].includes(defaults.taxMode);
  const [tax, setTax] = useState({ taxMode: taxKnown ? defaults.taxMode : '', taxPercent: taxKnown && defaults.taxMode !== 'TAX_NONE' ? String(defaults.taxPercent ?? '') : '' });
  async function save(confirmation) {
    setBusy(true); setError(null);
    try {
      await api('/api/business/jurisdiction', { method: 'POST', body: { ...form, taxMode: tax.taxMode, taxPercent: tax.taxMode === 'TAX_NONE' ? '0' : tax.taxPercent, ...(confirmation ? { countryChange: confirmation } : {}) } });
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
      <Field label="Sales tax on customer invoices"><Select aria-label="Sales tax on customer invoices" value={tax.taxMode} onChange={event => setTax({ ...tax, taxMode: event.target.value })}><option value="">Choose</option><option value="TAX_NONE">No tax line on customer invoices</option><option value="TAX_MATERIALS">Tax on materials</option><option value="TAX_ALL">Tax on the entire job</option></Select></Field>
      {tax.taxMode && tax.taxMode !== 'TAX_NONE' && <Field label="Sales tax rate (%)"><TextInput aria-label="Sales tax rate" value={tax.taxPercent} onChange={event => setTax({ ...tax, taxPercent: event.target.value })} /></Field>}
    </>}
    <CountryChangeConfirmation pending={pending} onConfirm={() => save(pending.countryChange)} />
    {error && <p role="alert" className="field-error">{error.message}</p>}
    <Button disabled={!ready || busy} onClick={() => save()}>Save business country</Button>
  </Notice>;
}
