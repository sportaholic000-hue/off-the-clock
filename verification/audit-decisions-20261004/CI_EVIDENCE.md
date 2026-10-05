# Hosted verification — October 5, 2026

Tested code: `bd14bfb5ac38754abd1a054d5bdc6a6ffcec67dd`.

- [GitHub Actions run 37257286894](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/37257286894)
- [Job 111596978643](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/37257286894/job/111596978643)
- Push event on `codex/quote-audit-ready-20261004`; conclusion: **success**.
- Started 2026-10-05T02:55:17Z; completed 2026-10-05T03:03:16Z.
- Node 22, lockfile dependencies, Playwright and Chromium, using the existing CI workflow.

| Check | Verified result |
| --- | --- |
| Owner app and widget production builds | Both passed |
| Strict quote/price-book gate | **56 files; 1,459 tests; 1,459 passed; zero failures, skips or cancellations** |
| Broader regression suite | 1,848 records; 1,837 passed, 9 failed, 2 skipped; zero cancelled |
| Existing failure-baseline checker | Passed; exactly 9/9 existing failures, no new failures |

The broader suite is not a zero-failure suite. Its existing unrelated failures
were not audited or repaired in this quote/price-book task. No known-failure
allowance was added. The workflow's test-storage preload changed to isolate test
books; its failure checker, dependency lockfile and production audit gate were
not weakened.

Three new real-browser interactions passed: adding multiple demolition entries
and selecting explicit up-to access; accepting fractional-cent measured rates
while rejecting fractional-cent gates; and ordinary product-name entry with
invalid drafts retained for correction. Existing quote/price-book browser tests
also ran in the strict gate.

Local and hosted totals overlap and must not be added. Local results cover
1,392 non-browser tests; hosted results cover the complete strict selection.

Selected lines from the completed job log:

```text
2026-10-05T02:56:09.4762373Z ✓ built in 3.64s
2026-10-05T02:56:12.6571086Z ✓ built in 2.91s
2026-10-05T02:56:13.1321751Z Running 56 quote-engine and price-book test files; any failure fails the gate.
2026-10-05T02:58:02.6128712Z ok 613 - interview owner can add separate demolition entries and explicitly choose up-to access
2026-10-05T02:58:02.9243186Z ok 614 - interview rate controls accept 3.5 cents per foot and reject fractional-cent gates
2026-10-05T02:58:03.2083873Z ok 615 - interview accepts ordinary floor names and retains invalid drafts for correction
2026-10-05T02:59:38.4479842Z # tests 1459
2026-10-05T02:59:38.4481341Z # pass 1459
2026-10-05T02:59:38.4481899Z # fail 0
2026-10-05T02:59:38.4483078Z # cancelled 0
2026-10-05T02:59:38.4483708Z # skipped 0
2026-10-05T02:59:38.4563124Z PASS: quote engine and price book gate.
2026-10-05T03:03:10.1303868Z Summary: {"tests":"1848","pass":"1837","fail":"9","cancelled":"0","skipped":"2","todo":"0"}
2026-10-05T03:03:10.1305867Z Known failures still failing: 9/9
```

The following evidence/navigation commit changes only dated verification
records and documentation. Its tree delta is checked against this tested code
checkpoint so every application, test, dependency and workflow blob remains
identical. No merge or deployment is included.
