import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {readFileSync} from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {harness} from './voiceLifecycle20261006Fixture.mjs';
import {compileVoiceSystemInstruction,transcriptionNoticeKind,TRANSCRIPTION_NOTICE} from '../server/src/voice/voicePromptCompiler.js';
import {validateVoiceSettings} from '../server/src/voice/voiceSettings.js';
import {saveVoice,getBusinessProfile} from '../server/src/onboardingService.js';
import {migrateDatabase} from '../server/src/migrations.js';
import {createServer} from 'vite';

// Owner decision 2026-10-30: each business owner decides whether callers hear that the call is
// transcribed. Off unless the owner turns it on. Expected text written before execution.
const QUOTING='Just so you know, this call is transcribed to ensure quoting accuracy.';
const DETAILS='Just so you know, this call is transcribed so we get your details right.';
const LABEL='Tell callers the call is transcribed';
const HELPER='When on, your receptionist says this right after the greeting on every call.';
const guideText=readFileSync(new URL('../server/src/voice/receptionistGuide.md',import.meta.url),'utf8');
const base={guideText,business:{businessName:'Synthetic Roofing',agentName:'Sam'},services:[]};

test('transcription notice: exact sentences and plan choice',()=>{
  assert.equal(TRANSCRIPTION_NOTICE.quoting,QUOTING);
  assert.equal(TRANSCRIPTION_NOTICE.details,DETAILS);
  assert.equal(transcriptionNoticeKind(false,{booking:true}),undefined);
  assert.equal(transcriptionNoticeKind(true,{booking:true}),'quoting');
  assert.equal(transcriptionNoticeKind(true,{booking:false}),'details');
});

test('transcription notice: off adds nothing; on adds the exact sentence right after the greeting rule, with or without a custom greeting',()=>{
  const off=compileVoiceSystemInstruction(base);
  assert.doesNotMatch(off,/TRANSCRIPTION NOTICE|is transcribed to ensure|is transcribed so we get/);
  for(const greeting of [undefined,'Thanks for calling Synthetic Roofing, this is Sam.']){
    for(const [kind,sentence] of [['quoting',QUOTING],['details',DETAILS]]){
      const text=compileVoiceSystemInstruction({...base,greeting,transcriptionNotice:kind});
      const rule='TRANSCRIPTION NOTICE: Right after the greeting, once per call, say exactly: "'+sentence+'"';
      assert.equal(text.split(rule).length,2,kind);
      const greetingRule=text.indexOf('On call connection, speak business.greeting exactly when configured');
      assert.ok(greetingRule>=0&&greetingRule<text.indexOf(rule),'notice follows the greeting rule');
      assert.doesNotMatch(sentence,/\bAI\b|artificial|robot/i);
    }
  }
  assert.throws(()=>compileVoiceSystemInstruction({...base,transcriptionNotice:'custom'}),error=>error.code==='INVALID_TRANSCRIPTION_NOTICE'||/INVALID_TRANSCRIPTION_NOTICE/.test(error.message)||error.setting!==undefined);
});

test('transcription notice: the setting accepts only true or false',()=>{
  const input={voiceId:'female',agentName:'Nova',greeting:'Synthetic greeting'};
  assert.equal(validateVoiceSettings(input).transcriptionNotice,undefined);
  assert.equal(validateVoiceSettings({...input,transcriptionNotice:true}).transcriptionNotice,true);
  assert.equal(validateVoiceSettings({...input,transcriptionNotice:false}).transcriptionNotice,false);
  for(const value of ['true',1,null,'yes'])assert.throws(()=>validateVoiceSettings({...input,transcriptionNotice:value}),error=>error.statusCode===400);
});

test('transcription notice: existing databases gain the column switched off for every business',()=>{
  const db=new Database(':memory:');
  db.exec("CREATE TABLE users(id TEXT PRIMARY KEY)");
  db.exec("CREATE TABLE businessProfiles(id TEXT PRIMARY KEY, ownerId TEXT, greeting TEXT, updatedAt TEXT)");
  db.prepare("INSERT INTO businessProfiles(id,ownerId,greeting,updatedAt) VALUES('p1','synthetic-old','Hi','2026-11-01T00:00:00Z')").run();
  try{migrateDatabase(db);}catch{/* later legacy-user checks are outside this test; additive columns run before them */}
  const columns=db.prepare('PRAGMA table_info(businessProfiles)').all();
  const column=columns.find(c=>c.name==='transcriptionNotice');
  assert.ok(column,'column added');assert.equal(column.dflt_value,'0');assert.equal(column.notnull,1);
  assert.equal(db.prepare("SELECT transcriptionNotice FROM businessProfiles WHERE ownerId='synthetic-old'").get().transcriptionNotice,0);
  db.close();
});

test('transcription notice: new businesses start off, saving it on for one business leaves the other off',async t=>{
  const h=await harness(t,{filename:process.env.DATABASE_PATH});
  assert.equal(getBusinessProfile('synthetic-a').transcriptionNotice,false);
  assert.equal(getBusinessProfile('synthetic-b').transcriptionNotice,false);
  saveVoice('synthetic-a',{voiceId:'female',agentName:'Nova',greeting:'Synthetic greeting',transcriptionNotice:true});
  assert.equal(getBusinessProfile('synthetic-a').transcriptionNotice,true);
  assert.equal(getBusinessProfile('synthetic-b').transcriptionNotice,false);
  saveVoice('synthetic-a',{voiceId:'female',agentName:'Nova',greeting:'Synthetic greeting'});
  assert.equal(getBusinessProfile('synthetic-a').transcriptionNotice,true,'leaving it out keeps the saved choice');
  saveVoice('synthetic-a',{voiceId:'female',agentName:'Nova',greeting:'Synthetic greeting',transcriptionNotice:false});
  assert.equal(getBusinessProfile('synthetic-a').transcriptionNotice,false);
  assert.ok(h);
});

for(const [plan,sentence] of [['Operator',QUOTING],['QuoteDone',QUOTING],['Starter',DETAILS]])
test(`transcription notice: a real signed call on ${plan} carries the ${plan==='Starter'?'details':'quoting'} sentence only when the owner turned it on`,async t=>{
  for(const on of [false,true]){
    const connections=[];
    const h=await harness(t,{beforeInstall:f=>{
      f.db.prepare('UPDATE users SET plan=? WHERE id=?').run(plan,'synthetic-a');
      f.db.prepare('UPDATE businessProfiles SET transcriptionNotice=? WHERE ownerId=?').run(on?1:0,'synthetic-a');
    },onConnect:input=>connections.push(input)});
    await h.connect(on?2:1);
    assert.equal(connections.length,1);
    const prompt=connections[0].config.systemInstruction;
    if(on)assert.equal(prompt.split('say exactly: "'+sentence+'"').length,2);
    else assert.doesNotMatch(prompt,/TRANSCRIPTION NOTICE/);
  }
});

test('transcription notice: the voice and greeting screen shows the switch with the exact label and helper text',async()=>{
  const vite=await createServer({root:new URL('../client',import.meta.url).pathname,server:{middlewareMode:true},appType:'custom'});
  let html;try{const {Toggle}=await vite.ssrLoadModule('/src/ui.jsx');html=renderToStaticMarkup(React.createElement(Toggle,{checked:false,onChange(){},label:LABEL,sublabel:HELPER}));}finally{await vite.close();}
  assert.match(html,/role="switch"/);assert.match(html,/aria-checked="false"/);
  assert.ok(html.includes(LABEL));assert.ok(html.includes(HELPER));
  const source=readFileSync(new URL('../client/src/onboarding.jsx',import.meta.url),'utf8');
  assert.ok(source.includes(`<Toggle checked={form.transcriptionNotice} onChange={value => update('transcriptionNotice', value)} label="${LABEL}" sublabel="${HELPER}" />`));
  assert.ok(source.includes('transcriptionNotice:state.profile.transcriptionNotice===true,'));
});
