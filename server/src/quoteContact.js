const text = value => typeof value === 'string' ? value.trim() : '';

// This checks contact syntax, not ownership, consent, delivery or reachability.
// Either supported callback channel is sufficient; no name or country is guessed.
export function hasCallbackContact(contact) {
  if (!contact || typeof contact !== 'object' || Array.isArray(contact)) return false;
  const email = text(contact.email), phone = text(contact.phone);
  const emailValid = email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const phoneDigits = phone.replace(/\D/g, '');
  const phoneValid = /^\+?[\d\s().-]+$/.test(phone) && phoneDigits.length >= 7 && phoneDigits.length <= 15;
  return emailValid || phoneValid;
}
