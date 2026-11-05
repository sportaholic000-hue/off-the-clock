import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';

// Real HTTP routes, auth middleware and SQLite. Expected results written before execution:
// - A Settings save (fromSettings:true) of Receptionist or Business knowledge leaves
//   onboardingStep where it was, and the flag is never stored.
// - Finishing step 9 sets onboardingStep 10 even when steps 7 and 8 were passed
//   without a save (Starter: saved progress is 6 when step 9 is finished).
// - Saving step 5 during setup still moves progress to 6.
// - Erasing one account deletes its voice preview clips and no other account's.
test('Settings saves keep setup progress; setup saves still advance; erasure removes preview clips',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'otc-settings-progress-'));
  const originalEnvironment={...process.env};
  Object.assign(process.env,{
    NODE_ENV:'test',PORT:'0',DATABASE_PATH:join(directory,'test.sqlite'),
    PRICEBOOK_PATH:join(directory,'books'),JWT_SECRET:'SYNTHETIC_SETTINGS_PROGRESS_SECRET_20261105',
    VOICE_RUNTIME_ENABLED:'false',ALLOW_PROVIDER_WRITES:'false',
    TWILIO_ACCOUNT_SID:'AC'+'0'.repeat(32),TWILIO_API_KEY_SID:'SK'+'0'.repeat(32),
    TWILIO_API_KEY_SECRET:'SYNTHETIC_TEST_ONLY'
  });
  let lifecycle;
  try {
    const server=await import('../server/src/server.js');
    lifecycle=server.lifecycle;
    if(!server.httpServer.listening)await once(server.httpServer,'listening');
    const {db}=await import('../server/src/db.js');
    const {createAuthSessionService}=await import('../server/src/authSessionService.js');
    const {ensureBusinessProfile,updateBusinessProfile}=await import('../server/src/onboardingService.js');
    const {eraseTenantRows}=await import('../server/src/billingTenantErasure.js');
    const base='http://127.0.0.1:'+server.httpServer.address().port;
    const now='2026-11-05T12:00:00.000Z';

    function owner(plan,tag,step) {
      const id='[SYNTHETIC]-progress-'+tag;
      db.prepare(`INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,emailVerifiedAt,timezone,role,createdAt)
        VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(id,id+'@example.invalid','[SYNTHETIC]','[SYNTHETIC] First','[SYNTHETIC] Business',plan,'active',now,'UTC','owner',now);
      db.prepare('INSERT INTO billingAccounts(ownerId,stripeCustomerId,paymentMethodVerifiedAt,createdAt,updatedAt) VALUES(?,?,?,?,?)')
        .run(id,'cus_SYNTHETIC_progress_'+tag,now,now,now);
      db.prepare("UPDATE users SET planStatus='active' WHERE id=?").run(id);
      ensureBusinessProfile(id);updateBusinessProfile(id,{onboardingStep:step});
      return {id,token:createAuthSessionService(db).create(db.prepare('SELECT * FROM users WHERE id=?').get(id)).token};
    }
    const post=async(who,path,body)=>{
      const response=await fetch(base+path,{method:'POST',headers:{authorization:'Bearer '+who.token,'content-type':'application/json'},body:JSON.stringify(body)});
      return {status:response.status,body:await response.json()};
    };
    const step=who=>db.prepare('SELECT onboardingStep FROM businessProfiles WHERE ownerId=?').get(who.id).onboardingStep;
    const voice={voiceId:'female',agentName:'',greeting:'[SYNTHETIC] Thanks for calling, how can I help?'};
    const knowledge={about:'[SYNTHETIC] About',hours:'[SYNTHETIC] Hours',services:'',policies:'',faqs:'',prices:'',neverSay:''};

    const settingsOwner=owner('Starter','settings',3);
    let saved=await post(settingsOwner,'/api/onboarding/voice',{...voice,fromSettings:true});
    assert.equal(saved.status,200,JSON.stringify(saved.body));assert.equal(step(settingsOwner),3);
    assert.equal(Object.hasOwn(saved.body.profile,'fromSettings'),false);
    saved=await post(settingsOwner,'/api/onboarding/knowledge-base',{...knowledge,fromSettings:true});
    assert.equal(saved.status,200,JSON.stringify(saved.body));assert.equal(step(settingsOwner),3);
    assert.equal(JSON.stringify(saved.body.profile).includes('fromSettings'),false);
    // Other unknown voice fields are still refused.
    assert.equal((await post(settingsOwner,'/api/onboarding/voice',{...voice,fromSettings:true,extra:1})).status,400);

    const setupOwner=owner('Starter','setup',5);
    assert.equal((await post(setupOwner,'/api/onboarding/knowledge-base',knowledge)).status,200);assert.equal(step(setupOwner),6);
    // Starter passes steps 7 and 8 without a save, then finishes step 9.
    assert.equal((await post(setupOwner,'/api/onboarding/voice',voice)).status,200);assert.equal(step(setupOwner),10);

    const other=owner('Starter','other',10);
    const clip=db.prepare('INSERT INTO voicePreviewClips(ownerId,clipKey,voiceId,model,audioWav,createdAt) VALUES(?,?,?,?,?,?)');
    clip.run(setupOwner.id,'a'.repeat(64),'female','[SYNTHETIC]',Buffer.from('RIFF'),Date.parse(now));
    clip.run(other.id,'b'.repeat(64),'female','[SYNTHETIC]',Buffer.from('RIFF'),Date.parse(now));
    eraseTenantRows(db,setupOwner.id,now);
    const clips=db.prepare('SELECT ownerId FROM voicePreviewClips ORDER BY ownerId').all().map(row=>row.ownerId);
    assert.deepEqual(clips,[other.id]);
  } finally {
    if(lifecycle)await lifecycle.shutdown({timeoutMs:5000,exit:code=>assert.equal(code,0)});
    for(const key of Object.keys(process.env))if(!Object.hasOwn(originalEnvironment,key))delete process.env[key];
    Object.assign(process.env,originalEnvironment);
    rmSync(directory,{recursive:true,force:true});
  }
});
