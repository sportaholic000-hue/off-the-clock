# Local verification limitations

All experiments use synthetic accounts, local HTTP stubs and memory/temporary SQLite. No Stripe account API endpoint was contacted. SDK contract HTTP is explicitly restricted to 127.0.0.1.

Node 22 from the workspace runtime; npm ci installed 262 lockfile packages and exited 0. Both production client/widget builds exited 0. Playwright 1.56.0 was installed with --no-save and used the existing Chromium installation. Dependency manifests and lockfiles are unchanged.

The final local strict gate completed 2068 tests: 2031 passed, 37 failed, zero skipped/cancelled/TODO. Every failed browser workflow failed at Chromium startup with SIGTRAP. Full log is preserved as cold-quote.log.gz.

The final local npm test attempt exited 1 without a complete summary. It reported browser startup failures and the four existing billing test contradictions. Its last completed named test was QP-03 320-product last_live; quick=true (1728); the following diagnostic line appeared without a completed test/summary. The cause of the incomplete runner termination is not established, and the partial count is not represented as a full suite pass. The raw stdout/TAP snapshots are preserved, compressed without changing their bytes.

Earlier local broad attempts and one combined targeted attempt also ended without complete summaries. They are preserved separately and not counted as successful gates. The four final targeted billing files completed separately with 116 + 288 + 11 + 10 = 425 passing tests and zero failures/skips/cancellations/TODO. Hosted CI at the exact published source revision supplies the complete independent runner result.

The unapplied integration patch was validated in a private temporary Git index and temporary test copies: 29 existing billing tests passed with the proposed corrected fixtures/assertions. The original test files and all CI gates remain unchanged; this validation does not make the repository's full gate green.
