# Widget entry review task list

- [x] Read AGENTS.md, BUILD_STATUS and the applicable widget/quote decisions.
- [x] Create the unique A1 branch from exact `04df35cd8e9ced136ef611cfc2b25f2de64c21bf`.
- [x] Merge `59d5c282ad8d88be0cce6d59eff2c6fb207d41d2`, preserving both histories in `915f8e711e078f453c99255484b5bdf8abb8ad39`.
- [x] Write independent cents and required-answer expectations before execution.
- [x] Add only new A1 tests/evidence; normal strict/full selectors include the new test.
- [x] Complete real owner save, confirmation, approval and public catalog setup for all 20 fixtures; preserve the exact configuration evidence.
- [x] Build locally; preserve the local Chromium SIGTRAP failure without claiming browser success.
- [x] Publish initial test checkpoint `7aac065d08fa6339dade2aa25891513a8dbc110c` and start hosted run `39310251440`.
- [x] Supplemental HTTP preflight:120/120 passed (missing required answers, complete/partial exact cents and original receipt replay for every service); this is not browser evidence.
- [x] Add incremental visible-step traces, independent quantity/unit checks and paired scope-label/value checks to the new harness.
- [x] Rename only the new owned test to `qeAgent1BlankWidgetEntry20261019.browser.spec.mjs` so its evidence precedes the older large log bundles; all wrapper assertions are byte-identical and both unchanged selectors still include it.
- [x] Run at most four independent service fixtures concurrently; all 120 checks remain required. Compare the progress element's DOM text immediately before Continue, so CSS text transformation and dynamic step counts cannot satisfy the wait prematurely.
- [ ] Complete all 20 services × desktop/mobile through empty-storage loader/wizard entry.
- [ ] Record valid cents, required-answer review, scope disclosures and immutable original replay results.
- [ ] Reproduce any product defects separately and continue the remaining cases.
- [ ] Publish final evidence and verify strict/full/browser/build/Docker/checker/dependency audit on the exact head.

Current limit: local Chromium exits with SIGTRAP. Hosted real Chromium supplies
the required rendered execution. No A3 retry/race injection, production edits,
existing assertion changes, approval/version changes or integration writes.

Initial hosted run 39310251440 (7aac065): all 120 new checks failed before
widget entry because the reused booking fixture seeded the 11-character
`synthetic-a` public key. The actual loader correctly rejects that test-only
key. The corrected isolated fixture removes only that seeded owner key and
uses the real POST /api/quotedone/access handler to issue a valid key. This
is a harness defect, not a product finding. The complete 105-file failed-run
bundle and extraction hashes are retained in hosted-checkpoint-01.bundle.json.gz.
