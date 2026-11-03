// Owner signup is open unless OWNER_SIGNUP_ENABLED is exactly "false"
// (for example, a demo-and-waitlist launch before live email is set up).
export const OWNER_SIGNUP_CLOSED_MESSAGE = 'Signups are not open yet.';
export function ownerSignupEnabled(env = process.env) {
  return env.OWNER_SIGNUP_ENABLED !== 'false';
}
