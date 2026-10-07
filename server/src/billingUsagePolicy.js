import {createHash} from 'node:crypto';

export const MINUTE_PLANS = Object.freeze({
  Operator: Object.freeze({included:300, monthlyCents:11900, annualCents:119000}),
  QuoteDone: Object.freeze({included:1200, monthlyCents:27900, annualCents:279000})
});
export const OVERAGE_CENTS_PER_MINUTE = 35;
export const UPGRADE_DIFFERENCE_CENTS = 16000;
export const MINUTE_THRESHOLDS = Object.freeze([60,30,0]);
export const billingUsageId = (...values) => createHash('sha256').update(JSON.stringify(values)).digest('hex');
export function billingMoney(cents) {
  if(!Number.isSafeInteger(cents)||cents<0)throw new TypeError('Invalid money amount.');
  return '$'+(cents/100).toLocaleString('en-CA',{minimumFractionDigits:2,maximumFractionDigits:2});
}
export function usageAmounts(plan, minutesUsed) {
  const policy=MINUTE_PLANS[plan];
  if(!policy||!Number.isSafeInteger(minutesUsed)||minutesUsed<0)throw new TypeError('Invalid metered usage.');
  const overageMinutes=Math.max(0,minutesUsed-policy.included),overageCents=overageMinutes*OVERAGE_CENTS_PER_MINUTE;
  if(!Number.isSafeInteger(overageCents))throw new RangeError('Metered amount is too large.');
  const quoteDoneOverage=Math.max(0,minutesUsed-MINUTE_PLANS.QuoteDone.included)*OVERAGE_CENTS_PER_MINUTE;
  const savingsCents=plan==='Operator'&&overageCents>UPGRADE_DIFFERENCE_CENTS
    ? Math.max(0,overageCents-quoteDoneOverage-UPGRADE_DIFFERENCE_CENTS):0;
  return {minutesUsed,includedMinutes:policy.included,minutesLeft:Math.max(0,policy.included-minutesUsed),overageMinutes,overageCents,
    savingsCents,upgradeMessage:savingsCents?`Upgrading to QuoteDone would have saved you ${billingMoney(savingsCents)} this month`:null};
}
export function usageInstant(value) {
  if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString()!==value)throw new TypeError('Invalid usage boundary.');
  return value;
}
export function monthlyAnniversary(anchor, offset) {
  const date=new Date(usageInstant(anchor));
  if(!Number.isSafeInteger(offset)||offset<0||offset>12000)throw new TypeError('Invalid anniversary offset.');
  const day=date.getUTCDate();date.setUTCDate(1);date.setUTCMonth(date.getUTCMonth()+offset);
  const last=new Date(date);last.setUTCMonth(last.getUTCMonth()+1);last.setUTCDate(0);
  date.setUTCDate(Math.min(day,last.getUTCDate()));return date.toISOString();
}
export function allowancePeriods({start,end,interval,anchor=start}) {
  usageInstant(start);usageInstant(end);usageInstant(anchor);
  if(end<=start||!['monthly','annual'].includes(interval)||anchor>start)throw new TypeError('Invalid paid term.');
  if(interval==='monthly')return [{start,end}];
  if(Date.parse(end)-Date.parse(start)>367*86400000)throw new TypeError('Annual term exceeds twelve months.');
  const a=new Date(anchor),s=new Date(start);let offset=(s.getUTCFullYear()-a.getUTCFullYear())*12+s.getUTCMonth()-a.getUTCMonth();
  while(monthlyAnniversary(anchor,offset)<=start)offset++;
  const result=[];let cursor=start;
  while(cursor<end){const next=monthlyAnniversary(anchor,offset++),stop=next<end?next:end;
    if(stop<=cursor||result.length>=13)throw new TypeError('Invalid monthly anniversary.');
    result.push({start:cursor,end:stop});cursor=stop;
  }
  return result;
}
export function usageTransaction(db, work) {
  if(db.inTransaction===true||db.isTransaction===true)return work();
  db.exec('BEGIN IMMEDIATE');
  try{const result=work();db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}
}
export function usageOwnerQuery(database, ownerQuery=sql=>database.prepare(sql)) {
  return sql=>{if(!/\bownerId\b/.test(sql))throw Error('Usage query requires owner binding.');return ownerQuery(sql);};
}
