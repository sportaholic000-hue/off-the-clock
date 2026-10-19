# Listed-price reconciliation — 2026-10-18

Branch: `codex/qe-listed-price-reconcile-235eb5c-20261018`.

The owner designated the session holding `235eb5c978f847c2d47379ae3cf03b52c1f9104c`
as reconciliation owner and explicitly authorized overlapping parser, regression
and evidence resolutions on this new branch. The original colliding and shared
integration branches must remain unchanged.

## Histories and conflict resolutions

The exact local candidate was preserved on the new local branch before merging
`4f6152413a650085a7fe6002dfd077a542f9c0c2`, the fetched latest colliding head.
The reconciliation commit retains both as ordered merge parents.

- Parser: combine both condition/qualifier guards, the original-spelling numeric
  check, NFKC normalization only for qualifier detection, and phrase-start
  preposition matching that preserves board-on-board, nail-in and plug-in names.
- Tests: preserve both original test bodies without assertion changes inside
  separate lexical blocks; shared imports are deduplicated. All 91 local and
  206 incoming regressions remain, totaling 297 inherited tests plus 8 reconciliation tests (305 total). The voice-prefixed filename and
  existing selectors are unchanged.
- README: both original reports are byte-identical in `README.local-235eb5c.md`
  and `README.remote-4f615241.md`; this file describes reconciliation.
- Build evidence: both original logs are byte-identical in distinctly named
  `build.local-235eb5c.log` and `build.remote-4f615241.log`; the local original
  also remains at `build.log`. All non-conflicting original evidence is retained.

`reconciliation-binding.json` records test-body and unchanged-source hashes.
The arithmetic/rounding/currency tail is byte-identical to base `c1817621`.
No other production file, selector, gate assertion, workflow, dependency,
engine version, specification or frozen fixture changes.

## Before/after

The original five conditions returned $30.00 for quantity 3 on `c1817621`.
The original failing direct/dispatcher evidence is retained.
The seven additional cases still returned $30.00 on `4f615241`:

- Assuming pickup $10 each
- Cash price $10 each
- Monday service $10 each
- Advance booking $10 each
- Approved orders $10 each
- Delivery excluded $10 each
- Materials billed separately $10 each

All seven now return the existing `needs_review` response, with no extended
amount or calculated voice summary, in both direct and real-dispatcher tests.
Caller quantity confirmation does not establish pricing eligibility. The exact
refusal message is unchanged; verbatim saved-listing fallback remains intact.

Positive controls retain product-number names, ordinary compounds, exact decimal
products, half-up cent rounding and its disclosure, currency and saved identity.
Draft/foreign/duplicate/edited listings and invalid confirmations remain refused.
This conservative English grammar does not claim to understand arbitrary
natural-language conditions or prove live model speech behavior.

## Verification and publication status

Clean Node 22 `npm ci` and owner/widget builds passed. Before the separator follow-up, the reconciled 297-case
file and the 741-case focused/neighboring selection passed with zero failures,
skips, cancellations or TODOs. Strict/full results are recorded separately when
those complete. Local Chromium exits with SIGTRAP; Docker is unavailable.

Publication is blocked: ordinary Git push has no credentials. The GitHub
connector cannot create a reference to the unpublished exact local commit
(`Object does not exist`) and its commit API does not expose original author/
committer timestamps needed to preserve that exact SHA. Recreating different
commit identities would violate the requested history preservation, so that
substitution is not made. No force push or shared-branch write occurred.

Hosted verification on the final reconciled SHA is therefore NOT complete.
Results from either parent are not counted as final-candidate hosted results.

## Separator follow-up during reconciliation

The colon-without-space variants `Widgets:on collection $10 each`,
`Widgets:in store $10 each`, `Widgets:by arrangement $10 each` and
`Widgets:ＩＮ store $10 each` still multiplied before the final separator fix.
Eight direct/dispatcher tests were added first: 297 passed, 8 failed.
The preposition phrase-start grammar now also recognizes a colon; ordinary
hyphenated product names remain covered by both inherited positive suites.
The preliminary strict run is preserved. Its following full run was stopped
before production was changed; final strict/full runs were restarted on the
corrected source. No preliminary run is counted as a final-candidate pass.

The preliminary strict run also exposed an unchanged sod-disclosure test's
broad `/90/` assertion matching only a random quote handle ending in `90`.
The actual amount was $2,950 and no other returned field matched. The unchanged
sod file passed 7/7 on a diagnostic rerun. The original failure and extracted
matching field are retained; that out-of-scope test/assertion was not edited.

## Final local verification

| Check | Actual result |
| --- | --- |
| Clean installation / owner and widget builds | Passed |
| Final parser regressions | 305/305 passed |
| Final focused and neighboring selection | 749/749 passed |
| Complete local strict quote run | 4,871 passed / 124 failed / 4,995 registered |
| Complete local full run | 6,186 passed / 124 failed / 6,310 registered |
| New regressions in full | All 305 executed exactly once and passed |
| New regressions in strict | Zero, as required by unchanged selectors |
| Production dependency audit | Zero vulnerabilities |
| Hosted final-SHA verification | Not run; publication blocked by Git authentication |
| Local Docker | Executable unavailable |

Both complete final runs have zero cancellations, skips and TODOs. They are
**failed gates**: each has 123 browser-launch failures and one parent failure
caused by its browser subtests. Every failure is inventoried with its diagnostic
in `final-local-failures.json`; there are no other final-run failures.
The unchanged full-suite checker correctly rejected the run, with known
failures still 0/0. The sod test passed in both final runs; its preliminary
failure remains documented and its broad assertion remains unchanged.

The default Chromium headless-shell executable is missing. The available full
Chromium was also probed explicitly and exits with SIGTRAP. Eleven nested tests
cannot register after browser setup fails: five in ownerDashboard20261007,
two in ownerAlertsDelivery20261006, and four in leadCaptureRepair20261006.
The selectors still choose all 268 strict files and all 332 full files. No test
selection, assertion, skip or gate was weakened. The 305 additions explain the
full-suite increase; browser setup explains the eleven unregistered nested tests.

Raw preliminary/final logs are retained as lossless gzip files. Their final
summary counts and log hashes are in `final-local-results.json`. The eight new
separator regressions preserve the before/after result of 297/305 then 305/305.
Original reports and logs are historical evidence tied to their original heads,
not claims of final-candidate hosted success.
