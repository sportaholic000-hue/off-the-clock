import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import Database from 'better-sqlite3';
import {once} from 'node:events';
import {installLiveDemoRoutes} from '../server/src/demo/liveDemo.js';

// Owner feedback 2026-10-29 from live demo calls: the agent never brought up the website quote
// widget, described it as lead capture only, never mentioned calendar booking, and listed
// transcription without saying why it matters. Expected wording written before execution.
const env={DEMO_ENABLED:'true',GEMINI_API_KEY:'SYNTHETIC_NOT_A_KEY',DEMO_ALLOWED_ORIGINS:'https://synthetic-demo.example.invalid',DEMO_IP_SALT:'synthetic-salt'};
const expected={
  booking:"- Booking (Operator and QuoteDone): the receptionist books callers into open times on the owner's connected Google Calendar, using the hours and availability the owner sets. When direct booking isn't set up, it takes the caller's preferred time for the owner to confirm.",
  widget:"- Website quote widget (Operator and QuoteDone): the owner adds it to their own website, and visitors get a quote any time, day or night, from the owner's own Price Book for the services the owner has set up. After the quote, visitors can book a time or request a preferred time, depending on how the owner set up booking. Jobs it can't price go to the owner as a detailed lead.",
  transcripts:"- Calls are transcribed, never recorded. The owner can read every call's transcript in the dashboard to check exactly what was said.",
  quotesWidget:'Whenever quotes come up, also tell them about the website quote widget: visitors on their own website get a real quote from their own prices, any time. Never describe the widget as only capturing leads.',
  quotesFirst:'If they ask about quotes before you know their business, cover quotes by phone and quotes on their website in a sentence or two, then ask what business they have.',
  bringUp:'BRING THESE UP: Once you know their business, work these in where they fit the calls and customers that business gets, one at a time and each only once, before smaller details like transcripts or spam filtering: booking callers straight into open times on their calendar, and the website quote widget that quotes visitors on their own website from their own prices.',
};

async function sessionText(t,agent){
  const db=new Database(':memory:'),app=express(),bodies=[];
  installLiveDemoRoutes(app,{db,env,fetchImpl:async(_url,init)=>{bodies.push(JSON.parse(init.body));return {ok:true,json:async()=>({name:'auth_tokens/synthetic'})};}});
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));db.close();});
  const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/demo/session',{method:'POST',headers:{'content-type':'application/json',origin:env.DEMO_ALLOWED_ORIGINS},body:JSON.stringify({agent})});
  assert.equal(response.status,200);assert.equal(bodies.length,1);
  return bodies[0].bidiGenerateContentSetup.systemInstruction.parts[0].text;
}

for(const agent of ['miles','nova'])test(`demo agent 20261029: ${agent} is told about booking, the website widget's quotes and why transcripts matter`,async t=>{
  const text=await sessionText(t,agent);
  for(const [name,line] of Object.entries(expected))assert.ok(text.includes(line),`${agent} session must include ${name}`);
  // The original owner rulings stay in place.
  assert.ok(text.includes('For any business, including every business outside those seven trades'));
  assert.ok(text.includes("Never tell a visitor their business can't get phone quotes."));
  assert.ok(text.includes('Off The Clock does not send text messages.'));
  assert.doesNotMatch(text,/QUOTING BY PHONE/);
  // Each new fact appears once, so the agent is not pushed to repeat itself.
  for(const line of [expected.booking,expected.widget,expected.transcripts])assert.equal(text.split(line).length,2);
});

// Owner feedback 2026-10-30 from a recorded demo call: "100% accurate", repeated read-back and
// lead lines, and no concrete examples of what a roofer's callers get asked.
test('demo agent 20261030: trade examples, accuracy tied to the caller\'s measurements, no repeating the read-back',async t=>{
  const text=await sessionText(t,'miles');
  assert.ok(text.includes("- Roof replacement: the roof's size in square feet, current and new roofing material, pitch, number of stories, how many layers come off, how complex the roof is, and the whole roof or part of it."));
  assert.ok(text.includes('- Siding repair: siding type, type of damage, size of the damaged area, and stories.'));
  assert.ok(text.includes('give two or three real examples for their trade from this list, in plain words, and never read the list out'));
  assert.ok(text.includes('A phone quote is as accurate as the caller\'s measurements, and the receptionist tells the caller: "This price is based on the measurements you gave us. The business will confirm them on site." Never call a quote 100% accurate or guaranteed.'));
  assert.ok(text.includes('This includes the measurement read-back and unpriced jobs going to the owner as a lead: say each at most once'));
  assert.doesNotMatch(text,/Examples can include the requested work/);
});

// Owner ruling (2026-10-01, restored 2026-10-30): the demo never turns a business type away.
// A later unrelated commit had replaced this line and the agent began refusing non-trade businesses.
test('demo agent 20261030: any business whose phone rings is a fit',async t=>{
  for(const agent of ['miles','nova']){
    const text=await sessionText(t,agent);
    assert.ok(text.includes('Any business whose phone rings is a fit. Never turn a business type away'));
    assert.ok(text.includes('Visitors are business owners deciding'));
    assert.doesNotMatch(text,/owners of service businesses|Do not promise suitability for every workflow/);
  }
});
