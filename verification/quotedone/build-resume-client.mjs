import {spawnSync} from 'node:child_process';
import path from 'node:path';
for(const args of [['build'],['build','--config','vite.widget.config.js']]){
 const r=spawnSync(process.execPath,[path.resolve('node_modules/vite/bin/vite.js'),...args],{cwd:path.resolve('client'),env:{...process.env,NODE_ENV:'production',VITE_API_URL:''},encoding:'utf8',windowsHide:true,timeout:180000});
 process.stdout.write(r.stdout??'');process.stderr.write(r.stderr??'');if(r.error)console.error(r.error.message);if(r.status!==0){process.exitCode=1;break;}
}

