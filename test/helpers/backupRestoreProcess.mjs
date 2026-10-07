// Test-only production entry point. Never used by npm start or deployment.
import {mock} from 'node:test';
import fs from 'node:fs';
import {once} from 'node:events';

const events = process.env.SYNTHETIC_CALENDAR_EVENTS;
if (!events || !process.env.APP_DATA_DIR) throw Error('Synthetic fixture paths required.');
const read = () => JSON.parse(fs.readFileSync(events, 'utf8'));
mock.module('../../server/src/googleCalendarAdapter.js', {namedExports: {
  createGoogleCalendarAdapter: () => ({
    idempotentCreateByEventId: true,
    async listBusy() { return read().map(({startAtUtc,endAtUtc}) => ({startAtUtc,endAtUtc})); },
    async createEvent(request) {
      const rows = read();
      const prior = rows.find(row => row.eventId === request.eventId);
      if (prior) return prior;
      const result = {status:'CONFIRMED',eventId:request.eventId,startAtUtc:request.startAtUtc,endAtUtc:request.endAtUtc};
      fs.writeFileSync(events, JSON.stringify([...rows,result]));
      return result;
    },
    async getEvent({eventId}) { return read().find(row => row.eventId === eventId) || null; }
  })
}});
// The server must not make any real external HTTP request during this drill.
globalThis.fetch = async () => { throw Error('SYNTHETIC_REHEARSAL_EXTERNAL_HTTP_FORBIDDEN'); };
const {httpServer} = await import('../../server/src/server.js');
const {ENGINE_VERSION} = await import('../../server/src/quoteDoneBridge.js');
if (!httpServer.listening) await once(httpServer,'listening');
process.on('message', message => {if(message === 'stop') process.emit('SIGTERM');});
process.send({ready:true,engineVersion:ENGINE_VERSION});
