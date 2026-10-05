# Independent verification and final QP-05 repair — October 4, 2026

**All five original findings have passing acceptance checks at code checkpoint
`5e2ea7647d46241fc365bb2184422ae4c905cb06`.** This follow-up verified the four
functional fixes in PR #23, reproduced its remaining original performance
failure, repaired that failure, and added the reproductions to the strict quote
gate. It does not claim exhaustive proof of defect-free software or deployment
readiness.

Candidate: `codex/quote-audit-ready-20261004`, [PR #24](https://github.com/sportaholic000-hue/off-the-clock/pull/24),
stacked on PR #23 at `6eb6622d746c0f1a16a3cfdc002930409f403b05`.
Only `server/quote-engine-vnext/priceBook.js` changes production behavior in this
follow-up. Dependency files, runtime paths, financial calculations, original
specifications and historical reports are preserved.

## Results

| Run | Result | Evidence |
| --- | --- | --- |
| Before repair: original independent reproductions at `6eb6622` | 13 tests; 12 pass, original QP-05 fails | [before-fix.tap](before-fix.tap) |
| After repair: focused acceptance | 35 tests; 35 pass, no failures/skips/cancellations | [acceptance.tap](acceptance.tap) |
| After repair: scoped local regressions | 35 files; 928 tests, 928 pass, no failures/skips/cancellations | [local-regressions.tap](local-regressions.tap), [selected files](local-test-files.json) |
| After repair: differential fixtures against `eda14525` | 65 fixtures, 195 comparisons, zero differences | [differential.json](differential.json), [reproducible comparison](compare.mjs) |
| Hosted CI at `5e2ea764` | 1,106/1,106 strict quote tests; builds pass; broader suite has nine existing allowed failures | [hosted evidence](CI_EVIDENCE.md) |

The 35 acceptance tests are included in the 928 count and in the hosted strict
quote gate. Do not add overlapping totals. The local checkout materializes the
selected source/tests from the pinned repository; hosted CI checks out the whole
repository and runs the complete quote gate, including browser tests.

## Original input, observed improvement and controls

A cold flat-roof catalog has 80 registered existing products and 80 registered
replacement products. Its three price maps contain 500-cent rates, all business
defaults are present, and only `pricing.minimumJob` is removed. The serialized
book is 14,024 bytes. It is synthetic and never uses a live owner account.

Before repair, `bookQuoteStatuses` took **8,820.7 ms** synchronously and a 20 ms
timer fired at **8,826.0 ms**. After repair, the standalone acceptance run took
**7.5 ms**, timer **21.3 ms**; the fresh broad run measured **6.8 ms**, timer
**19.5 ms**. This is the same missing-minimum case, not the missing-fee case
previously substituted by the implementation test. That earlier test now also
uses its stated 80 products per axis.

The repair checks common minimum/accessory requirements, stored Class 2 factors,
unsupported fields and malformed structures on each tier's merged prices, using
the existing contracts before constructing product pairs. Missing individual
map entries remain selection-dependent, preserving valid sibling products. Additional cases
check detailed owner readiness, omitted/null/negative/fractional/string/boolean/
unsafe/object minimum values, explicit zero, valid tier-supplied zero and positive
minima, a bad tier alongside a valid inherited tier, the pitched-roof minimum,
and incomplete product pairs alongside a valid sibling. Eight further cases
cover invalid/missing shared factors, a missing access factor, unsupported fields,
an empty map, a negative rate, a tier repairing a factor, and the shared
pitched-roof accessory mode. Actual quote requests
still receive complete validation.

Independent arithmetic controls: 500,000 cents labor + 550,000 cents membrane
(including the October amendment's 10% waste) + 500,000 cents tear-off =
**1,550,000 cents**. A 2,000,000-cent minimum produces **2,000,000 cents**.
The original five findings' other expected amounts remain unchanged.

An additional boundary check on the first minimum-only repair (`b8e2e046`)
found the same stall with `membraneWasteFactor = -1`: **8,656.7 ms**. The final
`5e2ea764` revision includes the broader invariant checks above and passing
regressions for this case; [additional-before-fix.json](additional-before-fix.json)
records the observed counterexample.

The existing no-live-pair coverage control now uses structurally valid maps with
unconfigured zero prices, retaining its exact 144-pair coverage assertions.
The old empty-map input is a global structure error, now separately tested to
return the root diagnostic promptly without generating useless duplicate pair
rows. No failure allowance, skip, or gate-selection exclusion was added.

## Reproduce

Use Node 22 and the repository's locked dependencies. The new acceptance file is
automatically selected by the existing import-based gate; the gate and its
known-failure policy were not weakened.

```sh
node --test test/quoteAuditAcceptance20261004.spec.mjs
# Equivalent dated entry point:
node --test verification/independent-followup-20261004/verify.mjs
npm run test:quote
```

For the exact local subset (browser installation is not required for this run):

```sh
node --input-type=module -e 'import fs from "node:fs"; import {spawnSync} from "node:child_process"; const files=JSON.parse(fs.readFileSync("verification/independent-followup-20261004/local-test-files.json","utf8")); process.exit(spawnSync(process.execPath,["--test","--test-concurrency=1",...files],{stdio:"inherit"}).status ?? 1);'
```

For the differential comparison, prepare a separate checkout of
`eda14525dca5c25f15ac9e9f005343cc9ec172ee` with its locked dependencies:

```sh
node verification/independent-followup-20261004/compare.mjs /path/to/baseline
```

The comparison checks full internal results, sanitized customer results and full
owner status, stripping only generated `quoteId` fields. The fixtures are
unchanged between these checkpoints. It does not normalize monetary values,
validation diagnostics, tiers, scope descriptions or readiness decisions.

## Source binding and limitations

[results.json](results.json) records exact counts, timings and runtime.
[source-binding.json](source-binding.json) pins the tested commit and file hashes.
The uploaded production/test blobs were read back by Git tree and matched to
local Git blob hashes. Documentation-only additions after the tested checkpoint
must leave those source blobs unchanged.

The independent harness uses a temporary price-book directory and synthetic
owners, then removes that directory. No production data is read or written.
Local Chromium could not launch in this environment; hosted browser evidence is
reported separately. Live business price data, deployment revision, trade-market
accuracy and unrelated product features were not separately audited. The full
product suite has a pre-existing allowed-failure baseline; it must not be confused
with the zero-failure quote gate.

Repository organization is limited to a root entry point, documentation/review/
verification indexes and a current BUILD_STATUS summary.
Existing source/evidence directories are not moved or deleted. No subagents,
merge or deployment were used.
