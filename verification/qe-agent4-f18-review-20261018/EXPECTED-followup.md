# Minimal reproduction expectations (before follow-up execution)

The 91-check matrix has already run at the target SHA. These smaller probes
isolate its findings without changing the original probe or expected outcomes.

1. Instant receipt with `options: [null, "invalid", Saved]`, where Saved has
   low 221.23, high 243.35 CAD and skippedAddons ["Door sides"]: saved voice
   retains the valid option/range (the existing D15 compatibility control).
2. Put that same estimate inside a historical PARTIAL_ESTIMATE_READY receipt
   with generated global Door sides additional work: customer presentation and
   saved voice must keep PARTIAL_ESTIMATE_READY and Door sides. Live voice may
   reject the malformed option without returning a quote.
3. A saved option with low 300, high 200 is invalid: live rejects it; saved voice
   should reject it or omit it, never publish the inverted range. This is an
   existing validation asymmetry, not an assertion that F18 introduced it.
4. An estimate with valid top-level low 221.23, high 243.35 but an object-valued
   options container is malformed: both voice projections should reject rather
   than silently omit that option structure. Record actual behavior exactly.

For all four, repeated output/rejection and serialized input must be unchanged.
The primary matrix's expectation hashes, inputs and output evidence remain intact.
