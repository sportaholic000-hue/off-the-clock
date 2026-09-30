const text = value => typeof value === 'string' ? value.trim() : '';

// This checks contact syntax, not ownership, consent, delivery or reachability.
// Either supported callback channel is sufficient; no name or country is guessed.
export function hasCallbackContact(contact) {
  if (!contact || typeof contact !== 'object' || Array.isArray(contact)) return false;
  return isCallbackEmail(contact.email) || isCallbackPhone(contact.phone);
}

export function invalidCallbackFields(contact) {
  if (!contact || typeof contact !== 'object' || Array.isArray(contact)) return [];
  return [['email',isCallbackEmail],['phone',isCallbackPhone]]
    .filter(([key,valid])=>typeof contact[key]==='string'&&contact[key].trim()&&!valid(contact[key]))
    .map(([key])=>key);
}

export function isCallbackEmail(value) {
  const email = text(value);
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isCallbackPhone(value) {
  const phone = text(value);
  const phoneDigits = phone.replace(/\D/g, '');
  return /^\+?[\d\s().-]+$/.test(phone) && phoneDigits.length >= 7 && phoneDigits.length <= 15;
}
