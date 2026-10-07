# Three follow-up repairs — hosted checks passed

Verified source/test commit: `2879f2560e3ae2ee2d4a38c41c401c1da49487f3`.
[Hosted run 37596037228](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/37596037228)
passed cold installation, both production builds, **2,597/2,597 strict quote
checks**, **3,624/3,624 full-suite tests**, the empty-failure checker and the
production dependency audit (zero vulnerabilities). Both test summaries have
zero failures, cancellations, skips and TODOs. Browser conflict reconciliation
and mulch unit-change tests pass in the hosted browser. Application/test/CI
source is unchanged in this result-recording checkpoint.

This is a bounded repair checkpoint, not a clean bill of health for the project.
Base: `9720aaef7677b7d864363a417cd823c816477dde`, on
`codex/audit-small-repairs-20261007`.

1. **An old interview screen cannot overwrite a newer saved price.** Every
   manual save now carries the revision it actually displayed. Missing or stale
   revisions are rejected. The screen preserves the unsaved answer, loads the
   current draft, and requires an explicit choice followed by another read-back
   and confirmation. Other newly saved answers and confirmations survive.
2. **Mulch quantities state the right units.** The form and confirmation summary
   distinguish bed area in square feet from mulch volume in cubic yards. Changing
   the method clears the old quantity. Review measurements use the selected unit.
   Stored field names and all price formulas remain unchanged.
3. **Imported website prices retain adjacent conditions.** Single-price div and
   section blocks preserve nearby day/minimum conditions; bounded plain-text
   paragraphs preserve following conditions. Neighboring offers stay separate.
   Oversized adjacent-condition blocks are omitted and partial coverage disclosed.

## Evidence

Expected amounts and behavior were recorded in `EXPECTATIONS.md` before running
the new regressions. Against the unchanged base, eight new checks yielded one
passing arithmetic control and seven reproduced failures. After repair, the
focused run passed **291/291**, zero failures/skips/cancellations/TODOs. It covers
the new checks, actual HTTP interview saves, interview normalization, existing
scope confirmation, monetary controls, website transport/extraction, display,
voice, previous repairs and architecture checks. Both production app builds pass.

Local Chromium exits with SIGTRAP before browser assertions run. This is recorded
as a failed local browser launch, not a passing or skipped browser test. The
existing browser suites now cover conflict reconciliation in both directions and
mulch unit changes; hosted full-suite verification is required for their result.
Compressed baseline, focused, build and local browser-launch logs are retained.

The first hosted follow-up run, [37595006058](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/37595006058),
rebuilt both apps and ran 2,597 strict checks: 2,595 passed, two failed. An older
test that evaluates the extracted confirmation handler lacked its new conflict
state binding. The saved-answer browser assertion also read the numeric input
before its React effect restored the external value. The harness now supplies
the component's state, and the browser test waits for the expected visible value
while retaining its value/save assertions. Application source is unchanged by
this test correction. Local follow-up checks passed 36/36, and the successful
hosted run above verifies both corrected cases. The failed run is not counted
as a passing gate.

The previous five-repair source at the base SHA passed hosted run
[37592728250](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/37592728250):
2,585/2,585 strict quote tests, 3,612/3,612 full-suite tests, both production builds,
and zero production dependency vulnerabilities. That result is for the base;
it is not evidence that the new source has already passed hosted checks.

## Limits

Phone confirmation bound to selected scope, stylesheet-based hidden website
content, saved quote links, exact arithmetic for general receptionist listed
prices, and the other platform/workflow findings remain outside this batch.
The website extractor is bounded and does not claim arbitrary layout/CSS support.
No price formula, live data, deployment or main merge changed.

The active agent made and verified all source changes personally. A read-only
helper started earlier was stopped when the owner prohibited subagents; it made
no source changes. No further delegation was used.
