import test from 'node:test';
import assert from 'node:assert/strict';
import {startLeadCaptureFeed} from '../client/src/leadCaptureFeed.js';

class Events {
  listeners=new Map();visibilityState='visible';
  addEventListener(type,fn){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(fn);}
  removeEventListener(type,fn){this.listeners.get(type)?.delete(fn);}
  emit(type){for(const fn of [...(this.listeners.get(type)||[])])fn({type});}
  count(){return [...this.listeners.values()].reduce((n,set)=>n+set.size,0);}
}
function harness(read){
  const jobs=new Map(),events=new Events(),visibility=new Events(),data=[],errors=[];let now=0,serial=0,identity='synthetic-a',changes=0;
  const feed=startLeadCaptureFeed({read,onData:value=>data.push(value),onError:error=>errors.push(error),onSessionChange:()=>changes++,session:()=>identity,
    events,visibility,schedule:(fn,delay)=>{const id=++serial;jobs.set(id,{fn,at:now+delay});return id;},cancel:id=>jobs.delete(id)});
  async function advance(ms){const end=now+ms;for(;;){const next=[...jobs.entries()].filter(([,job])=>job.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;now=next[1].at;jobs.delete(next[0]);next[1].fn();await flush();}now=end;await flush();}
  return {feed,jobs,events,visibility,data,errors,advance,change:(next,notify=true)=>{identity=next;if(notify)events.emit('otc:session');},changes:()=>changes};
}
async function flush(){for(let i=0;i<8;i++)await Promise.resolve();}
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};

test('D30 feed: one bounded timer/read, delayed reads show stale state without overlapping requests',async()=>{
  const pending=deferred();let reads=0;const h=harness(()=>{reads++;return pending.promise;});
  assert.equal(h.jobs.size,1);await h.advance(4999);assert.equal(reads,0);await h.advance(1);assert.equal(reads,1);
  await h.advance(60000);assert.equal(reads,1);assert.equal(h.errors.length,1);assert.match(h.errors[0].message,/delayed/);assert.equal(h.jobs.size,0);
  pending.resolve({calls:[{id:'synthetic-new'}]});await flush();assert.equal(h.data[0].calls[0].id,'synthetic-new');assert.equal(h.jobs.size,1);h.feed.stop();assert.equal(h.jobs.size,0);
});

test('D30 feed: repeated failures back off and pause after three attempts; explicit restart can recover',async()=>{
  let reads=0;const h=harness(async()=>{reads++;throw Error('[SYNTHETIC] unavailable');});
  await h.advance(5000);assert.equal(reads,1);await h.advance(9999);assert.equal(reads,1);await h.advance(1);assert.equal(reads,2);await h.advance(20000);assert.equal(reads,3);await h.advance(600000);assert.equal(reads,3);assert.equal(h.jobs.size,0);assert.equal(h.errors.length,3);h.feed.stop();
  const retry=harness(async()=>({calls:[{id:'synthetic-recovered'}]}));await retry.advance(5000);assert.equal(retry.data[0].calls[0].id,'synthetic-recovered');retry.feed.stop();
});

test('D30 feed: hidden tabs pause, visible events do not create duplicate timers or reads',async()=>{
  let reads=0;const h=harness(async()=>{reads++;return {calls:[]};});h.visibility.visibilityState='hidden';h.visibility.emit('visibilitychange');await h.advance(60000);assert.equal(reads,0);assert.equal(h.jobs.size,0);
  h.visibility.visibilityState='visible';for(let i=0;i<5;i++)h.visibility.emit('visibilitychange');assert.equal(h.jobs.size,1);await h.advance(0);assert.equal(reads,1);assert.equal(h.jobs.size,1);h.feed.stop();
});

test('D30 feed: changed tenant/session discards an old response and clears the snapshot once',async()=>{
  const pending=deferred(),h=harness(()=>pending.promise);await h.advance(5000);h.change('synthetic-b');assert.equal(h.changes(),1);assert.equal(h.jobs.size,0);
  pending.resolve({calls:[{id:'synthetic-a-private'}]});await flush();assert.equal(h.data.length,0);assert.equal(h.changes(),1);assert.equal(h.events.count(),0);assert.equal(h.visibility.count(),0);
  const silent=deferred(),other=harness(()=>silent.promise);await other.advance(5000);other.change('synthetic-b',false);silent.resolve({calls:[{id:'synthetic-a-private'}]});await flush();assert.equal(other.data.length,0);assert.equal(other.changes(),1);
});

test('D30 feed: unmount cleans timer/subscriptions and ignores both late success and errors',async()=>{
  for(const failure of [false,true]){const pending=deferred(),h=harness(()=>pending.promise);await h.advance(5000);h.feed.stop();h.feed.stop();assert.equal(h.jobs.size,0);assert.equal(h.events.count(),0);assert.equal(h.visibility.count(),0);
    if(failure)pending.reject(Error('[SYNTHETIC] late failure'));else pending.resolve({calls:[{id:'synthetic-late'}]});await flush();assert.equal(h.data.length,0);assert.equal(h.errors.length,0);assert.equal(h.jobs.size,0);}
});
