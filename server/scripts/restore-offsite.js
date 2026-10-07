import 'dotenv/config';
import {prepareDeploymentEnvironment} from '../src/deploymentConfig.js';
import {readOffsiteConfig,createS3BackupStore} from '../src/offsiteStore.js';
import {restoreOffsiteBackup,restoreContinuousBackup} from '../src/offsiteBackups.js';
let store;
try {
  const args=process.argv.slice(2);
  if(args.length!==4 || !['--day','--checkpoint'].includes(args[0]) || args[2]!=='--target')throw Error('OFFSITE_ARGUMENTS_INVALID');
  const deployment=prepareDeploymentEnvironment(),config=readOffsiteConfig();
  if(!deployment.production || !config.enabled)throw Error('OFFSITE_RESTORE_CONFIG_INVALID');
  store=createS3BackupStore(config);
  const common={store,config,target:args[3],volume:deployment.volume};
  console.log(JSON.stringify(await (args[0]==='--checkpoint'?restoreContinuousBackup({...common,checkpoint:args[1]}):restoreOffsiteBackup({...common,day:args[1]}))));
} catch(error) {
  const code=/^OFFSITE_[A-Z0-9_]+$/.test(error.message)?error.message:'OFFSITE_RESTORE_FAILED';
  console.error(code+': use --day YYYY-MM-DD or --checkpoint <checkpoint-id>, then --target <new-volume-restores-directory>. Check configuration/key/checksum; existing data is never overwritten.');process.exitCode=1;
} finally {store?.close();}
