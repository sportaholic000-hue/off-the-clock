import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import crypto from 'node:crypto';

const dir = resolve(process.cwd(), 'data', 'pricebooks');
const moneyPattern = /(price|cost|rate|fee|minimum|allowance|labor|material|removal|disposal|permit|overhead|surcharge|deposit)/i;
const skipPattern = /(percent|factor|multiplier|month|count|spacing|hours|sqft|linear|lf|yard|depth|width|height|quantity|mode|type|status|active|taxable|allow)/i;

export function loadPricebook(ownerId) {
  try { return JSON.parse(readFileSync(resolve(dir, `${ownerId}.json`), 'utf8')); }
  catch (err) { if (err.code === 'ENOENT') return { ownerId, services: [], defaults: {} }; throw err; }
}

export function savePricebook(ownerId, data) {
  mkdirSync(dir, { recursive: true });
  const next = { ...data, ownerId, updatedAt: new Date().toISOString(), services: (data.services || []).map(s => ({ id: s.id || crypto.randomUUID(), ...s })) };
  writeFileSync(resolve(dir, `${ownerId}.json`), JSON.stringify(next, null, 2));
  return { success: true };
}

export function hasPricing(ownerId) {
  return loadPricebook(ownerId).services.filter(s => s.active).length > 0;
}

function convertObject(value, direction, key = '') {
  if (Array.isArray(value)) return value.map(v => convertObject(v, direction, key));
  if (!value || typeof value !== 'object') {
    if (typeof value === 'number' && moneyPattern.test(key) && !skipPattern.test(key)) return direction === 'toCents' ? Math.round(value * 100) : value / 100;
    return value;
  }
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, convertObject(v, direction, k)]));
}

export const dollarsToCents = (data) => convertObject(data, 'toCents');
export const centsToDollars = (data) => convertObject(data, 'toDollars');
