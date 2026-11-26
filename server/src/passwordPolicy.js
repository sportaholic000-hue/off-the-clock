// bcrypt uses only the first 72 bytes of a password, so no longer password is
// accepted: two passwords sharing those bytes would otherwise both sign in.
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_BYTES = 72;
export const PASSWORD_LENGTH_MESSAGE = 'Use a password of 8 to 72 characters. Accented letters and emoji count as more than one.';

export function passwordWithinBcryptLimit(value) {
  return typeof value === 'string' && Buffer.byteLength(value, 'utf8') <= PASSWORD_MAX_BYTES;
}

export function validPassword(value) {
  return typeof value === 'string' && value.length >= PASSWORD_MIN_LENGTH && passwordWithinBcryptLimit(value);
}
