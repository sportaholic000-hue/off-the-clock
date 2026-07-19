const CA = {
  ON: [13], NB: [15], NL: [15], PE: [15], NS: [14],
  AB: [5], NT: [5], NU: [5], YT: [5],
  BC: [5, true], SK: [5, true], MB: [5, true], QC: [5, true]
};
const US_NO_STATE_SALES_TAX = new Set(['OR','MT','NH','DE','AK']);
const pstNote = 'Your province has PST/QST in addition to GST. PST treatment of contractor work varies by province and job type. Confirm your combined rate with your accountant and update it here.';
const usNote = 'How do you handle sales tax on customer invoices? Owner confirmation is required; Off The Clock does not provide tax advice.';

export function resolveJurisdiction(country, region) {
  const c = String(country || '').toUpperCase();
  const r = String(region || '').toUpperCase();
  if (c === 'CA') {
    const found = CA[r];
    if (!found) return { taxMode: null, taxPercent: null, locked: false, needsOwnerConfirmation: true, note: pstNote };
    return { taxMode: 'TAX_ALL', taxPercent: found[0], locked: false, needsOwnerConfirmation: Boolean(found[1]), note: found[1] ? pstNote : null };
  }
  if (c === 'US') {
    if (US_NO_STATE_SALES_TAX.has(r)) return { taxMode: 'TAX_NONE', taxPercent: 0, locked: false, needsOwnerConfirmation: false, note: null };
    return { taxMode: null, taxPercent: null, locked: false, needsOwnerConfirmation: true, note: usNote };
  }
  return { taxMode: null, taxPercent: null, locked: false, needsOwnerConfirmation: true, note: 'Unsupported jurisdiction. Owner confirmation required.' };
}
