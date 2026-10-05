// This test worker owns its signing key and price-book storage. No environment
// secrets or live provider credentials are required by the acceptance fixtures.
import './pricebookTestEnv.mjs';
process.env.JWT_SECRET = 'synthetic-voice-acceptance-signing-key-not-for-production';
await import('./voiceQuotePathCases20261005.mjs');
