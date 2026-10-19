# Recovery integration — local qualification

Before publication, A4 run `39319523284` completed successfully on exact first
parent `03ebb1a9acd0c36381ef166c7c9e78ca2e551ca3`; the API proof is recorded in
`parent-publication-gate.json`. Combined hosted qualification follows publication;
no local browser pass or combined hosted pass is claimed here.

The conflict-free merge on `codex/qe-agent3-recovery-integration-20261019` has
ordered parents A4 `03ebb1a9acd0c36381ef166c7c9e78ca2e551ca3`, then reviewed A3
`7c7542a930c6e3d36847dfe3c3143ac45960a465`. Their common ancestor is
`04df35cd8e9ced136ef611cfc2b25f2de64c21bf`. A4 changes 251 paths; A3 changes
24; there is no overlap. All 4,210 inherited Git blobs and modes are retained
exactly, including incoming tests, receipts and historical failed evidence.

Only this new integration evidence directory is authored in this task. No
source, test, selector, workflow, dependency or specification is changed beyond
the automatic union of the two approved parents. v12, all workflow bytes and
the 45-minute timeout match both parents. `client/src/widget-entry.jsx` matches
both parents. No newer A1 widget-entry or A2 voice-refresh work is incorporated.

Local results:

- Build owner app and widget: pass (`build.log`).
- Importer selection: 1,208/1,208 pass; every passing name matches the inherited
  inventory (`importer-1208.tap`, `local-results.json`).
- Focused existing quote/recovery tests: 59/59 pass (`focused-59.tap`).
- Unchanged selector: exactly one added file in both suites; 295 strict and 369
  full selected files (`selection.json`). Both A1 browser files remain selected.
- Real local Chromium probe: fails with SIGTRAP (`chromium-probe.log`); no local
  browser qualification is claimed. Hosted execution is required.
- Full inherited blob/mode preservation and protected-source hashes pass
  (`preservation.json`, `preservation-manifest.json.gz`). Build-generated HTML
  and removed tracked assets were restored from the index before this check.

The first merge command stopped before merging because the checkout lacked a
committer identity. Command-local Agent 3 identity allowed the unchanged merge
to proceed. The first post-build preservation check detected two removed tracked
build assets; restoring generated `client/dist` entries resolved the check
without changing an assertion or inherited source.
The inherited A3 TAP excerpt has a trailing blank line reported by `git diff
--check`; it is retained byte-for-byte rather than editing incoming evidence.

`required-passing-names.json` freezes complete expected passing-name multisets
before execution: 6,176 strict / 8,141 full / 12 dedicated browser records.
The new `audit-hosted.py` verifies exact-head run, remote ref, ordered parents,
job and step success, every name occurrence and zero failures/skips. It checks
all 11 recovery and 92 A1 browser leaf cases separately inside their correct
parent groups in both suites, and all 1,208 importer names in full. It retains
the existing tightly bounded GitHub credential-URL redaction check. No selector
or existing test is changed to make these checks pass.

The full real-Chromium traces and receipts remain emitted by the unchanged
incoming harnesses. Hosted logs, decoded records and individual-name audit
results are collected outside the checkout, preserving the exact tested merge
and its requested two parents. The final handoff supplies the tested SHA and
run link. No subsequent evidence commit is added to replace that merge.

No subagents, cancellation of A4's run, changes to another owner's branch,
force push, main merge, deployment or live provider action is authorized.
