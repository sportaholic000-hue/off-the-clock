import React, { useState } from 'react';
import { ExactNumericInput } from './pricebookInputs.jsx';
import { Field, Select } from './ui.jsx';

const OWNER_RATE_PROVINCES = [['QC', 'Quebec'], ['BC', 'British Columbia'], ['MB', 'Manitoba'], ['SK', 'Saskatchewan']];
const codesText = codes => Array.isArray(codes) ? codes.join(', ') : typeof codes === 'string' ? codes : '';
const parseCodes = text => String(text || '').split(/[,;\n]+/).map(entry => entry.trim().replace(/\s+/g, '')).filter(Boolean);

// Sales tax by the job's location. Canada: GST/HST follows the province where
// the property is; Quebec, BC, Manitoba and Saskatchewan add a provincial tax
// whose rate the owner states. United States: owner ZIP tax zones, with the
// business rate everywhere else.
export function TaxLocationSettings({ defaults, onDefault }) {
  const on = defaults.taxByJobLocation === true;
  const country = defaults.currency === 'USD' ? 'US' : defaults.currency === 'CAD' ? 'CA' : null;
  const zones = Array.isArray(defaults.taxZones) ? defaults.taxZones : [];
  const [rawCodes, setRawCodes] = useState(() => zones.map(zone => codesText(zone?.codes)));
  const province = defaults.provinceTaxPercent && typeof defaults.provinceTaxPercent === 'object' ? defaults.provinceTaxPercent : {};
  const setProvince = (code, value) => {
    const next = { ...province };
    if (value === undefined || value === null || value === '') delete next[code]; else next[code] = value;
    onDefault('provinceTaxPercent', Object.keys(next).length ? next : undefined);
  };
  const setZones = next => onDefault('taxZones', next.length ? next : undefined);
  const updateZone = (index, patch) => setZones(zones.map((zone, i) => i === index ? { ...zone, ...patch } : zone));
  return <div data-testid="tax-location-settings">
    <Field label="Does the tax rate follow the job's location?" help="Turn this on when you work in more than one tax area. Customers then give a postal or ZIP code before the quote.">
      <Select value={on ? 'yes' : 'no'} onChange={event => onDefault('taxByJobLocation', event.target.value === 'yes' ? true : undefined)}>
        <option value="no">No: use my tax rate on every job</option>
        <option value="yes">Yes: use the rate where the job is</option>
      </Select>
    </Field>
    {on && country !== 'US' && <>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>GST/HST is charged at the rate of the province where the property is: 13% in Ontario, 14% in Nova Scotia, 15% in New Brunswick, Newfoundland and Labrador and Prince Edward Island, and 5% in Alberta and the territories. In the provinces below, enter the combined rate you charge there (GST plus any QST or PST you collect). Jobs in a province left blank go to you for review.</p>
      {OWNER_RATE_PROVINCES.map(([code, name]) => <Field key={code} label={`${name} rate (%)`}>
        <ExactNumericInput aria-label={`${name} tax rate percent`} value={province[code]} onChange={value => setProvince(code, value)} />
      </Field>)}
    </>}
    {on && country !== 'CA' && <div style={{ marginTop: 8 }}>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Add a zone for each area with a different rate, by 5-digit ZIP code or 3-digit ZIP prefix. A full ZIP code wins over a prefix. Jobs outside every zone use your tax rate above.</p>
      {zones.map((zone, index) => <div key={index} data-testid={`tax-zone-row-${index}`} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, alignItems: 'end', marginTop: 8 }}>
        <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Zone name
          <input className="form-input" value={zone?.name ?? ''} placeholder="e.g. City of Seattle" onChange={event => updateZone(index, { name: event.target.value })} />
        </label>
        <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>ZIP codes or prefixes
          <input className="form-input" value={rawCodes[index] ?? codesText(zone?.codes)} placeholder="e.g. 98101, 981" onChange={event => {
            const text = event.target.value;
            setRawCodes(prev => { const next = [...prev]; next[index] = text; return next; });
            updateZone(index, { codes: parseCodes(text) });
          }} />
        </label>
        <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Tax rate (%)
          <ExactNumericInput aria-label={`Tax zone ${index + 1} rate percent`} value={zone?.percent} onChange={value => updateZone(index, { percent: value })} />
        </label>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setRawCodes(prev => prev.filter((_, i) => i !== index)); setZones(zones.filter((_, i) => i !== index)); }}>Remove zone</button>
      </div>)}
      <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={() => { setRawCodes(prev => [...prev, '']); setZones([...zones, { name: '', codes: [], percent: undefined }]); }}>Add tax zone</button>
    </div>}
  </div>;
}
