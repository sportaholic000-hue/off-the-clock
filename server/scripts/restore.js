import 'dotenv/config';
import {prepareDeploymentEnvironment} from '../src/deploymentConfig.js';
import {restoreBackup} from '../src/backups.js';

try {
  const args=process.argv.slice(2);
  if(args.length!==4 || args[0]!=='--backup' || args[2]!=='--target') throw new Error('Arguments invalid');
  const config=prepareDeploymentEnvironment();
  if(!config.production) throw new Error('Production restore requires NODE_ENV=production.');
  const result=restoreBackup(args[1],args[3],{volume:config.volume});
  console.log(JSON.stringify(result));
} catch {console.error('RESTORE_FAILED: use --backup <bundle> --target <new-volume-directory>; existing data is never overwritten.');process.exitCode=1;}
