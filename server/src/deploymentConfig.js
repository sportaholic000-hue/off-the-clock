import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {proxyMode} from './clientAddress.js';
import {validateRuntimeConfig} from './runtimeConfig.js';
import {liveDemoConfig} from './demo/liveDemo.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fail = message => { throw new Error(message); };
const integer = (env,key,dflt,min,max) => {
  const n = env[key] === undefined || env[key] === '' ? dflt : Number(env[key]);
  if (!Number.isInteger(n) || n < min || n > max) fail(key+' is outside its allowed integer range.');
  return n;
};
export function inside(root, target) {
  const relative = path.relative(root,target);
  return relative === '' || (!relative.startsWith('..'+path.sep) && relative !== '..' && !path.isAbsolute(relative));
}
export function assertRealContainment(root, target) {
  const realRoot = fs.realpathSync(root);
  let existing = target;
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) fail('Persistent path has no existing parent.');
    existing = parent;
  }
  if (!inside(realRoot,fs.realpathSync(existing))) fail('Persistent path escapes its volume through a symlink.');
}
export function validateDeploymentConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  if(env.RAILWAY_ENVIRONMENT_ID && !production) fail('Railway requires NODE_ENV=production; refusing development storage defaults.');
  const mode = proxyMode(env);
  if (!production) return {production:false,mode};
  const runtime = validateRuntimeConfig(env);
  for(const key of ['JWT_SECRET','BOOKING_SLOT_TOKEN_SECRET']) if(new Set(env[key]).size < 8) fail(key+' must not be a repeated placeholder.');
  const keyText=String(env.CREDENTIAL_ENCRYPTION_KEY).trim();
  const keyBytes=Buffer.from(keyText,/^[a-f0-9]{64}$/i.test(keyText)?'hex':'base64');
  if(new Set(keyBytes).size < 8) fail('CREDENTIAL_ENCRYPTION_KEY must not be a repeated placeholder.');
  if(env.JWT_SECRET===env.BOOKING_SLOT_TOKEN_SECRET || env.JWT_SECRET===keyText || env.BOOKING_SLOT_TOKEN_SECRET===keyText) fail('Production signing and encryption secrets must be distinct.');
  for (const key of ['ALLOW_PROVIDER_WRITES','VOICE_RUNTIME_ENABLED','STRIPE_BILLING_ENABLED','EMAIL_DELIVERY_ENABLED','OUTBOUND_WEBHOOKS_ENABLED','DEMO_ENABLED']) {
    if (env[key] !== undefined && !['true','false'].includes(env[key])) fail(key+' must be true or false.');
  }
  if (!env.TRUST_PROXY) fail('Production requires an explicit TRUST_PROXY.');
  if (mode === 'railway' && !env.RAILWAY_ENVIRONMENT_ID) fail('TRUST_PROXY=railway requires Railway environment metadata.');
  if (env.DEMO_TRUSTED_PROXY_HOPS !== undefined) fail('Remove DEMO_TRUSTED_PROXY_HOPS; TRUST_PROXY controls every client address.');
  for (const key of ['APP_DATA_DIR','RAILWAY_VOLUME_MOUNT_PATH']) {
    if (!env[key] || !path.isAbsolute(env[key]) || path.resolve(env[key]) === path.parse(env[key]).root) fail(key+' must name an absolute persistent directory.');
  }
  const volume = path.resolve(env.RAILWAY_VOLUME_MOUNT_PATH), root = path.resolve(env.APP_DATA_DIR);
  if (!inside(volume,root)) fail('APP_DATA_DIR must be within RAILWAY_VOLUME_MOUNT_PATH.');
  const databasePath = path.join(root,'off-the-clock.sqlite'), pricebookPath = path.join(root,'pricebooks');
  for (const [key,expected] of [['DATABASE_PATH',databasePath],['PRICEBOOK_PATH',pricebookPath]]) {
    if (env[key] && (!path.isAbsolute(env[key]) || path.resolve(env[key]) !== expected)) fail(key+' must equal its APP_DATA_DIR-derived path; remove the override.');
  }
  const shutdownMs = integer(env,'SHUTDOWN_TIMEOUT_SECONDS',110,5,115)*1000;
  if (integer(env,'RAILWAY_DEPLOYMENT_DRAINING_SECONDS',0,0,3600)*1000 < shutdownMs+5000) fail('RAILWAY_DEPLOYMENT_DRAINING_SECONDS must exceed SHUTDOWN_TIMEOUT_SECONDS by at least 5.');
  const port = integer(env,'PORT',3000,1,65535);
  integer(env,'BCRYPT_COST',12,10,16);
  const publicUrl = env.PUBLIC_BASE_URL;
  if(publicUrl !== new URL(publicUrl).origin) fail('PUBLIC_BASE_URL must be a bare HTTPS origin without a trailing slash.');
  if(!runtime.corsOrigins.includes(publicUrl)) fail('CORS_ALLOWED_ORIGINS must include PUBLIC_BASE_URL.');
  if (!env.CLIENT_URL || env.CLIENT_URL !== publicUrl) fail('CLIENT_URL must equal PUBLIC_BASE_URL for owner account links.');
  if (env.CLIENT_BASE_URL && env.CLIENT_BASE_URL !== publicUrl) fail('CLIENT_BASE_URL, if set, must equal PUBLIC_BASE_URL.');
  if (env.LOCAL_PREVIEW_MODE === 'true') fail('Local preview is forbidden in production.');
  const demo = liveDemoConfig(env);
  if (demo.enabled && demo.origins.some(origin=>new URL(origin).protocol !== 'https:')) fail('Production DEMO_ALLOWED_ORIGINS must use HTTPS.');
  const googleKeys = ['GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','GOOGLE_CALENDAR_REDIRECT_URI'];
  if (googleKeys.some(key=>env[key])) {
    if (googleKeys.some(key=>!env[key])) fail('Google Calendar requires all three OAuth settings.');
    if (env.GOOGLE_CALENDAR_REDIRECT_URI !== publicUrl+'/api/onboarding/calendar/google/callback') fail('GOOGLE_CALENDAR_REDIRECT_URI must use the public service callback.');
  }
  if (Boolean(env.ADMIN_EMAIL) !== Boolean(env.ADMIN_PASSWORD_HASH)) fail('Admin email and password hash must be set together.');
  if (env.ADMIN_PASSWORD_HASH && !/^\$2[aby]\$(?:1[0-6])\$[./A-Za-z0-9]{53}$/.test(env.ADMIN_PASSWORD_HASH)) fail('ADMIN_PASSWORD_HASH must be a bcrypt hash with cost 10 through 16.');
  return {production,mode,volume,root,databasePath,pricebookPath,
    backupPath:path.join(root,'backups'),tempPath:path.join(root,'tmp'),port,shutdownMs,
    backupIntervalMs:integer(env,'BACKUP_INTERVAL_SECONDS',21600,60,86400)*1000,
    backupRetentionDays:integer(env,'BACKUP_RETENTION_DAYS',30,30,365),
    ownerDist:path.join(projectRoot,'client/dist')};
}

export function prepareDeploymentEnvironment(env = process.env) {
  const config = validateDeploymentConfig(env);
  if (!config.production) return config;
  if (!fs.existsSync(config.volume) || !fs.statSync(config.volume).isDirectory()) fail('The persistent volume is missing; refusing ephemeral storage.');
  // On Linux, a directory in the image is insufficient: the declared volume
  // must actually be mounted. Railway's Docker runtime uses Linux.
  if (process.platform === 'linux' && env.RAILWAY_ENVIRONMENT_ID) {
    const mounts = fs.readFileSync('/proc/self/mountinfo','utf8').split('\n').map(line=>line.split(' ')[4]?.replace(/\\([0-7]{3})/g,(_,n)=>String.fromCharCode(parseInt(n,8))));
    if (!mounts.includes(config.volume)) fail('RAILWAY_VOLUME_MOUNT_PATH is not an actual mounted volume.');
  }
  assertRealContainment(config.volume,config.root);
  for (const dir of [config.root,config.pricebookPath,config.backupPath,config.tempPath]) {
    assertRealContainment(config.volume,dir);
    fs.mkdirSync(dir,{recursive:true,mode:0o700});
  }
  assertRealContainment(config.volume,config.databasePath);
  const probe = path.join(config.tempPath,'startup-'+randomUUID());
  try { fs.writeFileSync(probe,'storage-ready',{flag:'wx',mode:0o600,flush:true}); if(fs.readFileSync(probe,'utf8') !== 'storage-ready') fail('Volume write/read verification failed.'); }
  finally { if(fs.existsSync(probe)) fs.unlinkSync(probe); }
  for (const name of ['index.html','widget.js','widget-app.js']) if(!fs.existsSync(path.join(config.ownerDist,name))) fail('Production owner/widget bundles are missing; build before starting.');
  env.DATABASE_PATH = config.databasePath;
  env.PRICEBOOK_PATH = config.pricebookPath;
  env.TMPDIR = env.TEMP = env.TMP = config.tempPath;
  return config;
}
