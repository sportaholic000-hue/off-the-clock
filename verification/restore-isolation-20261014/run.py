"""Bounded hosted experiment. Does not edit/import application source."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import os
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import traceback
import zipfile

APP_SHA = '95e1631f42461ca8ae7d46d859940bffc302d155'
TAG_SHA = '7c7e5a9363ed7113ea8969cdd3e400f58b1b538f'
APP = Path(os.environ['ISOLATION_APPLICATION']).resolve()
EVIDENCE = Path(os.environ['ISOLATION_EVIDENCE']).resolve()
OUTPUT = Path(os.environ['ISOLATION_OUTPUT']).resolve()
SOURCE = Path(__file__).resolve().parent
CONTROL = SOURCE.parents[1]
EVIDENCE.mkdir(parents=True, exist_ok=False)
OUTPUT.mkdir(parents=True, exist_ok=False)
allowlist = set()
results = {'applicationCommit': APP_SHA, 'normal': {'status': 'NOT RUN'}, 'traced': {'status': 'NOT RUN'}}
clock = lambda: datetime.now(timezone.utc).isoformat()
sha = lambda data: hashlib.sha256(data).hexdigest()

def save(name, data):
    assert name not in allowlist, 'Refuse to replace evidence: ' + name
    destination = EVIDENCE / name
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(data if isinstance(data, bytes) else data.encode())
    allowlist.add(name)

def record(name, value):
    save(name, json.dumps(value, indent=2) + '\n')

def capture(label, argv, cwd=APP, env=None, timeout=600):
    env = dict(os.environ if env is None else env)
    fields = ['PATH', 'HOME', 'LANG', 'LC_ALL', 'TZ', 'TMPDIR', 'NODE_ENV', 'NODE_OPTIONS', 'CI']
    meta = {'argv': argv, 'cwd': str(cwd), 'startedUTC': clock(), 'environment': {k: env[k] for k in fields if k in env}}
    out_name, err_name = label + '.stdout.txt', label + '.stderr.txt'
    for name in [out_name, err_name]:
        assert name not in allowlist
        allowlist.add(name)
    with (EVIDENCE / out_name).open('xb') as stdout, (EVIDENCE / err_name).open('xb') as stderr:
        try:
            process = subprocess.Popen(argv, cwd=cwd, env=env, stdout=stdout, stderr=stderr, start_new_session=True)
            meta['pid'] = process.pid
            try:
                code = process.wait(timeout=timeout)
            except subprocess.TimeoutExpired:
                meta['timeoutSeconds'] = timeout
                os.killpg(process.pid, signal.SIGTERM)
                try:
                    code = process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL)
                    code = process.wait()
            meta.update(exitCode=code if code >= 0 else None, signal=-code if code < 0 else None)
        except Exception as error:
            meta.update(exitCode=None, signal=None, launchError=repr(error))
    meta['finishedUTC'] = clock()
    record(label + '.execution.json', meta)
    print(json.dumps({'label': label, **meta}), flush=True)
    return meta

def output(label):
    return (EVIDENCE / (label + '.stdout.txt')).read_text(errors='replace')

def checked(label, argv, **kwargs):
    meta = capture(label, argv, **kwargs)
    if meta.get('exitCode') != 0 or meta.get('signal') is not None:
        raise RuntimeError(label + ' failed; original output retained')
    return output(label).strip()

def source_manifest(label):
    names = subprocess.check_output(['git', 'ls-files', '-z'], cwd=APP).decode().split('\0')
    selected = [n for n in names if n and (n.startswith(('server/', 'test/', 'scripts/', '.github/scripts/')) or n in ['AGENTS.md', 'package.json', 'package-lock.json']) and '/node_modules/' not in n]
    rows = []
    for name in selected:
        p = APP / name
        original = subprocess.check_output(['git', 'show', APP_SHA + ':' + name], cwd=APP)
        actual = p.read_bytes()
        rows.append({'path': name, 'bytes': len(actual), 'sha256': sha(actual), 'taggedSha256': sha(original), 'identical': actual == original})
    record(label + '.json', rows)
    assert all(r['identical'] for r in rows), 'Application/test source mismatch'

def register_traces(prefix):
    # Only exact numeric strace output names from this invocation; never volume files.
    paths = sorted(p for p in EVIDENCE.iterdir() if re.fullmatch(re.escape(prefix) + r'\.\d+', p.name))
    for path in paths:
        assert path.name not in allowlist
        allowlist.add(path.name)
    return paths

def tap_result(label, meta):
    text = output(label)
    summary = {}
    for key in ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo']:
        matches = re.findall(r'^# ' + key + r' (\d+)\s*$', text, re.M)
        summary[key] = int(matches[0]) if len(matches) == 1 else None
    expected = {'tests': 9, 'pass': 9, 'fail': 0, 'cancelled': 0, 'skipped': 0, 'todo': 0}
    status = 'PASS' if summary == expected and meta.get('exitCode') == 0 and meta.get('signal') is None and 'timeoutSeconds' not in meta else 'FAIL'
    observations = []
    for number, line in enumerate(text.splitlines(), 1):
        for marker in ['restore-recovery ', 'restore-cleanup ']:
            if marker in line:
                raw = line.split(marker, 1)[1]
                try:
                    value = json.loads(raw)
                except ValueError:
                    value = {'unparsedOriginal': raw}
                observations.append({'stdoutLine': number, 'marker': marker.strip(), 'observation': value})
    record(label + '.observations.json', observations)
    return {'status': status, 'summary': summary, 'exitCode': meta.get('exitCode'), 'signal': meta.get('signal'), 'execution': label + '.execution.json', 'observations': label + '.observations.json'}

def temp_state(label, root):
    # Metadata only; never copy a temporary database or recursively collect volumes.
    entries = []
    for p in sorted(root.iterdir()):
        stat = p.lstat()
        entries.append({'path': str(p), 'device': stat.st_dev, 'inode': stat.st_ino, 'size': stat.st_size, 'mtimeNs': stat.st_mtime_ns, 'ctimeNs': stat.st_ctime_ns})
    record(label + '.temporary-root-after.json', {'observedUTC': clock(), 'root': str(root), 'directEntries': entries, 'databaseSnapshotCaptured': False})

RAW_BUFFERS = 'read,readv,pread64,preadv,preadv2,write,writev,pwrite64,pwritev,pwritev2,sendto,sendmsg,sendmmsg,recvfrom,recvmsg,recvmmsg,getdents,getdents64'
def traced_command(prefix, command):
    return ['strace', '-ff', '-ttt', '-T', '-yy', '-v', '-s', '256', '-e', 'abbrev=execve,execveat', '-e', 'trace=%file,%process,%desc,%memory', '-e', 'raw=' + RAW_BUFFERS, '-o', str(EVIDENCE / prefix), '--', *command]

def derive_timeline(paths, roots):
    events = []
    process_lines = []
    mutation = re.compile(r'\b(openat|open|creat|write|writev|pwrite64|pwritev|rename|renameat|renameat2|unlink|unlinkat|rmdir|mkdir|mkdirat|utime|utimes|utimensat|futimesat|truncate|ftruncate|copy_file_range|sendfile|link|symlink|mmap|msync|clone|clone3|fork|vfork|execve|exit_group)\(')
    for path in paths:
        pid = int(path.name.rsplit('.', 1)[1])
        for line_number, line in enumerate(path.read_text(errors='replace').splitlines(), 1):
            stamp = re.match(r'^(\d+\.\d+)', line)
            if re.search(r'\b(execve|clone|clone3|fork|vfork|exit_group)\(', line):
                process_lines.append({'file': path.name, 'line': line_number, 'pidOrTid': pid, 'raw': line})
            if mutation.search(line) and (any(str(root) in line for root in roots) or re.search(r'\b(write|writev|pwrite64|pwritev|copy_file_range|sendfile|clone|clone3|fork|vfork|execve|exit_group)\(', line)):
                events.append({'epochSeconds': stamp.group(1) if stamp else None, 'file': path.name, 'line': line_number, 'pidOrTid': pid, 'raw': line})
    events.sort(key=lambda e: (float(e['epochSeconds'] or 0), e['pidOrTid'], e['line']))
    record('derived-timeline.json', {'limitations': 'Index only: retain raw traces for fd inheritance, unfinished/resumed calls, native memory stores and attribution. PID/TID does not establish external-writer coverage.', 'events': events, 'processEvents': process_lines})

def package():
    record('RESULTS.json', results)
    rows = [{'path': n, 'bytes': (EVIDENCE/n).stat().st_size, 'sha256': sha((EVIDENCE/n).read_bytes())} for n in sorted(allowlist)]
    record('INVENTORY.json', {'createdUTC': clock(), 'selection': 'Explicitly registered capture outputs and numeric strace files only; no temporary application volume inclusion.', 'files': rows, 'exclusions': ['INVENTORY.json', 'SHA256SUMS']})
    save('SHA256SUMS', ''.join(r['sha256'] + '  ' + r['path'] + '\n' for r in rows))
    archive = OUTPUT / 'restore-isolation-evidence.zip'
    with zipfile.ZipFile(archive, 'x', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for name in sorted(allowlist):
            z.write(EVIDENCE/name, name)
    with zipfile.ZipFile(archive) as z:
        assert z.testzip() is None
        assert set(z.namelist()) == allowlist
        for row in rows:
            assert sha(z.read(row['path'])) == row['sha256']
    digest = sha(archive.read_bytes())
    (OUTPUT / 'restore-isolation-evidence.zip.sha256').write_text(digest + '  ' + archive.name + '\n')
    print(json.dumps({'artifact': archive.name, 'sha256': digest, 'bytes': archive.stat().st_size, 'entries': len(allowlist), 'verified': True}), flush=True)

try:
    for name in ['run.py', 'trace-smoke.py', 'REPORT.md']:
        save('diagnostic-source/' + name, (SOURCE/name).read_bytes())
    save('diagnostic-source/EXECUTION.json', (SOURCE/'EXECUTION.json').read_bytes())
    save('diagnostic-source/workflow.yml', (CONTROL/'.github/workflows/restore-isolation-20261014.yml').read_bytes())
    results['diagnosticCommit'] = checked('diagnostic-head', ['git', 'rev-parse', 'HEAD'], cwd=CONTROL)
    assert checked('application-head', ['git', 'rev-parse', 'HEAD']) == APP_SHA
    detached = capture('application-detached', ['git', 'symbolic-ref', '-q', 'HEAD'])
    assert detached.get('exitCode') == 1
    assert checked('tag-type', ['git', 'cat-file', '-t', 'rc-20261013m']) == 'tag'
    assert checked('tag-object', ['git', 'rev-parse', 'rc-20261013m']) == TAG_SHA
    assert checked('tag-peel', ['git', 'rev-parse', 'rc-20261013m^{}']) == APP_SHA
    for label, command in [('node-version', ['node', '--version']), ('npm-version', ['npm', '--version']), ('git-version', ['git', '--version']), ('python-version', [sys.executable, '--version']), ('kernel', ['uname', '-a'])]:
        checked(label, command)
    assert output('node-version').strip().startswith('v22.')
    record('hosted-identity.json', {k: os.environ.get(k) for k in ['GITHUB_REPOSITORY', 'GITHUB_SHA', 'GITHUB_REF', 'GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT', 'GITHUB_WORKFLOW', 'GITHUB_JOB', 'RUNNER_OS', 'RUNNER_ARCH', 'ImageOS', 'ImageVersion']})
    checked('pre-install-status', ['git', 'status', '--short'])
    source_manifest('source-before')
    checked('npm-ci', ['npm', 'ci'])
    checked('build', ['npm', 'run', 'build'])
    checked('build-diff', ['git', 'diff', '--binary', APP_SHA])
    checked('build-status', ['git', 'status', '--short'])
    source_manifest('source-after-build')
    clean_env = {k: os.environ[k] for k in ['PATH', 'HOME', 'LANG', 'LC_ALL', 'TZ'] if k in os.environ}
    clean_env.update(CI='true', TZ='UTC')
    command = ['node', '--experimental-test-module-mocks', '--import', './test/pricebookTestEnv.mjs', '--test', '--test-reporter=tap', 'test/backupRestoreRehearsal.spec.mjs']
    normal_root = Path(tempfile.mkdtemp(prefix='restore-isolation-normal-'))
    normal = capture('normal', command, env={**clean_env, 'TMPDIR': str(normal_root)}, timeout=240)
    results['normal'] = tap_result('normal', normal)
    temp_state('normal', normal_root)
    if not shutil.which('strace'):
        checked('tracer-install-update', ['sudo', 'apt-get', 'update'])
        checked('tracer-install', ['sudo', 'apt-get', 'install', '-y', 'strace'])
    checked('strace-version', ['strace', '--version'])
    smoke_root = Path(tempfile.mkdtemp(prefix='restore-isolation-tracer-proof-'))
    smoke_env = {**clean_env, 'TMPDIR': str(smoke_root), 'TRACE_PRIVATE_SENTINEL': 'SYNTHETIC_ENV_MUST_NOT_BE_DUMPED'}
    smoke = capture('tracer-proof', traced_command('tracer-proof.raw', [sys.executable, str(SOURCE/'trace-smoke.py'), str(smoke_root/'synthetic-write')]), env=smoke_env)
    smoke_traces = register_traces('tracer-proof.raw')
    combined = '\n'.join(p.read_text(errors='replace') for p in smoke_traces)
    # If argv/environment abbreviation failed, no application tracing is attempted.
    proof_json = json.loads(output('tracer-proof')) if smoke.get('exitCode') == 0 else {}
    child_trace = EVIDENCE / ('tracer-proof.raw.' + str(proof_json.get('pid')))
    child_text = child_trace.read_text(errors='replace') if child_trace.exists() else ''
    working = smoke.get('exitCode') == 0 and proof_json.get('path') == str(smoke_root/'synthetic-write') and all(term in child_text for term in ['synthetic-write', 'write(', 'rename(', 'utimensat(', 'unlink(']) and 'SYNTHETIC_ENV_MUST_NOT_BE_DUMPED' not in combined
    record('tracer-proof.validation.json', {'working': working, 'child': proof_json, 'trace': child_trace.name if child_trace.exists() else None, 'environmentAbbreviated': 'SYNTHETIC_ENV_MUST_NOT_BE_DUMPED' not in combined})
    if working:
        trace_root = Path(tempfile.mkdtemp(prefix='restore-isolation-traced-'))
        traced = capture('traced', traced_command('rehearsal.raw', command), env={**clean_env, 'TMPDIR': str(trace_root)}, timeout=300)
        traces = register_traces('rehearsal.raw')
        results['traced'] = tap_result('traced', traced)
        results['traced']['traceFiles'] = len(traces)
        if not traces:
            results['traced']['status'] = 'INCOMPLETE'
        temp_state('traced', trace_root)
        derive_timeline(traces, [normal_root, trace_root])
    else:
        results['traced'] = {'status': 'NOT RUN', 'reason': 'Kernel tracer capability/identity/privacy proof failed; see original tracer-proof output.'}
    source_manifest('source-after-executions')
    checked('final-application-diff', ['git', 'diff', '--binary', APP_SHA])
    checked('final-application-status', ['git', 'status', '--short'])
except Exception:
    save('diagnostic-error.txt', traceback.format_exc())
    results['diagnosticError'] = 'diagnostic-error.txt'
finally:
    results['finishedUTC'] = clock()
    results['targetedStatus'] = 'PASS' if all(results[k]['status'] == 'PASS' for k in ['normal', 'traced']) and 'diagnosticError' not in results else 'INCOMPLETE'
    package()
sys.exit(0 if results['targetedStatus'] == 'PASS' else 1)
