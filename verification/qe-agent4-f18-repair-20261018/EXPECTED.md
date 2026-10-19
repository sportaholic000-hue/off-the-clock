# F18 repair: expectations recorded before execution and production edits

Base: 03b29925437e73acb24b916ba6e69e5a002dfff1. New branch: codex/qe-agent4-f18-repair-20261018.
Only production files: server/src/quoteScopeDisclosure.js and server/src/voice/voiceQuotePresentation.js. Only workflow change: jobs.test.timeout-minutes 30 to 45.

## Retained evidence
The original read-only review remains byte-for-byte unchanged. original-review-sha256.json records all its files, including the original 76-pass/15-fail TAP, 91-check source, observations and SQLite receipts. The copied review.spec.mjs has identical assertions. Its observations commit field denotes its original base; execution manifests will separately identify the repaired source hashes. The separate unpublished 9af52ddc recovery is not changed by this task.

## Outcomes
- The retained matrix reproduces 76 passes / 15 failures on the base and must pass all 91 checks after repair, with no skips, cancellations or TODOs.
- Valid shared surface exclusions survive non-record optional junk (before/after/between options), empty records and invalid ranges. Valid mixed options must not produce false global exclusions. Genuine additional work, including a caller-declared description matching a surface label, remains genuine.
- Partial receipts with no valid pricing evidence or unusable option containers must retain known exclusions and must not be promoted to ready. Missing or malformed exclusion metadata cannot establish that the whole job is priced. Voice may reject safely, without publishing an amount.
- D15 retains exact saved 221.23–243.35 CAD from valid options surrounded by null, string, boolean, numeric and array junk; no recalculation.
- Saved and live voice reject inverted, negative, non-numeric, missing, non-finite ranges and invalid optional midpoints. Nested first-visit ranges use the same validation. Zero ranges and omitted optional midpoint remain valid.
- Live voice rejects present non-array options containers, including null, object, string, number and boolean; it never silently discards them.
- Valid top-level ranges and every valid option preserve original decimal values, currency, tax, units, written disclosures, first-visit context and exclusions. No full-job total is invented. Private financial fields and internal scope metadata never reach voice.
- Projection on a frozen input, repeated projection, and projection after customer normalization remain stable. Mutating an output must not mutate input or stored receipt JSON.
- Additional uncertainty control, recorded before executing it: valid mixed options plus an invalid record must not falsely claim a shared exclusion or promote the uncertain partial receipt to ready. Both voice projections reject the malformed option record safely.
- Real saved-retry routing returns corrected scope without changing stored JSON or saved identity. Real dispatcher caller history retains qualified valid ranges for D15, safely suppresses invalid ranges, preserves other history and tenant boundaries. Real live getQuote retains mixed option exclusions and separately requested work.

All fixtures are synthetic and explicitly marked. No production data, provider sends, deployment, engine/spec/dependency/selector changes are authorized. Hosted completion requires publication and successful exact-head CI, beyond targeted local passes.
