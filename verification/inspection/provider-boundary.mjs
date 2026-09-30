// Inspection-only preload. All Google operations remain intercepted by the saved fixture.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import '../quotedone/calendar-provider-fixture.mjs';
assert.equal(process.env.NODE_ENV, 'test');
const syntheticFetch = globalThis.fetch;
globalThis.fetch = async function inspectionFetch(url, options) {
  const fixture = process.env.QUOTEDONE_CALENDAR_FIXTURE;
  const state = JSON.parse(fs.readFileSync(fixture, 'utf8'));
  const pathname = new URL(url).pathname;
  if ((state.inspectionPauseBeforeWrite && pathname === '/calendar/v3/freeBusy') ||
      (state.inspectionPauseAfterWriteClaim && options?.method === 'POST' && pathname.endsWith('/events'))) {
    state.inspectionReachedPause = true;
    fs.writeFileSync(fixture, JSON.stringify(state, null, 2));
    // The parent kills the isolated server here, before any provider write.
    await new Promise(() => {});
  }
  return syntheticFetch(url, options);
};
