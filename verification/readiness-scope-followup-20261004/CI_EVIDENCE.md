# Hosted verification — October 4, 2026

Tested code: `42812a71ef31604d34140ea32ecc12b0bda53552`.

- [GitHub Actions run 37243049494](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/37243049494)
- [Job 111555411038](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/37243049494/job/111555411038)
- Event: push; branch: `codex/quote-audit-ready-20261004`; conclusion: **success**.
- Started October 4 at 23:14:46 UTC; completed at 23:22:00 UTC.
- Existing workflow: Node 22, locked dependencies, Playwright/Chromium.

| Check | Verified result |
| --- | --- |
| Owner app and widget builds | Passed |
| Strict quote/price-book gate | **51 files; 1,234 tests; 1,234 pass; zero failures, skips or cancellations** |
| Broader suite | 1,626 records; 1,615 pass, 9 fail, 2 skipped, zero cancelled |
| Existing failure-baseline checker | Passed; 9/9 existing failures remain, no new failures |

The broader suite is not a zero-failure suite. No failure allowance, workflow,
dependency lockfile, skip, or quote-gate exclusion was changed. The unrelated
baseline failures were not separately audited or repaired in this scoped task.
Local and hosted test counts overlap and must not be added together.

The cold no-live/late-live readiness cases all passed their timing gates. On the
hosted runner, full-detail calls took 700 ms (unclassified zero prices), 224 ms
(missing registrations), and 507 ms (only the final pair live). Their 20 ms timers
fired at 714, 226 and 508 ms respectively. These are measured observations, not
a deployed throughput guarantee. Three-tier and private-snapshot isolation
regressions passed as part of the same strict gate.

Selected lines from the completed job log:

```text
2026-10-04T23:15:30.3794160Z ✓ built in 3.40s
2026-10-04T23:15:33.4580925Z ✓ built in 2.82s
2026-10-04T23:15:33.6540845Z PASS: quotes reach the engine only through quoteDoneBridge.js; customers receive sanitized results; no legacy engine in production.
2026-10-04T23:15:33.8707322Z Running 51 quote-engine and price-book test files; any failure fails the gate.
2026-10-04T23:17:03.8489755Z # {"case":"original-missing-minimum","bytes":14024,"productsPerAxis":80,"elapsedMs":14.065364000000045,"timerDelayMs":33.06674199999998}
2026-10-04T23:18:29.8994615Z # {"case":"unconfigured-zero-prices","firstLiveProduct":false,"productsPerAxis":80,"elapsedMs":700.329342,"timerDelayMs":714.115444}
2026-10-04T23:18:29.9005457Z # {"case":"unconfigured-zero-prices","firstLiveProduct":true,"productsPerAxis":80,"elapsedMs":492.250038,"timerDelayMs":493.79801899999995}
2026-10-04T23:18:30.1532242Z # {"case":"missing-all-registration","firstLiveProduct":false,"productsPerAxis":80,"elapsedMs":224.19422499999996,"timerDelayMs":226.335335}
2026-10-04T23:18:30.2581097Z # {"case":"missing-all-registration","firstLiveProduct":true,"productsPerAxis":80,"elapsedMs":124.2235740000001,"timerDelayMs":126.03871900000013}
2026-10-04T23:18:30.7804176Z # {"case":"only-final-pair-live","firstLiveProduct":false,"productsPerAxis":80,"elapsedMs":506.81217800000013,"timerDelayMs":507.50411399999984}
2026-10-04T23:18:31.2740271Z # {"case":"only-final-pair-live","firstLiveProduct":true,"productsPerAxis":80,"elapsedMs":466.96030299999984,"timerDelayMs":472.8277640000001}
2026-10-04T23:18:40.6491306Z # tests 1234
2026-10-04T23:18:40.6506364Z # pass 1234
2026-10-04T23:18:40.6506908Z # fail 0
2026-10-04T23:18:40.6507562Z # cancelled 0
2026-10-04T23:18:40.6508182Z # skipped 0
2026-10-04T23:18:40.6544112Z PASS: quote engine and price book gate.
2026-10-04T23:21:56.7594700Z Summary: {"tests":"1626","pass":"1615","fail":"9","cancelled":"0","skipped":"2","todo":"0"}
2026-10-04T23:21:56.7595692Z Known failures still failing: 9/9
```

The subsequent evidence/navigation commit preserves every application, test,
dependency and workflow blob in this tested code checkpoint. Its changed paths
are limited to the new dated verification record and existing documentation
indexes/status. Uploaded hashes and the complete tree delta are checked separately.
