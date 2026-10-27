// Optional commercial settings. Do not materialize defaults into saved books.
export const RANGE_FIELDS=['rangeLowPercent','rangeHighPercent'];
export const rangeBlank=value=>value===undefined||value===null||value==='';
// Same commercial bound as the single estimate range buffer (rangeBufferPercent).
export const RANGE_MAX_PERCENT=25;
export const validRangePercent=(field,value)=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=RANGE_MAX_PERCENT;
export function rangeSettingIssues(settings={}) {
  return RANGE_FIELDS.filter(field=>!rangeBlank(settings[field])&&!validRangePercent(field,settings[field])).map(path=>({path,message:(path==='rangeLowPercent'?'Low':'High')+' range buffer must be from 0 to '+RANGE_MAX_PERCENT+'%.'}));
}
export function resolvedRangeSettings(defaults,service={}) {
  if(!RANGE_FIELDS.some(field=>!rangeBlank(defaults[field])||!rangeBlank(service[field])))return null;
  return Object.fromEntries(RANGE_FIELDS.map(field=>[field,!rangeBlank(service[field])?service[field]:!rangeBlank(defaults[field])?defaults[field]:defaults.rangeBufferPercent]));
}
export const RANGE_HELP='These percentages are a commercial buffer, not a measured accuracy band. Each blank side uses the existing estimate range buffer. Minimum-price and customer display rules still apply. Custom prices entered as a low/high range keep their own endpoints.';
export const SERVICE_RANGE_HELP='Each blank side uses the business-wide setting for that side, then the existing estimate range buffer.';
