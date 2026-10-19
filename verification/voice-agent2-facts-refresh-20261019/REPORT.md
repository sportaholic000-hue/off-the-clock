# H2 — refresh saved public facts in connected voice sessions

Branch: `codex/qe-agent2-voice-facts-refresh-20261019`

Parent: `04df35cd8e9ced136ef611cfc2b25f2de64c21bf`

Scope: the H2 provider/session lifecycle only. This is a separate repair branch,
not an integration, release, or deployment. Work was performed personally, with
no subagents. No prior unpublished H2 branch or worktree was present.

## Reproduction and independent expectations

`EXPECTED.md` was written before production changes. The source was read at
`db1dcb4cb4dedebb59811c390c8fe2ac9a608846`, without merging that history:
`verification/qe-agent4-import-condition-boundaries-20261019/handoff-probes.mjs`.
Its probe and fixture are copied byte for byte in this directory; their hashes
are recorded in `reproduction-source.json`. The initial and final targeted runs
select exactly the two H2 cases. An auxiliary negative-pattern invocation also
ran the three H1 cases, as described below; H1 was not repaired or added to the
normal gates here.

`before-h2-original.tap` records both H2 cases failing on the exact parent. A
connected provider still received `Widget $10 each` after the owner saved either
`Widget $12 each` or an added membership qualification. The real dispatcher
already rejected the stale listing. Three at the newly saved $12 correctly
produced `36.00`, while the connected provider's facts remained $10. That split
was the defect; the arithmetic and stale-request rejection were correct.

## Production changes

| File | Change |
| --- | --- |
| `server/src/voice/productionVoiceRuntime.js` | Supplies an owner-bound revision of saved fact contents to the provider opener. It compares contents rather than audit timestamps, so consecutive saves sharing a timestamp are detected. The existing public prompt projection remains the sole source of provider facts. |
| `server/src/voice/googleGenAiLiveAdapter.js` | Recompiles facts for connection setup and resumption; observes saves during an idle call, on input/provider events, and again when queued output is delivered; serializes refreshes; mutes and clears stale output; drains accepted tool replies and caller transcripts; replaces the connection with the current instruction; retires obsolete callbacks; and closes safely on refresh failure. |
| `server/src/voice/geminiMediaBridge.js` | Schedules shutdown from failed audio, interruption and tool callback queues without returning the shutdown promise into a queue that shutdown itself must drain. This removes the circular wait exposed by a tool-response refresh failure. |

No importer, widget, pricing arithmetic, engine/version literal, F2 rule,
approval mechanism, historical fixture, existing assertion, test selector,
specification, dependency/lockfile, or workflow was edited. The CI test timeout
remains 45 minutes. Generated build outputs are excluded from publication.

### Provider boundary

The locked SDK is `@google/genai` 2.24.0. The installed Session API provides
`sendClientContent`, `sendRealtimeInput`, `sendToolResponse`, and `close`;
it does not provide an in-place `session.update` API. Google's official Live
reference specifies that an open connection's configuration cannot change and
that configuration other than the model can change when pausing/resuming:

- https://ai.google.dev/api/live
- https://ai.google.dev/gemini-api/docs/live-api/session-management

The repair therefore sends the freshly compiled system instruction in an actual
replacement `live.connect` configuration. It reuses the same call's resumption
handle when available. Without a handle, it seeds a fresh connection with a
bounded set of already received same-call transcripts and already delivered
public tool results. Those results are explicitly historical context, not new
authorizations or orphan function responses. Refresh does not repeat the opening
greeting. A delayed obsolete connection cannot supersede a later saved revision.

The idle interval is one second; active paths also check freshness at receipt
and delivery. Old queued telephony audio is cleared before refreshed speech or
queued caller input proceeds. Accepted function responses drain to the provider
that requested them before replacement. The normal close path permits that
drain, while continuing to reject new caller audio during close.

## New regression coverage

All **60** new normal cases have unique `voice H2` names, listed in
`voice-required-names.json`. They use the existing selectors and are selected
in the full suite and excluded from strict quote selection.

| New spec | Cases | Evidence covered |
| --- | ---: | --- |
| `test/voiceAgent2FactsRefresh20261019.spec.mjs` | 35 | Changed amounts; added, removed and replaced qualifications; removed and unchanged listings; idle detection; consecutive/delayed saves; resumed and cold connections; retired output; multiple queued messages and audio parts; pending tools; normal close; delayed transcript persistence; bounded context; revision/compiler/connect/timeout/continuation/clear failure; owner isolation. |
| `test/voiceAgent2FactsRefreshProduction20261019.spec.mjs` | 23 | Actual owner-save HTTP route, SQLite, signed Twilio incoming requests, real media WebSockets, captured provider connection/message arguments, and the real dispatcher. Includes stale tool-ID reuse, same-timestamp content changes, resume, cold replacement, failure/fallback, telephony write failures, two owners and two calls for one owner. |
| `test/voiceAgent2FactsRefreshHistorical20261019.spec.mjs` | 2 | Genuine incoming priced and review-only v12 receipts replayed before and after actual saved-facts refreshes. Entire frozen quote, submission, idempotency and narration rows remain equal, as do prices, metadata and approval records. |

The historical artifact is read unchanged and checked against its incoming
SHA-256 file. Its captured account state is restored after the captured billing
evidence is inserted, because the users-insert trigger correctly denies service
before that evidence exists. Synthetic phone provisioning enables a separate
new call; receipt contents and original quote calls are not regenerated.

The HTTP fixtures hold the audit timestamp equal only in explicit collision
controls. All public content still comes from the real save route. The save
body deliberately supplies a foreign owner ID, and the authenticated owner
binding wins. Other-owner data, handles and caller transcripts remain isolated.

## Verification and preserved failures

Command receipts record actual exit codes, summaries, log hashes, and, for final
runs, hashes of all changed production/test source files. No failed evidence was
overwritten. The following development evidence is deliberately retained:

- The two original H2 failures on the exact base.
- A restricted test-child startup failure that did not execute individual tests.
- The initial slow-tool queued-output race, then separate-message and multipart
  delivery races, and a pending-clear ordering failure.
- A final-transcript regression caught while adding delivery freshness checks.
- Fixture errors: an attempted connection was incorrectly treated as an opened
  provider; an empty argument was expected to pass required-field validation;
  an underscore-containing synthetic listing was incorrectly assumed eligible
  for multiplication; and historical-owner setup initially lacked restored
  captured billing status/unique phone provisioning. Production validation was
  not changed to accommodate those assumptions.
- The incomplete `combined-regressions-01` run, stopped after diagnosing its
  shutdown hang; it has no successful complete summary. The focused
  `response-failure-before-01` run records the same queue-cycle timeout.
- Delayed caller-context persistence and accepted-tool close-drain failures,
  plus an initially ineffective WebSocket fault-injection hook. The hook was
  moved to the actual `handleUpgrade` callback; no production failure behavior
  was relaxed.
- `original-controls-final` accidentally included the three H1 importer-boundary
  probes because its negative name pattern matched the parent file name. All
  three H1 probes failed; the two H2 cases, 14 F16 cases and 91 F18 checks passed
  in that 110-case run. The failures and diagnostics are preserved. Positive H2
  selection and separate F16/F18 invocations record clean, independent results;
  no test or selector was edited to hide the H1 finding. The F18 script's initial
  untracked outputs were moved into this owned evidence directory; no incoming
  tracked evidence was overwritten.

`focused-final-02` passes **60/60**, with zero failures, cancellations, skips or
TODOs. `lifecycle-final-02` passes **88/88** unchanged neighboring cases.
`rendered-controls-01` passes **47/47** A2/A3, widget and required browser
controls. `build-final-01` succeeds. `combined-regressions-final` passes
**1834/1834** across 46 files, with zero failures, cancellations, skips or TODOs.
It includes all 60 H2 cases, all 525 geometry cases, all 874 retained parser/import
cases, the normally selected 14-case F16 entry, A1 approval and A2 precision/
metadata regressions, F18, privacy and historical-receipt controls. The final
unmodified-probe and direct F16/F18 receipts also accompany this report.

The exact base's hosted run is
https://github.com/sportaholic000-hue/off-the-clock/actions/runs/39292378154:
strict **6070**, full **7701**, required browser **12**, with successful build,
Docker smoke, checker and production dependency audit. Those results qualify
only the base. With the 60 additional voice cases and unchanged selectors, the
candidate's expected totals are strict **6070** and full **7761**; a difference
must be investigated rather than concealed or forced by editing tests.

`voice-verify-hosted.py` compares the final hosted logs to the base logs. It
requires the final run, both main jobs and rechecked remote to name the exact
final SHA; all gates must complete. It checks every retained base passing name
and its multiplicity, every H2 name once in full and zero times in strict, zero
unsuccessful tests, Docker smoke, checker and final production audit. The final
SHA/run link and completed hosted counts are supplied in the handoff after this
commit's own CI finishes; passing parent evidence is never used to qualify it.

## Limits

These tests inspect the arguments delivered at the Google client boundary and
exercise actual application HTTP, database, dispatcher and WebSocket paths with
synthetic providers. They do not establish live Gemini acceptance, real spoken
model behavior, live Twilio delivery, latency under production load, or an
end-to-end live call. No customer data or live provider calls were used.

Cold continuity is deliberately bounded to 24 transcript/public-result turns
and 32 KiB. It cannot reconstruct opaque provider state or audio that was never
transcribed before the old connection ended. Omitted history is labeled and
the continuation requires missing details to be asked for rather than guessed.
Already played speech cannot be recalled; queued stale output is cleared and
subsequent old output is suppressed. A refresh may pause speech while accepted
tools drain and the provider reconnects. Failure uses the existing fallback and
preserves its usage protections. This branch does not resolve unrelated F2 or
the separate import-condition H1 issue.
