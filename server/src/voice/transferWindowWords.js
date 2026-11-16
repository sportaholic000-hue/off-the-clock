// Transfer-window day names and the blank-window refusal, shared by the owner
// app (checked before saving) and the server (checked on save).
export const TRANSFER_DAY_NAMES=Object.freeze({sun:'Sunday',mon:'Monday',tue:'Tuesday',wed:'Wednesday',thu:'Thursday',fri:'Friday',sat:'Saturday'});
export const blankTransferWindowMessage=day=>`Enter a start and end time for ${TRANSFER_DAY_NAMES[day]}'s transfer window, or remove it.`;
// The first window, in the order the owner sees the days (Monday first), with
// a blank start or end: {day, index, key}, or null when every window is filled.
export function firstBlankTransferWindow(windows,days=['mon','tue','wed','thu','fri','sat','sun']){
  for(const day of days)for(const [index,window] of (windows?.[day]||[]).entries())for(const key of ['start','end'])
    if(!String(window?.[key]??'').trim())return {day,index,key};
  return null;
}
