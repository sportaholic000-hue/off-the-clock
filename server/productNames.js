// Every owner control that names a product, gate or price row uses this one
// conversion, so a name registered in one place matches the same name typed in
// another. Stored names are lowercase words joined by underscores and start
// with a letter (the engine's canonical form); see below for digit-first names. Accents are folded
// (Épinette → epinette) and any other punctuation becomes a word break, so
// "O'Brien cedar" and "Vinyl (D4)" are accepted everywhere. A refused name
// returns a reason to show the owner; nothing is dropped silently.
const foldName = name => String(name ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
  .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
// A name that starts with a digit ("3-tab shingle", "30 year shingle") is kept
// exactly as typed: its stored key is "n__" and the typed name in hexadecimal.
// A typed name never produces a double underscore, so these keys start with a
// letter and never collide with any other name.
const TYPED_PREFIX = 'n__';
const MAX_KEY_LENGTH = 200;
const toHex = text => [...new TextEncoder().encode(text)].map(byte => byte.toString(16).padStart(2, '0')).join('');
export function productNameFromKey(key) {
  if (typeof key !== 'string' || !key.startsWith(TYPED_PREFIX)) return null;
  const hex = key.slice(TYPED_PREFIX.length);
  if (!hex || hex.length % 2 || !/^[0-9a-f]+$/.test(hex)) return null;
  try { return new TextDecoder('utf-8', {fatal: true}).decode(new Uint8Array(hex.match(/../g).map(pair => parseInt(pair, 16)))); } catch { return null; }
}
// How a stored key reads: the typed name for a digit-first name, else the key
// with underscores read as spaces (as before).
export function keyLabel(key) {
  const typed = productNameFromKey(key);
  return typed ?? String(key).replaceAll('_', ' ');
}
export function productKeyFromName(name) {
  const key = foldName(name);
  if (!key) return { error: 'Enter a name using letters or numbers.' };
  if (/^[a-z]/.test(key)) return { key };
  const typed = TYPED_PREFIX + toHex(String(name).trim().replace(/\s+/g, ' '));
  if (typed.length > MAX_KEY_LENGTH) return { error: 'Use a shorter name.' };
  return { key: typed };
}
export const DUPLICATE_NAME_MESSAGE = 'That name is already listed.';
// Names that read the same once case, spaces and punctuation are ignored are
// one product ("3-tab shingle", "3 Tab Shingle"), as "Vinyl Plank" and
// "vinyl-plank" already are through the folded key.
export function productIdentity(key) {
  const typed = productNameFromKey(key);
  return typed === null ? key : TYPED_PREFIX + foldName(typed);
}
export function productNameTaken(key, keys) {
  const identity = productIdentity(key);
  return [...(keys || [])].some(existing => productIdentity(existing) === identity);
}
// Two different stored digit-first names anywhere in one saved value (a
// service) that read the same, as [first, second], or null.
export function duplicateTypedProductKeys(value) {
  const seen = new Map();
  let found = null;
  const note = key => {
    if (found || typeof key !== 'string' || productNameFromKey(key) === null) return;
    const identity = productIdentity(key), first = seen.get(identity);
    if (first === undefined) seen.set(identity, key); else if (first !== key) found = [first, key];
  };
  const visit = (node, depth) => {
    if (found || depth > 64) return;
    if (typeof node === 'string') { note(node); return; }
    if (Array.isArray(node)) { for (const item of node) visit(item, depth + 1); return; }
    if (node === null || typeof node !== 'object') return;
    for (const [key, item] of Object.entries(node)) { note(key); visit(item, depth + 1); }
  };
  visit(value, 0);
  return found;
}

// A bare floor is an absence, not a product the owner must register.
// Both the engine and its voice adapter use this identity applicability rule.
export function productIdentityRequired(field, value) {
  return !(field === 'existingFloorType' && value === 'none');
}


export function registeredProductKey(value, keys) {
  if (typeof value !== 'string') return null;
  // A digit-first product's own stored key identifies it exactly.
  if (productNameFromKey(value) !== null && keys.includes(value)) return value;
  // Normalization, not fuzzy guessing: different named products never become
  // interchangeable and prices do not constitute product registration.
  const converted = productKeyFromName(value);
  if (converted.error) return null;
  const exact = keys.filter(key => key === converted.key);
  if (exact.length === 1) return exact[0];
  // A digit-first name matches the way any other name does: case, spaces and
  // punctuation aside. Two registered names that read the same match neither.
  const typed = productNameFromKey(converted.key);
  if (typed === null) return null;
  const matches = keys.filter(key => { const name = productNameFromKey(key); return name !== null && foldName(name) === foldName(typed); });
  return matches.length === 1 ? matches[0] : null;
}
