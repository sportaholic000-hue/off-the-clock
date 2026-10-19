"""Run the unchanged incoming 161-case HTTP/widget/voice audit on this tree."""
import json
import os
import pathlib
import subprocess
import time

folder = pathlib.Path(__file__).resolve().parent
repo = folder.parent.parent
runtime = repo.parent / 'qe-integration-runtime/node_modules/.bin'
node = str(runtime / 'node')
output = folder / 'original-161'
log = folder / 'original-161.log'
if output.exists() or log.exists():
    raise SystemExit('Refusing to overwrite prior evidence')
temp = repo.parent / 'qe-roof-integration-tmp/original-161'
temp.mkdir(parents=True, exist_ok=True)
env = os.environ.copy()
env['PATH'] = str(runtime) + os.pathsep + env['PATH']
env['TMPDIR'] = str(temp)
for key in ['REPAIR_CASES', 'CASE_FILTER', 'CAPTURE', 'CAPTURE_CONTEXT_OFFSET']:
    env.pop(key, None)
command = [node, '--experimental-test-module-mocks',
           'verification/qe-agent1-roof-pitch-activation-20261019/audit.mjs', str(output)]
started = time.time()
with log.open('wb') as stream:
    run = subprocess.run(command, cwd=repo, env=env, stdout=stream, stderr=subprocess.STDOUT)
summary = json.loads((output / 'summary.json').read_text())
rows = json.loads((output / 'results.json').read_text())
accepted = json.loads((repo / 'verification/qe-agent1-roof-pitch-activation-20261019/audit-161-after-01/results.json').read_text())
low_ids = ['ROOFING_REPLACEMENT--absent-unknown-pitch-policy-known-request',
           'ROOFING_REPLACEMENT--absent-over12-adjustment-known-request']
review_ids = ['ROOFING_REPLACEMENT--absent-unknown-pitch-policy-unknown-request',
              'ROOFING_REPLACEMENT--absent-over12-adjustment-over12-request']
controls = [row for row in rows if row['id'] in low_ids + review_ids]
problems = []
if run.returncode != 0 or summary['executed'] != 161 or summary['matched'] != 161 or summary['mismatched'] != 0:
    problems.append({'execution': summary, 'exit_code': run.returncode})
if rows != accepted:
    prior = {row['id']: row for row in accepted}
    problems.append({'changed_accepted_results': [row['id'] for row in rows if row != prior.get(row['id'])]})
if len(controls) != 4:
    problems.append({'control_inventory': len(controls)})
for row in controls:
    expected = [391000] if row['id'] in low_ids else []
    if row['faults'] or any(value != expected for value in row['amounts'].values()):
        problems.append({'monetary_control': row})
receipt = {'command': command, 'node': subprocess.check_output([node, '--version'], text=True).strip(),
           'exit_code': run.returncode, 'seconds': round(time.time() - started, 3),
           'summary': summary, 'identical_to_accepted_161_results': rows == accepted,
           'controls': controls, 'problems': problems, 'passed': not problems}
(folder / 'original-161-execution.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt))
raise SystemExit(0 if receipt['passed'] else 1)
