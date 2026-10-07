// Temporary synthetic production composition; all external writes are disabled
// except the explicitly supplied loopback fake object store.
import {once} from 'node:events';
import {httpServer} from '../../server/src/server.js';
import {db} from '../../server/src/db.js';
import {createAuthSessionService} from '../../server/src/authSessionService.js';
if(!httpServer.listening)await once(httpServer,'listening');
const sessions=createAuthSessionService(db),tokens={};
tokens.admin=sessions.create({id:'admin',role:'admin',email:process.env.ADMIN_EMAIL,passwordHash:process.env.ADMIN_PASSWORD_HASH}).token;
for(const [id,role] of [['SYNTHETIC-backup-owner','owner']]){
  db.prepare("INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt) VALUES(?,?,'[PLACEHOLDER]','[PLACEHOLDER]','[PLACEHOLDER]','Operator','pending_payment','UTC',?,?)").run(id,id+'@example.invalid',role,new Date().toISOString());
  tokens[role]=sessions.create(db.prepare('SELECT * FROM users WHERE id=?').get(id)).token;
}
process.on('message',message=>{
  if(message.type==='commit'){
    db.prepare('INSERT INTO leads(id,ownerId,customerName,createdAt) VALUES(?,?,?,?)').run('SYNTHETIC-after-nightly','SYNTHETIC-backup-owner','[PLACEHOLDER] after nightly',new Date().toISOString());
    process.send({type:'committed'});
  }
});
process.send({type:'ready',port:httpServer.address().port,tokens});
