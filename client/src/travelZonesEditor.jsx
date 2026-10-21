import React, { useState, useEffect } from 'react';

function formatCodesText(codes) {
  if (Array.isArray(codes)) return codes.join(', ');
  if (typeof codes === 'string') return codes;
  return '';
}

function parseCodesList(text) {
  if (typeof text !== 'string') return [];
  return text
    .split(/[,;\n]+/)
    .map((entry) => entry.trim().toUpperCase().replace(/\s+/g, ''))
    .filter(Boolean);
}

export function TravelZonesEditor({ zones, onChange }) {
  const list = Array.isArray(zones) ? zones : [];
  const [rawCodesByIndex, setRawCodesByIndex] = useState(() => list.map((zone) => formatCodesText(zone?.codes)));

  useEffect(() => {
    setRawCodesByIndex((prev) => list.map((zone, index) => {
      const formatted = formatCodesText(zone?.codes);
      if (prev[index] !== undefined && parseCodesList(prev[index]).join(',') === parseCodesList(formatted).join(',')) {
        return prev[index];
      }
      return formatted;
    }));
  }, [list.length, JSON.stringify(list.map((zone) => zone?.codes))]);

  const updateZone = (index, patch) => {
    const next = list.map((zone, i) => (i === index ? { ...zone, ...patch } : zone));
    onChange(next);
  };

  const addZone = () => {
    const next = [...list, { name: '', codes: [], charge: '' }];
    setRawCodesByIndex((prev) => [...prev, '']);
    onChange(next);
  };

  const removeZone = (index) => {
    const next = list.filter((_, i) => i !== index);
    setRawCodesByIndex((prev) => prev.filter((_, i) => i !== index));
    onChange(next.length ? next : undefined);
  };

  return (
    <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border-subtle)' }} data-testid="travel-zones-editor">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12, fontWeight: 700 }}>Travel zones (postal or ZIP code)</div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={addZone}>
          Add travel zone
        </button>
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0 8px' }}>
        Optional. Define postal or ZIP code zones to price travel by area. When zones are set, customers are asked only for their postal or ZIP code before the quote, and the matched zone&apos;s travel charge replaces the business-wide travel fee. Codes outside every zone are sent for review.
      </p>
      {list.map((zone, index) => (
        <div
          key={index}
          data-testid={`travel-zone-row-${index}`}
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(120px, 1fr) minmax(180px, 2fr) minmax(120px, 1fr) auto',
            gap: 8,
            alignItems: 'end',
            marginTop: 8
          }}
        >
          <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Zone name
            <input
              className="form-input"
              value={zone?.name ?? ''}
              placeholder="e.g. Core, Outer"
              onChange={(e) => updateZone(index, { name: e.target.value })}
            />
          </label>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Postal FSAs or ZIP codes / prefixes
            <input
              className="form-input"
              value={rawCodesByIndex[index] ?? formatCodesText(zone?.codes)}
              placeholder="e.g. E2L, E2M or 041"
              onChange={(e) => {
                const text = e.target.value;
                setRawCodesByIndex((prev) => prev.map((item, i) => (i === index ? text : item)));
                updateZone(index, { codes: parseCodesList(text) });
              }}
            />
          </label>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Travel charge ($)
            <input
              type="number"
              min="0"
              step="0.01"
              className="form-input"
              value={zone?.charge ?? ''}
              placeholder="0 allowed"
              onChange={(e) => updateZone(index, { charge: e.target.value === '' ? '' : Number(e.target.value) })}
            />
          </label>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => removeZone(index)}
          >
            Remove zone
          </button>
        </div>
      ))}
    </div>
  );
}
