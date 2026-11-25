// A callback number in international (E.164) form for a business in Canada
// or the United States, which share the +1 numbering plan. "(506) 555-0123",
// "506-555-0123" and "1 506 555 0123" become "+15065550123"; a number already
// in international form is kept; anything else returns null and is refused
// where an international number is required (Neon audit of v50, V50-3).
// Shared by the server and the booking widget; no dependencies.
export function northAmericanPhone(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || !/^\+?[\d\s().-]+$/.test(text)) return null;
  const digits = text.replace(/\D/g, '');
  if (text.startsWith('+')) return /^[1-9]\d{7,14}$/.test(digits) ? '+' + digits : null;
  const local = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  return /^[2-9]\d{2}[2-9]\d{6}$/.test(local) ? '+1' + local : null;
}
