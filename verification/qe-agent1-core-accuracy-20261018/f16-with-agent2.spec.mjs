import assert from 'node:assert/strict';
import {fixedPriceField} from '../../server/pricePrecision.js';
import {approvalPrecisionCases} from './f16-approval-cases.mjs';

// Explicit dependency integration suite: always fail if A2 is not present.
// Run with A2 7e9dfcedc6f11f80b45b8ca0554aa5b83935d15b; no conditional skips.
assert.equal(fixedPriceField('pipeJackEach'),true,'A2 pipe-jack precision change must be integrated');
approvalPrecisionCases('pipeJackEach');
