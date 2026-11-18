// The sales tax asked for in the country-change confirmation: prefilled from
// the new country and region's preset (the server's 409 details.tax) when it
// has one, blank otherwise; the confirm button waits for a mode and, unless
// there is no tax line, a rate above 0 and at most 100.
export const TAX_MODE_OPTIONS = [['TAX_NONE', 'No tax line on customer invoices'], ['TAX_MATERIALS', 'Tax on materials'], ['TAX_ALL', 'Tax on the entire job']];
export const countryChangeTaxPrefill = pending => {
  const mode = pending?.tax?.taxMode;
  if (!TAX_MODE_OPTIONS.some(([value]) => value === mode)) return { taxMode: '', taxPercent: '' };
  return { taxMode: mode, taxPercent: mode === 'TAX_NONE' ? '' : String(pending.tax.taxPercent ?? '') };
};
export const countryChangeTaxReady = tax => !!tax?.taxMode && (tax.taxMode === 'TAX_NONE' || (String(tax.taxPercent ?? '').trim() !== '' && Number(tax.taxPercent) > 0 && Number(tax.taxPercent) <= 100));
export const countryChangeTaxBody = tax => ({ taxMode: tax.taxMode, taxPercent: tax.taxMode === 'TAX_NONE' ? '0' : tax.taxPercent });
