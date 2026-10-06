// Owner rulings: annual billing at launch (2026-10-02); annual = two months free (2026-10-05).
import test from 'node:test';
import assert from 'node:assert/strict';
import { demoInstructions } from '../server/src/demo/demoInstructions.js';

test('demo states monthly and annual plan prices (annual = 10 x monthly)', () => {
  const text = demoInstructions('Ava');
  assert.match(text, /Operator plan, \$119 per month/);
  assert.match(text, /QuoteDone plan, \$279 per month/);
  assert.match(text, /Operator \$1,190 per year, QuoteDone \$2,790 per year/);
  assert.match(text, /two months free/);
});
