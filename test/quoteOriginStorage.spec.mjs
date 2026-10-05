import './pricebookTestEnv.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';

import { parseStoredQuoteOrigins } from '../server/src/quoteDoneRoutes.js';

test('stored widget origin allowlists fail closed when corrupt or ambiguous', () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    assert.deepEqual(parseStoredQuoteOrigins('["https://example.com"]'), ['https://example.com']);
    for (const value of [
      'not json', '{}', '[]',
      '["https://example.com","https://example.com"]',
      '["https://example.com/path"]',
      '["https://user:pass@example.com"]',
      '["http://example.com"]'
    ]) assert.deepEqual(parseStoredQuoteOrigins(value), [], value);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});

test('loopback HTTP origins are accepted only outside production', () => {
  const previous = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'development';
    assert.deepEqual(parseStoredQuoteOrigins('["http://localhost:5173"]'), ['http://localhost:5173']);
    process.env.NODE_ENV = 'production';
    assert.deepEqual(parseStoredQuoteOrigins('["http://localhost:5173"]'), []);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});

