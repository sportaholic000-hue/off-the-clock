import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
export function renderSummary({run,sha,checker,tap,checkerOutcome='unknown',suiteOutcome='unknown',priorGates='not reported'}){
  const lines=[`run ${run} sha ${sha}`,`Earlier gate outcomes: ${priorGates}`,`Full-suite outcome: ${suiteOutcome}; checker outcome: ${checkerOutcome}`];
  if(checker===null)lines.push(`Checker output unavailable: test-check.txt was not created (checker ${checkerOutcome}; an earlier failed/skipped stage may have prevented it). No checker pass is inferred.`);
  else lines.push('Checker output:',checker.trimEnd()||'[empty checker output; no pass inferred]');
  if(tap===null)lines.push(`TAP unavailable: test-results.tap was not created (full suite ${suiteOutcome}; an earlier stage may have failed). Tests are NOT RUN/unverified, not passed.`);
  else{
    const rows=tap.split('\n'),failures=rows.filter(row=>/^\s*not ok \d+\b/.test(row));
    lines.push('Available TAP failures (including nested subtests):',...(failures.length?failures:['[none recorded; absence alone is not a pass]']));
    const counts=rows.filter(row=>/^# (tests|pass|fail|skipped|cancelled|todo|duration_ms) /.test(row));
    lines.push('Available TAP summary:',...(counts.length?counts:['[summary missing; run incomplete/unverified]']));
  }
  lines.push('This summary does not override the original gate outcomes.');
  return lines.join('\n')+'\n';
}
export function readOptional(file){try{return fs.readFileSync(file,'utf8');}catch(error){if(error.code==='ENOENT')return null;throw error;}}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const root=process.env.GITHUB_WORKSPACE||process.cwd();
  process.stdout.write(renderSummary({run:process.env.GITHUB_RUN_ID,sha:process.env.GITHUB_SHA,checker:readOptional(path.join(root,'test-check.txt')),tap:readOptional(path.join(root,'test-results.tap')),checkerOutcome:process.env.CHECKER_OUTCOME,suiteOutcome:process.env.SUITE_OUTCOME,priorGates:process.env.PRIOR_GATES}));
}
