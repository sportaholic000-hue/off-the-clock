// The owner-facing sentence for TRANSFER_DESTINATION_UNAVAILABLE. Since 3e8b47c
// that reason is given only when no usable transfer number is saved, so the
// sentence must say that, not that a number could not be reached.
// Expected wording written before execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import {plainReason} from '../server/src/ownerMessageFormat.js';

test('no usable transfer number: the reason reads that no separate transfer number is saved',()=>{
  assert.equal(plainReason('TRANSFER_DESTINATION_UNAVAILABLE'),'No separate transfer number is saved.');
  assert.equal(plainReason(' TRANSFER_DESTINATION_UNAVAILABLE '),'No separate transfer number is saved.');
});
test('the other transfer reasons',()=>{
  assert.equal(plainReason('TRANSFER_OUTSIDE_HOURS'),'It was outside your transfer hours.');
  assert.equal(plainReason('TRANSFER_HOURS_UNCONFIGURED'),'Live transfer hours are not set up.');
  assert.equal(plainReason('TRANSFER_TIMEZONE_INVALID'),'Live transfer could not check your hours.');
  assert.equal(plainReason('TRANSFER_NOT_CONFIRMED'),'The transfer did not connect.');
  assert.equal(plainReason('TRANSFER_PROVIDER_UNAVAILABLE'),'The transfer did not go through.');
});
