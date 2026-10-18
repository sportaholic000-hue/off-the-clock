PASS — seven new adversarial voice-correction sequences pass. No application contract violation reproduced. Test-only review branch; not release/audit clearance.

# Voice quote correction sequences — 2026-10-18

## Filename-only selector repair

Follow-up starts at `741aa8fe9afb2a36ff7a7eb8f3035b3e7325dc90`. Hosted run `39101002709` on that commit ran all seven sequences successfully in the strict quote gate, but the gate failed two existing assertions because the filename `test/qeVoiceCorrectionSequences20261018.spec.mjs` did not begin with the selector's reserved `test/voice` prefix. No selector or existing assertion was changed.

The test was renamed to `test/voiceCorrectionSequences20261018.spec.mjs`. Its contents remain byte-for-byte identical: SHA-256 `b838e1892339addc35498927da8ac3c2c5fb43c46f56c652b22341fb08ae3ee4` before and after. `selection-before-repair.json` preserves the prior record; `selection.json` records both actual selector states and their list digests.

The actual exported selectors report:

- `allSpecFiles`: 328 files before and after; the old path is replaced only by the new path, which remains included.
- `quotePricebookSpecFiles`: 267 files before and 266 after; only the old misnamed voice file leaves the strict quote selection, and the renamed file is excluded.
- Reconstructing each previous array from the current array reproduces the recorded previous SHA-256 digest, proving no other file changed selection.

Required focused command:

```sh
node --experimental-test-module-mocks --import ./test/pricebookTestEnv.mjs --test --test-concurrency=1 --test-reporter=tap test/auditFixes20261003.spec.mjs test/quoteEngineVNextRepairs.spec.js test/voiceCorrectionSequences20261018.spec.mjs
```

Local Node 22.23.3 result: **209 tests, 209 pass, 0 fail/cancel/skip/TODO; exit 0, signal null**. All seven voice-correction sequences ran as tests 203–209. New command, result, stdout and stderr are preserved as `selection-repair-focused.*`. The original `first-run.*`, `final-targeted.*`, `assertion-correction.diff` and their historical old-path commands/results are unchanged.

This follow-up changes no production code, selector, runner, workflow, dependency, specification, test body, expected price or known-failure list. Exact-final-commit hosted results are supplied in the chat handoff after CI completes; they are not preclaimed in this source checkpoint.

Base: `1857b7779b83b70f7753b41b72c3677270cd4ffc` (isolated checkout).
Branch: `codex/qe-voice-correction-sequences-20261018`.
Main observed before publication: `ed12dca1253a8790c885b071ab6037e05632bea0`; no main write or merge.

## Coverage and independent results

`EXPECTED.md` was written before the first execution. The saved-book `publish` helper is reused. Its `phone` helper is deliberately not used: each affected scope field is selected and confirmed explicitly, rather than automatically confirming all returned tokens.

| Sequence | Observed result |
| --- | --- |
| Scope token issued at 200 sqft, dimensions corrected to 250 | `customerConfirmed:false` denied without saving; fresh structured confirmation quotes $1,065; persisted input is 250 |
| Add four narrow steps; subsequently change width to the wide package | Missing stair confirmation denied; narrow scope $1,152; stale narrow token denied for wide scope; explicit wide token $1,332 |
| Confirm laminate, then change to hardwood | Original $852; laminate token denied for hardwood; newly presented plywood scope $1,940; original replay still $852 |
| Change saved-book material rate during the call | Old handle denies new 250-sqft request; rematched handle plus old token also denied; current token quotes $1,335 at revised rate; original receipt still replays $852 |
| Borrow handle and token across calls | Borrowed handle denied; own handle plus borrowed token denied; own confirmation produces separate $852 receipt correctly linked to the second internal call row |
| Change services within the same call and unchanged book revision | Borrowed first-service token denied even though underlayment description is identical; second-service token quotes $1,072; first receipt unchanged |
| Repeat tool ID versus fresh corrected request, then replay both | Same ID/args replays; changed confirmation or dimensions with reused ID denied; fresh ID quotes corrected $1,065; original and corrected receipts replay independently without extra rows |

Expected values and observed values match for every executed amount. `EXPECTED.md` also works out the unused revised-rate 200-sqft control ($1,068); that extra arithmetic row was not executed and is not counted as coverage.

Every denial asserts `needs_details`, no quote handle/estimates/options, and unchanged quote/submission counts. Every correction/replay checks original complete SQLite submission and quote rows remain unchanged. A second readonly database connection verifies committed records, not just an in-memory mock. The synthetic database is removed on cleanup; no database snapshot is claimed as preserved. Original TAP includes receipt/quote SHA-256 fingerprints and bounded tool status/amount/count observations.

Actual fake Google session configs and every provider-visible response are checked recursively for private pricing, rates, calculation, owner/service identity and receipt-internal keys, including rate-path text. This is targeted projection regression coverage, not a proof against every possible future textual leak. All new fixtures assert zero fake Twilio writes.

## Original failure and diagnosis

First execution: **7 tests, 6 pass, 1 fail; exit 1, signal null**. The cross-call test incorrectly compared `quotes.callId` directly with provider `CallSid`. It had already observed the expected denials and two correct quotes. `quotes.callId` is the internal `calls.id`; production creates distinct internal call-row UUIDs. This is a test-author linkage error, not an application failure.

Preserved original source: `first-run.spec.mjs.txt`; original stdout/stderr, command and result: `first-run.*`; exact correction: `assertion-correction.diff`. The assertion now joins `calls` by owner and internal ID before comparing CallSids. All original amount, denial, immutability and count assertions remain. No production code changed. The helper source is unchanged between these executions.

No deliberately failing application reproduction was created because no application contract defect was reproduced. The original erroneous test source is archived as text outside normal selection, not advertised as a production-defect reproduction. No known-failure exemption or selection change was made.

## Validation

Runtime: **Node v22.23.3 / npm 11.9.0**, Linux. `npm ci`: exit 0, 328 packages installed; original installation stdout/stderr preserved. Toolchain installed outside the repository. No manifest or lockfile changes.

First command (after expected values were written):

```sh
node --experimental-test-module-mocks --import ./test/pricebookTestEnv.mjs --test --test-concurrency=1 --test-reporter=tap test/qeVoiceCorrectionSequences20261018.spec.mjs
```

Final command:

```sh
node --experimental-test-module-mocks --import ./test/pricebookTestEnv.mjs --test --test-concurrency=1 --test-reporter=tap test/qeVoiceCorrectionSequences20261018.spec.mjs test/voiceQuotePathRegression20261005.spec.mjs test/voiceLifecycle20261006.spec.mjs test/voicePersistence.spec.mjs test/quoteEngineLeftovers20261007.spec.mjs test/quoteDeliveryBatch20261015Gates.spec.mjs
```

Final result: **168 tests, 168 pass, 0 fail/cancel/skip/TODO; exit 0, signal null**. Includes all seven new regression names and 161 existing tests. Do not sum the first and final executions as distinct coverage. Exact commands, timestamps, outputs and status are in `final-targeted.*`. `capture.mjs` only captures local subprocess evidence; it performs no provider/deploy actions. The original selection observation is retained in `selection-before-repair.json`; the follow-up result is in `selection.json`. `tested-sources.json` binds current tested source and expectations to SHA-256 hashes.

NOT RUN: full `npm test`, full `npm run test:quote`, frontend build/browser, Docker, live model/ASR/phone/provider checks. This assignment changed only backend test/evidence files; targeted regressions were used. Hosted CI was not yet checked when this report was authored; no hosted success is asserted here.

## Contract limits and decisions

- No SHARE finding from these sequences.
- Scope tokens sign selected scope presentation plus service/call/revision, not every numerical measurement. A still-applicable scope token can accompany corrected dimensions with a fresh structured `customerConfirmed:true`. No requirement for transcript inference, universally one-use tokens, or automatic revocation of historical receipts was invented.
- Scripted transcripts and scripted fake-provider callbacks enter the real production voice runtime and dispatcher. They demonstrate orchestration and persisted receipts, not model comprehension, speech recognition, real spoken consent or live telephony.
- No production fix, quote arithmetic change, dependency/workflow/spec/public-page edit, external message, live provider request, deployment, merge or tag.

## Inspection and changed-file boundary

Read `AGENTS.md`, `specs/BUILD_STATUS.md`, relevant flooring and voice requirements, `test/voiceQuotePathCases20261005.mjs`, `test/voiceLifecycle20261006Fixture.mjs`, `test/quoteDeliveryBatch20261015Fixture.mjs`, existing scope/receipt/persistence cases, and runtime scope binding, dispatcher, receipt replay and schema paths. Key source references: `server/src/voice/voiceQuoteContract.js`, `server/src/voice/voiceToolRuntime.js`, `server/src/voice/toolDispatcher.js`, `server/src/voice/productionVoiceRuntime.js`, `server/src/schema.js`, `server/scopeConfiguration.js`.

The original commit added `test/qeVoiceCorrectionSequences20261018.spec.mjs` and this verification directory. The follow-up changes only that test's filename and the current evidence records; production code, selectors, runners and pre-existing tests remain unchanged. `sequenceFixture.mjs` contains synthetic owner fixture data, explicitly selected scope confirmation helpers, public projection assertions, disk-backed lifecycle setup and bounded diagnostics.

Publication/readback is verified after committing; the final chat handoff supplies the exact remote SHA. `SHA256SUMS` inventories every deliverable other than itself. No real credentials are present; fixture handles and private receipt contents are omitted from diagnostics by design, not reconstructed or retroactively redacted from execution logs.
