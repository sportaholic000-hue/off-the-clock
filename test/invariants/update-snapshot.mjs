// Rewrites the frozen outcomes and the known-findings list after a deliberate
// change. Usage:
//   node --import ./test/pricebookTestEnv.mjs test/invariants/update-snapshot.mjs --reason "audit f1501ff #4: catalog rows now tested"
// Every run appends the reason and the changed keys to CHANGES.md, so a
// reviewer sees exactly which outcomes moved and why. Never run it to make a
// failing gate pass without reading every changed outcome first.
import {writeFileSync,readFileSync,existsSync,appendFileSync} from 'node:fs';
import {runAll,findingKey} from './harness.mjs';
const at=process.argv.indexOf('--reason'),reason=at>0?process.argv[at+1]:'';
if(!reason||reason.length<10){console.error('Give a --reason of at least 10 characters naming the audit item or owner ruling.');process.exit(1);}
const dir=new URL('.',import.meta.url),outFile=new URL('frozenOutcomes.json',dir),findFile=new URL('knownFindings.json',dir);
const before=existsSync(outFile)?JSON.parse(readFileSync(outFile,'utf8')):{};
const beforeFindings=existsSync(findFile)?JSON.parse(readFileSync(findFile,'utf8')):[];
const {outcomes,findings}=runAll();
const changed=Object.keys({...before,...outcomes}).filter(k=>JSON.stringify(before[k])!==JSON.stringify(outcomes[k])).sort();
const keys=findings.map(findingKey).sort(),prior=new Set(beforeFindings.map(findingKey));
const added=keys.filter(k=>!prior.has(k)),removed=[...prior].filter(k=>!keys.includes(k));
writeFileSync(outFile,JSON.stringify(Object.fromEntries(Object.keys(outcomes).sort().map(k=>[k,outcomes[k]])),null,0).replace(/\},"/g,'},\n"')+'\n');
writeFileSync(findFile,JSON.stringify(findings.sort((a,b)=>findingKey(a)<findingKey(b)?-1:1),null,1)+'\n');
const lines=[`\n## ${new Date().toISOString().slice(0,10)} — ${reason}`,`Outcomes changed: ${changed.length}. Findings added: ${added.length}. Findings removed: ${removed.length}.`,
  ...changed.slice(0,200).map(k=>`- outcome \`${k}\`: ${JSON.stringify(before[k]??null)} → ${JSON.stringify(outcomes[k]??null)}`),
  ...added.map(k=>`- finding added \`${k}\``),...removed.map(k=>`- finding removed \`${k}\``)];
appendFileSync(new URL('CHANGES.md',dir),lines.join('\n')+'\n');
console.log(lines.slice(0,2).join('\n'));
