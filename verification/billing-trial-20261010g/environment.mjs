// Must run before application modules with import-time database configuration.
import {mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('./.runtime/',import.meta.url));
mkdirSync(root,{recursive:true});
process.env.NODE_ENV='test';
process.env.DATABASE_PATH=root+'import-only.sqlite';
process.env.PRICEBOOK_PATH=root+'pricebooks';
process.env.ALLOW_PROVIDER_WRITES='false';
process.env.VOICE_RUNTIME_ENABLED='false';
process.env.STRIPE_BILLING_ENABLED='false';
process.env.EMAIL_PROVIDER='console';
