import {createHash} from 'node:crypto'; import {businessTieAnalysis,mainTableScoped} from './ownerQueryScope.js'; import {OWNER_QUERY_REVIEWED_STATEMENTS} from './ownerQueryExceptions.js';

export const MINUTE_PLANS = Object.freeze({
  Starter: Object.freeze({included:150, monthlyCents:6900, annualCents:69000}),
  Operator: Object.freeze({included:300, monthlyCents:11900, annualCents:119000}),
  QuoteDone: Object.freeze({included:1200, monthlyCents:27900, annualCents:279000})
});
export const OVERAGE_CENTS_PER_MINUTE = 35;
// Signed recurring-price difference; verified Stripe invoices determine proration.
export function planPriceDifferenceCents(from, to, interval = 'monthly') {
  if (!MINUTE_PLANS[from] || !MINUTE_PLANS[to] || !['monthly','annual'].includes(interval)) throw new TypeError('Invalid plan change.');
  const key = interval === 'annual' ? 'annualCents' : 'monthlyCents';
  return MINUTE_PLANS[to][key] - MINUTE_PLANS[from][key];
}
export const MINUTE_THRESHOLDS = Object.freeze([60,30,0]);
export const billingUsageId = (...values) => createHash('sha256').update(JSON.stringify(values)).digest('hex');
export function billingMoney(cents) {
  if(!Number.isSafeInteger(cents)||cents<0)throw new TypeError('Invalid money amount.');
  return '$'+(cents/100).toLocaleString('en-CA',{minimumFractionDigits:2,maximumFractionDigits:2});
}
export function usageAmounts(plan, minutesUsed, interval = 'monthly') {
  const policy=MINUTE_PLANS[plan];
  if(!policy||!['monthly','annual'].includes(interval)||!Number.isSafeInteger(minutesUsed)||minutesUsed<0)throw new TypeError('Invalid metered usage.');
  const overageMinutes=Math.max(0,minutesUsed-policy.included),overageCents=overageMinutes*OVERAGE_CENTS_PER_MINUTE;
  if(!Number.isSafeInteger(overageCents))throw new RangeError('Metered amount is too large.');
  let savingsCents=0,upgradePlan=null;
  for(const [candidate,terms] of Object.entries(MINUTE_PLANS)){
    if(terms.monthlyCents<=policy.monthlyCents)continue;
    const candidateOverage=Math.max(0,minutesUsed-terms.included)*OVERAGE_CENTS_PER_MINUTE;
    // Keep all money arithmetic in integer cents, including annual monthly-equivalent savings.
    const months=interval==='annual'?12:1;
    const saved=Math.floor(((overageCents-candidateOverage)*months-planPriceDifferenceCents(plan,candidate,interval))/months);
    if(saved>savingsCents){savingsCents=saved;upgradePlan=candidate;}
  }
  return {minutesUsed,includedMinutes:policy.included,minutesLeft:Math.max(0,policy.included-minutesUsed),overageMinutes,overageCents,
    savingsCents,upgradePlan,upgradeMessage:savingsCents?`Upgrading to ${upgradePlan} would have saved you ${billingMoney(savingsCents)} this month`:null};
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
  const columnsOf=tableColumns(database);
  return sql=>{
    const binding=ownerBinding(sql,{columnsOf});if(!binding)throw Error('Usage query requires owner binding.');
    return guardOwnerParameters(ownerQuery(sql),binding.ownerParameters,'Usage query requires owner binding.');
  };
}
// When two or more different parameters tie tables to the owner (for example
// two positional ?), check on every run that they carry the same value.
// Arguments bind as both drivers bind them: a plain object supplies named
// parameters, an array is spread, and every other value fills the next
// unnamed parameter.
export function guardOwnerParameters(statement, ownerParameters, message) {
  if(!ownerParameters)return statement;
  const check=args=>{
    const values=[];let named=null;
    for(const arg of args){
      if(Array.isArray(arg))values.push(...arg);
      else if(arg!==null&&typeof arg==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(arg)))named={...named,...arg};
      else values.push(arg);
    }
    const bound=[...ownerParameters.anonymous.map(position=>values[position]),
      ...ownerParameters.named.map(name=>named&&Object.hasOwn(named,name)?named[name]:undefined)];
    if(bound.some(value=>value===undefined||value!==bound[0]))throw Error(message);
  };
  let bound=false;
  const guarded=new Proxy(statement,{get(target,property){
    const value=Reflect.get(target,property,target);
    if(typeof value!=='function')return value;
    if(['run','get','all','iterate'].includes(property))return (...args)=>{if(!bound||args.length)check(args);return value.apply(target,args);};
    if(property==='bind')return (...args)=>{check(args);bound=true;value.apply(target,args);return guarded;};
    return (...args)=>{const result=value.apply(target,args);return result===target?guarded:result;};
  }});
  return guarded;
}
// Column names of a table (schema only; reads no rows), or null when unknown.
// Used only to tell whether a JOIN's main table holds owner data.
export function tableColumns(database) {
  const columnsOf=name=>{
    try{return database.prepare('SELECT name FROM pragma_table_info(?)').all(name).map(row=>row.name);}
    catch{return null;}
  };
  // Single-column foreign keys, lower case: [{from,table,to}].
  columnsOf.foreignKeys=name=>{
    try{
      const rows=database.prepare('SELECT * FROM pragma_foreign_key_list(?)').all(name),groups=new Map();
      for(const row of rows)groups.set(row.id,[...(groups.get(row.id)||[]),row]);
      return [...groups.values()].filter(group=>group.length===1&&group[0].to).map(([row])=>({from:row.from.toLowerCase(),table:row.table.toLowerCase(),to:row.to.toLowerCase()}));
    }catch{return [];}
  };
  // Every unique key (unique indexes, the primary key, an INTEGER PRIMARY KEY
  // rowid alias) as lower-case column lists; an expression column is ''. null when unknown.
  columnsOf.uniqueKeys=name=>{
    try{
      const keys=database.prepare('SELECT name FROM pragma_index_list(?) WHERE "unique"=1').all(name)
        .map(index=>database.prepare('SELECT name FROM pragma_index_info(?)').all(index.name).map(column=>String(column.name??'').toLowerCase()));
      const primary=database.prepare('SELECT name,type FROM pragma_table_info(?) WHERE pk>0').all(name);
      if(primary.length===1&&String(primary[0].type).toUpperCase()==='INTEGER')keys.push([primary[0].name.toLowerCase()]);
      return keys;
    }catch{return null;}
  };
  return columnsOf;
}
// SELECT, UPDATE and DELETE must compare ownerId (or alias.ownerId) for
// equality with a bound parameter; INSERT must name an ownerId column.
// Comments and quoted SQL text never count as the predicate. SELECT, UPDATE,
// DELETE and WITH must also pass ownerScopedStatement (ownerQueryScope.js):
// the owner condition is a top-level AND condition of the WHERE clause that
// limits the main table (not under OR, not negated, not only on a joined table),
// and every other table that holds business data, joined or inside a subquery,
// is tied to the same business (account tables such as authTokens through
// userId). INSERT and REPLACE must pass the second part (businessTieAnalysis)
// for the SELECT that supplies rows and every subquery, and an upsert or
// REPLACE must not be able to reach another business's row. When two or more
// different parameters tie tables to the owner, the helpers check on every
// run that they carry the same value (guardOwnerParameters).
// A statement whose exact text is on OWNER_QUERY_REVIEWED_STATEMENTS
// (ownerQueryExceptions.js) is excused from the second part only.
const SQL_PARAMETER=String.raw`(?:\?\d*|[@:$][A-Za-z_]\w*)`;
const OWNER_PREDICATE=new RegExp(String.raw`(?:^|[^\w.$])(?:[A-Za-z_]\w*\.)?ownerId\s*=\s*${SQL_PARAMETER}(?![\w=])`);
const SQL_WORDS=new Set(['WHERE','SET','LEFT','RIGHT','INNER','OUTER','CROSS','JOIN','ON','ORDER','GROUP','LIMIT','UNION','RETURNING']);
// An owner's own account row has no ownerId (the users CHECK constraint makes
// role='owner' rows ownerId IS NULL); it is bound by id=? AND ownerId IS NULL.
function ownerAccountRow(text) {
  for(const match of text.matchAll(/\b(?:FROM|JOIN|UPDATE)\s+users\b(?:\s+(?:AS\s+)?([A-Za-z_]\w*))?/gi)){
    const alias=match[1]&&!SQL_WORDS.has(match[1].toUpperCase())?match[1]:null;
    const column=alias?String.raw`(?:${alias}\.)?`:String.raw`(?:users\.)?`;
    if(new RegExp(String.raw`(?:^|[^\w.$])${column}id\s*=\s*${SQL_PARAMETER}(?![\w=])`).test(text)&&
      new RegExp(String.raw`(?:^|[^\w.$])${column}ownerId\s+IS\s+NULL\b`,'i').test(text))return true;
  }
  return false;
}
const REVIEWED_SIGNATURES=new Set(OWNER_QUERY_REVIEWED_STATEMENTS.map(row=>row.signature));
// Every business table tied, or the exact statement is on the reviewed list.
const tablesTied=(sql,columnsOf)=>businessTieAnalysis(sql,{columnsOf})||(REVIEWED_SIGNATURES.has(createHash('sha256').update(sql).digest('hex'))?{ownerParameters:null}:null);
export function ownerBoundSql(sql, {columnsOf=null}={}) {
  return ownerBinding(sql,{columnsOf})!==null;
}
// null when the statement is refused; otherwise {ownerParameters} for
// guardOwnerParameters.
export function ownerBinding(sql, {columnsOf=null}={}) {
  if(typeof sql!=='string')return null;
  const text=sql.replace(/--[^\n]*|\/\*[\s\S]*?\*\//g,' ').replace(/'(?:[^']|'')*'/g,"''");
  const verb=/^[\s(]*([A-Za-z]+)/.exec(text)?.[1]?.toUpperCase();
  if(verb==='INSERT'||verb==='REPLACE'){
    const columns=/^[\s(]*(?:INSERT(?:\s+OR\s+[A-Za-z]+)?|REPLACE)\s+INTO\s+(?:"[^"]+"|[\w.]+)(?:\s+AS\s+\w+)?\s*\(([^)]*)\)/i.exec(text)?.[1];
    return Boolean(columns)&&columns.split(',').some(column=>column.trim().replace(/^"|"$/g,'')==='ownerId')?tablesTied(sql,columnsOf):null;
  }
  if(['SELECT','UPDATE','DELETE','WITH'].includes(verb))return (OWNER_PREDICATE.test(text)||ownerAccountRow(text))&&mainTableScoped(sql,{columnsOf})?tablesTied(sql,columnsOf):null;
  return null;
}
