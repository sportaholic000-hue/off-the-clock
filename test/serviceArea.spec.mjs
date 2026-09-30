import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isServiceAreaConfigured,
  normalizeServiceArea,
  serviceAreaDecision,
  serviceAreaFromKnowledgeBase
} from '../server/src/serviceArea.js';

const HALIFAX = { city: 'Halifax', region: 'NS', country: 'CA' };

test('city policies require an exact city, region, and country match', () => {
  const policy = normalizeServiceArea({ mode: 'cities', cities: [HALIFAX] });
  assert.deepEqual(serviceAreaDecision(policy, { city: ' halifax ', region: 'ns', country: 'ca' }), {
    eligible: true,
    reason: 'IN_AREA'
  });
  assert.deepEqual(serviceAreaDecision(policy, { city: 'Halifax', region: 'West Yorkshire', country: 'GB' }), {
    eligible: false,
    reason: 'OUT_OF_AREA'
  });
});

test('an explicit all-areas policy is eligible without silently inferring coverage', () => {
  assert.deepEqual(serviceAreaDecision({ mode: 'all' }, HALIFAX), { eligible: true, reason: 'IN_AREA' });
  assert.equal(isServiceAreaConfigured({ mode: 'all' }), true);
  assert.equal(isServiceAreaConfigured(null), false);
});

test('missing or malformed configuration and address data fail closed', () => {
  assert.deepEqual(serviceAreaDecision(null, HALIFAX), {
    eligible: false,
    reason: 'SERVICE_AREA_UNCONFIGURED'
  });
  assert.deepEqual(serviceAreaDecision({ mode: 'cities', cities: [HALIFAX] }, { city: 'Halifax' }), {
    eligible: false,
    reason: 'ADDRESS_REQUIRED'
  });
  assert.throws(() => normalizeServiceArea({ mode: 'cities', cities: [] }), /between 1 and 100/);
  assert.throws(() => normalizeServiceArea({ mode: 'radius', cities: [] }), /all or cities/);
  assert.throws(() => normalizeServiceArea({ mode: 'all', cities: [HALIFAX] }), /cannot include/);
});

test('duplicate and ambiguous locality entries are rejected', () => {
  assert.throws(() => normalizeServiceArea({
    mode: 'cities',
    cities: [HALIFAX, { city: ' HALIFAX ', region: 'ns', country: 'ca' }]
  }), /unique/);
  assert.throws(() => normalizeServiceArea({
    mode: 'cities',
    cities: [{ city: 'Halifax', region: '', country: 'CA' }]
  }), /region/);
  assert.throws(() => normalizeServiceArea({
    mode: 'cities',
    cities: [{ city: 'Halifax', region: 'NS', country: 'Canada' }]
  }), /country/);
});

test('knowledge-base extraction accepts only a valid structured policy', () => {
  assert.deepEqual(
    serviceAreaFromKnowledgeBase(JSON.stringify({ serviceArea: { mode: 'cities', cities: [HALIFAX] } })),
    { mode: 'cities', cities: [HALIFAX] }
  );
  assert.equal(serviceAreaFromKnowledgeBase('{bad'), null);
  assert.equal(serviceAreaFromKnowledgeBase({ about: 'Local contractor' }), null);
});
