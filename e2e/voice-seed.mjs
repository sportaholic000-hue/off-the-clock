// Seeds one owner who can take calls on a test number. Usage: node e2e/voice-seed.mjs <appOrigin> <dbPath> <twilioNumber>
import { createRequire } from 'node:module';
const require = createRequire(new URL('../server/package.json', import.meta.url));
const Database = require('better-sqlite3');
const [app, dbPath, number] = process.argv.slice(2);
const r = await fetch(app + '/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost:5173' },
  body: JSON.stringify({ email: 'voice-owner@example.com', password: 'CorrectHorse-Battery-77', firstName: 'Tess', businessName: 'Fundy Roofing', plan: 'Operator' }) });
if (!r.ok) throw new Error('register failed ' + r.status);
const db = new Database(dbPath); const now = new Date().toISOString();
const owner = db.prepare("SELECT id FROM users WHERE email = 'voice-owner@example.com'").get();
db.prepare('INSERT INTO billingAccounts (ownerId, stripeCustomerId, paymentMethodVerifiedAt, createdAt, updatedAt) VALUES (?,?,?,?,?)').run(owner.id, 'cus_e2e_' + owner.id.slice(0, 8), now, now, now);
db.prepare("UPDATE users SET plan = 'Operator', planStatus = 'active' WHERE id = ?").run(owner.id);
const has = db.prepare('SELECT ownerId FROM businessProfiles WHERE ownerId = ?').get(owner.id);
if (has) db.prepare("UPDATE businessProfiles SET twilioNumber = ?, agentName = 'Nova', phoneProvisioningStatus = 'active', updatedAt = ? WHERE ownerId = ?").run(number, now, owner.id);
else db.prepare("INSERT INTO businessProfiles (ownerId, twilioNumber, agentName, phoneProvisioningStatus, updatedAt) VALUES (?,?,'Nova','active',?)").run(owner.id, number, now);
console.log(JSON.stringify({ ownerId: owner.id, profile: db.prepare('SELECT twilioNumber, agentName FROM businessProfiles WHERE ownerId = ?').get(owner.id) }));
