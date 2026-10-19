import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync,spawnSync} from 'node:child_process';
import {qualifySource} from '../qualify-source.mjs';
const owned='server/quote-engine-vnext/priceBook.js',other='server/src/synthetic-other-owner.js';
function repository(t){
 const cwd=mkdtempSync(join(tmpdir(),'roof-source-qualification-'));t.after(()=>rmSync(cwd,{recursive:true,force:true}));
 const git=(...args)=>execFileSync('git',['-c','user.name=Synthetic qualification','-c','user.email=synthetic@example.invalid',...args],{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 git('init','--initial-branch=synthetic-base');
 const write=(path,value)=>{mkdirSync(dirname(join(cwd,path)),{recursive:true});writeFileSync(join(cwd,path),value);};
 const commit=()=>{git('add','.');git('commit','-m','Synthetic qualification fixture');return git('rev-parse','HEAD');};
 write(owned,'synthetic base\n');const base=commit();write(owned,'synthetic scoped delta\n');const scoped=commit();
 return {cwd,git,write,commit,base,scoped};
}
test('source qualification accepts the explicit scoped commit range',t=>{
 const f=repository(t);assert.deepEqual(qualifySource(f.base,f.scoped,f.cwd),{baseCommit:f.base,headCommit:f.scoped,changed:[owned],qualified:true});
});
test('source qualification ignores unrelated committed and dirty checkout content outside the named range',t=>{
 const f=repository(t);f.write(other,'synthetic separately approved work\n');f.commit();f.write(other,'synthetic later checkout edit\n');
 assert.equal(qualifySource(f.base,f.scoped,f.cwd).qualified,true);
});
test('source qualification rejects an unowned change within the named range',t=>{
 const f=repository(t);f.write(other,'synthetic separately approved work\n');const combined=f.commit();
 assert.throws(()=>qualifySource(f.base,combined,f.cwd),error=>error.message.includes('Unowned changes in ')&&error.message.includes(other));
});
test('source qualification requires forward ancestry',t=>{
 const f=repository(t);assert.throws(()=>qualifySource(f.scoped,f.base,f.cwd),/ancestor/);
});
test('source qualification CLI refuses omitted commit refs',()=>{
 const result=spawnSync(process.execPath,[new URL('../qualify-source.mjs',import.meta.url).pathname],{encoding:'utf8'});
 assert.equal(result.status,1);assert.match(result.stderr,/BASE_COMMIT HEAD_COMMIT/);
});
