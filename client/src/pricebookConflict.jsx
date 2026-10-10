import {ownerMessage} from './pricebookDiagnostics.js';
import React, {useEffect, useRef, useState} from 'react';
import {Button, ErrorMessage, Notice} from './ui.jsx';
import {pricebookPayload} from './pricebookConflict.js';
import {retainedRows, reviewLabel, reviewRows} from './pricebookReview.js';

function ConflictValue({row, side, meta}) {
  if (row[side + 'Missing']) return <p>Removed</p>;
  const service = row.service || {serviceType:'CUSTOM', pricing:{}};
  const path = row.path.slice(row.path[0] === 'services' ? 2 : 0).join('.');
  const value = row[side];
  if (path === 'tiers' && Array.isArray(value)) return value.length ? <ul>{value.map((tier, index) => {
    const rows = reviewRows({...service, tiers:[tier]}, {}, meta).filter(item => item.label.startsWith('Price option:'));
    return <li key={index}><strong>{tier.name || 'Unnamed option'}</strong>{rows.length ? <dl>{rows.map((item, i) => <React.Fragment key={i}><dt>{item.label}</dt><dd>{item.value}</dd></React.Fragment>)}</dl> : <p>Uses the service’s base prices</p>}</li>;
  })}</ul> : <p>No price options</p>;
  const rows = row.kind !== 'value' ? reviewRows(pricebookPayload(value), {}, meta)
    : retainedRows(path, value, service, meta);
  return rows.length ? <dl>{rows.map((item, index) => <React.Fragment key={index}><dt>{item.label}</dt><dd>{item.value}</dd></React.Fragment>)}</dl> : <p>None</p>;
}

export function PricebookConflict({state, merge, metadata, onChoice, onAccept, onEdit, onRetry, onDiscard}) {
  const dialog = useRef(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  const busy = state.phase === 'loading' || state.phase === 'validating';
  return <dialog ref={dialog} className="pricebook-conflict" aria-labelledby="pricebook-conflict-title" onCancel={event => {event.preventDefault(); onEdit();}}>
    <h2 id="pricebook-conflict-title">Recover your unsaved changes</h2>
    <p>Another session saved a newer price book. Your unsaved changes are still here. Separate changes are combined automatically; choose which version to keep where both changed.</p>
    <Notice>Preview stays paused until recovery is accepted. Missing prices and pending approvals can still be saved as a draft.</Notice>
    {busy && <p role="status">{state.phase === 'loading' ? 'Loading the latest saved price book…' : 'Checking the combined draft…'}</p>}
    {merge?.conflicts.map(row => {
      const meta = metadata.find(item => item.serviceType === row.service?.serviceType) || {};
      const path = row.path.slice(row.path[0] === 'services' ? 2 : 0).join('.');
      const name = row.service?.service || meta.name || 'Business settings';
      const title = row.kind === 'remote_deleted' ? name + ' was deleted remotely but you have unsaved changes.'
        : row.kind === 'local_deleted' ? name + ' has newer saved changes but you removed it.'
        : name + ' · ' + reviewLabel(path, row.service || {serviceType:'CUSTOM', pricing:{}}, meta);
      return <fieldset key={row.key} disabled={busy} className="conflict-choice"><legend>{title}</legend>
        <div className="conflict-values">{[['base','When you opened it'], ['local','Your draft'], ['remote','Latest saved version']].map(([side, label]) => <section key={side}><h3>{label}</h3><ConflictValue row={row} side={side} meta={meta}/></section>)}</div>
        <label><input type="radio" name={row.key} checked={row.choice === 'local'} onChange={() => onChoice(row.key, 'local')}/>{row.kind === 'remote_deleted' ? 'Restore Service' : row.kind === 'local_deleted' ? 'Remove service' : 'Keep my change'}</label>
        <label><input type="radio" name={row.key} checked={row.choice === 'remote'} onChange={() => onChoice(row.key, 'remote')}/>{row.kind === 'remote_deleted' ? 'Discard local service edits' : row.kind === 'local_deleted' ? 'Keep saved service' : 'Keep saved change'}</label>
      </fieldset>;
    })}
    {state.errors?.length > 0 && <Notice tone="error"><strong>Correct these settings before accepting:</strong><ul>{state.errors.map(message => <li key={message}>{ownerMessage(message)}</li>)}</ul><span>Return to editing to correct the draft, then reopen recovery.</span></Notice>}
    <ErrorMessage error={state.error}/>
    {confirmDiscard ? <Notice tone="warning"><p>Discard all your unsaved changes and load the latest saved price book?</p><div className="conflict-actions"><Button disabled={busy} onClick={onDiscard}>Discard my draft and load saved version</Button><Button variant="secondary" onClick={() => setConfirmDiscard(false)}>Keep my draft</Button></div></Notice>
      : <div className="conflict-actions"><Button disabled={busy || !merge || merge.unresolved.length > 0 || !!state.error || !!state.errors?.length || state.phase !== 'ready' || state.validatedDraft !== merge.draft} onClick={onAccept}>Accept Merged Price Book</Button><Button variant="secondary" onClick={onEdit}>Return to editing</Button><Button variant="secondary" disabled={busy} onClick={onRetry}>Check latest saved version</Button><Button variant="quiet" disabled={busy || !state.remote} onClick={() => setConfirmDiscard(true)}>Load saved version</Button></div>}
  </dialog>;
}
