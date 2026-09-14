import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const root = path.resolve(process.argv[2]);
const evidence = path.resolve(process.argv[3]);
assert.ok(root.includes('quotedone-verification'), 'Use the disposable verification copy');
assert.equal(fs.existsSync(evidence), false, 'Use a fresh evidence/store directory');
fs.mkdirSync(evidence, { recursive: true });
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const report = { source: process.env.QUOTEDONE_TESTED_SHA || 'working tree; see source-binding evidence', startedAt: new Date().toISOString(), requests: [], checks: [] };
const record = name => { report.checks.push(name); console.log('PASS:', name); };
const redact = value => JSON.parse(JSON.stringify(value, (key, item) => ['token', 'password', 'passwordHash'].includes(key) ? '[SECRET OMITTED]' : item));
let server;
let logs = "";
try {
  const executable = fs.realpathSync(process.execPath);
  assert.equal(executable.toLowerCase(), fs.realpathSync(path.join(root, '.portable-runtime/node-v22.23.2-win-x64/node.exe')).toLowerCase());
  assert.equal(process.version, 'v22.23.2'); assert.equal(process.platform, 'win32'); assert.equal(process.arch, 'x64'); assert.equal(process.versions.modules, '127');
  const environment = { ...process.env };
  const inheritedPath = Object.entries(environment).find(([key]) => key.toLowerCase() === 'path')?.[1] || '';
  for (const key of Object.keys(environment)) if (key.toLowerCase() === 'path') delete environment[key];
  environment.Path = path.dirname(executable) + path.delimiter + inheritedPath;
  environment.npm_node_execpath = executable;
  environment.npm_execpath = path.join(path.dirname(executable), 'node_modules/npm/bin/npm-cli.js');
  const child = spawnSync('node', ['-p', 'JSON.stringify({execPath:process.execPath,version:process.version,arch:process.arch,abi:process.versions.modules})'], { env: environment, encoding: 'utf8' });
  assert.equal(child.status, 0); const childRuntime = JSON.parse(child.stdout);
  assert.equal(fs.realpathSync(childRuntime.execPath).toLowerCase(), executable.toLowerCase());
  report.runtime = { executable, version: process.version, platform: process.platform, arch: process.arch, abi: process.versions.modules, childRuntime };
  record('Portable Node and child runtime are Windows x64, Node 22.23.2, ABI 127');
  const require = createRequire(path.join(root, 'package.json'));
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json')));
  report.packages = {};
  for (const [name, expected, binary] of [['better-sqlite3', '11.10.0', 'build/Release/better_sqlite3.node'], ['bcrypt', '5.1.1', 'lib/binding/napi-v3/bcrypt_lib.node']]) {
    const packagePath = require.resolve(name + '/package.json');
    const packageData = JSON.parse(fs.readFileSync(packagePath));
    assert.equal(packageData.version, expected); assert.equal(lock.packages['node_modules/' + name].version, expected);
    const binaryPath = path.join(path.dirname(packagePath), binary); const bytes = fs.readFileSync(binaryPath);
    assert.equal(bytes.subarray(0, 2).toString(), 'MZ'); const pe = bytes.readUInt32LE(0x3c); assert.equal(bytes.readUInt32LE(pe), 0x4550); assert.equal(bytes.readUInt16LE(pe + 4), 0x8664);
    report.packages[name] = { version: packageData.version, lockedVersion: lock.packages['node_modules/' + name].version, packagePath, binaryPath, binarySha256: sha256(bytes), machine: 'PE x64' };
  }
  record('Package versions match the unchanged lockfile; both official binaries are PE x64');
  const Database = require('better-sqlite3');
  const databasePath = path.join(evidence, 'native.sqlite');
  let db = new Database(databasePath); db.pragma('journal_mode = WAL');
  db.exec('CREATE TABLE native_control (id INTEGER PRIMARY KEY, amountCents INTEGER NOT NULL, label TEXT NOT NULL)');
  const insert = db.prepare('INSERT INTO native_control (id, amountCents, label) VALUES (?, ?, ?)');
  db.transaction(() => { insert.run(1, 20001, 'Synthetic first row'); insert.run(2, 10000, 'Synthetic second row'); })();
  const expected = [{id:1,amountCents:20001,label:'Synthetic first row'},{id:2,amountCents:10000,label:'Synthetic second row'}];
  assert.deepEqual(db.prepare('SELECT * FROM native_control ORDER BY id').all(), expected);
  assert.throws(() => db.transaction(() => { insert.run(3, 77, 'Synthetic rollback'); throw new Error('Deliberate rollback'); })(), /Deliberate rollback/);
  assert.deepEqual(db.prepare('SELECT * FROM native_control ORDER BY id').all(), expected);
  db.close(); db = new Database(databasePath);
  report.sqlite = { rows: db.prepare('SELECT * FROM native_control ORDER BY id').all(), total: db.prepare('SELECT SUM(amountCents) AS cents FROM native_control').get(), integrity: db.pragma('integrity_check') };
  assert.deepEqual(report.sqlite.rows, expected); assert.deepEqual(report.sqlite.total, {cents:30001}); assert.deepEqual(report.sqlite.integrity, [{integrity_check:'ok'}]); db.close();
  record('Real SQLite create/write/commit/rollback/close/reopen and integrity check');
  const bcrypt = require('bcrypt'); const password = crypto.randomBytes(24).toString('hex'); const hash = await bcrypt.hash(password, 12);
  report.bcrypt = { correct: await bcrypt.compare(password, hash), incorrect: await bcrypt.compare(password + '-wrong', hash), rounds: bcrypt.getRounds(hash) };
  assert.deepEqual(report.bcrypt, {correct:true,incorrect:false,rounds:12});
  record('Real bcrypt hash accepts the correct password and rejects an incorrect password');
  const port = 4391, base = 'http://127.0.0.1:' + port;
  const settings = { DATABASE_PATH:path.join(evidence,'application.sqlite'), PRICEBOOK_PATH:path.join(evidence,'pricebooks'), PORT:String(port), NODE_ENV:'test', EMAIL_PROVIDER:'console', DOTENV_CONFIG_PATH:path.join(evidence,'absent.env'), JWT_SECRET:crypto.randomBytes(32).toString('hex') };
  report.server = { command:[executable,'server/src/server.js'], cwd:root, settings:{...settings,JWT_SECRET:'[SECRET OMITTED]'} };
  server = spawn(executable, ['server/src/server.js'], { cwd:root, env:{...environment,...settings}, stdio:['ignore','pipe','pipe'] });
  server.stdout.on('data', bytes => { logs += bytes; }); server.stderr.on('data', bytes => { logs += bytes; });
  let ready=false;
  for(let attempt=0;attempt<900;attempt++) { if(server.exitCode!==null) throw new Error('Application exited '+server.exitCode+'\n'+logs); try {const response=await fetch(base+'/api/health'); if(response.status===200){assert.deepEqual(await response.json(),{ok:true});ready=true;break;}}catch {} await delay(100); }
  assert.equal(ready,true,'Real application must listen');
  async function request(method,url,body,token){const response=await fetch(base+url,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})}); const result=await response.json(); report.requests.push({method,path:url,body:redact(body||null),authenticated:Boolean(token),status:response.status,result:redact(result)}); return {status:response.status,result};}
  const account={email:'synthetic-runtime-owner@example.invalid',password,firstName:'Synthetic',businessName:'Synthetic runtime verification',plan:'QuoteDone'};
  const registration=await request('POST','/api/auth/register',account);assert.equal(registration.status,201);assert.equal(registration.result.account.role,'owner');assert.equal(registration.result.account.plan,'QuoteDone');assert.equal(typeof registration.result.token,'string');
  const incorrect=await request('POST','/api/auth/login',{email:account.email,password:password+'-wrong'});assert.equal(incorrect.status,401);assert.deepEqual(incorrect.result,{error:'Invalid credentials'});
  const login=await request('POST','/api/auth/login',{email:account.email,password});assert.equal(login.status,200);assert.deepEqual(Object.keys(login.result),['token']);
  const anonymous=await request('GET','/api/dashboard');assert.equal(anonymous.status,401);assert.deepEqual(anonymous.result,{error:'Missing token'});
  const dashboard=await request('GET','/api/dashboard',null,login.result.token);assert.equal(dashboard.status,200);assert.equal(dashboard.result.ownerId,registration.result.account.id);assert.equal(dashboard.result.role,'owner');assert.equal(dashboard.result.quoteRequestCount,0);
  const stored = new Database(settings.DATABASE_PATH,{readonly:true});const row=stored.prepare('SELECT id,email,role,plan,passwordHash FROM users WHERE id = ?').get(registration.result.account.id);assert.equal(await bcrypt.compare(password,row.passwordHash),true);assert.equal(row.email,account.email);report.persistedAccount=redact(row);report.applicationIntegrity=stored.pragma('integrity_check');stored.close();
  record('Actual server registration/login and authenticated owner dashboard; wrong password and anonymous request rejected');
  server.kill(); await new Promise(resolve=>server.once('close',resolve)); server=null;
  // Email verification tokens are secrets even for this synthetic account.
  fs.writeFileSync(path.join(evidence,'server.log'),logs.replace(/token=[a-f0-9]+/g,'token=[SECRET OMITTED]'));
  report.complete=true;
} catch(error) { report.failure=error.stack; throw error; }
finally { if(server)server.kill(); fs.writeFileSync(path.join(evidence,'server.log'),logs.replace(/token=[a-f0-9]+/g,'token=[SECRET OMITTED]')); report.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify(report,null,2)); }
