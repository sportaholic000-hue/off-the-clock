import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import express from 'express';
import Database from 'better-sqlite3';
import {createLifecycle} from '../server/src/lifecycle.js';

async function fixture(t) {
  const db=new Database(':memory:');db.exec('CREATE TABLE work(kind TEXT PRIMARY KEY)');
  const app=express(),lifecycle=createLifecycle(app,db),server=app.listen(0);await once(server,'listening');
  t.after(()=>{server.closeAllConnections();server.close();if(db.open)db.close();});
  return {db,app,lifecycle,server,url:'http://127.0.0.1:'+server.address().port};
}
test('shutdown rejects new work, drains active HTTP handlers and workers, then closes SQLite',async t=>{
  const f=await fixture(t);let releaseRoute,releaseWorker,routeStarted,workerStopped=false,exitCode;
  const entered=new Promise(resolve=>{routeStarted=resolve;});
  f.app.get('/slow',async(_req,res)=>{
    routeStarted();await new Promise(resolve=>{releaseRoute=resolve;});
    f.db.prepare('INSERT INTO work VALUES(?)').run('request');res.json({ok:true});
  });
  f.lifecycle.attach(f.server,{signals:false,stopWorkers:[async()=>{
    await new Promise(resolve=>{releaseWorker=resolve;});f.db.prepare('INSERT INTO work VALUES(?)').run('worker');workerStopped=true;
  }]});
  const response=fetch(f.url+'/slow');await entered;
  const shutdown=f.lifecycle.shutdown({timeoutMs:3000,exit:code=>{exitCode=code;}});
  assert.equal(f.lifecycle.isDraining(),true);
  await new Promise(resolve=>setTimeout(resolve,20));assert.equal(f.db.open,true);assert.equal(exitCode,undefined);
  // The listener stops accepting new sockets as soon as shutdown begins.
  await assert.rejects(()=>fetch(f.url+'/new',{signal:AbortSignal.timeout(500)}));
  releaseRoute();assert.equal((await response).status,200);
  assert.equal(f.db.open,true);assert.equal(workerStopped,false);
  releaseWorker();await shutdown;assert.equal(workerStopped,true);assert.equal(f.db.open,false);assert.equal(exitCode,0);
});
test('shutdown also waits for an async route after its client disconnects',async t=>{
  const f=await fixture(t);let release,entered;
  const started=new Promise(resolve=>{entered=resolve;});
  f.app.get('/abandoned',async(_req,res)=>{entered();await new Promise(resolve=>{release=resolve;});f.db.prepare('INSERT INTO work VALUES(?)').run('abandoned');res.end();});
  f.lifecycle.attach(f.server,{signals:false});
  const request=http.get(f.url+'/abandoned');request.on('error',()=>{});
  await started;request.destroy();await new Promise(resolve=>setTimeout(resolve,20));
  let exitCode;const stop=f.lifecycle.shutdown({timeoutMs:3000,exit:code=>{exitCode=code;}});
  await new Promise(resolve=>setTimeout(resolve,20));assert.equal(exitCode,undefined);assert.equal(f.db.open,true);
  release();await stop;assert.equal(exitCode,0);assert.equal(f.db.open,false);
});
test('deadline exits for journal recovery without closing a database under unfinished work',async t=>{
  const f=await fixture(t);f.lifecycle.attach(f.server,{signals:false,stopWorkers:[()=>new Promise(()=>{})]});
  let exitCode;await f.lifecycle.shutdown({timeoutMs:30,exit:code=>{exitCode=code;}});
  assert.equal(exitCode,1);assert.equal(f.db.open,true);
});
test('health readiness checks SQLite and fails closed when it is unavailable',async t=>{
  const f=await fixture(t);f.app.get('/api/health',f.lifecycle.health);
  assert.equal((await fetch(f.url+'/api/health')).status,200);f.db.close();
  const response=await fetch(f.url+'/api/health');assert.equal(response.status,503);assert.deepEqual(await response.json(),{ok:false,error:'SERVICE_NOT_READY'});
});
test('final backup waits for disconnected route and worker commits while SQLite remains open',async t=>{
  const f=await fixture(t);let enter,releaseRoute,releaseWorker,captured,exitCode;
  const entered=new Promise(resolve=>{enter=resolve;});
  f.app.get('/final-write',async(_req,res)=>{enter();await new Promise(resolve=>{releaseRoute=resolve;});f.db.prepare('INSERT INTO work VALUES(?)').run('last-route');res.end();});
  f.lifecycle.attach(f.server,{signals:false,stopWorkers:[async()=>{await new Promise(resolve=>{releaseWorker=resolve;});f.db.prepare('INSERT INTO work VALUES(?)').run('last-worker');}],finalWorkers:[async()=>{
    assert.equal(f.db.open,true);captured=f.db.prepare('SELECT kind FROM work ORDER BY kind').all().map(row=>row.kind);
  }]});
  const request=http.get(f.url+'/final-write');request.on('error',()=>{});await entered;request.destroy();
  const stopped=f.lifecycle.shutdown({timeoutMs:3000,exit:code=>{exitCode=code;}});await new Promise(resolve=>setTimeout(resolve,20));assert.equal(captured,undefined);
  releaseWorker();await new Promise(resolve=>setTimeout(resolve,20));assert.equal(captured,undefined);
  releaseRoute();await stopped;assert.deepEqual(captured,['last-route','last-worker']);assert.equal(exitCode,0);assert.equal(f.db.open,false);
});
