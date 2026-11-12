// Privacy policy: "These records are deleted after 2 days." The demo rate-limit
// rows (demoSessions) are deleted by a scheduled background pass, without any
// demo request, and the pass stops cleanly on shutdown like the other workers.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import express from 'express';
import Database from 'better-sqlite3';
import {installLiveDemoRoutes, DEMO_SESSION_RETENTION_MS} from '../server/src/demo/liveDemo.js';

const DAY = 86400000;
const env = {DEMO_ENABLED:'true', GEMINI_API_KEY:'SYNTHETIC_KEY', DEMO_ALLOWED_ORIGINS:'https://www.offtheclockai.com', DEMO_IP_SALT:'SYNTHETIC_SALT'};

// The app is never listened on, so no demo request can be made.
function harness(start = Date.parse('2026-11-12T12:00:00Z')) {
  const db = new Database(':memory:'); let clock = start;
  const demo = installLiveDemoRoutes(express(), {db, env, now: () => clock, fetchImpl: async () => { throw new Error('no provider call expected'); }});
  const add = (id, ageMs) => db.prepare('INSERT INTO demoSessions (id, ipKey, agent, createdAt) VALUES (?, ?, ?, ?)').run(id, 'ip-' + id, 'miles', clock - ageMs);
  const ids = () => db.prepare('SELECT id FROM demoSessions ORDER BY id').all().map(row => row.id);
  return {db, demo, add, ids, advance: ms => { clock += ms; }};
}

test('retention is 2 days, matching the privacy policy sentence', () => {
  assert.equal(DEMO_SESSION_RETENTION_MS, 2 * DAY);
  const privacy = readFileSync(new URL('../site/www/privacy/index.html', import.meta.url), 'utf8');
  assert.equal(privacy.split('These records are deleted after 2 days.').length, 2);
});

test('the scheduled pass deletes a row older than 2 days with no demo request; a newer row stays', () => {
  const h = harness(); let tick = null, cleared = null;
  h.add('old', 2 * DAY + 1); h.add('new', 2 * DAY - 60000);
  const stop = h.demo.startCleanup({intervalMs: 900000, setTimer: (fn, ms) => { tick = fn; assert.equal(ms, 900000); return 'timer'; }, clearTimer: t => { cleared = t; }});
  assert.deepEqual(h.ids(), ['new'], 'first pass runs at start');
  // Later rows age past 2 days and are removed by the timer alone.
  h.add('later', 60000);
  h.advance(2 * DAY);
  tick();
  assert.deepEqual(h.ids(), [], 'both rows are now older than 2 days');
  h.add('fresh', 0);
  tick();
  assert.deepEqual(h.ids(), ['fresh']);
  stop();
  assert.equal(cleared, 'timer', 'shutdown clears the timer');
  h.advance(3 * DAY); tick();
  assert.deepEqual(h.ids(), ['fresh'], 'a stopped pass deletes nothing');
});

test('the real timer deletes an aged row without any demo request, and stop() ends it', async () => {
  const h = harness();
  const stop = h.demo.startCleanup({intervalMs: 20});
  try {
    h.add('aged', 2 * DAY + 5000); h.add('recent', DAY);
    const deadline = Date.now() + 2000;
    while (h.ids().includes('aged') && Date.now() < deadline) await new Promise(done => setTimeout(done, 10));
    assert.deepEqual(h.ids(), ['recent']);
  } finally { stop(); }
  h.add('after-stop', 3 * DAY);
  await new Promise(done => setTimeout(done, 80));
  assert.ok(h.ids().includes('after-stop'), 'no pass runs after stop');
});

test('a failing pass reports a fixed code and keeps running', () => {
  const h = harness(); const codes = []; let tick;
  const stop = h.demo.startCleanup({onError: code => codes.push(code), setTimer: fn => { tick = fn; return 1; }, clearTimer: () => {}});
  h.db.close();
  tick();
  assert.deepEqual(codes, ['DEMO_SESSION_CLEANUP_FAILED']);
  stop();
});

test('server.js starts the pass and stops it with the other background workers on shutdown', () => {
  const source = readFileSync(new URL('../server/src/server.js', import.meta.url), 'utf8');
  assert.match(source, /const liveDemo = installLiveDemoRoutes\(app, \{ db \}\);/);
  assert.match(source, /const stopDemoSessionCleanup=liveDemo\.startCleanup\(\{onError:/);
  const attach = source.match(/lifecycle\.attach\(httpServer,\{stopWorkers:\[([^\]]*)\]/);
  assert.ok(attach && attach[1].split(',').includes('stopDemoSessionCleanup'), 'listed in lifecycle stopWorkers');
  assert.match(source, /httpServer\.on\('close',\(\)=>\{[^\n]*stopDemoSessionCleanup\(\);/);
});
