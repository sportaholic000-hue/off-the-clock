import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {decryptCredentialPayload,encryptCredentialPayload} from '../server/src/credentialEncryption.js';

// Neon (89ff890b) started sealing credentials with AAD. Calendar tokens,
// webhook secrets and retry secrets saved before that have no AAD and must
// still open, or every connected calendar breaks on deploy.
// HANDWRITTEN EXPECTATIONS, before execution:
// - a pre-AAD record opens with the right key, with or without an aad option;
// - a pre-AAD record with the wrong key is refused;
// - a new record opens only with its exact AAD (wrong or missing AAD refused).
const key='ab'.repeat(32);
function legacy(payload){
  const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',Buffer.from(key,'hex'),iv);
  const ct=Buffer.concat([c.update(JSON.stringify(payload)),c.final()]);
  return {credentialsCiphertext:ct.toString('base64'),credentialsIv:iv.toString('base64'),credentialsTag:c.getAuthTag().toString('base64'),keyVersion:'v1'};
}
test('credentials saved before AAD still open with the right key only',()=>{
  const row=legacy({refreshToken:'[SYNTHETIC] old'});
  assert.deepEqual(decryptCredentialPayload(row,{key}),{refreshToken:'[SYNTHETIC] old'});
  assert.deepEqual(decryptCredentialPayload(row,{key,aad:'webhook:o:v'}),{refreshToken:'[SYNTHETIC] old'});
  assert.throws(()=>decryptCredentialPayload(row,{key:'cd'.repeat(32)}));
});
test('credentials saved with AAD open only with that exact AAD',()=>{
  const row=encryptCredentialPayload({s:'[SYNTHETIC]'},{key,aad:'tenant:a'});
  assert.deepEqual(decryptCredentialPayload(row,{key,aad:'tenant:a'}),{s:'[SYNTHETIC]'});
  assert.throws(()=>decryptCredentialPayload(row,{key,aad:'tenant:b'}));
  assert.throws(()=>decryptCredentialPayload(row,{key}));
});
