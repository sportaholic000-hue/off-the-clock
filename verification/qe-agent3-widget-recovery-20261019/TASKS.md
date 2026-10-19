# A3 task list

- [x] Create the unique branch at the exact requested base; inspect instructions, specifications and existing coverage.
- [x] Record independent expected amounts before executing the new cases.
- [x] Preserve test-only baseline Chromium reproductions before client repair.
- [x] Repair reproduced lifecycle defects only in the two assigned customer files.
- [x] Pass local builds and 59 focused existing checks.
- [x] Pass hosted strict (6,082/6,082) and full (7,713/7,713) gates on the repaired source; all 11 new Chromium cases pass in both.
- [x] Archive repaired source-bound browser requests/responses and persisted-receipt evidence.
- [x] Verify all pre-existing files outside the two assigned files remain unchanged.
- [x] Complete server-defect assessment: no defect established; no server edit or handoff required.
- [x] Publish and read back the unique source branch.

Qualified source: `32ae0435e87320885d81341a60a1e545e7ad0415`.
[Source CI run 39308396349](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/39308396349)
passed all applicable jobs. Detailed results and raw evidence are indexed in
REPORT.md. Earlier harness failures and the corrected display expectation remain
explicitly distinguished from product defects.

**Final handoff gate:** the final evidence commit requires its own completed
hosted CI and exact remote-head readback. [Live branch CI status](https://github.com/sportaholic000-hue/off-the-clock/actions?query=branch%3Acodex%2Fqe-agent3-widget-recovery-20261019)
and the final handoff identify that run/SHA. This gate is checked after publication;
the earlier source run does not satisfy it, and no later commit is added after
verification. The active task plan tracks this post-publication check.

No subagents, server edits, existing-test changes, main merge or deployment.
Specifications, v12, approval rules, pricing formulas and workflows are preserved.
Local Chromium startup exits SIGTRAP; only hosted Chromium supplies browser passes.
