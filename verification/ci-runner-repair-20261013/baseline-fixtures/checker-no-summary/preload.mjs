import cp from 'node:child_process';
import fs from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
const spawn=cp.spawn;
cp.spawn=(command,args,options)=>{
  fs.writeFileSync('selected-command.json',JSON.stringify({command,args}));
  return spawn(process.execPath,['synthetic-child.mjs'],options);
};
syncBuiltinESMExports();
