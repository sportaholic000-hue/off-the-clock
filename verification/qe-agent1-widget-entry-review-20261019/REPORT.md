# A1 widget-entry review

All 120 new rendered checks passed at af0fd1c. No product defect reproduced.
Final exact-head broad gates are pending at this evidence publication.

Branch: `codex/qe-agent1-widget-entry-review-20261019`.
Base: `04df35cd8e9ced136ef611cfc2b25f2de64c21bf`.
Preserved test-only checkpoint: `59d5c282ad8d88be0cce6d59eff2c6fb207d41d2`.
True merge: `915f8e711e078f453c99255484b5bdf8abb8ad39`, with those two commits
as its ordered parents. Production remains identical to the requested base.

The new test loads the unchanged production `widget.js` and built
`widget-app.js` on a separate synthetic host. The production asset handler
serves the files, and public requests reach actual disposable application
HTTP handlers. No intercepted response, prefilled browser storage, injected
React state or direct calculator substitutes for the wizard interaction.

Each service uses its own saved, confirmed and explicitly approved book. Each
viewport starts a new Chromium context with empty cookies/local/session storage.
The driver first leaves one required answer blank, submits for review, chooses
Change details, enters all fixture answers through visible controls and obtains
a priced receipt. Desktop is 1440×1000. Mobile is 390×844 with touch/mobile
enabled and also requests separate additional work; the result must disclose
partial scope without inventing a whole-job total. Original final requests are
replayed unchanged through real public HTTP; response, receipt, saved quote,
row counts, book and approval must remain unchanged.

## Coverage matrix

This is one documented representative saved configuration per service, not an
exhaustive sweep of every material, tier, optional selection or measurement mode.
The inherited tests continue to cover corrections and stale confirmations.
A3’s loader retry/race assignment is not duplicated. F2 is outside this review.

| Service | HTTP missing/valid/replay, both scopes | Desktop loader/wizard | Mobile loader/wizard |
|---|---|---|---|
| ROOFING_REPAIR | 6/6 | 3/3 passed | 3/3 passed |
| ROOFING_REPLACEMENT | 6/6 | 3/3 passed | 3/3 passed |
| FLAT_ROOF_REPLACEMENT | 6/6 | 3/3 passed | 3/3 passed |
| FLAT_ROOF_REPAIR | 6/6 | 3/3 passed | 3/3 passed |
| INTERIOR_PAINTING | 6/6 | 3/3 passed | 3/3 passed |
| EXTERIOR_PAINTING | 6/6 | 3/3 passed | 3/3 passed |
| FLOORING_INSTALL | 6/6 | 3/3 passed | 3/3 passed |
| FLOORING_REPLACEMENT | 6/6 | 3/3 passed | 3/3 passed |
| FENCING_INSTALL | 6/6 | 3/3 passed | 3/3 passed |
| FENCING_REPLACEMENT | 6/6 | 3/3 passed | 3/3 passed |
| SIDING_REPLACEMENT | 6/6 | 3/3 passed | 3/3 passed |
| SIDING_REPAIR | 6/6 | 3/3 passed | 3/3 passed |
| CONCRETE_DRIVEWAY | 6/6 | 3/3 passed | 3/3 passed |
| CONCRETE_PATIO_SLAB | 6/6 | 3/3 passed | 3/3 passed |
| LANDSCAPING_CLEANUP | 6/6 | 3/3 passed | 3/3 passed |
| LANDSCAPING_MULCH | 6/6 | 3/3 passed | 3/3 passed |
| LANDSCAPING_SOD | 6/6 | 3/3 passed | 3/3 passed |
| LANDSCAPING_PLANTING | 6/6 | 3/3 passed | 3/3 passed |
| LANDSCAPING_MOWING | 6/6 | 3/3 passed | 3/3 passed |
| CUSTOM | 6/6 | 3/3 passed | 3/3 passed |

The independent formulas and exact cents were written in [EXPECTED.md](EXPECTED.md)
before comparisons. Supplemental HTTP results are 120/120 and actual hosted Chromium checks are
120/120 at af0fd1c (40 browser sessions × three checks). No product defect
reproduced in this matrix. Complete HTTP evidence is in the lossless preflight
bundles. The complete rendered evidence is preserved in
`hosted-checkpoint-03.bundle.json.gz`: 185 JSON files containing all saved books,
owner actions, catalogs, requests, responses, original receipts, source hashes,
and 1,272 observed wizard steps. `hosted-checkpoint-03-summary.json` provides
the 20-service matrix and per-file SHA-256 hashes. Chromium:141.0.7390.37;
Node:v22.23.3. Each of the three stages passed 40/40, with zero page errors.
Successful screenshots were taken during execution but are not retained in
the compact hosted bundle; step traces and paired visible scope assertions are
retained. Failure screenshots are included when available.

## Evidence and limits

[FAILED-RUNS.md](FAILED-RUNS.md) preserves the initial fixture error and local
Chromium failures. The short test key was corrected using the real owner access
creation handler. No customer-facing defect is inferred from that harness error.

The merge-only checkpoint passed all hosted gates with 7,795/7,795 full-suite
tests and zero failures/skips/cancellations/TODOs:
[run 39309190478](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/39309190478).
That validates the merge baseline, not the new widget journeys.

Current source under hosted test: `af0fd1c6118a19b2917eff53d7f3f2f5e5507c52`,
[run 39314728750](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/39314728750).
Build, the existing 12/12 browser gate and Docker passed at this source.
Strict/full/checker/dependency-audit results remain pending at publication.
The evidence-only final head must independently pass every required gate;
its exact SHA and run results are reported in the handoff. Pending or skipped
gates are never counted as passes.

Only new A1 tests/evidence are added. No production, existing assertions,
selectors, workflow, version, price, approval, specification or dependency change;
no integration/main write, force push, deployment or subagent.

## Reproduce

With repository dependencies, Playwright 1.56 and its Chromium installed:

```sh
npm run build
node --test test/qeAgent1BlankWidgetEntry20261019.browser.spec.mjs
```

The unchanged strict/full selectors include this test. For an uncompressed
persistent run, supply a new output directory:

```sh
node verification/qe-agent1-widget-entry-review-20261019/browser-entry.mjs . /absolute/new-output-directory
```

Extract an archived invocation without overwriting any evidence:

```sh
python3 verification/qe-agent1-widget-entry-review-20261019/extract-evidence.py verification/qe-agent1-widget-entry-review-20261019/hosted-checkpoint-03.bundle.json.gz /absolute/new-extracted-directory
```

The two earlier failed hosted bundles remain alongside the passing bundle.
No failed case was skipped, accepted as passing, or removed from the 120 required
assertions. The final evidence publication changes no executable test or production
bytes from the passing af0fd1c source.
