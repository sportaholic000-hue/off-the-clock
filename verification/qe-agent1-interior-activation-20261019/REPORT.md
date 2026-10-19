# PI-00 interior painting activation repair

Branch: `codex/qe-agent1-interior-activation-20261019`.
Exact starting integration: `e50c9f58459a4362537eb5da5dc1cf082fbc3ca8`.
A3 evidence read: `9c69eead93a58dbf31ccf64e1f16598055af58c1`.
Personal work; no subagents, merge, deployment, live data or provider writes.

## Reproduction and repair

Before editing server code, reused A3's actual authenticated HTTP probe on the
exact starting integration. Actual save, explicit starting-value confirmation,
approval and public catalog retrieval reproduced current owner approval with
`NEEDS PRICING`, invalid `customerInputs.trimCoats` and
`customerInputs.trimSurfaceCondition`, and an empty public service catalog.
`before/` retains the first run; `before-durable/` repeats it and also retains
the genuine approved internal book. Each contains source binding, result,
finding and full compressed request/response wire evidence. The capture script
refuses another HEAD or modified server source.

Only production change: `server/quote-engine-vnext/configuredOfferings.js`.
The trim contract compares optional structured owner coat/condition values
only when that individual value exists. An absent optional setting cannot
contradict a valid customer answer. Normal customer type/range/required checks,
explicit owner constraints, owner validation, selected-price requirements and
option isolation all remain enforced. Descriptions remain opaque; no setting,
price, preparation, coat count or owner confirmation is inferred or written.

This restores eligibility and validation, with no arithmetic or amount change
for a previously valid quote. The approval rule documented in
`specs/QUOTE_REAUDIT_REPAIRS_20261006.md` permits retaining the engine version
for such repairs. Both existing version literals remain v12. Current receipts
are preserved; stale/unapproved configurations do not become approved. Real
owner edits still require explicit reapproval. F2's below-one signed-adjustment
policy remains unresolved and outside this repair.

## Independent expectations and coverage

`EXPECTED.md` was written before executing comparisons. Original installed
fixture: 500 sqft × 600c walls + 200 sqft × 300c ceilings + 100 LF × 200c trim
= **380000 cents**. Walls-only **300000**, walls/ceilings **360000**,
walls/trim **320000**. No new markup or coat multiplier applies to installed
prices.

45 new test results across three uniquely named regression files cover:

- Four scope combinations and all nine absent-setting customer coat/condition
  combinations; the description's words never become structured settings.
- Each explicit trim constraint independently, matching and contradictory
  answers, malformed owner/customer values, required answers, missing wall
  prices, selected/unselected missing extras and isolation of a complete tier.
- The original captured approved blocked book becomes live with identical
  settings/receipt; actual HTTP save/confirmation/approval/catalog and absence
  from catalog before approval or after an owner edit.
- Fresh saved widget and actual voice-tool correctness for five positive cases
  and four negative cases, preserving submitted measurements and private rates.
- Genuine v12 receipt replay before/after ordinary save, owner content edit and
  explicit reapproval: exact amounts, wording and entire historical durable
  rows remain unchanged. Both original and new voice tool-call IDs are checked.

`historical-v12.json.gz` contains genuine full-scope and wall-only widget/voice
receipts captured before the repair on the starting integration (380000 and
300000 cents). `historical-v12.sha256` binds the original uncompressed capture.
The capture uses actual application save/approval and actual runtime tools,
with legacy starting-value retention explicitly performed by the established
fixture helper. It does not fabricate historical result payloads. Frozen older
fixtures are untouched.

## Verification and retained failures

- Initial new-test attempt: **33/41**, eight failures. One null customer input
  correctly required a missing answer instead of an invalid-value diagnostic;
  five delivery cases mistakenly sent an unsupported height field; two replay
  cases collided with newly generated synthetic call IDs. The fixture setup
  and exact diagnostic assertion were corrected, historical tests isolated in
  their own file, and all original receipts preserved. `focused-initial.tap.gz`.
- Corrected initial coverage: **41/41**. `focused-second.tap.gz`.
- Expanded local regression attempt: **772/780**, eight failures. Four new
  negative widget cases lacked a synthetic booking policy; four existing A3
  browser cases could not launch because local Chromium was unavailable.
  Booking setup was corrected. Browser tests/selectors/skips/gates were not
  changed. `focused-regressions.tap.gz` preserves the complete failed run.
- Final non-browser focused regressions: **776/776**, zero failures, skips,
  cancellations or TODOs. `focused-final.tap.gz` includes
  all new cases, all 287 original arithmetic comparisons plus 203 extensions,
  v12 widget/voice geometry and genuine v11 historical replay, F16 precision
  and approval/adoption boundaries, F18 saved/voice sod disclosure, existing
  offering/surface controls and accepted-zero/separate-line-rounding controls.
- Local owner/widget build passed: `build.log`. Generated client output was
  restored; no client source/output is included in this branch.

The final published SHA must complete the unchanged hosted strict/full/browser,
build, Docker startup/health, known-failure checker and production dependency
security gates before handoff. This report is prepared before publication;
exact-head CI conclusions and actual counts are supplied with the final
verified SHA, not asserted here ahead of execution. No workflow, dependency,
selector, skip, specification, existing test or other owner's production file
was changed.
