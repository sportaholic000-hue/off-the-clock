# Reproducing the independent checks

Use a disposable checkout with existing approved dependencies and Node v22.23.2/ABI127. Do not run against production data or a live deployment.

The report's application checks target 6c670a48c881f8fa628cd70800b290371b730362. Booking code remains identical in 4aaded3c8855f1821c1668d7c26f474dd7ead526. The later tax check targets the server entry point from 4aaded3 with its unchanged backend dependencies.

Copy repro/afterclaim-review.mjs and repro/provider-boundary-afterclaim.mjs from this report folder into verification/inspection in the disposable checkout. These are inspection fixtures only. Leave the canonical application files untouched. The preexisting provider fixture intercepts Google operations; the added preload holds the POST /events request before it reaches that fixture. Synthetic owner/book/calendar data is created locally.

Run:
node --test test/bookingService.spec.mjs
node verification/engine-independent/measured-scopes-arithmetic.mjs <fresh-arithmetic-output-directory>
node verification/inspection/afterclaim-review.mjs <absolute-checkout-root> <fresh-booking-output-directory>

The application harness requires the pinned portable runtime at .portable-runtime/node-v22.23.2-win-x64/node.exe, plus a literal client/node_modules dependency directory or junction. Use fresh output directories. Its local port is 4872; no live provider is needed. The quote-booking raw runner retains the original historical reviewBaselineCommit label, 1013190b, from the reused independent review. EXECUTION_BINDING.json and the per-file manifests identify what was actually tested on this run.

The tax script accepts root, fresh output directory and commit label:
node <report-directory>/repro/tax-owner-choice.mjs <absolute-checkout-root> <fresh-tax-output-directory> <commit>
It creates a synthetic owner and synthetic verified billing fixture, uses port4605, console email and disables provider writes. Run on the old checkpoint to reproduce the discarded choices; run on 4aaded3 to check the fix. Its inputs are configuration authority probes, not recommended legal tax rates.

The auditor's first fixed-tax startup attempt stopped before health readiness, with no executed tax cases. A longer startup window was then used. This does not count as a product tax failure.

Keep generated SQLite stores, session tokens, provider fixture state and complete HTTP recordings out of the report bundle. Published result summaries contain only synthetic case outcomes and safe source bindings. No provider purchases, calendar writes, real calls, messages, charges or deployments are part of these checks.
