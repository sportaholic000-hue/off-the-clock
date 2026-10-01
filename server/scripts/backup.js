import 'dotenv/config';
import Database from 'better-sqlite3';
import {prepareDeploymentEnvironment} from '../src/deploymentConfig.js';
import {createSnapshot} from '../src/backups.js';

let db;
try {
  const config=prepareDeploymentEnvironment();
  if(!config.production) throw new Error('Production backup requires NODE_ENV=production.');
  db=new Database(config.databasePath,{readonly:true,fileMustExist:true});
  console.log(await createSnapshot(db,config));
} catch {console.error('BACKUP_FAILED: check storage, configuration and database integrity.');process.exitCode=1;}
finally {db?.close();}
