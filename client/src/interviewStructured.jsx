import React, { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { humanPricingKey } from './pricebookFormatting.js';
import { Button, TextInput } from './ui.jsx';
import {
  structuredShape, describeStructuredValue, validateStructuredValue
} from './interviewStructuredValue.js';

export { structuredShape, describeStructuredValue, validateStructuredValue };

// Structured pricing questions for the AI price-book interview.
//
// The interview previously rendered these as a textarea asking the owner to
// type raw JSON (placeholder: {"key": 0}) and then spoke that raw text back.
// A service-business owner should never see or type serialized data.
//
// Four shapes come out of the price-book metadata (field.shapedKeys):
//   FIXED_KEYS       keys:[...]                     every key required
//   OWNER_SELECTABLE keys:[...], ownerSelectable    owner picks which apply
//   NESTED           nested:[small,medium,large]    key x size matrix
//   OPEN             keys:null                      owner names the keys
//
// Every shape produces the exact object the existing price-book validation and
// quote engine already expect. Nothing here relaxes those rules.

export default function StructuredPricingQuestion({ definition, value, onChange }) {
  const domain = definition.shapedKeys || {};
  const shape = structuredShape(domain);
  const map = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const keyLabel = domain.keyLabel || 'Type';
  const unit = domain.leafUnit || '$';
  const [newKey, setNewKey] = useState('');

  const fixedKeys = useMemo(
    () => (Array.isArray(domain.keys) ? domain.keys : Object.keys(map)),
    [domain.keys, map]
  );

  function write(next) {
    // An empty object is the same as "nothing answered yet".
    onChange(Object.keys(next).length ? next : {});
  }

  function setFlat(key, raw) {
    const next = { ...map };
    if (raw === '') delete next[key];
    else next[key] = Number(raw);
    write(next);
  }

  function setNested(key, size, raw) {
    const next = { ...map };
    const row = { ...(next[key] && typeof next[key] === 'object' ? next[key] : {}) };
    if (raw === '') delete row[size];
    else row[size] = Number(raw);
    if (Object.keys(row).length) next[key] = row;
    else delete next[key];
    write(next);
  }

  function toggleOffered(key, offered) {
    const next = { ...map };
    if (offered) next[key] = '';
    else delete next[key];
    write(next);
  }

  function addKey() {
    const key = newKey.trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (!/^[a-z][a-z0-9_]*$/.test(key) || map[key] !== undefined) return;
    write({ ...map, [key]: shape === 'NESTED' ? {} : '' });
    setNewKey('');
  }

  function removeKey(key) {
    const next = { ...map };
    delete next[key];
    write(next);
  }

  // --- Nested: type x size ---------------------------------------------
  if (shape === 'NESTED') {
    const rows = Object.keys(map);
    return (
      <div className="structured-question">
        <p className="structured-hint">
          Give a price for each size of every {String(keyLabel).toLowerCase()} you handle.
        </p>
        {rows.map(key => (
          <div className="structured-group" key={key}>
            <div className="structured-group-head">
              <span className="structured-group-title">{humanPricingKey(key)}</span>
              <Button variant="quiet" icon={Trash2} onClick={() => removeKey(key)}
                aria-label={`Remove ${humanPricingKey(key)}`}>Remove</Button>
            </div>
            <div className="structured-sizes">
              {domain.nested.map(size => (
                <label className="structured-cell" key={size}>
                  <span className="structured-cell-label">{humanPricingKey(size)}</span>
                  <span className="structured-input">
                    <span className="structured-prefix mono">{unit.startsWith('$') ? '$' : ''}</span>
                    <input
                      type="number" step="0.01" min="0" inputMode="decimal"
                      aria-label={`${humanPricingKey(key)} ${humanPricingKey(size)}`}
                      value={map[key]?.[size] ?? ''}
                      onChange={event => setNested(key, size, event.target.value)}
                    />
                  </span>
                </label>
              ))}
            </div>
          </div>
        ))}
        <div className="structured-add">
          <TextInput
            value={newKey}
            aria-label={`Add ${String(keyLabel).toLowerCase()}`}
            placeholder={`Add a ${String(keyLabel).toLowerCase()}`}
            onChange={event => setNewKey(event.target.value)}
          />
          <Button variant="secondary" icon={Plus} onClick={addKey}>Add</Button>
        </div>
      </div>
    );
  }

  // --- Owner-selectable: the owner picks what they offer -----------------
  if (shape === 'OWNER_SELECTABLE') {
    return (
      <div className="structured-question">
        <p className="structured-hint">
          Turn on only the {String(keyLabel).toLowerCase()}s you offer. Anything left off is
          treated as not offered — never as free.
        </p>
        {fixedKeys.map(key => {
          const offered = Object.hasOwn(map, key);
          return (
            <div className={`structured-row${offered ? '' : ' not-offered'}`} key={key}>
              <label className="structured-toggle">
                <input
                  type="checkbox"
                  checked={offered}
                  onChange={() => toggleOffered(key, !offered)}
                />
                <span>{humanPricingKey(key)}</span>
              </label>
              {offered ? (
                <span className="structured-input">
                  <span className="structured-prefix mono">{unit.startsWith('$') ? '$' : ''}</span>
                  <input
                    type="number" step="0.01" min="0" inputMode="decimal"
                    aria-label={`${humanPricingKey(key)} price`}
                    value={map[key] ?? ''}
                    onChange={event => setFlat(key, event.target.value)}
                  />
                </span>
              ) : (
                <span className="structured-off mono">NOT OFFERED</span>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // --- Fixed keys: every one required ------------------------------------
  if (shape === 'FIXED_KEYS') {
    return (
      <div className="structured-question">
        <p className="structured-hint">
          Give a price for each {String(keyLabel).toLowerCase()}. All of them are needed.
        </p>
        {fixedKeys.map(key => (
          <div className="structured-row" key={key}>
            <span className="structured-row-label">{humanPricingKey(key)}</span>
            <span className="structured-input">
              <span className="structured-prefix mono">{unit.startsWith('$') ? '$' : ''}</span>
              <input
                type="number" step="0.01" min="0" inputMode="decimal"
                aria-label={`${humanPricingKey(key)} ${unit}`}
                value={map[key] ?? ''}
                onChange={event => setFlat(key, event.target.value)}
              />
            </span>
          </div>
        ))}
      </div>
    );
  }

  // --- Open: the owner names the types they carry ------------------------
  return (
    <div className="structured-question">
      <p className="structured-hint">
        Add each {String(keyLabel).toLowerCase()} you work with and give it a price.
      </p>
      {Object.keys(map).map(key => (
        <div className="structured-row" key={key}>
          <span className="structured-row-label">{humanPricingKey(key)}</span>
          <span className="structured-input">
            <span className="structured-prefix mono">{unit.startsWith('$') ? '$' : ''}</span>
            <input
              type="number" step="0.01" min="0" inputMode="decimal"
              aria-label={`${humanPricingKey(key)} price`}
              value={map[key] ?? ''}
              onChange={event => setFlat(key, event.target.value)}
            />
          </span>
          <Button variant="quiet" icon={Trash2} onClick={() => removeKey(key)}
            aria-label={`Remove ${humanPricingKey(key)}`}>Remove</Button>
        </div>
      ))}
      <div className="structured-add">
        <TextInput
          value={newKey}
          aria-label={`Add ${String(keyLabel).toLowerCase()}`}
          placeholder={`Add a ${String(keyLabel).toLowerCase()}`}
          onChange={event => setNewKey(event.target.value)}
        />
        <Button variant="secondary" icon={Plus} onClick={addKey}>Add</Button>
      </div>
    </div>
  );
}
