import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import express from 'express';
import Database from 'better-sqlite3';
import {CREATE_TABLE_STATEMENTS,CREATE_INDEX_STATEMENTS} from '../server/src/schema.js';

// The receptionist name is required again. Expected results written before execution:
// - DEFAULT_AGENT_NAMES is {female:'Nova',male:'Miles'}; defaultAgentName falls back to Nova.
// - A new business profile starts with Nova (no voice or female) or Miles (male voice).
// - The migration gives every profile with a NULL or blank name the default for its
//   voice, never touches a named profile, and a second run changes nothing.
// - The greeting preview works with only a voice and a greeting (no name).
// Synthetic owners only; the preview uses a fake provider, never the live model.

test('default names: Nova for the female voice, Miles for the male voice, Nova otherwise',async()=>{
  const {DEFAULT_AGENT_NAMES,defaultAgentName}=await import('../server/src/voice/agentNames.js');
  assert.deepEqual({...DEFAULT_AGENT_NAMES},{female:'Nova',male:'Miles'});
  assert.ok(Object.isFrozen(DEFAULT_AGENT_NAMES));
  assert.equal(defaultAgentName('female'),'Nova');
  assert.equal(defaultAgentName('male'),'Miles');
  for(const voiceId of [undefined,null,'','robot','toString','constructor','__proto__'])assert.equal(defaultAgentName(voiceId),'Nova',String(voiceId));
});

async function syntheticOwner(tag){
  const {db,migrate}=await import('../server/src/db.js');migrate();
  const id='[SYNTHETIC]-name-required-'+tag,now='2026-11-05T12:00:00.000Z';
  db.prepare("INSERT OR IGNORE INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt) VALUES(?,?,'[SYNTHETIC]','[SYNTHETIC]','[SYNTHETIC] Cedar Co','Starter','active','UTC','owner',?)").run(id,id+'@example.invalid',now);
  return {db,id};
}

test('a new profile with no voice set starts with Nova',async()=>{
  const {ensureBusinessProfile,getBusinessProfile}=await import('../server/src/onboardingService.js');
  const {id}=await syntheticOwner('no-voice');
  assert.equal(ensureBusinessProfile(id).agentName,'Nova');
  const other=await syntheticOwner('read-first');
  assert.equal(getBusinessProfile(other.id).agentName,'Nova','created on first read');
});

test('a new profile with the female voice starts with Nova and with the male voice starts with Miles',async()=>{
  const {ensureBusinessProfile,updateBusinessProfile}=await import('../server/src/onboardingService.js');
  const female=await syntheticOwner('female'),male=await syntheticOwner('male');
  const femaleProfile=ensureBusinessProfile(female.id,'female');
  assert.equal(femaleProfile.agentName,'Nova');assert.equal(femaleProfile.voiceId,'female');
  const maleProfile=ensureBusinessProfile(male.id,'male');
  assert.equal(maleProfile.agentName,'Miles');assert.equal(maleProfile.voiceId,'male');
  // A first save that sets only the voice creates the profile with that voice's name.
  const patched=await syntheticOwner('male-patch');
  assert.equal(updateBusinessProfile(patched.id,{voiceId:'male'}).agentName,'Miles');
  // An existing profile keeps its name.
  assert.equal(ensureBusinessProfile(female.id,'male').agentName,'Nova');
});

test('migration: NULL or blank names get the default for their voice; named profiles are untouched; idempotent',async()=>{
  const {backfillDefaultAgentNames}=await import('../server/src/migrations.js');
  const db=new Database(':memory:');
  for(const sql of CREATE_TABLE_STATEMENTS)db.exec(sql);
  const now='2026-11-05T12:00:00.000Z';
  const rows=[
    ['[SYNTHETIC]-null-female','female',null,'Nova'],
    ['[SYNTHETIC]-empty-male','male','','Miles'],
    ['[SYNTHETIC]-spaces-male','male','   ','Miles'],
    ['[SYNTHETIC]-tab-female','female','\t\n','Nova'],
    ['[SYNTHETIC]-null-novoice',null,null,'Nova'],
    ['[SYNTHETIC]-empty-novoice',null,'','Nova'],
    ['[SYNTHETIC]-named-male','male','Sam','Sam'],
    ['[SYNTHETIC]-named-female','female','  Riley ','  Riley '],
  ];
  const insertUser=db.prepare("INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt) VALUES(?,?,'x','x','x','Starter','active','UTC','owner',?)");
  const insertProfile=db.prepare('INSERT INTO businessProfiles(ownerId,voiceId,agentName,greeting,updatedAt) VALUES(?,?,?,?,?)');
  for(const [id,voiceId,agentName] of rows){insertUser.run(id,id+'@example.invalid',now);insertProfile.run(id,voiceId,agentName,'[SYNTHETIC] greeting',now);}
  const read=()=>Object.fromEntries(db.prepare('SELECT ownerId,agentName,voiceId,greeting,updatedAt FROM businessProfiles').all().map(row=>[row.ownerId,row]));
  const before=read();
  backfillDefaultAgentNames(db);
  const after=read();
  for(const [id,voiceId,,expected] of rows){
    assert.equal(after[id].agentName,expected,id);
    assert.equal(after[id].voiceId,voiceId,id+' voice unchanged');
    assert.equal(after[id].greeting,before[id].greeting,id+' greeting unchanged');
  }
  backfillDefaultAgentNames(db);
  assert.deepEqual(read(),after,'a second run changes nothing');
  db.close();
});

test('migration runs on startup: migrateDatabase fills a blank name and keeps a named one',async()=>{
  const {db,migrate}=await import('../server/src/db.js');migrate();
  const {id}=await syntheticOwner('startup-blank');
  const named=await syntheticOwner('startup-named');
  const now='2026-11-05T12:00:00.000Z';
  db.prepare("INSERT OR REPLACE INTO businessProfiles(ownerId,voiceId,agentName,greeting,updatedAt) VALUES(?,'male','  ','',?)").run(id,now);
  db.prepare("INSERT OR REPLACE INTO businessProfiles(ownerId,voiceId,agentName,greeting,updatedAt) VALUES(?,'male','Sam','',?)").run(named.id,now);
  const {migrateDatabase}=await import('../server/src/migrations.js');
  migrateDatabase(db);
  assert.equal(db.prepare('SELECT agentName FROM businessProfiles WHERE ownerId=?').get(id).agentName,'Miles');
  assert.equal(db.prepare('SELECT agentName FROM businessProfiles WHERE ownerId=?').get(named.id).agentName,'Sam');
});

async function previewServer(t){
  const {installVoicePreviewRoutes}=await import('../server/src/voicePreviewRoutes.js');
  const db=new Database(':memory:');for(const sql of CREATE_TABLE_STATEMENTS)db.exec(sql);for(const sql of CREATE_INDEX_STATEMENTS)db.exec(sql);
  const sent=[];
  const client={live:{connect:async({callbacks})=>({sendClientContent:value=>{sent.push(value);setImmediate(()=>callbacks.onmessage({serverContent:{modelTurn:{parts:[{inlineData:{mimeType:'audio/pcm;rate=24000',data:Buffer.from([1,0,2,0]).toString('base64')}}]},turnComplete:true}}));},close(){}})}};
  const app=express();app.use(express.json());
  const requireAuth=()=>(req,_res,next)=>{req.tenantOwnerId='[SYNTHETIC]-preview-owner';next();};
  const asyncHandler=handler=>(req,res,next)=>Promise.resolve(handler(req,res,next)).catch(next);
  installVoicePreviewRoutes(app,{requireAuth,asyncHandler,ownerQuery:sql=>db.prepare(sql),env:{GEMINI_API_KEY:'synthetic-key',GEMINI_MODEL:'synthetic-native-audio-live-model'},client,clock:()=>Date.parse('2026-11-05T12:00:00Z'),onError:()=>{}});
  app.use((err,_req,res,_next)=>res.status(err.statusCode||500).json({error:err.statusCode<500?err.message:'Internal server error'}));
  const http=app.listen(0,'127.0.0.1');await once(http,'listening');
  t.after(()=>{http.close();db.close();});
  const preview=async body=>{const response=await fetch('http://127.0.0.1:'+http.address().port+'/api/onboarding/voice/preview',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});return {status:response.status,body:await response.json()};};
  return {preview,sent};
}

test('preview still works with only a voice and a greeting; voice and greeting are still checked',async t=>{
  const f=await previewServer(t);
  const greeting='Thanks for calling [SYNTHETIC] Cedar Co, this is Nova. How can I help?';
  for(const voiceId of ['female','male']){
    const reply=await f.preview({voiceId,greeting:voiceId+' '+greeting});
    assert.equal(reply.status,200,JSON.stringify(reply.body));
    assert.equal(reply.body.mimeType,'audio/wav');
  }
  assert.equal(f.sent.length,2);
  for(const body of [{voiceId:'robot',greeting},{voiceId:'female',greeting:'   '},{voiceId:'female',greeting:'x'.repeat(1001)}]){
    const reply=await f.preview(body);
    assert.equal(reply.status,400,JSON.stringify(body));
    assert.match(reply.body.error,/Choose a voice and enter a greeting/);
  }
  assert.equal(f.sent.length,2,'refused previews never reach the provider');
});
