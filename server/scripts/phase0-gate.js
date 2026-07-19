import { spawn } from 'node:child_process';

const env = {
  ...process.env,
  PORT: '3100',
  DATABASE_PATH: './data/phase0-gate.sqlite',
  JWT_SECRET: 'phase0-gate-secret',
  BCRYPT_COST: '12',
  EMAIL_PROVIDER: 'console',
  NODE_ENV: 'test'
};

const server = spawn('node', ['server/src/server.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
let ready = false;
server.stdout.on('data', (chunk) => {
  process.stdout.write(chunk);
  if (String(chunk).includes('listening')) ready = true;
});
server.stderr.on('data', (chunk) => process.stderr.write(chunk));

function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
async function waitForReady() {
  for (let i = 0; i < 40; i += 1) {
    if (ready) return;
    await wait(250);
  }
  throw new Error('Server did not start');
}

async function post(path, body) {
  const response = await fetch(`http://127.0.0.1:3100${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  const json = await response.json();
  if (!response.ok) throw new Error(`${path} failed: ${response.status} ${JSON.stringify(json)}`);
  return json;
}

try {
  await waitForReady();
  const email = `phase0-${Date.now()}@example.com`;
  const registered = await post('/api/auth/register', { email, password: 'CorrectHorseBatteryStaple1!', firstName: 'Phase', businessName: 'Gate Co' });
  console.log('I can POST /api/auth/register and receive a JWT:', Boolean(registered.token));
  const loggedIn = await post('/api/auth/login', { email, password: 'CorrectHorseBatteryStaple1!' });
  console.log('I can POST /api/auth/login and receive a JWT:', Boolean(loggedIn.token));
  console.log('I can load /dashboard and see the empty shell: run the client and open /dashboard');
  console.log('I can load /admin and see the empty admin shell: run the client and open /admin');
  const schema = await fetch('http://127.0.0.1:3100/api/schema').then(r => r.json());
  console.log('CREATE TABLE statements that ran:');
  for (const statement of schema.createTableStatements) console.log(statement);
} finally {
  server.kill();
}
