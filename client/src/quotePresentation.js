// The quote retains complete disclosures for API consumers. On screen, the
// unit and tax treatment are already displayed beside each price.
export function quoteDisplayDisclaimer(disclaimer, {priceUnit, taxTreatment} = {}) {
  if (typeof disclaimer !== 'string') return '';
  const displayed = [priceUnit ? 'Price is ' + priceUnit + '.' : null, taxTreatment].filter(Boolean);
  if (!displayed.length) return disclaimer;
  let text = disclaimer;
  for (const sentence of displayed) text = text.split(sentence).join('');
  return text.replace(/[ \t]{2,}/g, ' ').trim();
}
