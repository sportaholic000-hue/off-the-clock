// Explicit branch-delta qualification, never an automatic behavioral test gate.
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export function qualifySource(base,head,cwd=process.cwd()) {
 if(!base||!head)throw Error('Usage: node qualify-source.mjs BASE_COMMIT HEAD_COMMIT');
 const git=(...args)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']});
 const baseCommit=git('rev-parse','--verify','--end-of-options',base+'^{commit}').trim();
 const headCommit=git('rev-parse','--verify','--end-of-options',head+'^{commit}').trim();
 try{git('merge-base','--is-ancestor',baseCommit,headCommit);}catch{throw Error('Source qualification requires BASE_COMMIT to be an ancestor of HEAD_COMMIT');}
 // Inspect only the two named commits. Neither HEAD nor checkout changes are
 // implicitly part of this ownership assertion. --no-renames checks both paths.
 const changed=git('diff','--name-only','--no-renames','-z',baseCommit,headCommit,'--').split('\0').filter(Boolean);
 const unowned=changed.filter(p=>p!=='server/quote-engine-vnext/priceBook.js'&&!p.startsWith('verification/qe-agent1-roof-pitch-activation-20261019/')&&!/^test\/(?:voice)?qeAgent1RoofPitchActivation.*\.spec\.mjs$/.test(p));
 if(unowned.length)throw Error('Unowned changes in '+baseCommit+'..'+headCommit+':\n'+unowned.join('\n'));
 return {baseCommit,headCommit,changed,qualified:true};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  if(process.argv.length!==4)throw Error('Usage: node qualify-source.mjs BASE_COMMIT HEAD_COMMIT');
  console.log(JSON.stringify(qualifySource(process.argv[2],process.argv[3]),null,2));
 }catch(error){console.error(error.message);process.exitCode=1;}
}
