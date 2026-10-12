// Test-only production entry point. Never used by npm start or deployment.
import {mock} from 'node:test';
import fs from 'node:fs';
import {once} from 'node:events';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';

const instanceId=randomUUID(),startedAt=new Date().toISOString();

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
// Capture only synthetic email transport; registration, token consumption and login stay real.
const sendSyntheticEmail=async message=>{
  if(!message.to.endsWith('@example.invalid'))throw Error('SYNTHETIC_EMAIL_ONLY');
  const filename=events+'.emails.json';const prior=fs.existsSync(filename)?JSON.parse(fs.readFileSync(filename,'utf8')):[];
  fs.writeFileSync(filename,JSON.stringify([...prior,message]));return {accepted:true,id:'synthetic-email-'+prior.length};
};
mock.module('../../server/src/email.js',{namedExports:{sendTransactionalEmail:sendSyntheticEmail,createTransactionalEmailSender:()=>sendSyntheticEmail}});
// The server must not make any real external HTTP request during this drill.
globalThis.fetch = async () => { throw Error('SYNTHETIC_REHEARSAL_EXTERNAL_HTTP_FORBIDDEN'); };
const {httpServer} = await import('../../server/src/server.js');
const {ENGINE_VERSION} = await import('../../server/src/quoteDoneBridge.js');
const {db,ownerQuery} = await import('../../server/src/db.js');
const {pricebookDirectory} = await import('../../server/priceBookService.js');
if (!httpServer.listening) await once(httpServer,'listening');
const identity={pid:process.pid,instanceId,startedAt,readyAt:new Date().toISOString(),
  port:httpServer.address().port,databasePath:db.pragma('database_list').find(row=>row.name==='main').file,
  pricebookPath:pricebookDirectory()};
// IPC only: observe the actual application connection/paths without calling a
// loader that could backfill the creation ledger or otherwise change the fixture.
process.on('message', message => {
  if(message === 'stop') {process.emit('SIGTERM');return;}
  if(message?.type!=='restore-observe'||!Number.isSafeInteger(message.id)||
    typeof message.ownerId!=='string'||!/^[a-zA-Z0-9-]{1,128}$/.test(message.ownerId))return;
  const observation={...identity,observedAt:new Date().toISOString(),uptimeMs:Math.round(process.uptime()*1000),
    listening:httpServer.listening,book:{path:path.join(pricebookDirectory(),message.ownerId+'.json')}};
  try {
    const bytes=fs.readFileSync(observation.book.path),stat=fs.statSync(observation.book.path);
    Object.assign(observation.book,{exists:true,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,mtimeMs:stat.mtimeMs});
  } catch(error) {
    Object.assign(observation.book,{exists:error.code==='ENOENT'?false:null,errorCode:error.code||'READ_FAILED'});
  }
  try {
    observation.creationRecorded=Boolean(ownerQuery('SELECT 1 FROM priceBookCreationRecords WHERE ownerId=?').get(message.ownerId));
    observation.submissions=ownerQuery('SELECT count(*) n FROM quoteSubmissions WHERE ownerId=?').get(message.ownerId).n;
  } catch(error) {observation.databaseErrorCode=error.code||'READ_FAILED';}
  process.send({type:'restore-observation',id:message.id,observation});
});
process.send({ready:true,engineVersion:ENGINE_VERSION,identity});
