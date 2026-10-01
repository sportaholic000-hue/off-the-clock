// Local acceptance fixture only. No production data, email, voice or provider calls.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'otc-owner-integrations-browser-'));
const port=Number(process.env.INTEGRATION_BROWSER_PORT||8847);
process.env.PORT=String(port);process.env.NODE_ENV='test';
process.env.JWT_SECRET='SYNTHETIC_BROWSER_OWNER_INTEGRATION_JWT_SECRET_ONLY';
process.env.CREDENTIAL_ENCRYPTION_KEY='47'.repeat(32);
process.env.OUTBOUND_WEBHOOKS_ENABLED='false';process.env.ALLOW_PROVIDER_WRITES='false';
process.env.VOICE_RUNTIME_ENABLED='false';process.env.STRIPE_BILLING_ENABLED='false';
process.env.EMAIL_DELIVERY_ENABLED='false';process.env.EMAIL_PROVIDER='console';
process.env.DATABASE_PATH=path.join(directory,'fixture.sqlite');
process.env.PRICEBOOK_PATH=path.join(directory,'pricebooks');
const origin='http://127.0.0.1:'+port;
process.env.CLIENT_URL=origin;process.env.PUBLIC_BASE_URL=origin;process.env.CORS_ALLOWED_ORIGINS=origin;
const {db,migrate}=await import('../../server/src/db.js');migrate();
const timestamp=new Date().toISOString(),passwordHash=await bcrypt.hash('SYNTHETIC_OWNER_PASSWORD_ONLY',12);
for(const id of ['browser-a','browser-b']) {
  db.prepare(`INSERT INTO users (id,email,passwordHash,firstName,businessName,plan,planStatus,role,createdAt)
    VALUES (?,?,?,'Synthetic owner','Synthetic acceptance business','Operator','pending_payment','owner',?)`).run(id,id+'@example.invalid',passwordHash,timestamp);
  db.prepare(`INSERT INTO billingAccounts(ownerId,stripeCustomerId,paymentMethodVerifiedAt,createdAt,updatedAt)
    VALUES (?,?,?,?,?)`).run(id,'cus_SYNTHETIC_'+id,timestamp,timestamp,timestamp);
  db.prepare("UPDATE users SET planStatus='active' WHERE id=?").run(id);
}
function records(ownerId) {
  const marker=ownerId==='browser-a'?'SYNTHETIC_OWNER_A':'OTHER_TENANT_B',id=crypto.randomUUID();
  db.prepare(`INSERT INTO leads(id,ownerId,customerName,callerNumber,describedService,type,status,createdAt)
    VALUES (?,?,?,?,'Synthetic service','callback','NEW',?)`).run(id,ownerId,'='+marker,'+19025550123',timestamp);
  db.prepare('INSERT INTO quoteRequests(id,ownerId,describedService,createdAt) VALUES (?,?,?,?)').run(id,ownerId,marker,timestamp);
  db.prepare(`INSERT INTO appointments(id,ownerId,serviceType,status,datetime,customerJson,createdAt)
    VALUES (?,?,'SYNTHETIC_SERVICE','CONFIRMED','2026-10-02T12:00:00.000Z',?,?)`).run(id,ownerId,JSON.stringify({name:marker}),timestamp);
}
records('browser-a');records('browser-b');
const {default:app}=await import('../../server/src/server.js');
const {requireAuth}=await import('../../server/src/auth.js');
app.post('/__fixture/create-records',requireAuth(['owner']),(req,res)=>{records(req.tenantOwnerId);res.json({ok:true});});
app.post('/__fixture/stop',(_req,res)=>{res.json({ok:true});setTimeout(()=>process.exit(0),100);});
const express=(await import('express')).default,dist=path.resolve('client/dist');
app.use(express.static(dist));app.get('*',(_req,res)=>res.sendFile(path.join(dist,'index.html')));
console.log(JSON.stringify({fixtureReady:true,origin}));
