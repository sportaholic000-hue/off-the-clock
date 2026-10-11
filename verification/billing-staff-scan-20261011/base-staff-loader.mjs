// Reproduce the unknown-token hash defect against the exact requested base,
// without editing application source or using providers. Node 22.23+.
// Expected: the focused unknown-token regression fails with 1 hash instead of 0.
import {registerHooks} from 'node:module';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=new URL('../../',import.meta.url);
const target=new URL('server/src/staffService.js',root).href;
const source=execFileSync('git',['show','8973f429df487c58f3ad7a49bfdb35ebbb9a274a:server/src/staffService.js'],{cwd:fileURLToPath(root),encoding:'utf8'});
registerHooks({load(url,context,nextLoad){
  return url===target?{format:'module',source,shortCircuit:true}:nextLoad(url,context);
}});
