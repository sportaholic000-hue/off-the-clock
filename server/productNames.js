// Every owner control that names a product, gate or price row uses this one
// conversion, so a name registered in one place matches the same name typed in
// another. Stored names are lowercase words joined by underscores and must
// start with a letter (the engine's canonical form). Accents are folded
// (Épinette → epinette) and any other punctuation becomes a word break, so
// "O'Brien cedar" and "Vinyl (D4)" are accepted everywhere. A refused name
// returns a reason to show the owner; nothing is dropped silently.
export function productKeyFromName(name) {
  const key = String(name ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (!key) return { error: 'Enter a name using letters or numbers.' };
  if (!/^[a-z]/.test(key)) return { error: 'Start the name with a letter, for example "Three-tab shingle" instead of "3-tab shingle".' };
  return { key };
}
export const DUPLICATE_NAME_MESSAGE = 'That name is already listed.';

// A bare floor is an absence, not a product the owner must register.
// Both the engine and its voice adapter use this identity applicability rule.
export function productIdentityRequired(field, value) {
  return !(field === 'existingFloorType' && value === 'none');
}


export function registeredProductKey(value, keys) {
  if (typeof value !== 'string') return null;
  // Normalization, not fuzzy guessing: different named products never become
  // interchangeable and prices do not constitute product registration.
  const converted = productKeyFromName(value);
  if (converted.error) return null;
  const matches = keys.filter(key => key === converted.key);
  return matches.length === 1 ? matches[0] : null;
}
