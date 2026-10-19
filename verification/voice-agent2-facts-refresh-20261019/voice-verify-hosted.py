"""Qualify exact-head hosted logs and preserve every base passing test name.

Usage: python voice-verify-hosted.py BASE_TEST_LOG FINAL_TEST_LOG DOCKER_LOG METADATA_JSON
Logs may be plain UTF-8 or gzip. Metadata is the fetched GitHub run/jobs data,
plus expected_final_sha and the immediately rechecked remote_sha.
"""
from collections import Counter
import gzip
import hashlib
import json
from pathlib import Path
import re
import sys

root = Path(__file__).resolve().parent
base_path, final_path, docker_path, metadata_path = map(Path, sys.argv[1:])
metadata = json.loads(metadata_path.read_text())
required = json.loads((root / 'voice-required-names.json').read_text())
assert required and len(required) == len(set(required))

def read(path):
    raw = gzip.decompress(path.read_bytes()) if path.suffix == '.gz' else path.read_bytes()
    text = raw.decode('utf-8-sig')
    text = re.sub(r'\x1b\[[0-9;]*m', '', text)
    return re.sub(r'^\d{4}-\d\d-\d\dT\S+Z ?', '', text, flags=re.M), hashlib.sha256(raw).hexdigest()

def section(text, command):
    start = '##[group]Run ' + command + '\n'
    assert text.count(start) == 1, command + ': missing or ambiguous command boundary'
    rest = text.split(start, 1)[1]
    return rest.split('##[group]Run ', 1)[0]

def gate(text):
    summaries = re.findall(r'^# tests (\d+)$', text, re.M)
    assert len(summaries) == 1, 'A main gate must have exactly one complete TAP summary'
    summary = {key: int(value) for key, value in re.findall(r'^# (tests|suites|pass|fail|cancelled|skipped|todo) (\d+)$', text, re.M)}
    assert summary['tests'] > 0 and summary['tests'] == summary['pass']
    assert all(summary[key] == 0 for key in ['fail', 'cancelled', 'skipped', 'todo'])
    assert not re.search(r'^\s*not ok \d+', text, re.M)
    names = Counter(re.findall(r'^\s*ok \d+ - (.+?)\s*$', text, re.M))
    assert names
    return summary, names

def digest(names):
    return hashlib.sha256(json.dumps(sorted(names.items()), ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()

base, base_hash = read(base_path)
final, final_hash = read(final_path)
docker, docker_hash = read(docker_path)
assert metadata['base_sha'] == '04df35cd8e9ced136ef611cfc2b25f2de64c21bf'
assert metadata['remote_sha'] == metadata['expected_final_sha']
run = metadata['run']
assert run['head_sha'] == metadata['expected_final_sha']
assert run['status'] == 'completed' and run['conclusion'] == 'success'
jobs = {job['name']: job for job in metadata['jobs']}
for name in ['test', 'voice-docker-startup']:
    job = jobs[name]
    assert job['run_id'] == run['id'] and job['head_sha'] == run['head_sha']
    assert job['status'] == 'completed' and job['conclusion'] == 'success'

report = {'final_sha': run['head_sha'], 'run_id': run['id'], 'parent': metadata['base_sha'],
          'log_sha256': {'base_test': base_hash, 'final_test': final_hash, 'docker': docker_hash}, 'gates': {}}
commands = {'strict': 'npm run test:quote', 'full': 'npm test',
            'browser': 'node --test test/ownerAlertRepair20261006.browser.spec.mjs test/ownerAlertsDelivery20261006.browser.spec.mjs test/ownerDashboard20261007.browser.spec.mjs'}
observed = {}
for name, command in commands.items():
    old_summary, old_names = gate(section(base, command))
    summary, names = gate(section(final, command))
    expected = old_names + Counter(required) if name == 'full' else old_names
    assert names == expected, json.dumps({'gate': name, 'missing': list((expected - names).items()), 'extra': list((names - expected).items())})
    assert summary['tests'] == old_summary['tests'] + (len(required) if name == 'full' else 0)
    report['gates'][name] = {'summary': summary, 'base_summary': old_summary,
                            'all_base_passing_names_retained': True, 'base_name_multiset_sha256': digest(old_names),
                            'final_name_multiset_sha256': digest(names)}
    observed[name] = names
report['individual_H2_names'] = [{'name': name, 'full': observed['full'][name], 'strict': observed['strict'][name]} for name in required]
assert all(item['full'] == 1 and item['strict'] == 0 for item in report['individual_H2_names'])
assert 'Known failures still failing: 0/0' in final
assert re.search(r'found 0 vulnerabilities', section(final, 'npm audit --omit=dev --audit-level=high'))
assert 'PASS: production Docker image, no specs, voice enabled, synthetic credentials, network disabled, /api/health 200' in docker
for name in ['Build owner app and widget', 'No failures beyond the known list', 'Production dependency audit']:
    matches = [step for step in jobs['test']['steps'] if step['name'] == name]
    assert len(matches) == 1 and matches[0]['conclusion'] == 'success'
report.update(build='success', checker='success; known failures 0/0', dependency_audit='0 vulnerabilities', docker='success')
print(json.dumps(report, indent=2))
