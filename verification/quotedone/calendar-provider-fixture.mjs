// Synthetic provider boundary for real HTTP/application tests. Never imported by production.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const file=process.env.QUOTEDONE_CALENDAR_FIXTURE;
assert.equal(process.env.NODE_ENV,'test');
assert.equal(path.dirname(file),path.dirname(process.env.DATABASE_PATH));
assert.equal(process.env.GOOGLE_CLIENT_ID,'SYNTHETIC-NO-LIVE-CLIENT');
const save=s=>fs.writeFileSync(file,JSON.stringify(s,null,2));
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
globalThis.fetch=async function syntheticCalendarFetch(raw,options={}){
 const url=new URL(raw),method=options.method||'GET',state=JSON.parse(fs.readFileSync(file,'utf8'));
 assert.equal(state.syntheticOnly,true);
 const entry={url:url.toString(),method,body:options.body?String(options.body):null};state.calls.push(entry);save(state);
 if(url.href==='https://oauth2.googleapis.com/token'&&method==='POST'){
  const body=new URLSearchParams(options.body);assert.equal(body.get('client_id'),'SYNTHETIC-NO-LIVE-CLIENT');assert.equal(body.get('client_secret'),'SYNTHETIC-NO-LIVE-SECRET');
  return json({access_token:'SYNTHETIC-NO-LIVE-ACCESS',refresh_token:'SYNTHETIC-NO-LIVE-REFRESH',token_type:'Bearer',expires_in:3600,scope:'https://www.googleapis.com/auth/calendar'});
 }
 assert.equal(url.origin,'https://www.googleapis.com');
 assert.equal(new Headers(options.headers).get('authorization'),'Bearer SYNTHETIC-NO-LIVE-ACCESS');
 if(url.pathname==='/calendar/v3/freeBusy'&&method==='POST'){
  const body=JSON.parse(options.body);assert.deepEqual(body.items,[{id:'primary'}]);
  if(state.mode==='busy-unavailable')return json({error:'SYNTHETIC calendar unavailable'},503);
  const busy=(state.busy||[]).filter(row=>row.start<body.timeMax&&row.end>body.timeMin)
    .map(row=>({start:row.start<body.timeMin?body.timeMin:row.start,end:row.end>body.timeMax?body.timeMax:row.end}));
  return json({calendars:{primary:{busy}}});
 }
 if(url.pathname==='/calendar/v3/calendars/primary/events'&&method==='POST'){
  const body=JSON.parse(options.body);state.events[body.id]={...body,status:'confirmed'};save(state);
  if(state.mode==='ambiguous')throw Error('SYNTHETIC lost provider acknowledgement');
  return json(state.events[body.id]);
 }
 if(url.pathname.startsWith('/calendar/v3/calendars/primary/events/')&&method==='GET'){
  if(state.mode==='ambiguous')return json({error:'SYNTHETIC temporarily unavailable'},503);
  const event=state.events[decodeURIComponent(url.pathname.split('/').at(-1))];return event?json(event):json({error:'SYNTHETIC not found'},404);
 }
 throw Error('Unexpected provider operation blocked by synthetic test fixture');
};
