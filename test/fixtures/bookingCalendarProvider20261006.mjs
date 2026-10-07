// Test-only preload: every provider fetch terminates here; no network fallback.
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
assert.equal(process.env.NODE_ENV,'test');
const file=process.env.BOOKING_SYNTHETIC_PROVIDER;
assert.ok(file?.endsWith('synthetic-provider.json'));
const RealDate=Date,read=()=>JSON.parse(readFileSync(file,'utf8'));
globalThis.Date=class extends RealDate {constructor(...args){super(...(args.length?args:[read().now]));}static now(){return RealDate.parse(read().now);}};
globalThis.fetch=async(raw,options={})=>{
  const url=new URL(raw),state=read(),body=options.body?JSON.parse(options.body):null;
  assert.equal(state.syntheticOnly,true);assert.equal(url.origin,'https://www.googleapis.com');
  const owner=new Headers(options.headers).get('authorization')?.replace('Bearer SYNTHETIC-','');
  assert.ok(['synthetic-a','synthetic-b'].includes(owner));
  state.calls.push({owner,path:url.pathname,method:options.method,body});
  const save=()=>writeFileSync(file,JSON.stringify(state));
  const json=(value,status=200)=>{save();return new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});};
  if(url.pathname==='/calendar/v3/freeBusy'){
    if(state.mode==='busy-failure')return json({error:'[SYNTHETIC] unavailable'},503);
    const busy=Object.values(state.events).filter(e=>e.owner===owner&&e.start.dateTime<body.timeMax&&e.end.dateTime>body.timeMin)
      .map(e=>({start:e.start.dateTime<body.timeMin?body.timeMin:e.start.dateTime,end:e.end.dateTime>body.timeMax?body.timeMax:e.end.dateTime}));
    return json({calendars:{primary:{busy}}});
  }
  if(url.pathname==='/calendar/v3/calendars/primary/events'&&options.method==='POST'){
    if(state.mode==='reject')return json({error:'[SYNTHETIC] forbidden'},403);
    const key=owner+':'+body.id;
    if(state.events[key])return json({error:'[SYNTHETIC] duplicate ID'},409);
    state.events[key]={...body,owner,status:'confirmed'};save();
    if(state.mode==='lost-response')throw Error('[SYNTHETIC] response lost after durable write');
    return json(state.events[key]);
  }
  if(url.pathname.startsWith('/calendar/v3/calendars/primary/events/')&&options.method==='GET'){
    if(state.mode==='lost-response')return json({error:'[SYNTHETIC] lookup unavailable'},503);
    const value=state.events[owner+':'+decodeURIComponent(url.pathname.split('/').at(-1))];
    return json(value||{error:'[SYNTHETIC] not found'},value?200:404);
  }
  throw Error('Unexpected provider request blocked');
};
