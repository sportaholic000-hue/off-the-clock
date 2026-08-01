const DECIMAL_PATTERN = /^([+-]?)(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i;
const INTEGER_PATTERN = /^(?:0|[1-9]\d*)$/;
const SIGNED_INTEGER_PATTERN = /^(?:0|-?[1-9]\d*)$/;

function gcd(left, right) {
  left = left < 0n ? -left : left;
  right = right < 0n ? -right : right;
  while (right !== 0n) {
    const remainder = left % right;
    left = right;
    right = remainder;
  }
  return left;
}

function rational(numerator, denominator = 1n) {
  if (typeof numerator !== 'bigint' || typeof denominator !== 'bigint' || denominator === 0n) {
    throw new TypeError('Exact values require a nonzero BigInt denominator.');
  }
  if (denominator < 0n) {
    numerator = -numerator;
    denominator = -denominator;
  }
  if (numerator === 0n) return Object.freeze({ numerator: 0n, denominator: 1n });
  const divisor = gcd(numerator, denominator);
  return Object.freeze({ numerator: numerator / divisor, denominator: denominator / divisor });
}

function isRational(value) {
  return value !== null && typeof value === 'object' &&
    typeof value.numerator === 'bigint' && typeof value.denominator === 'bigint' &&
    value.denominator > 0n;
}

function decimalTextToRational(text) {
  const match = DECIMAL_PATTERN.exec(text);
  if (!match) throw new TypeError('Exact values must use finite decimal notation.');
  const [, sign, whole, fraction = '', exponentText = '0'] = match;
  const exponent = Number(exponentText);
  if (!Number.isSafeInteger(exponent)) throw new TypeError('Exact decimal exponent is unsafe.');
  const digits = (whole + fraction).replace(/^0+(?=\d)/, '');
  let numerator = BigInt(digits || '0');
  let denominator = 1n;
  const scale = fraction.length - exponent;
  if (scale > 0) denominator = 10n ** BigInt(scale);
  else if (scale < 0) numerator *= 10n ** BigInt(-scale);
  if (sign === '-') numerator = -numerator;
  return rational(numerator, denominator);
}

export function exactDecimal(value) {
  if (isRational(value)) return value;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError('Exact values must originate from finite numbers.');
  }
  return decimalTextToRational(value.toString());
}

export function exactAdd(...values) {
  return values.reduce((sum, value) => {
    const next = exactDecimal(value);
    return rational(
      sum.numerator * next.denominator + next.numerator * sum.denominator,
      sum.denominator * next.denominator
    );
  }, rational(0n));
}

export function exactSubtract(left, right) {
  const leftExact = exactDecimal(left);
  const rightExact = exactDecimal(right);
  return rational(
    leftExact.numerator * rightExact.denominator - rightExact.numerator * leftExact.denominator,
    leftExact.denominator * rightExact.denominator
  );
}

export function exactMultiply(...values) {
  return values.reduce((product, value) => {
    const next = exactDecimal(value);
    return rational(product.numerator * next.numerator, product.denominator * next.denominator);
  }, rational(1n));
}

export function exactDivide(dividend, divisor) {
  const left = exactDecimal(dividend);
  const right = exactDecimal(divisor);
  if (right.numerator === 0n) throw new RangeError('Exact division by zero is not allowed.');
  return rational(left.numerator * right.denominator, left.denominator * right.numerator);
}

export function exactCompare(left, right) {
  const leftExact = exactDecimal(left);
  const rightExact = exactDecimal(right);
  const difference = leftExact.numerator * rightExact.denominator - rightExact.numerator * leftExact.denominator;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

export function exactToNumber(value) {
  const exact = exactDecimal(value);
  const converted = Number(exact.numerator) / Number(exact.denominator);
  if (!Number.isFinite(converted)) throw new RangeError('Exact value cannot be represented as a finite number.');
  return converted;
}

export function exactRound(value) {
  const exact = exactDecimal(value);
  if (exact.numerator < 0n) throw new RangeError('Money rounding requires a non-negative exact value.');
  const quotient = exact.numerator / exact.denominator;
  const remainder = exact.numerator % exact.denominator;
  const rounded = remainder * 2n >= exact.denominator ? quotient + 1n : quotient;
  if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError('Rounded exact value exceeds safe integer range.');
  return Number(rounded);
}

export function exactIsSafeInteger(value) {
  const exact = exactDecimal(value);
  if (exact.denominator !== 1n) return false;
  const magnitude = exact.numerator < 0n ? -exact.numerator : exact.numerator;
  return magnitude <= BigInt(Number.MAX_SAFE_INTEGER);
}

export function exactEvidence(value) {
  const exact = exactDecimal(value);
  return {
    numerator: exact.numerator.toString(),
    denominator: exact.denominator.toString()
  };
}

export function exactFromEvidence(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== 2 || !Object.hasOwn(value, 'numerator') || !Object.hasOwn(value, 'denominator') ||
      typeof value.numerator !== 'string' || typeof value.denominator !== 'string' ||
      value.numerator.length > 400 || value.denominator.length > 400 ||
      !SIGNED_INTEGER_PATTERN.test(value.numerator) || !INTEGER_PATTERN.test(value.denominator) || value.denominator === '0') {
    throw new TypeError('Exact evidence must contain canonical numerator and denominator strings.');
  }
  const parsed = rational(BigInt(value.numerator), BigInt(value.denominator));
  const canonical = exactEvidence(parsed);
  if (canonical.numerator !== value.numerator || canonical.denominator !== value.denominator) {
    throw new TypeError('Exact evidence must be normalized.');
  }
  return parsed;
}

export function exactEvidenceMatches(value, evidence) {
  try {
    return exactCompare(value, exactFromEvidence(evidence)) === 0;
  } catch {
    return false;
  }
}
