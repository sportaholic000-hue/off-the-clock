import hashlib
import json
from pathlib import Path
import subprocess

out = Path(__file__).resolve().parent
root = out.parent.parent
baseline = json.loads((out / 'baseline.json').read_text())
changed = [p for p, h in baseline['trackedFiles'].items()
           if not (root / p).is_file() or hashlib.sha256((root / p).read_bytes()).hexdigest() != h]
assert not changed, changed
def git(*args):
    return subprocess.check_output(['git', *args], cwd=root).decode().strip()
assert git('rev-parse', 'HEAD') == baseline['commit']
assert git('show-ref').splitlines() == baseline['refs']
assert subprocess.run(['git', 'symbolic-ref', '-q', 'HEAD'], cwd=root, stdout=subprocess.DEVNULL).returncode != 0
untracked = git('ls-files', '--others', '--exclude-standard', '-z').strip('\0').split('\0')
assert all(p.startswith('verification/qe-agent4-f18-review-20261018/') for p in untracked if p)
for filename in ['execution.json', 'minimal-execution.json']:
    for name, h in json.loads((out / filename).read_text())['preExecutionSha256'].items():
        assert hashlib.sha256((out / name).read_bytes()).hexdigest() == h, name
lines = (out / 'review.tap').read_text().splitlines()
summary = {key: int(next(line for line in lines if line.startswith('# ' + key + ' ')).split()[-1])
           for key in ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo']}
summary['failedChecks'] = [line for line in lines if line.startswith('not ok ')]
data = json.loads((out / 'observations.json').read_text())
def keys(value):
    if isinstance(value, dict):
        for key, child in value.items():
            yield key
            yield from keys(child)
    elif isinstance(value, list):
        for child in value:
            yield from keys(child)
leaks = []
for case in data['cases']:
    for name, result in case['outcomes'].items():
        if result['kind'] == 'returned' and {'rangeBufferUsed', 'serviceId', 'serviceType', 'bookRevision'}.intersection(keys(result['value'])):
            leaks.append([case['id'], name, 'presentation metadata'])
    for name, result in case['voicePrivacyOutcomes'].items():
        if result['kind'] == 'returned' and ('PRIVATE_' in json.dumps(result['value']) or {'lineItems', 'materialCost', 'markupPercent', 'margin', 'internalResult'}.intersection(keys(result['value']))):
            leaks.append([case['id'], name, 'financial sentinel'])
assert not leaks, leaks
summary.update(caseCount=len(data['cases']),
               stabilityCasesPassed=sum(line.startswith('ok ') and 'stable projections' in line for line in lines),
               privateFieldLeaks=leaks,
               storedReceiptSha256=data['storedReceiptFileSha256'],
               storedReceiptBytesUnchanged=hashlib.sha256((out / 'receipts.sqlite').read_bytes()).hexdigest() == data['storedReceiptFileSha256'])
retention = {key: baseline[key] for key in ['commit', 'parent', 'tree']}
retention.update(trackedFilesChecked=len(baseline['trackedFiles']), changedTrackedFiles=changed,
                 localRefsUnchanged=True, detachedHead=True,
                 allNewUntrackedFilesConfinedToReviewDirectory=True, nodeVersion=data['node'],
                 sourceHashes={p: baseline['trackedFiles'][p] for p in [
                     'server/src/quoteScopeDisclosure.js', 'server/src/voice/voiceQuotePresentation.js',
                     'test/qeAgent3ScopePresentation20261018.spec.mjs', 'test/callerHistoryFollowup20261006.spec.mjs']})
(out / 'summary.json').write_text(json.dumps(summary, indent=2) + '\n')
(out / 'retention.json').write_text(json.dumps(retention, indent=2) + '\n')
print(json.dumps({'summary': summary, 'retention': retention}))
