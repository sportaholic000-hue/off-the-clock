import React, { useEffect, useRef, useState } from 'react';
import { parseOwnerNumericInput } from '../../server/priceBookMoney.js';
import { TextInput } from './ui.jsx';

// Keep entered decimal text while editing. Invalid text stays in the draft,
// so switching services cannot silently save an earlier accepted replacement.
export function ExactNumericInput({ value, onChange, kind = null, wholeCents = false, ...props }) {
  const [raw, setRaw] = useState(value === undefined || value === null ? '' : String(value));
  const [error, setError] = useState('');
  const emitted = useRef(value);
  useEffect(() => {
    const next = value === undefined || value === null ? '' : String(value);
    if (!Object.is(value, emitted.current)) {
      emitted.current = value;
      setRaw(next);
    }
    try { parseOwnerNumericInput(next, { kind, wholeCents }); setError(''); }
    catch (problem) { setError(problem.message); }
  }, [value, kind, wholeCents]);
  function change(text) {
    setRaw(text);
    try {
      const number = parseOwnerNumericInput(text, { kind, wholeCents });
      setError('');
      emitted.current = number;
      onChange(number);
    } catch (problem) {
      setError(problem.message);
      emitted.current = text;
      onChange(text);
    }
  }
  return <>
    <TextInput {...props} type="text" inputMode="decimal" value={raw}
      aria-invalid={Boolean(error)} onChange={event => change(event.target.value)} />
    {error && <span className="field-error" role="alert">{error}</span>}
  </>;
}
