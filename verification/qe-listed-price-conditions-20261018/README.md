# Listed-price condition repair — October 18, 2026

Repository: `sportaholic000-hue/off-the-clock`.
Base: `c1817621f6eccb31822979bf994efc4902682d34`.
Branch: `codex/qe-listed-price-conditions-20261018`.
Work performed personally, with no subagents or live provider actions.

## Reproduction and repair

`before-direct.json` records all five reported conditions calculating $30 for
quantity 3 at the exact base, before production edits. The original parser
treated condition clauses as product names. Quantity confirmation establishes
neither a condition nor eligibility for a conditional price.

The repair refuses logical, temporal, eligibility, uncertain-price and ambiguous
prepositional qualifications, including qualifications inside the item label.
NFKC normalization is used only for qualification detection, including a
full-width IF; the saved text and monetary representations stay untouched.
Ambiguous labels take the existing verbatim-listing review path rather than
releasing an amount. The existing product-number classifier and entire
arithmetic/rounding/currency tail are unchanged.

`EXPECTED.md` records the policy and hand-calculated positive controls. The new
regressions run both the direct parser and the actual dispatcher, runtime,
tenant-scoped saved knowledge lookup, input validator and result projector.
They cover qualifiers before/after prices and inside labels, in-store and
account-holder conditions, Unicode/case,
multiple sentences, composite units, product-number names, word boundaries,
exact decimals, half-up ties, rounding wording, currency, draft rejection,
saved identity, duplicates, foreign tenant listings and confirmation. Listed
calculations/refusals assert no business-data writes.

## Local results — Node 22.23.3

| Check | Actual result |
| --- | --- |
| Cold `npm ci --no-audit --no-fund` | Passed, 328 packages |
| Final regression file on pristine base | 206 tests: 82 passed, 124 failed |
| Final regression file on repaired source | 206/206 passed |
| Focused file and six neighboring suites | 339/339 passed |
| Owner app and widget `npm run build` | Passed |
| Existing test selectors | Full includes new file; strict excludes it |
| Failures/skips/cancellations/TODOs on repaired checks | 0/0/0/0 |

The baseline run uses the final regression file copied into a detached worktree
of the exact base; no original production code or assertions were altered.
Raw TAP evidence is gzip-compressed in this directory. The initial local
environment lacked writable `/tmp`; final checks use a writable temporary
directory via `TMPDIR`, with no application or dependency workaround.

Focused command:

```sh
node --test test/voiceListedPriceConditions20261018.spec.mjs
```

Neighboring command:

```sh
node --test test/voiceListedPriceConditions20261018.spec.mjs test/engineAuditListedPrices20261008.spec.mjs test/claudeListedUnits20261008.spec.mjs test/voiceCore20261007.spec.mjs test/voiceSecurity.spec.mjs test/voicePromptCompiler.spec.mjs test/voiceQuotePath20261005.spec.mjs
```

The existing CI workflow runs hosted cold installation/build, dedicated browser
regressions, strict quote, full suite, failure checker, dependency audit and the
voice-enabled Docker startup smoke. Exact final pushed-SHA hosted results and
run links are reported directly in the task response after completion; this
local evidence checkpoint does not claim a hosted result in advance.

Production ownership is limited to `server/src/voice/listedPriceCalculation.js`.
No engine versions, specifications, selectors, workflows, dependencies or
existing test assertions were changed. No main merge, deployment or force push.
