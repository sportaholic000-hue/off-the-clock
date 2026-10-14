# Targeted hosted verification PASS; required supplied-archive review INCOMPLETE

Codex worked personally, without subagents. Both authorized hosted rehearsals passed on their first execution. No unexpected book replacement was observed by their assertions or the inspected traced paths. **SHARE: none confirmed.** The historical cause and the earlier archive's 27 temporary files' preservation provenance remain unresolved. This experiment neither repairs nor explains those observations and is not a CLEAN release-audit vote.

One required input remains unavailable: Personal_Full_Audit_rc-20261013m.zip, expected SHA-256 bc944f6c275caeec5f110e8cc1694f303a1af8bdae14adf622e85ffb02d72a74. It was not available in this conversation's workspace or as an accessible attachment. Its byte identity and contents were NOT REVIEWED; its supplied summary is owner-provided context. The two requested hosted executions and evidence verification are complete.

## Identities and publication sequence

Repository: sportaholic000-hue/off-the-clock.

| Identity | SHA |
|---|---|
| Immutable application commit, separately checked out detached | 95e1631f42461ca8ae7d46d859940bffc302d155 |
| Annotated rc-20261013m object | 7c7e5a9363ed7113ea8969cdd3e400f58b1b538f |
| Tag peel and claude/release-candidate-20261013m branch | 95e1631f42461ca8ae7d46d859940bffc302d155 |
| Remote main checked before publication | ed12dca1253a8790c885b071ab6037e05632bea0 |
| Published pending diagnostic checkpoint | fa50e3842387adcdc0f2fb70e3bed6f24748108c |
| Activated diagnostic/workflow commit actually run | 671141684fe2bf273a606ff4f569dd2cd89c0a21 |

The diagnostic branch codex/restore-isolation-20261014 was absent before creation and starts directly at the application commit. git ls-remote verified the pending checkpoint at 05:05:17.143223 UTC before activation; EXECUTION.json retains the exact command/output/timestamps. Only the activation marker was then added. The final report-only commit is separately identified in the delivery after remote verification and report fetch-back; it does not change or retag the application.

Read AGENTS.md, specs/BUILD_STATUS.md, verification/backup-restore-20261006/EXPECTED.md, verification/restore-recheck-20261013/REPORT.md, the normal rehearsal/helper and existing CI setup. No phase gate passed. Only this new verification directory and .github/workflows/restore-isolation-20261014.yml are added/updated; existing application, tests, assertions, dependencies, workflows, specs and wording are unchanged.

## Hosted preparation and actual outcomes

[Dedicated run 38514792563, attempt 1](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/38514792563), job 115691046670, completed successfully. Inspected the run identity, actual job steps, complete job log, downloaded artifact, TAP outputs and relevant raw trace lines. Diagnostic checkout, detached application checkout, Node setup, bounded capture and artifact publication all succeeded. The earlier pending-checkpoint run was deliberately skipped and executed no rehearsal. Ordinary CI triggered automatically by publication is unrelated and is not new candidate qualification.

Runtime: Ubuntu 24 image 20261004.327.1; Linux 6.17.0-1022-azure, x86_64; Node **22.23.3**, npm **10.9.9**, Python **3.12.3**, Git **2.55.0**, strace **6.8**. GitHub Actions' own action runtime is distinct from the Node 22 application runtime.

Application cwd: /home/runner/work/off-the-clock/off-the-clock/application. Diagnostic checkout: /home/runner/work/off-the-clock/off-the-clock/diagnostic.

npm ci ran 05:05:48.685046–05:05:54.763024 UTC, exit 0/no signal, adding 328 packages. npm run build ran 05:05:54.763506–05:05:59.601191, exit 0/no signal. Original deprecation/large-chunk warnings remain. Build-generated tracked differences deleted two previous client/dist/assets bundles and modified client/dist/index.html; complete binary-capable diffs and status are retained. No source repair was made.

All **545 selected tracked application/test/script/package files** matched tagged bytes before installation, after build and after both executions. Entire tracked build/final diffs were also captured. Executed unchanged source hashes:

- test/backupRestoreRehearsal.spec.mjs: a3be06ce0499d88b8cb3798ec28dcd7df1ceb21debf87a1af85a40323e1309e0
- test/helpers/backupRestoreProcess.mjs: f2696cf4ee6ea4aa1ac6fe3d364f8d9f88252a66f69efc659aed436f5b020f2f

No Node hooks, rehearsal copies, assertion changes, sleeps or retries were introduced.

| Execution | UTC start–end, 2026-10-14 | Tests / pass / fail | Exit / signal |
|---|---|---|---|
| Unchanged normal rehearsal | 05:06:00.431370–05:06:06.161038 | 9 / 9 / 0 | 0 / null |
| Unchanged rehearsal under strace | 05:06:06.443543–05:06:24.999520 | 9 / 9 / 0 | 0 / null |

Both have zero cancelled/skipped/TODO results and empty stderr. No execution was repeated. Fresh TMPDIRs were /tmp/restore-isolation-normal-cre8djn1 and /tmp/restore-isolation-traced-vzlu7gan. Both had empty direct-entry listings after completion. Those are metadata observations, not snapshots or proof of future continuity.

Normal command:

    node --experimental-test-module-mocks --import ./test/pricebookTestEnv.mjs --test --test-reporter=tap test/backupRestoreRehearsal.spec.mjs

The traced execution prefixed the identical command with:

    strace -ff -ttt -T -yy -v -s 256 \
      -e abbrev=execve,execveat \
      -e trace=%file,%process,%desc,%memory \
      -e raw=read,readv,pread64,preadv,preadv2,write,writev,pwrite64,pwritev,pwritev2,sendto,sendmsg,sendmmsg,recvfrom,recvmsg,recvmmsg,getdents,getdents64 \
      -o /home/runner/work/_temp/restore-isolation-evidence/rehearsal.raw --

Exact argv, cwd, allowlisted environment, timestamps, PID, exit and signal are in normal.execution.json and traced.execution.json. Initial rehearsal environment: PATH, HOME, LANG, TZ=UTC, TMPDIR and CI=true, followed by the unchanged harness's synthetic configuration. No full environment or live credentials were dumped.

## Kernel proof and observed writers

Before application tracing, one harmless parent/child capability check ran at 05:06:06.227003–05:06:06.441160 UTC, exit 0/no signal. Child PID **3770**, PPID **3769**, performed the synthetic operations. tracer-proof.raw.3770 lines 859–864 show its path opened as fd 3, a **27-byte write on fd 3**, close, rename, utimensat and unlink. Child identity matches stdout; execve environment abbreviation was checked. No incomplete Node-hook substitute was used.

The application trace contains **94 process/thread files** following the test runner, fixture parent, application children and backup/restore CLIs. Execve identifies rehearsal parent **3780**, backup CLI **3815**, restore CLI **3826**, and recovery children **3846** (invalid JSON), **3855** (invalid structure), **3864** (missing).

Representative original trace references, also retained verbatim in trace-review.json:

- rehearsal.raw.3780 lines 5733–5740: parent opens/truncates the restored owner book and writes **7 bytes** at 05:06:18.107684. statx records size 7, inode **9457291**, device **259:1**, mtime/ctime **05:06:18.107695676**.
- rehearsal.raw.3846 line 19244 through its later observations at line 19553: child still sees size 7 with that inode and those timestamps.
- Parent lines 6085–6092: wait4 confirms child 3846 exited 0, then parent writes **3,140 bytes** at 05:06:20.376983. This is the unchanged fixture's expected cleanup after child shutdown.
- Child 3855's statx observations show the expected **82-byte** structurally invalid book.
- Parent line 6359 deletes the book for the missing case. Child 3864's eight target-path observations, lines 19234 through 19519, return **ENOENT**. Parent lines 6548–6558 cover the later child termination and expected 3,140-byte cleanup write.
- Old-volume book/database/backup contents are removed during the simulated wipe. The restore CLI's expected empty volume/app directory/startup-probe operations are distinct from restoring into volume/restores/synthetic-drill. No old-content reappearance was observed in the inspected paths.

The trace supports attribution of these **expected** operations to the fixture/CLI/application process identities. No unexpected writer was observed to identify. This supplies no retrospective attribution for the earlier local observation.

## Quoting observations and limits

Both TAP outputs record the approved $100 fixture, one quote, two leads, one appointment and two submissions. All three corruption subtests passed their unchanged assertions: owner read 503 for invalid JSON/structure or 409 for missing; fresh quote blocked without estimate fields; historical replay 200 and an unchanged receipt; changed binding 409; health 200; parent/child submission counts remain two and database/book paths match.

These response/count conclusions come from the inspected unchanged assertions and passing TAP, not invented request dumps. The unchanged harness emits full restore-recovery JSON only on failure; neither run failed. Its three existing restore-cleanup JSON records per execution are retained and parsed with stdout line references. Full success-case IPC identities/body hashes therefore are not separately serialized. Raw syscall buffer contents are suppressed to avoid capturing credentials and HTTP bodies.

Final restored-book hashes, each 3,140 bytes:

- Normal: 44cc0e4f18f49266de1ef56d5b72b30182344290f28e515bce27a6d7650a2dec
- Traced: 1398644d1827a73ab5e0b9ac06110e9f8281b07d27e7ee9c3c6c84d22a465d53

## Evidence integrity and limitations

[Hosted artifact 11871315884](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/38514792563/artifacts/11871315884) was downloaded and read back. It contains the runner-produced evidence ZIP and checksum. An identical durable downloadable copy of the inner ZIP accompanies the final handoff.

- Inner restore-isolation-evidence.zip: **4,229,243 bytes**, SHA-256 **e9ee579a044fa27e98b70963acf2731881f163ea2990180171631fb61114dbe1**.
- GitHub artifact wrapper: **4,143,515 bytes**, SHA-256 **6cd6360be0585ac07a937fadbf01a065443f075ebdd4a8435f24cca856ab71fb**.
- ZIP CRCs, all **178 inventory entries**, and the exact **180-entry** allowlist including two manifests were verified. No temporary volume, database, WAL or SHM files are packaged.
- The ZIP retains the pending REPORT.md present when execution began. **This committed report is the completed interpretation**; original execution evidence was not rewritten.
- hosted-job.log, hosted-run.json, hosted-artifacts.json, artifact-verification.json and trace-review.json retain the inspected hosted identity/readback. publication-errors.md preserves the initial git-push authentication failure and a report-authoring patch rejection. Publication used the connected GitHub API.

The earlier original archive remains SHA-256 b4dd3bbc86308b4879f127093fb4ef6a9a09c25ce74b2c84ce2b3f0209ad04d8; the earlier diagnostic archive remains bda2c534f9743dcd9232617904059f4031d187b4a0cbe34920d57ae032ec410e. Their bytes were not changed. No missing historical provenance was reconstructed.

Trace limitations: descendants only, not unrelated processes or a host-wide audit; ptrace changes timing; PID/TID/fd inheritance require raw-trace interpretation; memory-mapped stores are not individually traced; read/write buffers are deliberately omitted. Passing executions do not prove that no external writer exists. No database snapshot was deliberately captured or claimed.

**Decision:** targeted hosted verification PASS; SHARE none confirmed; historical cause/provenance unresolved; required supplied-archive review INCOMPLETE because the attachment was unavailable. Stop after these two runs. No repair, additional campaign, full/quote suite invocation for this task, tag, main merge, deployment, Railway change, live-provider operation, message or SMS. This evidence supplements the existing release gate; it does not replace independent clean audits or authorize merging.
