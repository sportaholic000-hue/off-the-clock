# A3 customer-widget request races and recovery

Status: reproduction in progress; no product repair or final acceptance claimed.

Branch: `codex/qe-agent3-widget-recovery-20261019`.
Requested base: `04df35cd8e9ced136ef611cfc2b25f2de64c21bf`.
Work performed personally, without subagents, main merge, deployment, or live
customer/provider operations.

## Scope and contract

This assignment concerns CustomerQuote request ownership and recovery, not the
previously completed dependent-field repairs. Production changes are limited to
`client/src/quotedone.jsx` and `client/src/quoteSubmission.js`; all other additions
are uniquely named tests/evidence. Existing tests, server code, specifications,
workflows, approvals, pricing formulas, dependency manifests and v12 are retained.

Read: AGENTS.md, BUILD_STATUS.md, quote-engine specification (including current
range/mowing and amendment rules), platform widget/privacy/link rules, current
public routes, submission/intake contracts, existing A3 coverage and strict/full
test selection. No new UI labels or product policy are introduced.

## Method and independent expectations

[EXPECTED.md](EXPECTED.md) was committed before executing the new cases. It
records hand calculations for $160 original mowing, $270 corrected mowing,
$215 revised-rate mowing and $400 cleanup. Its original revised-rate display
mistake is retained, with a specification-based correction appended before repair
verification: internal $193.50–$236.50 displays as $193–$237.
The owner setup uses authenticated real save/validate/approve HTTP. Customer
traffic uses CustomerQuote and the production widget transport in Chromium,
the real public HTTP handlers and temporary persistent SQLite storage.

The harness forwards each intercepted POST to the actual server, waits for its
response/commit, then releases or aborts delivery using explicit promises. No
sleep determines the race order. Native catalogue GETs retain Chromium's Fetch
Metadata. No quote/preparation response or calculation is fabricated.

Assertions cover displayed amounts and scope, immutable request bytes on lost
response retry/reload, quote identity, exact stored cents, and counts across
quoteSubmissions/quotes/leads/quoteRequests. Owner revision tests require stale
confirmation rejection, a fresh proof and new rate, then immutable historical
response replay. Changed payloads reusing the old identifier must reject.

## Reproduction record

- `120c2207`: first test-only checkpoint.
- `b2d86e4c`: corrected enum interaction and measurement-method ordering.
  [Hosted run 39302839885](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/39302839885)
  launched Chromium 141.0.7390.37, but the new cases stopped at an origin error
  in the harness. APIRequestContext catalogue GETs dropped the browser metadata;
  the public handler correctly returned 403. All 11 case failures plus their
  parent failure are **harness failures, not product reproductions**. The strict
  gate reported 6,070 passes and 12 failures, with zero skips. Source-bound raw
  results are in `baseline-b2d86e4c.json.gz`, with the TAP excerpt alongside.
- `d4917608`: corrected the exact-cent assertion to use the stored option's
  calculation record. A separate local real-HTTP probe passes for both fixture
  services and records their customer scope and exact cents in `setup/`.
- `6ef93587`: native Chromium catalogue GETs; POST barriers retained; rendered
  text and browser errors added to evidence.
  [Hosted run 39305527431](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/39305527431)
  completed in real Chromium 141.0.7390.37. Strict gate: 6,073 passes, 9 failures
  (8 new child cases plus their parent), zero skips. All 6,070 existing cases
  passed. Source-bound raw evidence is `baseline-6ef93587.json.gz`.

Customer source remains byte-identical to the requested base throughout those
checkpoints.

| Case | Baseline observation |
|---|---|
| R01 | Double prepare/confirm creates one receipt; exact replay preserves it. Pass. |
| R02a/R02b | Lost committed response recovers in place and after progressive-widget reload. Pass. |
| R03/R04 | Held preparation replaces a newer measured-area edit or service selection. Reproduced client defect. |
| R05/R05b/R05c | Correction leaves the old busy lock active, preventing a new preparation. Reproduced client defect; later response-order assertions cannot execute until repaired. |
| R06 | Two same-key widgets share one recovery key; reload replaces A's completed receipt with B's pending request. Reproduced client defect. |
| R07 | Old saved result appears after the public key changes; original pending recovery is overwritten. Reproduced client defect. |
| R08 | Stale proof rejects with 409 and creates no receipt; fresh rate computes 21,500 cents. The next assertion fails the mistaken display expectation described above. Historical replay assertions occur later and require the repaired run. |

## Client repair

Each preparation/save owns a distinct flight object. Edits supersede preparation
immediately, retain the corrected editable draft and permit a new preparation.
Only the current flight can write result/error/cache state or clear its busy lock.
An uncertain save remains immutable for exact retry. Unmounted sessions ignore
late responses; changing public key/cache prefix creates a new session and leaves
the original uncertain request recoverable.

Recovery keys are claimed per mounted instance in `quoteSubmission.js`. Slot zero
retains the existing key for backward compatibility; further same-key instances
receive separate slots. Reload recovery assumes the same instance mount order.
Embedders needing stable identity across arbitrary reordering can supply distinct
existing `cachePrefix` values. This task does not introduce a new identity API.

No server defect was established. Both hosted gates confirmed stale-proof
rejection, exact historical replay and rejection of changed payloads reusing an
identifier. No server handoff or server edit is needed for the exercised cases.

## Verification and preservation

Local Node 24 install failed during native dependency setup. Workspace Node
22.20.0 cold install and both builds passed. The focused existing suite passed
59/59 with zero failures/skips/cancellations/TODOs:

```
node --test test/quoteApplicationBoundary.spec.mjs \
  test/quoteOriginStorage.spec.mjs \
  test/quoteApprovalHistory20261005.spec.mjs \
  test/quoteReleaseStorage.spec.mjs \
  test/qeAgent3WidgetDependencies20261019.spec.mjs
```

Local Chromium startup exits SIGTRAP, including the separate single-process
probe. These attempts do not count as browser passes. Hosted Chromium supplies
the browser evidence. No workflow, runner, known-failure list, or existing test
was altered to obtain a pass. The new spec is selected by both normal gates.

`preservation-baseline.json` records grouped baseline Git blob-list hashes for
246 server files, 428 existing test files, 20 specification files, 14 GitHub
configuration files, other client source, and dependency manifests. Generated
tracked build HTML is restored after local builds.

## Repaired source qualification

Source checkpoint: `32ae0435e87320885d81341a60a1e545e7ad0415`.
[Hosted run 39308396349](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/39308396349)
completed successfully. Node v22.23.3 / Chromium 141.0.7390.37 executed every new
case in both the strict and full gates, with matching source SHA-256 hashes.

| Gate | Result |
|---|---|
| Cold install, real Chromium launch, owner/widget builds | Pass |
| Existing owner alerts/dashboard browser checks | 12/12 pass |
| Strict quote gate | 6,082/6,082 pass |
| Full suite | 7,713/7,713 pass |
| New A3 cases within each gate | 11/11 pass (plus suite parent) |
| Failure checker, production dependency audit, Docker voice smoke | Pass |

Both test gates report zero failures, cancellations, skips and TODOs. Conditional
release-tag jobs are intentionally skipped on this unique branch; no tag, main
merge or deployment was requested or performed.

| Case | Verified behavior in both gates |
|---|---|
| R01 | Same-turn double prepare/confirm sends one request per stage; one receipt; exact replay adds none. |
| R02a/R02b | A real committed 201 is lost; in-place and reload retries send identical bytes and recover the original receipt. |
| R03/R04 | Old responses cannot replace corrected area or service; new displayed scopes/ranges are 10,000 sq ft / $243–$297 and cleanup 1,000 sq ft / $360–$440. |
| R05/R05b/R05c | A replacement preparation starts while the old one is held; obsolete success, real 422 and finally handlers cannot replace or unlock the current preparation. |
| R06 | Same-key forms retain separate completed/pending recovery across reload; exactly two receipt identities; resetting A leaves B intact. |
| R07 | A late saved response cannot enter a replacement public-key session; switching back recovers the original receipt without another save. |
| R08 | Owner rate change invalidates the old proof (409, no receipt). New proof yields $215 / $193–$237; original $160 response and persisted history replay unchanged. Area/contact/service changes reusing the old ID reject with 409. |

Each gate finishes with 13 rows in each of quoteSubmissions, quotes, leads and
quoteRequests, exactly accounting for accepted new requests. Preparations,
rejections and retries create no extra rows. Amount, scope, immutable request,
receipt and historical-response assertions all pass.

Artifacts:

- `repaired-32ae0435-strict.json.gz` and `repaired-32ae0435-full.json.gz`: complete
  source-bound browser requests/responses, displayed text, recovery storage,
  before/after row counts and historical receipt snapshots. Decode with standard
  gzip/JSON tools; data is synthetic and belongs to temporary test databases.
- `repaired-32ae0435-cases.json`: readable case outcomes and receipt counts.
- `repaired-32ae0435-summary.log`: new-case TAP excerpts and overall gate counts.
- `hosted-32ae0435.json`: exact run/head/job/step outcomes.
- `preservation-repaired.json`: all protected baseline files unchanged, including
  428 existing test/client-test entries and v12's original Git blob.

## Exact-final handoff gate

The final evidence commit changes only this uniquely named evidence folder from
the qualified source checkpoint. Its own exact-commit CI must complete before
handoff; the earlier source run is not substituted for that check. The final
handoff identifies the final SHA and its completed run. The current authoritative
status is available in [this branch's CI runs](https://github.com/sportaholic000-hue/off-the-clock/actions?query=branch%3Acodex%2Fqe-agent3-widget-recovery-20261019).
No commit is added after verifying that final run.
