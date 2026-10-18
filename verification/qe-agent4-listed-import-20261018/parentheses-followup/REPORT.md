# F7 parenthesized-condition follow-up

**Publication and exact-final hosted verification remain incomplete.** Local
regressions and build pass; they do not replace the required hosted gates.

Starting commit: `101f0ae01b7d47fbc74782aec1c49b66088b9b13`.
Branch: `codex/qe-agent4-listed-import-20261018`.

## Reproduction and repair

Expectations and new tests were written before production edits. With quantity
`"3"` and `customerConfirmed: true`, the corrected baseline reproduced both
reported failures through the direct parser and real dispatcher:

| Saved listing | Before, both paths | After, both paths |
| --- | --- | --- |
| Weather (permitting) $10 each | calculated, extendedAmount "30.00" | exact existing needs_review fallback; no extendedAmount or voiceSummary |
| Online (orders) $10 each | calculated, extendedAmount "30.00" | exact existing needs_review fallback; no extendedAmount or voiceSummary |

Only `server/src/voice/listedPriceCalculation.js` changes among existing files.
The bounded weather-permitting / online-order phrase matcher now treats Unicode
punctuation and whitespace as separators, including parentheses, brackets and
quotes. It does not remove intervening words, rewrite saved text, infer
eligibility or alter product-compound exemptions. This remains bounded phrase
recognition, not general natural-language understanding.

The 36 new tests cover both reported failures on both paths, adjoining and
surrounding punctuation, genuine product names, exact saved identity, verbatim
compiled facts, read-only/private-data behavior and unchanged test selection.
Existing Board-on-board, Nail-in, Plug-in, arithmetic, currency and F8 import
assertions remain unchanged and pass in the retained selection. Additional
parenthesized genuine names also calculate exactly $30.00 for $10 times 3.

An initial new-test run contained two incorrectly proposed positive controls
starting with an opening parenthesis, a shape already excluded by the existing
price grammar. Before production edits, those were replaced with admitted
genuine names. The initial test source, expectations and log are preserved as
`initial-controls.spec.mjs.txt`, `EXPECTED-initial-controls.md` and
`baseline-initial-controls-new.tap`; that run is not the behavioral baseline.
No pre-existing assertion was edited.

## Verification

| Check | Result |
| --- | --- |
| Corrected new-test baseline, production unchanged | 20 passed / 16 failed / 36 tests |
| New regressions after repair | 36/36 passed |
| Exact previous 14-file selection | 722/722 passed |
| Previous selection plus new test file | 758/758 passed |
| Build | Passed |
| Existing tracked-file retention | 3,177 of 3,178 files byte-identical; only the owned parser differs |
| Previous test files and verification artifacts | All unchanged; 387 files under test/ and 2,081 under verification/ |
| Arithmetic/currency tail | Byte-identical |
| Local full/strict gates | Not rerun in this follow-up; earlier incomplete runs are not passing evidence |
| Exact-final hosted cold install/browser/build/strict/full/checker/audit/Docker | Incomplete; publication blocked at preflight |

All passing test runs report zero failures, cancellations, skips and TODOs.
Counts overlap; the combined run contains all 722 retained tests and all 36 new
tests. The retained 305-parser regression file remains SHA-256
`e522c4a0f86b30d51578d9e235c25d15e37f715d5b8cbe897c4e410e28d27bc9`.

Raw TAP logs, executable command arrays, source/test hashes, build output,
pre-edit file hashes and final retention comparison accompany this report.
The Node 22.23.3 runtime and writable TMPDIR are outside the repository, as in
the original verification. The build-generated tracked client index was
restored to its starting bytes. No selectors, dependencies, workflows, specs,
engine versions or extraction code changed. The new voice test is selected by
the existing full-suite convention and excluded from strict quote.

## Preserved ancestry and publication limits

The starting commit, merge `c58ca997e9cf63739d399939bcdade83e97874d2`, its
ordered parents `235eb5c978f847c2d47379ae3cf03b52c1f9104c` and
`4f6152413a650085a7fe6002dfd077a542f9c0c2`, and required repository base
`c1817621f6eccb31822979bf994efc4902682d34` were verified as ancestors.
No histories or earlier evidence were replaced. Work was performed personally.

Preflight ordinary Git push (`--dry-run`) exited 128:
`fatal: could not read Username for 'https://github.com': terminal prompts disabled`.
The authorized GitHub connection reports push/admin permission, but the exact
starting commit lookup returns 404 and the requested remote branch is absent.
The available commit-creation tool cannot supply original author/committer
metadata or raw commit bytes, so it cannot recreate the missing exact ancestral
SHAs. Substituted history is not an acceptable publication workaround.

After this checkpoint is committed, the exact final push, connector result and
exact-SHA hosted-run lookup are recorded in the downloadable handoff. A fresh
recovery bundle must bind to the final SHA and preserve the required ancestry.
No force push, shared-branch overwrite, main merge, deployment or tag is authorized.
