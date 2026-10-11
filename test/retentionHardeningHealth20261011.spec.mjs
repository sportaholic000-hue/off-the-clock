import test from 'node:test';
import assert from 'node:assert/strict';
import {A,END,DEADLINE,KEY,retentionFixture} from './helpers/tenantRetentionFixture.mjs';
import {installOffsiteBackupStatusRoute} from '../server/src/offsiteBackups.js';
import {createBillingCustomerLifecycle} from '../server/src/billingCustomerLifecycle.js';
import {createCalendarRetentionRevoker} from '../server/src/calendarRetentionRevocation.js';
import {eraseTenantPricebookFiles} from '../server/src/billingTenantErasure.js';
import {createAuthSessionService} from '../server/src/authSessionService.js';
import {requireAuth} from '../server/src/authMiddleware.js';
import express from 'express';
import jwt from 'jsonwebtoken';
const SID='PN'+'f'.repeat(32),DAY=86400000;
function lifecycle(f,{fail=false,backups=async()=>{}}={}){
 return createBillingCustomerLifecycle({database:f.db,clock:f.clock,enabled:()=>true,
  releaseNumber:async()=>{if(fail)throw Error('SYNTHETIC failed release');return {released:true};},
  revokeCalendar:createCalendarRetentionRevoker({enabled:()=>true,key:KEY,fetchImpl:async()=>({status:fail?503:200})}),
  erasePricebookFiles:ownerId=>eraseTenantPricebookFiles(ownerId,{directory:f.deployment.pricebookPath}),eraseBackupCopies:backups});
}

// Oracle: an overdue local/backups/calendar phase blocked by a retained lease
// must make admin health unhealthy even if the earlier phone release succeeded.
test('retention hardening: admin returns 503 for day-90 erasure blocked before initialization',async t=>{
 const f=retentionFixture(t);
 f.db.prepare('UPDATE businessProfiles SET twilioNumberSid=? WHERE ownerId=?').run(SID,A);
 const s=lifecycle(f);f.setTime(Date.parse(END)+30*DAY);await s.processOwner(A,{localOnly:true});
 f.setTime(DEADLINE);
 f.db.prepare('INSERT INTO billingRetentionLeases(ownerId,token,expiresAt) VALUES(?,?,?)').run(A,'SYNTHETIC-other-worker',new Date(Date.parse(DEADLINE)+60000).toISOString());
 await s.tick();
 const row=f.db.prepare('SELECT dataDeletedAt,lastError,retentionStateJson FROM billingCancellations WHERE ownerId=?').get(A);
 const status=s.retentionStatus(),remaining=f.db.prepare('SELECT COUNT(*) n FROM businessProfiles WHERE ownerId=?').get(A).n;
 assert.equal(remaining,1);assert.equal(JSON.parse(row.retentionStateJson).steps.phone.status,'DONE');assert.equal(row.dataDeletedAt,null);
 const environment={JWT_SECRET:'SYNTHETIC-audit-admin-secret',ADMIN_EMAIL:'synthetic-admin@example.invalid',ADMIN_PASSWORD_HASH:'SYNTHETIC-admin-hash'};
 const sessions=createAuthSessionService(f.db,{environment,clock:f.clock});
 const admin=sessions.create({id:'admin',role:'admin',email:environment.ADMIN_EMAIL,passwordHash:environment.ADMIN_PASSWORD_HASH});
 const app=express();installOffsiteBackupStatusRoute(app,{service:{status:()=>({ok:true,configured:true})},retentionStatus:s.retentionStatus,
  requireAuth:roles=>requireAuth(roles,{database:f.db,sessionService:sessions,verifyToken:token=>jwt.verify(token,environment.JWT_SECRET,{algorithms:['HS256'],clockTimestamp:f.clock().getTime()/1000})})});
 const server=await new Promise(resolve=>{const server=app.listen(0,'127.0.0.1',()=>resolve(server));});
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/admin/backups/offsite',{headers:{authorization:'Bearer '+admin.token}});
 const body=await response.json();t.diagnostic(JSON.stringify({case:'overdue cleanup blocked by lease',remainingPrivateProfiles:remaining,admin:status,httpStatus:response.status,body}));
 assert.equal(body.ok,false);
 assert.equal(response.status,503,'Overdue tenant erasure with surviving private data must not return healthy');
});


for(const connected of [true,false])test('retention hardening: missing due steps count, calendar connected='+connected,async t=>{
 const f=retentionFixture(t),s=lifecycle(f);
 if(!connected)f.db.prepare('DELETE FROM calendarConnections WHERE ownerId=?').run(A);
 f.setTime(Date.parse(END)+29*DAY);assert.equal(s.retentionStatus().ok,true);
 f.setTime(Date.parse(END)+30*DAY);
 assert.deepEqual(s.retentionStatus().pending.map(p=>p.step),['phone']);
 await s.processOwner(A,{localOnly:true});
 f.setTime(Date.parse(DEADLINE)-1);assert.equal(s.retentionStatus().ok,true);
 f.setTime(DEADLINE);
 assert.deepEqual(s.retentionStatus().pending.map(p=>p.step).sort(),connected?['backups','calendar','local']:['backups','local']);
 assert.equal(s.retentionStatus().pendingOwners,1);
});
