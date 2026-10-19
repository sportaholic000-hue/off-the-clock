# Authorized route-source fingerprint reconciliation

This checkpoint is a child of the published H2 source commit
`8c34b6c6e984723586ac9a7fe9c38fa6e212da25`. Its exact-head hosted results must
complete before H2 qualification is claimed. The final handoff identifies the
new SHA, its own run, completed gate counts and individual-name verification.

## Exact authorization and scope

The user authorized only the `src/voice/productionVoiceRuntime.js` SHA-256 entry
in `verification/tenant-isolation-20261007/route-sources.json` to change to
`5ceb2387f1b9bf6987292991caf6a7de98653f057664fad262e3e0b46f2fa655`, plus preserving
the failed run and completing verification. The other 25 source inventory entries
are byte-for-byte unchanged. No inventory was regenerated.

This is the only existing file modified relative to the published H2 parent.
The production repair, all test assertions, route coverage, middleware expectations,
selectors, prices, approvals, historical fixtures, F2, dependencies, specifications
and workflow are unchanged. The test job retains its 45-minute timeout.

## Preserved failed run

`voice-failed-hosted-39311667129/` preserves the previous exact-SHA test and Docker
logs, fetched run/job/ref metadata, count and individual-name audit, proposed patch,
and handoff report. Its reports are historical snapshots from before authorization;
their descriptions of the then-unapplied patch remain intact. The included manifest
was checked against every copied file.

That run belongs only to `8c34b6c6e984723586ac9a7fe9c38fa6e212da25`:
https://github.com/sportaholic000-hue/off-the-clock/actions/runs/39311667129

Its strict result was 6,070 tests, 6,066 pass and four failures: the source review
assertion in each server mode and their two parents. Full, checker and audit were
skipped. Browser 12/12, build and Docker passed. The failed run is not qualification
evidence for this child.

## Executed tenant matrices

The existing `test/tenantIsolationRoutes.spec.mjs` was rerun unchanged after the
authorized one-line update:

```sh
node --experimental-test-module-mocks --import ./test/pricebookTestEnv.mjs \
  --test-concurrency=1 --test --test-reporter=tap test/tenantIsolationRoutes.spec.mjs
```

`tenant-matrices-authorized-01.json` and its raw TAP record **270 tests, 270 pass,
zero failures, cancellations, skips or TODOs**. Both named server-mode parents and
both `every runtime registered route is covered; new and removed routes fail`
children pass. That unchanged child performs route coverage, source inventory and
middleware equality assertions sequentially. Passing it in each mode demonstrates
that the middleware assertion previously prevented by the source mismatch ran and
passed. No assertion was removed, bypassed or intercepted.

`voice-fingerprint-review.json` records the exact source/fixture hashes, preserved
guard inputs and passing names. Production and H2 test file hashes still match the
published source checkpoint.

## Exact-head hosted acceptance

No normal tests were added or altered in this child. Expected totals remain
6,070 strict and 7,761 full, including all 60 H2 names once in full and zero in
strict. Those totals are expectations until the new commit's hosted run finishes.

The existing `voice-verify-hosted.py` remains unchanged. It compares every passing
name and multiplicity to the verified combined source at
`04df35cd8e9ced136ef611cfc2b25f2de64c21bf`, adds the 60 H2 names only to full, and
requires exact-head run/jobs/ref agreement and complete successful required gates.
Its legacy output field named `parent` denotes that comparison base; the final
child handoff records the actual immediate parent separately as `8c34b6c6...`.
No passing ancestor is used to qualify a newer head.
