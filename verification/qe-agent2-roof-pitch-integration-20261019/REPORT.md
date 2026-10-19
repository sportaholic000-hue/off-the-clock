# A1 roofing activation integration checkpoint

Requested branch: `codex/qe-agent2-integration-checkpoint-20261019`.
The requested merge preserves these ordered parents:

1. `00523290be44c522254e2e736756d0a6eba0aba3`
2. `17701c5c20563be2c59607e3391bb6fccb0e97c6`

The source was prepared personally, with no subagents. This report records
completed local and incoming-source checks before publication. Complete final
hosted conclusions belong to the exact merge's GitHub Actions run and final
handoff; this report does not use an incoming or parent run to qualify the merge.

## Histories, scope and conflict handling

The merge base is `c743f6febdf9b758fea87545d2b930731cfb9b70`.
There are no overlapping changed paths and no merge conflicts. No manual
production or regression resolution was necessary.

The second-parent history contributes the A1 activation audit
`2b452feeb1af7c288c19b12bea5b95e48b81920e`, the accepted repair
`150aa4786c0f96b2eb612bf6e02c19fd423cfb74`, and its source-qualification
correction `17701c5c20563be2c59607e3391bb6fccb0e97c6`.

Relative to the first parent, the incoming history changes 145 paths:
one production file, three regression files, and 141 evidence files.
Production is solely `server/quote-engine-vnext/priceBook.js`; its accepted
six added/two removed lines control activation's optional pitch probes.
The three unchanged incoming spec files are:

- `test/qeAgent1RoofPitchActivationChannels20261019.spec.mjs`
- `test/qeAgent1RoofPitchActivationHistorical20261019.spec.mjs`
- `test/qeAgent1RoofPitchActivationReadiness20261019.spec.mjs`

All other new integration files belong to this verification directory. They
record independent expectations, execution, preservation and name checks.
The existing integration name auditor is imported unchanged; the new wrapper
adds the 113 A1 names and expected combined totals. No selector is changed.

The preservation manifest checks all **3,859 inherited paths** against the
appropriate parent blobs. Incoming production, tests, failed evidence and genuine
historical captures remain byte-identical. Parser/import code and evidence,
PI-00, A2 money metadata/precision, the combined F16 approval guard, A3 rendered
presentation, F18, frozen receipts and existing assertions are preserved.
Both engine literals remain `quote-engine-vnext-geometry-20261019-v12`.
The test job timeout remains **45 minutes**. Rates, formulas, tax rules,
owner approvals, dependency files, specifications and F2 policy are unchanged.
The separate voice-facts repair and additional A3/A4 history are not included.

## Explicit incoming-source qualification

The following command passed from the combined checkout:

```sh
node verification/qe-agent1-roof-pitch-activation-20261019/qualify-source.mjs 2b452feeb1af7c288c19b12bea5b95e48b81920e 17701c5c20563be2c59607e3391bb6fccb0e97c6
```

This qualifies only A1's named source range. The combined tree is not treated
as an A1-owned source delta. The separate qualifier regression suite passed
**5/5**, including unrelated-checkout isolation and rejection controls.

Incoming exact-head [CI 39270877598](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/39270877598)
completed successfully at `17701c5c20563be2c59607e3391bb6fccb0e97c6`.
Its logs show 6040 strict, 7094 full and 12 dedicated browser passes, zero
unsuccessful test outcomes, successful builds/Docker/checker and zero production
dependency vulnerabilities. All **113 A1 passing names occurred once in each
main gate**. `incoming-qualification.json` records exact job-head bindings;
`incoming-a1-name-audit.json.gz` records every individual occurrence.

## Completed combined local verification

Node **22.23.3**, repository lockfile dependencies, Playwright **1.56.0** and
official Chromium **141.0.7390.37**. Tests used disposable synthetic storage and
the actual local application/widget/voice paths with no live provider sends.

| Check | Actual passing result |
|---|---:|
| A1 roofing plus all retained parser/import regressions in one run | 987/987 |
| A1 cases within that combined run | 113/113, each name once |
| Parser/import cases within that combined run | 874/874, each name once |
| Geometry boundaries, delivery and genuine historical cases | 525/525 |
| A1 approval plus A2 precision/metadata and direct F16 dependency | 94/94 |
| Normally selected F16 integration entry | 14/14 |
| F18 regressions | 41/41 |
| Original unchanged F18 matrix | 91/91 |
| PI-00 activation, delivery and historical regressions | 45/45 |
| Activation neighbors | 177/177 |
| Compatibility, separate-line rounding and zero-adjustment controls | 491/491 |
| A3 rendered wording/confirmation and A2 editor controls | 5/5 |
| Source-qualification regressions | 5/5 |
| Original complete activation audit | 161/161 matched |
| Owner app and widget build | Both passed |

All completed successful runs report zero failures, cancellations, skips and
TODOs. Counts overlap; they are not a summed coverage claim. Commands and raw
compressed TAP logs are recorded by `run-local.py`, execution receipts and
`evidence-archives.json`. All retained name groups were checked individually.

The unchanged original 161-case audit produces results identical to the accepted
incoming repaired audit, including all four original AP01/AP02 cases. Both
known low-pitch fixtures remain **391000 cents** on direct, saved-widget and
actual-voice outputs. Their unsupported selected unknown/over-12 controls
remain review-only with empty amount arrays on all three channels. Explicit
approval is still required; stale edits do not silently renew approvals, and
authentic historical priced/review receipts replay unchanged.

`original-161-execution.json` records the four explicit control rows. The
archive retains all 162 generated wire/log records with byte and decompressed
content hashes. No earlier evidence was overwritten. The copied original
F18 matrix is byte-identical to the earlier integration's matrix; only its new
output location differs.

## Initial local setup attempts retained

The first restricted qualifier process exited before individual cases were
reported; `source-qualification-tests-initial.tap.gz` is retained. Running with
workspace temporary storage and required process access passed all five cases.
Two full Chromium installation attempts hit the installer's stale-lock error.
Official headless-shell installation, the actual launch probe and all rendered
regressions then passed. These failed setup logs remain in this directory.

A preliminary Playwright installation that disabled package-lock use resolved
unrelated local package versions. Before application testing, `npm ci` and the
exact CI Playwright command restored the locked environment. No dependency or
lockfile change is included. `environment-setup.json` identifies every attempt.

The complete staged whitespace check returns exit 2 for **274 original
whitespace warnings in four incoming failed TAP logs**. All four blobs exactly
match the accepted incoming source and are retained verbatim. Production,
regression files and this integration's new evidence pass their whitespace
check. `diff-check.json` records the distinction and preserves the original
complete diagnostic output; no failed evidence was reformatted.

## Final publication and hosted acceptance requirements

Recheck the target immediately before publication. Use a non-forced update with
the expected first-parent head. If another writer advanced the target, preserve
that work and publish this same ordered-parent candidate to a unique review
branch instead.

The final exact merge must complete strict, full, dedicated browser, build,
Docker, checker and production dependency-audit gates. Expected totals from
this exact base are **6040 strict / 7671 full**. The unchanged selector currently
selects 289 strict files and 359 full files. A count difference requires
investigation, never a test or selector change to obtain the expected number.

`audit-hosted.mjs TEST_JOB_LOG EXACT_MERGE_SHA` preserves the prior integration
name checks and additionally requires every A1 name once in strict and full.
It also checks all 874 parser/import names once in full, all 577 incoming voice
names absent from strict, the 116 punctuation names, 41 F18 full-only names,
525 geometry names, 45 PI-00 names, F16 and all retained rendered, zero and
historical compatibility groups. The one pre-existing masked synthetic URL
name requires its unchanged adjacent passing names and consecutive local TAP
numbers; all other names must match literally.

This remains an integration checkpoint. F2 policy is unresolved and unchanged.
No main merge, deployment, force push, tag, other-agent branch write, additional
A3/A4 integration or voice-facts change is part of this work.
