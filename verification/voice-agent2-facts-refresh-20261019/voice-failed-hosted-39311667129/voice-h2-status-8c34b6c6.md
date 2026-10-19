# H2 published repair — hosted verification blocked by scoped evidence update

## Current status

The H2 source and regressions are published, but the current commit is **not qualified**.
Hosted strict failed the existing tenant route-source fingerprint check. Full, checker,
and production dependency-audit steps were skipped. No complete hosted passing claim
is made.

- Repository: https://github.com/sportaholic000-hue/off-the-clock
- Branch: `codex/qe-agent2-voice-facts-refresh-20261019`
- Exact published SHA: `8c34b6c6e984723586ac9a7fe9c38fa6e212da25`
- Sole parent: `04df35cd8e9ced136ef611cfc2b25f2de64c21bf`
- Tree: `5c2b7dcbf6de836149500d2bb9eaa2c4550e1fb3`
- Exact-head run: https://github.com/sportaholic000-hue/off-the-clock/actions/runs/39311667129
- Test job: `118262537123`; Docker job: `118262535962`.
- Remote rechecked at the same SHA; worktree clean. No merge conflicts or incoming merge.
- Work performed personally; no subagents, main/integration write, force push or deployment.

## Repair and reproduced behavior

The original probe was read at `db1dcb4cb4dedebb59811c390c8fe2ac9a608846` without
merging its history. Both original H2 cases failed on the exact base: a connected
provider retained `Widget $10 each` after an actual owner save changed the amount to
$12 or added a membership qualification. The real dispatcher correctly rejected old
listing text; the arithmetic was not changed. The same two probes now pass.

`productionVoiceRuntime.js` supplies a tenant-bound content revision to the existing
public prompt compiler. `googleGenAiLiveAdapter.js` detects changes during idle calls,
input and provider output, recompiles facts, clears stale queued output, drains already
accepted tool results and caller transcripts, and connects the provider with the fresh
instruction. It uses the same call's resume handle when available. A cold connection
gets bounded, labeled historical context. Delayed older connections cannot supersede
a later save. Refresh failure closes through the existing fallback path.

`geminiMediaBridge.js` removes a shutdown promise cycle exposed by failed refreshes
with queued tool/output callbacks, while preserving accepted-tool and transcript drain.

Existing modified files are exactly these three voice-runtime files. All remaining
changes are five new voice-prefixed test/fixture files and 92 files in the new
voice-prefixed evidence directory. No existing test assertion, selector, source
extractor/importer, widget, pricing arithmetic, approval rule, version literal, frozen
receipt, F2 policy, dependency/lockfile, specification or workflow was edited. The test
job still has its authorized 45-minute timeout.

## Actual completed hosted results on the exact SHA

| Gate | Result |
| --- | --- |
| Locked dependency install | Passed |
| Owner/widget build | Passed |
| Required browser gate | 12 tests; 12 pass; no unsuccessful outcomes |
| Strict quote/pricebook | 6070 tests; 6066 pass; 4 fail; 0 cancelled/skipped/TODO |
| Full suite | Skipped after strict failure |
| Failure checker | Skipped |
| Production dependency audit | Skipped |
| Production Docker image and synthetic network-disabled voice smoke | Passed |

The four strict failures are two underlying failures plus their parent tests:

- `every runtime registered route is covered; new and removed routes fail` — twice,
  once in development/preview and once in production.
- `synthetic full server tenant matrix (development/preview)` — failed parent.
- `synthetic full server tenant matrix (production)` — failed parent.

Every strict name from the verified base executed with its existing multiplicity.
There are no additional failed names. The check compares a whole-file SHA-256 for
route-declaring source. The new saved-facts revision code changes the hash of
`src/voice/productionVoiceRuntime.js`; its route declarations, authorization and
nonce/CallSid/owner binding code are unchanged. The failure occurs before the guard's
subsequent middleware comparison; that particular assertion is not claimed executed.
The other executed tenant matrix cases passed.

## Local verification

These are overlapping runs and must not be added together. Final command receipts
record hashes matching all published modified production and new test source files,
except the separately identified earlier rendered-controls run.

| Run | Completed result |
| --- | --- |
| New H2 focused cases | 60/60 |
| Unchanged voice lifecycle/adapter/bridge/memory neighbors | 88/88 |
| Combined regressions, 46 files | 1834/1834 |
| Original unmodified H2 probe cases | 2/2 |
| Original combined F16 dependency checks | 14/14 |
| Original byte-identical F18 matrix | 91/91 |
| Build | Passed |
| Production dependency audit | 0 vulnerabilities |
| Earlier A2/A3 rendered/widget/browser controls | 47/47, before the last voice queue fixes |

The combined run verifies individual passing names once for all 525 geometry cases,
14 F16 cases, 41 F18 regressions, 874 retained parser/import cases, and 60 H2 cases.
The 577 retained voice cases are a subset of the parser/import count, not an additional
577. All 60 H2 names passed once in both focused and combined local logs, and remain
excluded from hosted strict by the existing selector. Hosted full did not execute
those names; no hosted H2 passing claim is made.

The exact base had 6070 strict and 7701 full tests. Expected totals after these 60 new
voice tests are 6070 strict and 7761 full. The latter is an expectation, not a result.

## Exact proposed cross-owner patch — NOT APPLIED

The user authorized necessary voice-runtime/provider-session files and **new**
voice-prefixed tests/evidence. The existing tenant-isolation evidence path below falls
outside that boundary. This handoff requests authorization for this exact one-line
source-fingerprint review update. The production work is already published.

The current 26-file route-source inventory differs from the reviewed inventory at
exactly this SHA. Replacing this one value makes the proposed inventory equal to the
actual current inventory, and `git apply --check` succeeds. The existing file remains
unchanged. No assertion or selector is removed or weakened by the proposed patch.

```diff
--- a/verification/tenant-isolation-20261007/route-sources.json
+++ b/verification/tenant-isolation-20261007/route-sources.json
@@ -85,7 +85,7 @@
   },
   {
     "file": "src/voice/productionVoiceRuntime.js",
-    "sha256": "8485138ef9a4ff020b8e235d5a13aaaf4c5e0a4387c6aa538775abc10994b3ea"
+    "sha256": "5ceb2387f1b9bf6987292991caf6a7de98653f057664fad262e3e0b46f2fa655"
   },
   {
     "file": "src/voice/voiceFallbackRoutes.js",
```

After authorization, the patch and preserved failed evidence can be committed as a
child of the current published SHA, using an expected-head, non-forced update on the
same unique branch. Every hosted gate and individual H2 name must then be verified
on that new final SHA. This failed run or a passing parent cannot qualify it.

## Preserved evidence and limitations

Published source/local evidence:
https://github.com/sportaholic000-hue/off-the-clock/tree/8c34b6c6e984723586ac9a7fe9c38fa6e212da25/verification/voice-agent2-facts-refresh-20261019

This handoff additionally includes the exact failed hosted test log and passed Docker
log, fetched run/job/ref metadata, a count and individual-name audit, and the proposed
patch. The repository remains at its published SHA; this handoff is not another source
commit.

All providers in the tests are synthetic. Tests capture actual `live.connect` and
session method arguments and use the real application save route, database, dispatcher,
signed incoming HTTP and media WebSocket paths. They do not establish real Gemini model
speech or provider acceptance, live Twilio delivery, or production load performance.
Already played speech cannot be recalled. Idle detection polls once per second and
active paths also check freshness. Cold history is bounded to 24 turns/32 KiB and cannot
reconstruct provider state or audio never transcribed; missing details must be asked
for again.

The original reproduction also contains three separate H1 importer-condition boundary
cases. An auxiliary development command accidentally executed them; all three failed.
Those failures are preserved in the published evidence and remain outside H2. Other
intermediate H2 failures, fixture errors and the incomplete shutdown-hang run are also
retained. F2 remains unchanged.
