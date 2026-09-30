# Reproduce the same-second assertion

Use the Node 22.23.2 ABI 127 runtime and isolated dependencies described in the prior auth verification setup. Use fresh evidence directories and synthetic accounts only.

At tested source `ad925d0fa368f295fd2f22b53ef115c55b5f4bdb`:

1. Build both production client bundles using verification/quotedone/build-resume-client.mjs.
2. Run verification/session-security/browser-workflow.mjs with arguments ROOT, FRESH_EVIDENCE and same-second. Both login and renewal checks must pass; the test asserts the renewed valid JWT equals the original under the fixed clock, while differing from the expired copy and rotating the refresh cookie.
3. Run the same fixture with normal mode (or omit mode). All nine checks must pass.
4. To reproduce the old assertion failure, copy REPRO_SAME_SECOND.mjs from this evidence folder into verification/session-security/repro-same-second-browser.mjs in an isolated checkout, preserving its contents. Run it with ROOT and another FRESH_EVIDENCE. It is intentionally expected to exit 1 at its notStrictEqual assertion after a successful login and successful renewal response.

Supply PRICEBOOK_BROWSER_MODULE and PRICEBOOK_BROWSER_EXECUTABLE as in the existing browser verification setup. The test-only clock file enforces NODE_ENV=test and an explicit synthetic-only state. The repro does not use any live providers. Preserve raw failed logs privately because assertion actual/expected values contain synthetic JWTs; published summaries include only equality/receipt counts and safe outcomes.
