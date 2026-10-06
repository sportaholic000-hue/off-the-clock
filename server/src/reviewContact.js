// The owner confirms who handles reviews in this business's existing inbox.
// Routing is server-owned; only the public name and role go to the receptionist.
function invalid() {
  const error = new Error('Review contact needs a name (up to 100 characters) and the role Owner or Manager.');
  error.code = 'INVALID_REQUEST';
  error.statusCode = 400;
  throw error;
}

function closed(value, keys) {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype ||
      Reflect.ownKeys(value).some(key => !keys.includes(key) || !('value' in Object.getOwnPropertyDescriptor(value, key)))) invalid();
}

export function normalizeReviewContact(value) {
  closed(value, ['name', 'role']);
  if (typeof value.name !== 'string' || value.name.length > 100 ||
      /[\p{Cc}\p{Cf}]/u.test(value.name) || !['owner', 'manager'].includes(value.role)) invalid();
  const name = value.name.trim();
  if (!/^[\p{L}\p{M}][\p{L}\p{M} .'’\-]*$/u.test(name) || !/\p{L}/u.test(name)) invalid();
  return { name, role: value.role };
}

export function readReviewContact(value, ownerId) {
  try {
    closed(value, ['name', 'role', 'ownerId']);
    if (typeof ownerId !== 'string' || !ownerId || value.ownerId !== ownerId) return null;
    return normalizeReviewContact({ name: value.name, role: value.role });
  } catch { return null; }
}
