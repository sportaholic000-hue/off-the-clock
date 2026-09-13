# QuoteDone application prerequisite checkpoint

**The authorized application workflow remains incomplete.** No authenticated customer workflow is marked passed. The real server cannot start with the available locked native dependencies. This checkpoint preserves completed independent repairs and executable evidence while that prerequisite is resolved.

- Branch: `codex/quotedone-application-completion`.
- Authorization/start: `51e5125297a58ca75695120fee0d20dbebb1ca07`, clean new branch worktree. The preserved original worktree remains on `codex/pricebook-integrity-20260912` at `eb79953faad059314071ae5f364770e41838a05a`, clean.
- Tested source: `59fad82357d95f1bef8dd96dd0176160c3d3ba61`. The later report/artifact commit contains documentation and evidence only; verify its source directories against this SHA.
- Frozen engine tree: `dcd481193b10c3cfc667cb23d22fb41b16322cff`; all 19 files unchanged. No engine formulas, owner rates, markup limits, zero classifications or display rules changed.

[Download the complete evidence ZIP](evidence/59fad823-prerequisite-checkpoint.zip) · [Workflow ledger](status.json) · [Authorization](START_HERE.md)

## Working behavior established, and its limits

| Requirement and reproduced defect | Correction and evidence | Limit |
|---|---|---|
| START_HERE §2: failed writes preserve saved data. A forced partial write against the original save function truncated the accepted owner book to 23 characters. | `server/priceBookService.js`: serialize first, write/flush an exclusive sibling temporary file, then rename; propagate failures and clean only that attempt's temporary file. Partial write, replacement failure, serialization failure and corrected-save controls pass. Full old/new objects and actual file bytes are in `checkpoint/complete-store-replay-objects/full-store-results.json`. | Actual JSON persistence function with explicit OS fault injection. No authenticated HTTP or application restart claim. Atomic replacement is not a claim about survival of every storage/power failure. |
| START_HERE §2: old preview responses cannot overwrite the current draft. All four contract-field browser cases failed against exact original source: old 200/400 replaces B, old completion clears loading, old success replaces invalid-current review. | `client/src/pricebook.jsx`: invalidate old effects, clear stale ready state, guard success/error/finally, include current revision and lock state. Four browser controls pass; unchanged focus/blur remains unchanged. Full requests, responses and React state are recorded. | Actual React/Chrome, explicitly intercepted transport. This does not establish authenticated current-revision server behavior. |
| START_HERE §4: original independent assets must remain exact. Windows checkout converted the original script to CRLF, so its manifest rejected it before execution. | `.gitattributes` preserves that single script's original bytes. No fixture/runner content diff. Exact-byte check passes; a one-byte mutation still fails before execution. | Repository checkout correction, not a pricing repair or dependency change. |

The pricing fixture retains its original SHA-256 `379dae9ef699fc16080bc1ae4f02e3c4368dcd02a6ff69995710c5a43a6b10d4`; decompressed cases retain `1f9b5df82e52e980c49c908f7050872b613b18c0c8bfaa4f907bbaa1d7aca5b5`.

## Source and regression files changed

1. `client/src/pricebook.jsx` — stale preview lifecycle.
2. `server/priceBookService.js` — atomic saved-book replacement.
3. `test/pricebookPreviewFreshness.browser.spec.mjs` — four full-state ordering controls.
4. `test/pricebookPersistence.spec.mjs` — four persistence/failure controls.
5. `test/precisionFixtureIntegrity.spec.mjs` — exact-byte and one-byte tamper controls.
6. `.gitattributes` — original fixture byte preservation.

Delivery-only files: this report, `status.json`, and the evidence ZIP. Original precision fixtures/runner, engine files, production route source, package/lockfiles, GitHub Actions and BUILD_STATUS have no content changes.

## Commands and actual results

Exact executables, working directories, process-local environment, starts/ends, exits and hashes are in each JSON beside the full log. All post-commit records below identify `59fad82357d95f1bef8dd96dd0176160c3d3ba61`.

| Command | Actual result | Evidence inside ZIP |
|---|---|---|
| `node verification/quotedone/run-precision.mjs .` | 22/22, exit 0 | `checkpoint/original-precision.log` |
| `node --test test/pricebookPersistence.spec.mjs test/precisionFixtureIntegrity.spec.mjs test/priceBookIntegrity.spec.js test/pricebookPreviewFreshness.browser.spec.mjs` | 31/31, exit 0 | `checkpoint/focused.log` and full browser objects |
| Existing `npm test` via the installed npm CLI | 430/430, exit 0 | `checkpoint/ordinary.log` |
| `node node_modules/vite/bin/vite.js build client --outDir <external evidence>/client-dist` in source-matched disposable copy | exit 0 | `checkpoint/client-build.log` |
| `node ../replay-quotedone-store.mjs .` | complete-object persistence replay, exit 0 | `checkpoint/complete-store-replay.log` |
| Existing `node --test test/priceBookEditor.browser.spec.mjs` | 15/15, 19 scenarios, exit 0; before source commit, identical source hashes independently bound | `prior-worktree/existing-editor-regressions.log`, screenshots and saved/request objects |

The ordinary command includes all three VNext suites plus existing legacy/tenant/Phase 2 regressions. The separate old isolation gate was preserved but not executed in this checkpoint; no passing integration gate is claimed. No Phase 0 or other phase gate ran. An authorized future bridge still requires its separate integration-boundary gate.

Independent expected results were written before the fixes in `prior-worktree/EXPECTED.md`. The original 22 cases cover safe-domain boundaries, $200.01 exact output/minimum display and 1,200% markup ($100 eligible cost + $1,200 markup = $1,300). They remain engine regression evidence. The $0.0049/$0.0050/$0.0051 sequence corresponds independently to $49/$50/$51 for 10,000 square feet with neutral factors; existing editor/component controls retain the decimal inputs. No new authenticated per-service arithmetic coverage is claimed. The browser ordering tests' synthetic $50 payload is an ordering control, not a calculated price.

## Exact environment prerequisite

Runtime: `C:\Program Files\nodejs\node.exe`, Node 24.13.1, Windows x64, module ABI 137. Locked SQLite: better-sqlite3 11.10.0. The committed/canonical binary is Linux ELF, SHA-256 `d7d9272b12d11c1dc2bb787741b1b7c4037d336155f316ace3420410c28fda37`, and its original load error is `ERR_DLOPEN_FAILED: ... is not a valid Win32 application`. The binary's own ABI was not established because the format is rejected first.

1. Authorized disposable-only restore: `node ../prebuild-install/bin.js --verbose` from the locked SQLite package. Exact v11.10.0/Node-v137/win32-x64 release URL returned HTTP 404; exit 1.
2. Authorized disposable-only rebuild: installed node-gyp 12.1.0, existing Python 3.12.14, exact Node 24.13.1 headers. Exit 1: `Could not find any Visual Studio installation to use`. Read-only checks found no installed C++ compiler/VS toolchain at the checked standard locations. No compiler was installed.
3. After correcting the disposable copy, `node server/src/server.js` with isolated synthetic DATABASE_PATH/PRICEBOOK_PATH, console email and an omitted random test secret exits 1 at `server/src/db.js:14`: `Could not locate the bindings file`. It did not reach a listening authenticated server. The earlier incomplete-copy startup timed out and is retained as an inconclusive setup attempt, not an application defect.
4. Independent locked bcrypt 5.1.1 probe also exits 1: its ELF binary is not a valid Win32 application. SQLite authorization did not authorize restoring bcrypt; no bcrypt repair was attempted.

**Smallest outside-authorization prerequisite:** an already-approved compatible verification environment for the recorded runtime and locked SQLite/bcrypt packages, or an explicit extension authorizing the specific missing tooling/runtime-artifact repair. START_HERE §1 permits only SQLite restoration/rebuild with already-installed approved tools. Installing C++ tooling or repairing the other native package is outside that record. No further pricing, markup or engine business decision is being requested.

## Runtime artifact accounting and setup corrections

Canonical project/dependencies remain untouched and clean. All runtime attempts occurred in the external disposable copy. The failed SQLite rebuild removed its incompatible disposable binary and wrote its own downloaded headers/cache; `runtime-artifacts.json` enumerates every observed SQLite/cache change (2,728 cache files), with hashes. Machine-specific binaries are not in this ZIP or commit.

Already-installed, lockfile-matching client runtime files (lucide-react 0.468.0, @esbuild/win32-x64 0.25.12 and @rollup/rollup-win32-x64-msvc 4.62.2) were reused only in the copy; 3,527 file hashes are recorded. No package version/lockfile change or new package install occurred.

The initial disposable-copy filter mistakenly excluded dependency-internal `dist`/`data` directories. That caused a missing Vite CLI module error. Restoring 1,206 missing committed files corrected the copy; the manifest records every path/hash and zero mismatches. The npm build script's Unix-only `.bin` shim was not replaced; its Windows `vite is not recognized` failure is retained, and the identical installed Vite JS entrypoint successfully built the client. Early browser attempts likewise failed module resolution before test execution; explicit resolution of existing libraries corrected that. These are setup attempts, not application or numerical regressions.

All 85 non-dependency application/test/verification/package/workflow source files in the disposable copy were SHA-256 compared with the committed candidate: zero mismatches. Protected remote branches were compared against the starting record and remained unchanged. No telephony/provider operations, live data/migrations, GitHub Actions changes, deployment or merge occurred.

## Remaining workflow work

Owner-approved VNext price-book semantics and saved-service-ID adapter; trusted response permissions; actual authenticated owner/staff/customer/cross-tenant matrix; customer-safe quote/review route; complete durable lead and quote records; tenant-scoped idempotency with changed-content and concurrency controls; owner lead retrieval/actions; real preview revision controls; process restart proof; every supported adapter and wholly review-only lead path; integration-boundary verification; full authenticated acceptance rerun. None is replaced by the passing component suites. Current legacy route behavior has not been declared acceptable.

## Artifact interpretation

`checkpoint/` contains post-commit executions and source binding. `prior-worktree/` retains starting state, exact pre-fix reproductions, evolving-worktree component runs and environment attempts; its old local directory name was the starting SHA, not a claim every run used unchanged starting source. Use its per-command/compiled-source hashes. `source/` contains the 85 compared non-dependency source files; `authorization/` contains committed governing documents. `MANIFEST.json` hashes every packaged file. No prices, IDs, approvals or statuses were normalized. Generated synthetic revisions/IDs are retained and asserted against the returned/saved objects. Random startup authentication secrets were omitted.
