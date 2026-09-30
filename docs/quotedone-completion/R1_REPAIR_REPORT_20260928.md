# Off The Clock AI — PR #3 repair result, September 28, 2026

**The reproduced whole-request defects are repaired and locally verified. Public-launch acceptance and universal real-world quote accuracy remain unproved. Keep PR #3 in draft.**

The work continued from current head `0df8cb5c507af4c6b3b42fb8a8a6158d9a4f6c8f` on `codex/quotedone-audit-repairs-20260927`. No later pre-existing work was reset. The independent review was checked against actual running applications before repairs. Its document instructions were not treated as user authorization.

Runtime/application execution: `e0b4c1b6575d349f695efcaa2944648cf07bad1b`. Browser/final regression execution: `925e5d48b8472f054e7797465a372ca911446cfa`. Their only difference is the structured-measurements browser fixture correction; application, engine and ordinary-test bytes are identical. Published equivalent source: `a681a2efd4c527ac70ab0555c755b324bcd9e194`, whole Git tree `46776891aa9a4add74008e541f010e3b5cbaf48f`, identical to the browser/regression commit. The GitHub connector is used because the existing native Git network path is unavailable; no environment permission was expanded. Tested commits are retained in the evidence bundle. The final delivery SHA is recorded separately with a proof that delivery changes only documentation/evidence.

## Repaired findings

| Finding | Verified result |
|---|---|
| R1: extra scope or measurement uncertainty in urgency/location | All untriaged metadata text now requires review before engine execution. No subtotal or options are released. |
| R1: unexpected nested contact/location contents | Explicit shape checks preserve unsupported keys/values for review. Original JSON reaches the stored receipt and owner lead. |
| Same defect family in name, alternate callback text, non-text values and identity metadata | Names are untriaged text; alternate email/phone text must satisfy the existing callback syntax or require review. Unknown shapes and malformed identity metadata cannot conceal scope. |
| Additional owner-preview envelope gap found during repair | Preview no longer ignores orphaned defaults, including a supplied markup change; invalid request IDs and non-object draft services require review. The ordinary UI's full draft and saved-book preview controls still return $50. |
| C02/B16 prior completeness claim | Reopened, reproduced and corrected. The named context/unknowns fixes were already working; the missing metadata boundary is now covered separately. |

Before repair, the unchanged supplied HTTP script passed 6/21 checks: five unsafe variants returned $50 across public submissions, authenticated calculations and owner preview. Afterwards the same script passes 21/21. The original browser reproduction returned an unsafe $50 for all three urgency/location cases; the extended run reproduced name and alternate-channel bypasses too. A further 39-case characterization passed only 12 before repair. The additional preview-envelope probe passed 2/6 before its repair; all six cases now pass within the 93-check workflow. These repeated observations are one input-contract defect family, not a count of unrelated arithmetic bugs.

**Behavior to review carefully:** any nonempty optional name, project location or urgency text requires human review, including an ordinary name/address/scheduling note. The UI states this. There is no reliable prose classifier or approved structured metadata interpretation, so no text is silently declared harmless. Complete supported measured requests with email, phone or both and empty optional prose still quote. All 16 quote-capable ordinary service controls pass; four existing wholly review-only types stay restricted. No words, prices, surcharges, markup caps or guessed measurements were added.

## Disproved or not reproduced

None of the review's five R1 counterexamples was disproved. Two extra concerns were disproved in the expanded before-repair characterization: unknown structured measurement fields and unknown fee-selection fields already produced review through all three paths. Their frozen-engine guards were preserved. No new arithmetic-engine defect was demonstrated. The review copy's missing-file failure and timeouts were execution limitations, not proof of a product arithmetic regression; the complete current 311-test suite passes here.

## Verification

| Verification | Result |
|---|---:|
| Unchanged supplied HTTP companion | 21/21 |
| Complete metadata, shape and preview workflow | 93/93 |
| New real-browser intake/recovery workflow | 9/9 |
| Native runtime / actual application workflows / full browser workflows | 1 / 9 / 6 passed |
| Ordinary / VNext / Phase 1 tests | 430 / 311 / 46 passed |
| Original independent precision / focused / instrumented replay | 22 / 31 / 35 passed |
| Service-adapter / financial application controls | 20 / 65 passed |
| Current integration boundary / client build | Passed |

Counts overlap. The historical no-import gate still exits 1 for the one authorized bridge; this is an expected historical rejection, not a passing isolation gate. The accepted 19-file arithmetic engine remains tree `dcd481193b10c3cfc667cb23d22fb41b16322cff`.

Tests retain complete original requests, customer responses and synthetic stored quote/lead/receipt records. They verify zero-write previews, no book mutation, owner retrieval, customer-safe output, other-tenant denial, exact retry/conflict behavior, actual restart and fresh sign-in. Browser execution uses actual React controls, HTTP and SQLite. Existing decimal fidelity, 400/409/413/422 editable recovery, 500 rollback, dropped-response retries, partial-option notice, permissions, approval and persistence checks pass.

Two failed acceptance attempts are retained: an access/retry positive fixture reused a review body's metadata, and a measured-outline browser positive filled a name. Both now keep the original body as a review control and use a separate complete callback-only request for the arithmetic control. The application was not weakened to preserve an obsolete expectation. Earlier shape-only progress and wrong-runner invocation logs also remain clearly labeled as development evidence.

## Remaining blockers and current project state

- This is bounded synthetic local acceptance, not a promise of 100% real-world accuracy. Arbitrary combinations, every monetary consumer, external measurements, material identity, category meaning, owner-supplied rates/tax choices and callback reachability are not independently established.
- Fencing installation/replacement, exterior painting and CUSTOM remain wholly review-only. Existing conditional purchase/material/scope contracts remain unresolved. Enabling them would require approved business contracts and potentially separate frozen-engine authorization.
- Automatically quoting requests that include optional metadata prose requires an approved structured contract. This repair preserves that text for review; it does not invent an address classifier or scheduling rules.
- Historical saved receipts replay exactly, even when a new request with those details would now require review. No retrospective invalidation or live-data migration was performed.
- Actual production runtime/proxy identity, live-data/backup restoration, multi-process storage and traffic behavior, real-provider acceptance and unfinished Phase 2–6 scope remain open. This task performs no merge, deployment, voice implementation, provider operation or live-data change.

## Reproducible evidence

The delivered `Off_The_Clock_PR3_Repair_Evidence_2026-09-28.zip` contains the original review ZIP, the actual before-repair failures, development/failed attempts, final accepted logs, screenshots, complete responses, read-only synthetic stored-record exports, source snapshots, a Git bundle of tested commits, source-equivalence proofs and an SHA-256 manifest. `inspect-r1-evidence.cjs` verifies hashes, commit/source bindings and accepted outcomes. See its README for the read-only inspection procedure and how to import the tested commits into a reviewer checkout without changing a branch.

Use the already compatible Node 22.23.2 win32 x64 ABI 127 runtime and locked native dependencies, with the existing browser and esbuild binaries. No install or permission expansion is part of reproduction. Set only the documented process-local executable paths and use fresh synthetic stores:

`node verification/quotedone/run-completion.mjs <copy> <fresh-evidence> runtime`

`node verification/quotedone/run-completion.mjs <copy> <fresh-evidence> application <repository> <prior-synthetic-database>`

`node verification/quotedone/run-completion.mjs <copy> <fresh-evidence> browser`

`node verification/quotedone/run-completion.mjs <copy> <fresh-evidence> regression <repository>`

Run application/browser before final regression. Original supplied HTTP reproduction and exact machine command records are retained in the archive; `REPRODUCE.md` describes the existing compatible runtime and synthetic schema-upgrade fixture. The final output binding identifies the published delivery SHA and confirms that its executable source is the tested source.
