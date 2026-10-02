import {parentPort,workerData} from 'node:worker_threads';
import Database from 'better-sqlite3';
import {createCallUsageService} from '../../server/src/callUsageService.js';
const database=new Database(workerData.filename);database.pragma('foreign_keys=ON');database.pragma('busy_timeout=10000');
const ownerQuery=sql=>{if(!/\bownerId\b/.test(sql))throw Error('Tenant query lacks ownerId');return database.prepare(sql);};
const service=createCallUsageService({database,ownerQuery,clock:()=>workerData.now});
try {parentPort.postMessage(service.recordCompletedCall(workerData.report));}
catch(error){parentPort.postMessage({error:error.code||error.message});}
finally {database.close();}

