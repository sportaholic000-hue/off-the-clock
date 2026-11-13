// The one email-address check: exactly what the account-email sender accepts
// (one @, no spaces or angle brackets, and a dot inside the domain). Sign-up,
// staff invitations, the sender and the owner app all use it, so they cannot
// disagree. Pure module: the owner app imports it too.
export const EMAIL_ADDRESS_MESSAGE = 'Enter a valid email address, like name@example.com.';
export function deliverableEmailAddress(value) {
  return typeof value === 'string' && /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(value);
}
