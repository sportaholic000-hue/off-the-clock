import 'dotenv/config';
import {prepareDeploymentEnvironment} from '../src/deploymentConfig.js';
import {readOffsiteConfig,createS3BackupStore} from '../src/offsiteStore.js';
import {restoreOffsiteBackup} from '../src/offsiteBackups.js';
let store;
try {
  const args=process.argv.slice(2);
  if(args.length!==4 || args[0]!=='--day' || args[2]!=='--target')throw Error('OFFSITE_ARGUMENTS_INVALID');
  const deployment=prepareDeploymentEnvironment(),config=readOffsiteConfig();
  if(!deployment.production || !config.enabled)throw Error('OFFSITE_RESTORE_CONFIG_INVALID');
  store=createS3BackupStore(config);
  console.log(JSON.stringify(await restoreOffsiteBackup({store,config,day:args[1],target:args[3],volume:deployment.volume})));
} catch(error) {
  const code=/^OFFSITE_[A-Z0-9_]+$/.test(error.message)?error.message:'OFFSITE_RESTORE_FAILED';
  console.error(code+': use --day YYYY-MM-DD --target <new-volume-restores-directory>. Check configuration/key/checksum; existing data is never overwritten.');process.exitCode=1;
} finally {store?.close();}
