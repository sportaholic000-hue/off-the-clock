# Exact commands and runtime selection

All tests ran in `/workspace/scratch/5228524b6f21/restore-recheck-20261013`.
Node **v22.23.3**, npm **11.9.0**, Linux x64. `runtime.json` records the versions.
The runtime reports `process.execPath` as `node`; consequently the recorder's
`nodePathPrefix` field is `.`. This is the literal runtime result, **not** the PATH
selection. The actual PATH override below selects the task-local Node 22 binary.
No other environment values or credentials are dumped.

Preparation (separate toolchain outside the repository, before install/tests):

```sh
mkdir -p restore-recheck-runtime/tmp restore-recheck-runtime/toolchain
TMPDIR=/workspace/scratch/5228524b6f21/restore-recheck-runtime/tmp npm install --prefix /workspace/scratch/5228524b6f21/restore-recheck-runtime/toolchain --no-package-lock --no-save node@22
git clone https://github.com/sportaholic000-hue/off-the-clock.git restore-recheck-20261013
cd restore-recheck-20261013
git switch --detach d38781b35d126f21fed6074844e07d4e9de7c944
git switch -c codex/restore-recheck-20261013
export PATH=/workspace/scratch/5228524b6f21/restore-recheck-runtime/toolchain/node_modules/node/bin:$PATH
export TMPDIR=/workspace/scratch/5228524b6f21/restore-recheck-runtime/tmp
```

The clone and toolchain installation were independent preparation operations.
The exact remote verification is in `starting-refs.execution.json` and its two
output streams. `EXPECTED.md` was written before every rehearsal/probe execution.

Recorded commands, each run once in this order:

```sh
node verification/restore-recheck-20261013/capture-command.mjs npm-ci npm ci
node verification/restore-recheck-20261013/capture-command.mjs build npm run build
node verification/restore-recheck-20261013/capture-command.mjs normal node --experimental-test-module-mocks --import ./test/pricebookTestEnv.mjs --test --test-reporter=tap test/backupRestoreRehearsal.spec.mjs
node verification/restore-recheck-20261013/capture-command.mjs intentional-verifier node verification/restore-recheck-20261013/run-intentional-probes.mjs
```

The recorder only captures the exact child command's stdout, stderr, status,
signal and timestamps. The normal child command is the requested unchanged
`node --experimental-test-module-mocks --import ./test/pricebookTestEnv.mjs --test --test-reporter=tap test/backupRestoreRehearsal.spec.mjs`.

The final command runs both existing modes once, sequentially. Their complete
argument arrays, actual disposable source paths, child PIDs, timestamps,
statuses and signals are in `intentional-results.json`. Its verifier assertions
and injections are unchanged. Evidence-only additions are in
`probe-runner-evidence-only.diff`.

The generated probe diffs were created **before** execution with
`git diff --no-index -- test/backupRestoreRehearsal.spec.mjs <actual-disposable-path>`;
status 1 means a recorded difference, not a failed rehearsal. Exact paths and
statuses are in `generated/*.source.json`.

After all three executions and evidence inspection, the only build-generated
tracked change was restored with:

```sh
git diff -- client/dist/index.html > verification/restore-recheck-20261013/build-generated.diff
git restore --source=d38781b35d126f21fed6074844e07d4e9de7c944 -- client/dist/index.html
```

No dependencies were installed or changed while tests were running. No retries,
browser installation, broader suites or production/provider actions were run.
