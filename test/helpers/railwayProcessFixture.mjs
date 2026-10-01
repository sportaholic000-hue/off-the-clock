import {once} from 'node:events';
import {httpServer,lifecycle} from '../../server/src/server.js';
import {db} from '../../server/src/db.js';
import {deploymentConfig} from '../../server/src/deploymentEnvironment.js';
import {savePricebook,loadPricebook} from '../../server/priceBookService.js';
import {createSnapshot,listSnapshots} from '../../server/src/backups.js';

if(!httpServer.listening)await once(httpServer,'listening');
process.on('message',async message=>{
  if(message.command==='signal'){process.emit('SIGTERM');return;}
  try {
    let result;
    if(message.command==='seed') {
      db.exec('CREATE TABLE IF NOT EXISTS deploymentProof(ownerId TEXT,kind TEXT,value TEXT,PRIMARY KEY(ownerId,kind))');
      for(const owner of ['a','b']) {
        for(const kind of ['lead','quote','booking'])db.prepare('INSERT OR REPLACE INTO deploymentProof VALUES(?,?,?)').run(owner,kind,owner+'-'+kind+'-retained');
        savePricebook(owner,{services:[],defaults:{},marker:owner+'-approved-price-book'});
      }
      result={written:true};
    } else if(message.command==='read') {
      result={rows:db.prepare('SELECT * FROM deploymentProof ORDER BY ownerId,kind').all(),books:{a:loadPricebook('a'),b:loadPricebook('b')},databasePath:db.name,snapshots:listSnapshots(deploymentConfig.backupPath).length};
    } else if(message.command==='backup')result={bundle:await createSnapshot(db,deploymentConfig)};
    else throw new Error('Unknown fixture command');
    process.send({id:message.id,result});
  } catch(error){process.send({id:message.id,error:error.message});}
});
process.send({ready:true,port:httpServer.address().port});
