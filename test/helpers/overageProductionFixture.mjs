// Synthetic-only child used by the production dashboard integration test.
import {once} from 'node:events';
import {httpServer} from '../../server/src/server.js';
import {db} from '../../server/src/db.js';
import {createAuthSessionService} from '../../server/src/authSessionService.js';
if(!httpServer.listening)await once(httpServer,'listening');
const sessions=createAuthSessionService(db),tokens={};
for(const id of ['SYNTHETIC-owner-a','SYNTHETIC-owner-b','SYNTHETIC-staff'])tokens[id]=sessions.create(db.prepare('SELECT * FROM users WHERE id=?').get(id)).token;
process.send({port:httpServer.address().port,tokens});
