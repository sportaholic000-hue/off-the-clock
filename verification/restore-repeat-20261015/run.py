"""One-shot hosted/Docker restore repetition. It never imports application code."""

from __future__ import annotations

from argparse import ArgumentParser
from datetime import datetime, timezone
from pathlib import Path
import hashlib
import json
import os
import re
import shutil
import signal
import subprocess
import sys
import tarfile
import tempfile
import traceback


EXPECTED_SUMMARY = {
    'tests': 9,
    'pass': 9,
    'fail': 0,
    'cancelled': 0,
    'skipped': 0,
    'todo': 0,
}
TEST_COMMAND = [
    'node',
    '--experimental-test-module-mocks',
    '--import',
    './test/pricebookTestEnv.mjs',
    '--test',
    '--test-reporter=tap',
    'test/backupRestoreRehearsal.spec.mjs',
]
EXPECTED_TEST_HASHES = {
    'test/backupRestoreRehearsal.spec.mjs': 'a3be06ce0499d88b8cb3798ec28dcd7df1ceb21debf87a1af85a40323e1309e0',
    'test/helpers/backupRestoreProcess.mjs': 'f2696cf4ee6ea4aa1ac6fe3d364f8d9f88252a66f69efc659aed436f5b020f2f',
}
SOURCE = Path(__file__).resolve().parent
SUPERVISOR_MARKER = '__RESTORE_REPEAT_EXECUTION__'


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def write_json(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + '\n')


def clean_name(value: str) -> str:
    return re.sub(r'[^a-zA-Z0-9_.-]+', '-', value).strip('-').lower()


def process_result(process: subprocess.Popen, started: str, timeout: int, *, input_bytes: bytes | None = None):
    timed_out = False
    try:
        stdout, stderr = process.communicate(input=input_bytes, timeout=timeout)
    except subprocess.TimeoutExpired:
        timed_out = True
        os.killpg(process.pid, signal.SIGTERM)
        try:
            stdout, stderr = process.communicate(timeout=10)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            stdout, stderr = process.communicate()
    code = process.returncode
    return {
        'startedUTC': started,
        'finishedUTC': utc_now(),
        'exitCode': code if code is not None and code >= 0 else None,
        'signal': -code if code is not None and code < 0 else None,
        'timedOut': timed_out,
        'stdout': stdout,
        'stderr': stderr,
    }


def run_process(argv: list[str], *, cwd: Path, env=None, timeout=600, input_bytes=None):
    started = utc_now()
    process = subprocess.Popen(
        argv,
        cwd=cwd,
        env=env,
        stdin=subprocess.PIPE if input_bytes is not None else subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        start_new_session=True,
    )
    return process_result(process, started, timeout, input_bytes=input_bytes)


def capture_preparation(label: str, argv: list[str], *, cwd: Path, output: Path, env=None, timeout=1200):
    result = run_process(argv, cwd=cwd, env=env, timeout=timeout)
    (output / 'preparation').mkdir(parents=True, exist_ok=True)
    (output / 'preparation' / f'{label}.stdout.txt').write_bytes(result.pop('stdout'))
    (output / 'preparation' / f'{label}.stderr.txt').write_bytes(result.pop('stderr'))
    result['argv'] = argv
    write_json(output / 'preparation' / f'{label}.execution.json', result)
    return result


def tracked_paths(application: Path) -> list[str]:
    raw = subprocess.check_output(['git', 'ls-files', '-z'], cwd=application)
    return [item.decode() for item in raw.split(b'\0') if item]


def describe_path(path: Path, relative: str) -> dict:
    try:
        stat = path.lstat()
    except FileNotFoundError:
        return {'path': relative, 'type': 'missing'}
    common = {
        'path': relative,
        'inode': stat.st_ino,
        'size': stat.st_size,
        'mtimeNs': stat.st_mtime_ns,
    }
    if path.is_symlink():
        target = os.readlink(path)
        return {**common, 'type': 'symlink', 'target': target, 'sha256': sha256(target.encode())}
    if path.is_file():
        return {**common, 'type': 'file', 'sha256': sha256(path.read_bytes())}
    if path.is_dir():
        return {**common, 'type': 'directory'}
    return {**common, 'type': 'other'}


def manifest_rows(root: Path, paths: list[str]) -> list[dict]:
    return [describe_path(root / relative, relative) for relative in paths]


def manifest_summary(label: str, rows: list[dict], output: Path) -> dict:
    manifest_path = output / 'manifests' / f'{label}.json'
    write_json(manifest_path, rows)
    content_rows = [{
        key: row.get(key) for key in ['path', 'type', 'size', 'sha256', 'target']
    } for row in rows]
    canonical = json.dumps(content_rows, sort_keys=True, separators=(',', ':')).encode()
    return {
        'label': label,
        'fileCount': len(rows),
        'regularFileCount': sum(row.get('type') == 'file' for row in rows),
        'missingCount': sum(row.get('type') == 'missing' for row in rows),
        'totalRegularFileBytes': sum(row.get('size', 0) for row in rows if row.get('type') == 'file'),
        'manifestSha256': sha256(canonical),
        'evidence': str(manifest_path.relative_to(output)),
    }


def compare_manifests(before: list[dict], after: list[dict]) -> dict:
    first = {row['path']: row for row in before}
    second = {row['path']: row for row in after}
    changes = []
    for name in sorted(set(first) | set(second)):
        left = first.get(name)
        right = second.get(name)
        relevant = lambda row: None if row is None else {
            key: row.get(key) for key in ['type', 'size', 'sha256', 'target']
        }
        if relevant(left) != relevant(right):
            changes.append({'path': name, 'before': relevant(left), 'after': relevant(right)})
    return {'identical': not changes, 'changedCount': len(changes), 'changes': changes}


def parse_tap(text: str) -> dict:
    result = {}
    for key in EXPECTED_SUMMARY:
        matches = re.findall(r'^# ' + re.escape(key) + r' (\d+)\s*$', text, re.MULTILINE)
        result[key] = int(matches[0]) if len(matches) == 1 else None
    return result


def filesystem_inventory(root: Path) -> dict:
    entries = []
    for base, directories, files in os.walk(root):
        directories.sort()
        files.sort()
        base_path = Path(base)
        for name in directories + files:
            path = base_path / name
            entries.append(describe_path(path, path.relative_to(root).as_posix()))
    return {'root': str(root), 'observedUTC': utc_now(), 'entries': entries}


def failure_files(output: Path, mode: str, iteration: int, stdout: bytes, stderr: bytes, inventory: dict) -> dict:
    root = output / 'failures' / f'{mode}-{iteration:03d}'
    root.mkdir(parents=True, exist_ok=False)
    stdout_path = root / 'tap.stdout.txt'
    stderr_path = root / 'stderr.txt'
    inventory_path = root / 'temporary-storage.json'
    stdout_path.write_bytes(stdout)
    stderr_path.write_bytes(stderr)
    write_json(inventory_path, inventory)
    return {
        'tap': str(stdout_path.relative_to(output)),
        'stderr': str(stderr_path.relative_to(output)),
        'temporaryStorage': str(inventory_path.relative_to(output)),
    }


def environment() -> dict:
    retained = {key: os.environ[key] for key in ['PATH', 'HOME', 'LANG', 'LC_ALL'] if key in os.environ}
    retained.update({'CI': 'true', 'TZ': 'UTC'})
    return retained


def validate_application(application: Path, application_commit: str) -> dict:
    if not re.fullmatch(r'[0-9a-f]{40}', application_commit):
        raise RuntimeError('Application input is not one complete commit SHA.')
    head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=application, text=True).strip()
    symbolic = subprocess.run(['git', 'symbolic-ref', '-q', 'HEAD'], cwd=application, capture_output=True)
    status = subprocess.check_output(['git', 'status', '--short'], cwd=application, text=True)
    diff = subprocess.run(['git', 'diff', '--exit-code', application_commit], cwd=application, capture_output=True)
    if head != application_commit or symbolic.returncode != 1 or status or diff.returncode != 0:
        raise RuntimeError('Application checkout is not the requested clean detached commit.')
    return {
        'head': head,
        'detached': True,
        'status': status,
        'diffExitCode': diff.returncode,
    }


def source_hashes(rows: list[dict]) -> dict:
    indexed = {row['path']: row for row in rows}
    return {
        name: {
            'sha256': indexed.get(name, {}).get('sha256'),
            'expectedSha256': expected,
            'matchesExpected': indexed.get(name, {}).get('sha256') == expected,
        }
        for name, expected in EXPECTED_TEST_HASHES.items()
    }


def aggregate(iterations: list[dict], requested: int) -> dict:
    passed = sum(row.get('status') == 'PASS' for row in iterations)
    completed = len(iterations)
    return {
        'requestedIterations': requested,
        'completedIterations': completed,
        'passedIterations': passed,
        'failedIterations': completed - passed,
        'notRunIterations': requested - completed,
        'tests': sum((row.get('summary') or {}).get('tests') or 0 for row in iterations),
        'pass': sum((row.get('summary') or {}).get('pass') or 0 for row in iterations),
        'fail': sum((row.get('summary') or {}).get('fail') or 0 for row in iterations),
        'cancelled': sum((row.get('summary') or {}).get('cancelled') or 0 for row in iterations),
        'skipped': sum((row.get('summary') or {}).get('skipped') or 0 for row in iterations),
        'todo': sum((row.get('summary') or {}).get('todo') or 0 for row in iterations),
    }


def hosted_iterations(application: Path, output: Path, count: int) -> tuple[list[dict], dict | None]:
    rows = []
    for number in range(1, count + 1):
        root = Path(tempfile.mkdtemp(prefix=f'restore-repeat-hosted-{number:03d}-'))
        if any(root.iterdir()):
            return rows, {'stage': 'fresh-temporary-directory', 'iteration': number, 'message': 'New TMPDIR was not empty.'}
        env = environment()
        env['TMPDIR'] = str(root)
        result = run_process(TEST_COMMAND, cwd=application, env=env, timeout=240)
        stdout = result.pop('stdout')
        stderr = result.pop('stderr')
        summary = parse_tap(stdout.decode(errors='replace'))
        passed = (
            summary == EXPECTED_SUMMARY
            and result['exitCode'] == 0
            and result['signal'] is None
            and not result['timedOut']
        )
        row = {
            'iteration': number,
            'startedUTC': result['startedUTC'],
            'finishedUTC': result['finishedUTC'],
            'summary': summary,
            'exitCode': result['exitCode'],
            'signal': result['signal'],
            'timedOut': result['timedOut'],
            'status': 'PASS' if passed else 'FAIL',
            'temporaryDirectory': str(root),
        }
        if not passed:
            row['failureEvidence'] = failure_files(output, 'hosted', number, stdout, stderr, filesystem_inventory(root))
        rows.append(row)
        print(json.dumps({'mode': 'hosted', **row}), flush=True)
        shutil.rmtree(root, ignore_errors=False)
    return rows, None


def docker_json(argv: list[str], *, cwd: Path, timeout=120, input_bytes=None) -> dict:
    result = run_process(argv, cwd=cwd, timeout=timeout, input_bytes=input_bytes)
    if result['exitCode'] != 0 or result['signal'] is not None or result['timedOut']:
        raise RuntimeError('Docker evidence command failed: ' + ' '.join(argv) + '\n' + result['stderr'].decode(errors='replace'))
    return json.loads(result['stdout'])


def docker_manifest(image: str, paths: list[str], application: Path) -> list[dict]:
    argv = [
        'docker', 'run', '--rm', '-i',
        '--mount', f'type=bind,src={SOURCE},dst=/repeat,readonly',
        image,
        'node', '/repeat/filesystem-evidence.mjs', '/application', 'manifest',
    ]
    return docker_json(argv, cwd=application, input_bytes=json.dumps(paths).encode())['entries']


def docker_volume_inventory(image: str, volume: str, application: Path) -> dict:
    argv = [
        'docker', 'run', '--rm',
        '--mount', f'source={volume},target=/data',
        '--mount', f'type=bind,src={SOURCE},dst=/repeat,readonly',
        image,
        'node', '/repeat/filesystem-evidence.mjs', '/data', 'inventory',
    ]
    return docker_json(argv, cwd=application)


def parse_supervisor(stderr: bytes) -> dict | None:
    found = []
    for line in stderr.decode(errors='replace').splitlines():
        if line.startswith(SUPERVISOR_MARKER):
            try:
                found.append(json.loads(line[len(SUPERVISOR_MARKER):]))
            except ValueError:
                pass
    return found[0] if len(found) == 1 else None


def docker_iterations(application: Path, output: Path, count: int, image: str) -> tuple[list[dict], dict | None]:
    rows = []
    prefix = clean_name('restore-repeat-' + os.environ.get('GITHUB_RUN_ID', 'local') + '-' + os.environ.get('GITHUB_JOB', 'docker'))
    for number in range(1, count + 1):
        volume = f'{prefix}-{number:03d}'
        container = f'{prefix}-container-{number:03d}'
        created = run_process(['docker', 'volume', 'create', volume], cwd=application, timeout=60)
        if created['exitCode'] != 0 or created['signal'] is not None or created['timedOut']:
            return rows, {'stage': 'docker-volume-create', 'iteration': number, 'stdout': created['stdout'].decode(errors='replace'), 'stderr': created['stderr'].decode(errors='replace')}
        failure = None
        try:
            before = docker_volume_inventory(image, volume, application)
            if before['entries']:
                failure = {'stage': 'fresh-docker-volume', 'iteration': number, 'volume': volume, 'inventory': before}
            else:
                argv = [
                    'docker', 'run', '--rm', '--init', '--name', container,
                    '--mount', f'source={volume},target=/data',
                    '--mount', f'type=bind,src={SOURCE},dst=/repeat,readonly',
                    '-e', 'TMPDIR=/data', '-e', 'CI=true', '-e', 'TZ=UTC',
                    image,
                    'node', '/repeat/container-supervisor.mjs',
                ]
                result = run_process(argv, cwd=application, timeout=240)
                stdout = result.pop('stdout')
                stderr = result.pop('stderr')
                execution = parse_supervisor(stderr)
                if execution is None:
                    run_process(['docker', 'rm', '-f', container], cwd=application, timeout=60)
                    failure = {
                        'stage': 'docker-container-supervisor',
                        'iteration': number,
                        'dockerExitCode': result['exitCode'],
                        'dockerSignal': result['signal'],
                        'dockerTimedOut': result['timedOut'],
                        'stdout': stdout.decode(errors='replace'),
                        'stderr': stderr.decode(errors='replace'),
                    }
                else:
                    summary = parse_tap(stdout.decode(errors='replace'))
                    passed = (
                        summary == EXPECTED_SUMMARY
                        and execution.get('exitCode') == 0
                        and execution.get('signal') is None
                        and not result['timedOut']
                    )
                    row = {
                        'iteration': number,
                        'startedUTC': execution.get('startedUTC'),
                        'finishedUTC': execution.get('finishedUTC'),
                        'summary': summary,
                        'exitCode': execution.get('exitCode'),
                        'signal': execution.get('signal'),
                        'timedOut': result['timedOut'],
                        'status': 'PASS' if passed else 'FAIL',
                        'dockerVolume': volume,
                        'dockerMount': '/data',
                    }
                    if not passed:
                        inventory = docker_volume_inventory(image, volume, application)
                        row['failureEvidence'] = failure_files(output, 'docker', number, stdout, stderr, inventory)
                    rows.append(row)
                    print(json.dumps({'mode': 'docker', **row}), flush=True)
        except Exception as error:
            failure = {'stage': 'docker-iteration', 'iteration': number, 'message': repr(error), 'traceback': traceback.format_exc()}
        finally:
            removed = run_process(['docker', 'volume', 'rm', '-f', volume], cwd=application, timeout=60)
            if removed['exitCode'] != 0 or removed['signal'] is not None or removed['timedOut']:
                failure = failure or {
                    'stage': 'docker-volume-remove',
                    'iteration': number,
                    'stdout': removed['stdout'].decode(errors='replace'),
                    'stderr': removed['stderr'].decode(errors='replace'),
                }
        if failure:
            return rows, failure
    return rows, None


def build_docker_image(application: Path, output: Path, commit: str, paths: list[str]) -> tuple[str, dict, list[dict]]:
    context_root = Path(tempfile.mkdtemp(prefix='restore-repeat-docker-context-'))
    archive_process = None
    try:
        app_context = context_root / 'application'
        app_context.mkdir()
        archive_process = subprocess.Popen(['git', 'archive', '--format=tar', commit], cwd=application, stdout=subprocess.PIPE)
        assert archive_process.stdout is not None
        with tarfile.open(fileobj=archive_process.stdout, mode='r|') as archive:
            archive.extractall(app_context, filter='data')
        if archive_process.wait() != 0:
            raise RuntimeError('git archive failed')
        shutil.copy2(SOURCE / 'Dockerfile.repeat', context_root / 'Dockerfile')
        context_rows = manifest_rows(app_context, paths)
        image = clean_name('restore-repeat-' + os.environ.get('GITHUB_RUN_ID', 'local') + '-' + os.environ.get('GITHUB_JOB', 'docker')) + ':candidate'
        prepared = capture_preparation(
            'docker-build',
            ['docker', 'build', '--pull', '--tag', image, '.'],
            cwd=context_root,
            output=output,
            timeout=1200,
        )
        return image, prepared, context_rows
    finally:
        if archive_process is not None and archive_process.poll() is None:
            archive_process.kill()
        shutil.rmtree(context_root, ignore_errors=True)


def prepare_result(mode: str, application: Path, output: Path, commit: str, iterations: int) -> tuple[dict, list[str], list[dict]]:
    output.mkdir(parents=True, exist_ok=False)
    identity = validate_application(application, commit)
    paths = tracked_paths(application)
    before = manifest_rows(application, paths)
    result = {
        'schemaVersion': 1,
        'mode': mode,
        'applicationCommit': commit,
        'expectedIterations': iterations,
        'expectedPerIteration': EXPECTED_SUMMARY,
        'testCommand': TEST_COMMAND,
        'startedUTC': utc_now(),
        'applicationIdentity': identity,
        'sourceIntegrity': {
            'beforeInstall': manifest_summary('source-before-install', before, output),
            'executedSourceHashesBeforeInstall': source_hashes(before),
        },
        'preparation': {},
        'iterations': [],
    }
    write_json(output / 'RUNNING.json', result)
    return result, paths, before


def run_hosted(application: Path, output: Path, commit: str, count: int) -> dict:
    result, paths, before = prepare_result('hosted', application, output, commit, count)
    node_version = capture_preparation('node-version', ['node', '--version'], cwd=application, output=output, timeout=60)
    npm_version = capture_preparation('npm-version', ['npm', '--version'], cwd=application, output=output, timeout=60)
    result['preparation']['nodeVersion'] = node_version
    result['preparation']['npmVersion'] = npm_version
    node_text = (output / 'preparation' / 'node-version.stdout.txt').read_text().strip()
    if node_version['exitCode'] != 0 or not node_text.startswith('v22.'):
        result['infrastructureFailure'] = {'stage': 'node-version', 'observed': node_text}
        return result
    npm_ci = capture_preparation('npm-ci', ['npm', 'ci'], cwd=application, output=output, timeout=1200)
    result['preparation']['npmCi'] = npm_ci
    if npm_ci['exitCode'] != 0 or npm_ci['signal'] is not None or npm_ci['timedOut']:
        result['infrastructureFailure'] = {'stage': 'npm-ci'}
        return result
    build = capture_preparation('npm-run-build', ['npm', 'run', 'build'], cwd=application, output=output, timeout=1200)
    result['preparation']['build'] = build
    if build['exitCode'] != 0 or build['signal'] is not None or build['timedOut']:
        result['infrastructureFailure'] = {'stage': 'npm-run-build'}
        return result
    after_build = manifest_rows(application, paths)
    result['sourceIntegrity']['afterBuild'] = manifest_summary('source-after-build', after_build, output)
    result['sourceIntegrity']['beforeToAfterBuild'] = compare_manifests(before, after_build)
    result['sourceIntegrity']['executedSourceHashesAfterBuild'] = source_hashes(after_build)
    rows, infrastructure = hosted_iterations(application, output, count)
    result['iterations'] = rows
    if infrastructure:
        result['infrastructureFailure'] = infrastructure
    after = manifest_rows(application, paths)
    result['sourceIntegrity']['afterIterations'] = manifest_summary('source-after-iterations', after, output)
    result['sourceIntegrity']['beforeToAfterIterations'] = compare_manifests(before, after)
    result['sourceIntegrity']['afterBuildToAfterIterations'] = compare_manifests(after_build, after)
    result['sourceIntegrity']['executedSourceHashesAfterIterations'] = source_hashes(after)
    return result


def run_docker(application: Path, output: Path, commit: str, count: int) -> dict:
    result, paths, before = prepare_result('docker', application, output, commit, count)
    image = None
    try:
        image, build, context_rows = build_docker_image(application, output, commit, paths)
        result['preparation']['dockerBuild'] = build
        result['preparation']['baseImage'] = 'node:22-bookworm-slim'
        result['sourceIntegrity']['dockerContextBeforeInstall'] = manifest_summary('docker-context-before-install', context_rows, output)
        result['sourceIntegrity']['checkoutToDockerContext'] = compare_manifests(before, context_rows)
        if build['exitCode'] != 0 or build['signal'] is not None or build['timedOut']:
            result['infrastructureFailure'] = {'stage': 'docker-build'}
            return result
        node_version = capture_preparation('docker-node-version', ['docker', 'run', '--rm', image, 'node', '--version'], cwd=application, output=output, timeout=60)
        npm_version = capture_preparation('docker-npm-version', ['docker', 'run', '--rm', image, 'npm', '--version'], cwd=application, output=output, timeout=60)
        result['preparation']['nodeVersion'] = node_version
        result['preparation']['npmVersion'] = npm_version
        node_text = (output / 'preparation' / 'docker-node-version.stdout.txt').read_text().strip()
        if node_version['exitCode'] != 0 or not node_text.startswith('v22.'):
            result['infrastructureFailure'] = {'stage': 'docker-node-version', 'observed': node_text}
            return result
        inspect = run_process(['docker', 'image', 'inspect', image], cwd=application, timeout=60)
        if inspect['exitCode'] != 0 or inspect['signal'] is not None:
            result['infrastructureFailure'] = {'stage': 'docker-image-inspect'}
            return result
        image_data = json.loads(inspect['stdout'])[0]
        result['preparation']['dockerImage'] = {
            'id': image_data.get('Id'),
            'repoDigests': image_data.get('RepoDigests'),
            'created': image_data.get('Created'),
        }
        image_after_build = docker_manifest(image, paths, application)
        result['sourceIntegrity']['afterBuild'] = manifest_summary('source-after-build', image_after_build, output)
        result['sourceIntegrity']['beforeToAfterBuild'] = compare_manifests(before, image_after_build)
        result['sourceIntegrity']['executedSourceHashesAfterBuild'] = source_hashes(image_after_build)
        rows, infrastructure = docker_iterations(application, output, count, image)
        result['iterations'] = rows
        if infrastructure:
            result['infrastructureFailure'] = infrastructure
        image_after = docker_manifest(image, paths, application)
        result['sourceIntegrity']['afterIterations'] = manifest_summary('source-after-iterations', image_after, output)
        result['sourceIntegrity']['beforeToAfterIterations'] = compare_manifests(before, image_after)
        result['sourceIntegrity']['afterBuildToAfterIterations'] = compare_manifests(image_after_build, image_after)
        result['sourceIntegrity']['executedSourceHashesAfterIterations'] = source_hashes(image_after)
        return result
    finally:
        if image:
            run_process(['docker', 'image', 'rm', '-f', image], cwd=application, timeout=120)


def finalize(result: dict, output: Path) -> int:
    result['aggregate'] = aggregate(result.get('iterations', []), result['expectedIterations'])
    result['finishedUTC'] = utc_now()
    integrity = result.get('sourceIntegrity', {})
    source_ok = all(
        integrity.get(key, {}).get('identical') is True
        for key in ['beforeToAfterBuild', 'beforeToAfterIterations', 'afterBuildToAfterIterations']
    )
    hashes_ok = all(
        all(row.get('matchesExpected') for row in integrity.get(key, {}).values())
        for key in [
            'executedSourceHashesBeforeInstall',
            'executedSourceHashesAfterBuild',
            'executedSourceHashesAfterIterations',
        ]
    )
    iterations_ok = (
        result['aggregate']['completedIterations'] == result['expectedIterations']
        and result['aggregate']['failedIterations'] == 0
        and result['aggregate']['notRunIterations'] == 0
    )
    result['overallStatus'] = 'PASS' if source_ok and hashes_ok and iterations_ok and 'infrastructureFailure' not in result else 'FAIL'
    write_json(output / 'RESULTS.json', result)
    running = output / 'RUNNING.json'
    if running.exists():
        running.unlink()
    print(json.dumps({'mode': result['mode'], 'overallStatus': result['overallStatus'], 'aggregate': result['aggregate'], 'sourceIntegrityPassed': source_ok, 'executedSourceHashesPassed': hashes_ok, 'infrastructureFailure': result.get('infrastructureFailure')}), flush=True)
    return 0 if result['overallStatus'] == 'PASS' else 1


def main() -> int:
    parser = ArgumentParser()
    parser.add_argument('mode', choices=['hosted', 'docker'])
    parser.add_argument('--application', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--application-commit', required=True)
    parser.add_argument('--iterations', required=True, type=int)
    args = parser.parse_args()
    result = None
    try:
        if args.iterations != 100:
            raise RuntimeError('This workflow is fixed to exactly 100 iterations per job.')
        runner = run_hosted if args.mode == 'hosted' else run_docker
        result = runner(args.application.resolve(), args.output.resolve(), args.application_commit, args.iterations)
    except Exception as error:
        if not args.output.exists():
            args.output.mkdir(parents=True)
        result = result or {
            'schemaVersion': 1,
            'mode': args.mode,
            'applicationCommit': args.application_commit,
            'expectedIterations': args.iterations,
            'expectedPerIteration': EXPECTED_SUMMARY,
            'testCommand': TEST_COMMAND,
            'startedUTC': utc_now(),
            'sourceIntegrity': {},
            'preparation': {},
            'iterations': [],
        }
        result['infrastructureFailure'] = {
            'stage': 'runner',
            'message': repr(error),
            'traceback': traceback.format_exc(),
        }
    return finalize(result, args.output.resolve())


if __name__ == '__main__':
    sys.exit(main())
