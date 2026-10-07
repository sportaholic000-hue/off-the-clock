# Source publication verification

- Required starting commit: b749dd6f76a6625314f87e4e8bf11fc3b3a0dbb3.
- Required starting tree: 5329a9547c8b9364346a738663996b6d2d0e88e9.
- Separate clone: billing-core-repairs; branch codex/billing-core-repairs-20261006.
- First checkpoint: 43a71dec195d3d29506f91f5c97c5741868b6809; tree f95df52bbb45fef9f9f5466565cf1f1892d7490e.
- Final application/test source checkpoint: 9e93cf51030667136a1c69e3698ade980c962d81; tree 71511e807acc5dc3c0788f4a08b76427b600cc26; direct parent 43a71dec195d3d29506f91f5c97c5741868b6809.

Each uploaded GitHub tree SHA equals the local staged tree SHA. GitHub's commit API independently returned the exact source SHA, tree and parent above. Fetching that immutable commit into the separate clone and git merge-base --is-ancestor b749dd6f76a6625314f87e4e8bf11fc3b3a0dbb3 HEAD succeeded. The branch was advanced with an expected old SHA and force=false, never merged or deployed.

SOURCE_BINDINGS.json binds all 13 changed production/test files to this exact source revision. All were rehashed locally with zero mismatches. Diff against the pin confirms all production/test changes fall within the assigned ownership. AGENTS.md, specs/BUILD_STATUS.md, all other specs, server.js, planAccess.js, voice/lead/booking/client/quote/price-book/import source, historical audits, shared CI, manifests and lockfiles remain unchanged.

Final hosted run for this exact source: https://github.com/sportaholic000-hue/off-the-clock/actions/runs/37514745759 . Results are recorded in the report and hosted-source-results files after completion. Any later evidence-only commit retains every application/test blob from this source revision; it is not a different implementation.
