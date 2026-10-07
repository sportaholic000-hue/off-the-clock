import test from 'node:test';
test('billing core F07/F09: real startup suspends elapsed grace and rejects unpaid dashboard writes; recovery is accessible',async()=>{await import('../verification/billing-core-repairs-20261006/followup-server-regression.mjs');});
