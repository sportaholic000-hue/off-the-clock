# Hosted verification — October 4, 2026

Tested code: `5e2ea7647d46241fc365bb2184422ae4c905cb06`.

- [GitHub Actions run 37240200078](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/37240200078)
- [Job 111547228511](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/37240200078/job/111547228511)
- Branch: `codex/quote-audit-ready-20261004`
- Event: push; conclusion: **success**.
- Started October 4 at 22:29:22 UTC; completed by 22:36:23 UTC.
- Existing workflow: Node 22, locked dependencies, Playwright 1.56.0 and Chromium.

| Check | Verified result |
| --- | --- |
| Owner app and widget builds | Passed |
| Strict quote/price-book gate | **48 files, 1,106 tests; 1,106 pass, 0 fail, 0 skipped, 0 cancelled** |
| Broader product suite | 1,498 records; 1,487 pass, 9 fail, 2 skipped, 0 cancelled |
| Existing known-failure checker | Passed; all nine failures matched the existing nine-entry baseline |

The broader suite is not a zero-failure suite. The failure allowance file and CI
workflow were not changed. No new failure allowance, skip, or quote-gate
exclusion was introduced. The unrelated features represented by that baseline
were not separately audited or repaired in this scoped task.

The final code also passed 928 selected local tests, including the 35 new
acceptance cases, and 195 differential comparisons. These counts overlap the
hosted run; they must not be added together.

The original 80-by-80 missing-minimum case on the hosted runner took **14.0 ms**;
its 20 ms timer fired at **27.7 ms**. Local standalone/broad measurements were
7.5/6.8 ms, compared with 8,820.7 ms before the fix. Measurements vary by runner;
the regression requires both the cold call and timer delay to stay below 1,500 ms.

Selected lines read from the completed job log:

```text
2026-10-04T22:30:15.7235067Z Running 48 quote-engine and price-book test files; any failure fails the gate.
2026-10-04T22:31:46.9045909Z # {"case":"original-missing-minimum","bytes":14024,"productsPerAxis":80,"elapsedMs":14.020266999999876,"timerDelayMs":27.71276399999988}
2026-10-04T22:33:12.2414226Z # tests 1106
2026-10-04T22:33:12.2463582Z # pass 1106
2026-10-04T22:33:12.2471762Z # fail 0
2026-10-04T22:33:12.2472235Z # cancelled 0
2026-10-04T22:33:12.2472907Z # skipped 0
2026-10-04T22:33:12.2504370Z PASS: quote engine and price book gate.
2026-10-04T22:36:18.1840909Z Summary: {"tests":"1498","pass":"1487","fail":"9","cancelled":"0","skipped":"2","todo":"0"}
2026-10-04T22:36:18.1842900Z Known failures still failing: 9/9
```

The later documentation/evidence commit preserves all application, existing test,
dependency and CI-workflow blobs from this tested code checkpoint. Its tree is
compared with the tested tree, and the uploaded file hashes are verified.
