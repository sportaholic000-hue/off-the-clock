"""Run every owner-requested file in its own Node process; retain exact TAP."""
import glob, json, os, pathlib, re, subprocess
folder = pathlib.Path(__file__).resolve().parent
patterns = ['test/lockRecoveryRace20261011.spec.mjs', 'test/retentionHardening*.spec.mjs',
            'test/day90*.spec.mjs', 'test/tenantRetention20261010.spec.mjs',
            'test/continuousOffsite20261007.spec.mjs', 'test/backups.spec.mjs',
            'test/offsiteBackups20261007.spec.mjs', 'test/backupRestoreRehearsal.spec.mjs',
            'test/ownerQueryCoverage20261009.spec.mjs', 'test/tenantIsolationRoutes.spec.mjs']
results = []
for pattern in patterns:
    files = sorted(glob.glob(pattern))
    assert files, pattern
    for file in files:
        command = ['node', '--experimental-test-module-mocks', '--import', './test/pricebookTestEnv.mjs',
                   '--test', '--test-reporter=tap', file]
        run = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        (folder / 'standalone' / (pathlib.Path(file).name + '.tap')).write_text(run.stdout)
        counts = {key: int(value) for key, value in re.findall(r'^# (tests|pass|fail|skipped|cancelled|todo) (\d+)$', run.stdout, re.M)}
        row = {'file': file, 'command': command, 'exit': run.returncode, **counts}
        results.append(row)
        print(json.dumps(row), flush=True)
(folder / 'standalone-results.json').write_text(json.dumps(results, indent=2) + '\n')
raise SystemExit(1 if any(row['exit'] or not row.get('tests') for row in results) else 0)
