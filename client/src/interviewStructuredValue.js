import { humanPricingKey } from './pricebookFormatting.js';

// Pure helpers for structured interview answers: shape detection, validation
// and human-readable descriptions. Kept free of JSX so they are directly
// unit-testable and reusable by the readback.
//
// Shapes (from price-book metadata field.shapedKeys):
//   FIXED_KEYS       keys:[...]                  every key required
//   OWNER_SELECTABLE keys:[...], ownerSelectable  owner picks what they offer
//   NESTED           nested:[small,medium,large]  key x size matrix
//   OPEN             keys:null                    owner names the keys

export function structuredShape(domain) {
  if (!domain) return 'OPEN';
  if (Array.isArray(domain.nested) && domain.nested.length) return 'NESTED';
  if (domain.ownerSelectable === true) return 'OWNER_SELECTABLE';
  if (Array.isArray(domain.keys) && domain.keys.length) return 'FIXED_KEYS';
  return 'OPEN';
}

// A key is "offered" when the owner has enabled it. For owner-selectable
// domains an absent key means NOT OFFERED -- never free, never substituted.
function isBlank(value) {
  return value === undefined || value === null || value === '';
}

// Human sentence describing the answer, used for the on-screen confirmation
// and the spoken readback. Never emits JSON.
// Render one amount the way a person would say it: money leads with the
// symbol, other units follow the number. Never emits serialized data.
function speakAmount(amount, leafUnit) {
  const unit = String(leafUnit || '').trim();
  if (unit.startsWith('$')) {
    const rest = unit.replace(/^\$\s*/, '');
    return rest ? `$${amount} ${rest}` : `$${amount}`;
  }
  return unit ? `${amount} ${unit}` : String(amount);
}

export function describeStructuredValue(value, domain, fieldLabel) {
  const shape = structuredShape(domain);
  const entries = Object.entries(value || {});

  if (!entries.length) return `No prices entered yet for ${fieldLabel}.`;

  if (shape === 'NESTED') {
    const sizes = domain.nested;
    const parts = entries.map(([key, row]) => {
      const inner = sizes
        .filter(size => !isBlank(row?.[size]))
        .map(size => `${humanPricingKey(size)} ${speakAmount(row[size], domain?.leafUnit)}`)
        .join(', ');
      return `${humanPricingKey(key)}: ${inner}`;
    });
    return `${fieldLabel} — ${parts.join('; ')}`;
  }

  const priced = entries.filter(([, amount]) => !isBlank(amount));
  const parts = priced.map(([key, amount]) => `${humanPricingKey(key)} at ${speakAmount(amount, domain?.leafUnit)}`);

  if (shape === 'OWNER_SELECTABLE') {
    const offeredKeys = priced.map(([key]) => key);
    const notOffered = (domain.keys || []).filter(key => !offeredKeys.includes(key));
    const tail = notOffered.length
      ? `. Not offered: ${notOffered.map(humanPricingKey).join(', ')}`
      : '';
    return `${fieldLabel} — ${parts.join(', ')}${tail}`;
  }

  return `${fieldLabel} — ${parts.join(', ')}`;
}

// Validation mirrors the server's activation rules so the owner is told about a
// gap here rather than after saving. It never accepts a shape the price book
// would reject.
export function validateStructuredValue(value, domain, fieldLabel) {
  const shape = structuredShape(domain);
  const entries = Object.entries(value || {});

  if (shape === 'NESTED') {
    if (!entries.length) return `Add at least one row for ${fieldLabel}.`;
    for (const [key, row] of entries) {
      for (const size of domain.nested) {
        const amount = row?.[size];
        if (isBlank(amount)) {
          return `Enter a ${humanPricingKey(size)} price for ${humanPricingKey(key)}.`;
        }
        if (!(Number(amount) > 0)) {
          return `${humanPricingKey(key)} ${humanPricingKey(size)} must be more than zero.`;
        }
      }
    }
    return null;
  }

  const priced = entries.filter(([, amount]) => !isBlank(amount));
  if (!priced.length) {
    return shape === 'OWNER_SELECTABLE'
      ? `Turn on at least one option you offer and give it a price.`
      : `Enter a price for ${fieldLabel}.`;
  }
  for (const [key, amount] of priced) {
    if (!(Number(amount) > 0)) {
      return `${humanPricingKey(key)} must be more than zero.`;
    }
  }
  if (shape === 'FIXED_KEYS') {
    const missing = (domain.keys || []).filter(key => isBlank(value?.[key]));
    if (missing.length) {
      return `Still needed: ${missing.map(humanPricingKey).join(', ')}.`;
    }
  }
  return null;
}

