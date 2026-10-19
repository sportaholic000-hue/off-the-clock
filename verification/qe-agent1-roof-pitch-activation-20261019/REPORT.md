# AP01/AP02 roofing pitch activation repair

Branch: `codex/qe-agent1-roof-pitch-activation-20261019`
Pinned sole parent: `2b452feeb1af7c288c19b12bea5b95e48b81920e`
Production: only `server/quote-engine-vnext/priceBook.js`, six added/two removed lines. Engine stays **v12**. No pricing formula, rate, policy, approval, client, specification, selector or workflow changes. No subagents.

## Repair

Readiness previously tested unknown pitch unconditionally and over-12 whenever either adjustment existed. Those optional unpriceable requests suppressed supported known-pitch work. Readiness now tests over-12 only when both adjustments are present (explicit zero is present), and unknown only when its configured band is among the complete bands. Structural validation still independently rejects null/malformed/negative settings.

Every existing standard-band, mixed-area, footprint, maximum area/layers, fee, allocation, product and financial-pipeline probe remains. This does not substitute one successful scenario for comprehensive readiness. A separate overflow control proves that an unsafe complete optional steep band blocks activation, and that a safe small quote cannot override an unsafe maximum-size probe.

Pricing/validation still reject selected unknown pitch without its allowance, and positive over-12 work missing either adjustment. Zero over-12 area does not select that work. Incomplete sibling products and tiers remain isolated. F2 below-one signed-adjustment policy remains unresolved and untouched.

## Reproduction and independent arithmetic

`EXPECTED.md` was written before execution. Original low-pitch fixture:200000 labor +110000 purchased field material +60000 removal +1000 installed-area underlayment +20000 disposal = **391000 cents**. The before-01 run captured the original four failures using actual HTTP save, starting-value confirmation, explicit approval, catalog, durable widget submissions and actual voice tools. The fifth base control passed.

The same exact original audit case definitions were rerun, without changing prior evidence. `audit-161-delta.json` proves that only four results changed; the other157 are identical. Both original low-pitch fixtures are now discoverable and quote391000 cents through saved widget and actual voice. The two unsupported selected-scope fixtures remain review-only, now reachable through the available service.

## Completed local verification

| Verification | Completed result |
|---|---:|
| Original 20-service audit, unchanged161 cases |161 matched /0 mismatched|
| Expanded roofing HTTP + saved widget + actual voice matrix |61 matched /0 mismatched|
| Final focused regression suite |1045 passed /0 failed, skipped, cancelled or TODO|
| New normally selected tests (included in1045) |113 passed|
| Owner app and widget build |both passed|

The expanded matrix covers each missing adjustment, both absent, complete positive and accepted zeros; known, unknown, whole-roof and measured mixed-pitch zero/positive steep areas; complete/incomplete allowance targets; inherited/explicit tier options; incomplete sibling products at2 and11 products (ordinary4-pair and large121-pair paths). Direct readiness also checks1/2/11 products through full and quick paths, malformed structures, shared fee failures and boundary overflow.

All222 audit/matrix cases performed explicit approvals and saved durable widget receipts, remained hidden before approval, kept their books unchanged during quoting and made zero provider sends. The original audit invoked162 getQuote calls and the expanded matrix61 (in addition to matchService discovery calls); original3 unavailable repair-limit cases are the existing documented M03 behavior, unchanged. The expanded matrix has44 priced and17 review outcomes on both widget and voice. Two additional actual HTTP lifecycle checks confirm ordinary save preserves the approval; a price edit makes approval stale; stale catalogs/voice stay unavailable; fresh stale widget requests review; old widget receipts replay unchanged; quotes never renew approval.

## Authentic historical receipts

`historical-v12.json.gz` captures six real pre-edit scenarios on the pinned source, with the uncompressed SHA256 recorded separately. Frozen data includes priced and review widget submissions and actual priced/review getQuote receipts (including narration/idempotency rows). Tests restore the captured timestamp and compare original complete stored rows and public results, including after ordinary save and stale edits. Formerly hidden matchService results were read-only discovery responses, not durable receipts; their availability is intentionally corrected, and no fake historical voice quote is claimed for those blocked services.

All original pre-edit evidence and failed harness/test logs remain. before-regressions.tap records new-harness URL/capture-ID errors; before-regressions-02.tap and before-readiness.tap preserve pre-fix failures. Capture before-02 is retained; before-03 recaptured the missing-measurement scenario with distinct genuine call IDs for replay in one test database. No production change occurred between captures.

## Hosted verification and limits

The final handoff must identify the exact published commit and its completed GitHub Actions CI run. Required checks are strict quote, full suite, browser, build, Docker startup, checker and production dependency audit. Their authoritative logs are attached to the immutable commit in [branch Actions runs](https://github.com/sportaholic000-hue/off-the-clock/actions?query=branch%3Acodex%2Fqe-agent1-roof-pitch-activation-20261019). A local result is not a hosted-gate claim. Hosted conclusions are reported after observation in the final handoff; this source-bound report intentionally does not predict them.

This is synthetic HTTP/tool verification, not a live phone call or deployment. No local Chromium or Docker pass is claimed. Original historical fixtures, prior audit evidence, existing tests/assertions and engine versions are unchanged. No integration/main writes, force push, tag, deployment or live provider messages.
