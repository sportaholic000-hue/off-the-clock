# Phone-end boundary for missing-duration recovery

Base: `94c0d63f7eace16eac4c97f5a95712eb443118d6`.

The recovery selector uses `calls.completedAt` for eligibility, ordering and the
seven-day give-up origin. An AI-leg metering completion cannot make an open
fallback eligible or consume a retry/give-up record. All existing tenant binding,
GET-only recovery, duration confirmation and billing exclusions are preserved.

`EXPECTED.md` was written before execution. `BASE.tap`: 11 tests, 1 ordinary-call
control passed and 10 fallback regressions failed (blank-line trailing whitespace normalized). `AFTER.tap`: 31 passed, including
all 11 new regressions and all 20 tests in the unchanged existing recovery file.

The shared synthetic call helper now explicitly records phone completion for a
completed fallback, consistent with its completed provider receipt. Live-fallback
regressions clear this field and retain the AI-leg end time deliberately.
`test/billingCalls20261009Recovery.spec.mjs` is byte-for-byte identical to the base
(SHA-256 `7dab49893aa90445108ebbc2cd5f0e2a338c7fea36021ced014e504f424a494f`). No owner-facing wording or quote arithmetic changed.

Commands (Node 22):

```sh
node --test test/durationFallback20261009.spec.mjs
node --test test/durationFallback20261009.spec.mjs test/billingCalls20261009Recovery.spec.mjs
```
