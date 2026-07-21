const SPECIAL_LABELS = {
  disposalFlat: 'Flat disposal charge ($)'
};

export function humanPricingKey(key) {
  if (SPECIAL_LABELS[key]) return SPECIAL_LABELS[key];
  const words = String(key)
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
