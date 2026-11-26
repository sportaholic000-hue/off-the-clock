// The job-context questions asked with a service's own questions: the job's
// postal or ZIP code (travel zones, tax by job location, or any taxed
// business) and the work month (busy-season pricing or a winter concrete
// charge). One rule for the customer form, the phone agent and the owner's
// price-book preview (Neon audit of v48 #5: the preview left them out).
import {hasTravelZones,travelChargeableVNext,POSTAL_CODE_FIELD} from './travelZones.js';
import {taxByJobLocationActive} from './taxJurisdiction.js';
import {WORK_MONTH_FIELD,yearRoundSeason} from './quote-engine-vnext/workMonth.js';
import {winterChargeConfigured,WINTER_WORK_MONTH_DETAIL,WINTER_WORK_MONTH_DETAIL_WITH_BUSY_SEASON} from './quote-engine-vnext/concreteLandscapePricing.js';

const clone=value=>structuredClone(value);
export function peakSurchargeConfigured(service={},defaults={}) {
  const months=service.peakMonths!==undefined?service.peakMonths:defaults.peakMonths;
  const percent=service.peakSurchargePercent!==undefined?service.peakSurchargePercent:defaults.peakSurchargePercent;
  return Array.isArray(months)&&months.length>0&&typeof percent==='number'&&percent>0;
}
export function customerContextFields(raw,pricing,defaults){
  const out=[];
  if((hasTravelZones(defaults)&&travelChargeableVNext(raw))||taxByJobLocationActive(defaults)||['TAX_ALL','TAX_MATERIALS'].includes(defaults?.taxMode))out.push(clone(POSTAL_CODE_FIELD));
  const busySeason=!!defaults&&peakSurchargeConfigured(raw,defaults||{})&&!yearRoundSeason(raw.peakMonths!==undefined?raw.peakMonths:defaults?.peakMonths),winter=winterChargeConfigured(raw,pricing);
  if(busySeason||winter)out.push({...clone(WORK_MONTH_FIELD),...(winter?{details:busySeason?[...WORK_MONTH_FIELD.details,WINTER_WORK_MONTH_DETAIL_WITH_BUSY_SEASON]:[WINTER_WORK_MONTH_DETAIL]}:{})});
  return out;
}
