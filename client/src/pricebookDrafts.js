import {sessionClaims} from './sessionIdentity.js';

const keys = {draft:'otc_pricebook_draft', suggestions:'otc_pricebook_suggestions'};
const ownerKnown = id => typeof id === 'string' && id.trim() === id && id.length > 0;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function transferKey(kind) {
  if (!Object.hasOwn(keys, kind)) throw Error('Unsupported price-book draft.');
  return keys[kind];
}

// The caller supplies the owner ID from its authenticated dashboard/onboarding
// response. Browser tokens are used only to clear transfers on session changes.
export function writePricebookTransfer(kind, ownerId, payload, storage) {
  if (!ownerKnown(ownerId)) throw Error('Sign in to the owner account before opening this price-book draft.');
  try {
    (storage ?? globalThis.sessionStorage).setItem(transferKey(kind), JSON.stringify({version:1, ownerId, payload}));
  } catch {
    throw Error('This browser could not keep the price-book draft for the editor. Your saved interview is still available; try resuming it or use the manual editor.');
  }
}
export function consumePricebookTransfer(kind, ownerId, storage) {
  try {
    const target = storage ?? globalThis.sessionStorage, key = transferKey(kind), raw = target.getItem(key);
    if (!raw) return {value:null, notice:null};
    target.removeItem(key);
    let envelope;
    try { envelope = JSON.parse(raw); } catch { /* rejected below */ }
    if (!record(envelope) || envelope.version !== 1 || !ownerKnown(ownerId) || envelope.ownerId !== ownerId) {
      return {value:null, notice:'We could not verify the owner of a price-book draft in this tab. It was not imported. Resume the saved interview from your own account, or generate new suggestions.'};
    }
    const payload = envelope.payload;
    if (!record(payload) || !Array.isArray(payload[kind === 'draft' ? 'services' : 'suggestions'])) {
      return {value:null, notice:'The price-book draft could not be read. Resume your saved interview or generate new suggestions.'};
    }
    return {value:payload, notice:null};
  } catch {
    return {value:null, notice:'This browser could not read the price-book draft. Resume your saved interview or use the manual editor.'};
  }
}
export function clearPricebookTransfersForSessionChange(previousToken, nextToken, storage) {
  const identity = token => { const c=sessionClaims(token);return c && typeof c.sub === 'string' ? JSON.stringify([c.sub,c.role]) : null; };
  const before=identity(previousToken), after=identity(nextToken);
  if (nextToken && before && before === after) return;
  try {const target=storage ?? globalThis.sessionStorage;for(const key of Object.values(keys))target?.removeItem(key);} catch { /* Cleanup must not interrupt sign-out. Imports still require an owner match. */ }
}
