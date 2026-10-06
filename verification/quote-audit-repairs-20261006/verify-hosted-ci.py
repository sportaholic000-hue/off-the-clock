"""Verify the preserved hosted log, counts, source hashes and browser results.

Run from any directory with Python 3; no network, dependencies or writes.
"""
import gzip
import hashlib
import json
from pathlib import Path
import re

here = Path(__file__).resolve().parent
repo = here.parents[1]
evidence = json.loads((here / 'hosted-ci.json').read_text())
compressed = (here / 'hosted-job.log.gz').read_bytes()
raw = gzip.decompress(compressed)
assert hashlib.sha256(compressed).hexdigest() == evidence['compressedLogSha256']
assert hashlib.sha256(raw).hexdigest() == evidence['logSha256']
assert evidence['run']['head_sha'] == evidence['testedSha']
assert evidence['run']['status'] == 'completed'
assert evidence['run']['conclusion'] == evidence['job']['conclusion'] == 'success'
assert all(step['conclusion'] == 'success' for step in evidence['job']['steps'])
for path, expected in evidence['sourceAndTestsSha256'].items():
    assert hashlib.sha256((repo / path).read_bytes()).hexdigest() == expected, path
log = re.sub(r'^\d{4}-\d\d-\d\dT\S+ ', '', raw.decode(), flags=re.M)
quote_start = log.index('##[group]Run npm run test:quote')
full_start = log.index('##[group]Run npm test', quote_start)
full_end = log.index('##[group]Run node .github/scripts/check-test-results', full_start)
segments = {'quote': log[quote_start:full_start], 'full': log[full_start:full_end]}
for suite, segment in segments.items():
    counts = {}
    for key in ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo']:
        matches = re.findall(r'^# ' + key + r' (\d+)\s*$', segment, re.M)
        assert len(matches) == 1, (suite, key, matches)
        counts[key] = int(matches[0])
    assert counts == evidence['counts'][suite]
    assert counts['tests'] == counts['pass'] > 0
    assert all(counts[key] == 0 for key in ['fail', 'cancelled', 'skipped', 'todo'])
    passed = set(re.findall(r'^ok \d+ - (.*)$', segment, re.M))
    before = json.loads((here / ('test-' + suite + '-final-failures.json')).read_text())
    names = [re.sub(r'^\d+ - ', '', case['test']) for case in before]
    assert len(names) == len(set(names)) == 37
    assert all(name in passed for name in names)
    assert evidence['previouslyEnvironmentBlockedBrowserTests'][suite] == [
        {'test': name, 'result': 'pass'} for name in names
    ]
assert 'found 0 vulnerabilities' in log[full_end:]
assert not re.search(r'^not ok ', log, re.M)
print(json.dumps({'verifiedSha': evidence['testedSha'], 'counts': evidence['counts'],
                  'previouslyBlockedBrowserTestsPassingPerSuite': 37}, indent=2))
