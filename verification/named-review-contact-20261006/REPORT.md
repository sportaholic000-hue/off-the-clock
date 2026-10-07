NOT CLEAN — named-contact code is implemented; end-to-end review capture and delivery still depend on the separately assigned lead repairs.

# Named review contact implementation

Implementation source: `4838ed2f3a12e962acfe58e542cd6f00bca31e3d`.
Branch: `codex/named-review-contact-implementation-20261006`.
Verified starting revision: `4e4b5ebaab12ef42e56149a7be35ccf1da90fbe9`.
That branch descends from the audited `73c00622d6f2df31f57773b32e41355a7421f1a3`;
this is an implementation report, not a new audit verdict for that old revision.
No subagents, merge, deployment, real calls/messages, provider writes or live data.

## What changed

The knowledge editor now collects an owner-confirmed name and Owner/Manager role.
The signup first name is an editable prefill, not a silently approved identity.
“Review and save” confirms the contact; an unsaved edit or AI draft cannot change
the contact used by calls. The editor gives a caller wording preview:

> “Let me check with Synthetic Morgan on that. What's the best number for a callback?”

The example uses a clearly synthetic contact. Production uses the saved name.
The saved contact is bound server-side to the authenticated business's existing
review inbox. The owner confirms this is the person who reviews that inbox.
Selecting Manager does not create a staff account, grant access, add a seat or
configure a separate notification destination. Actual delivery is a separate gate.

| Path | Implemented behavior | Source |
| --- | --- | --- |
| Owner editor | Name/role selection, explicit save, natural preview, reopen saved contact | `client/src/onboarding.jsx:384` |
| AI starter / website knowledge draft | Preserve the owner's contact; generated identity cannot replace it | `client/src/knowledgeDraft.js:3` |
| Validation | Closed fields; Owner/Manager only; bounded Unicode name; reject empty, controls, delimiters, non-strings and routing fields | `server/src/reviewContact.js:15` |
| Storage | Save contact atomically with knowledge; bind inbox to authenticated owner; preserve contact on legacy saves that omit it | `server/src/onboardingService.js:277` |
| Reopen / API projection | Return name and role; remove private routing metadata and corrupt/foreign bindings | `server/src/onboardingService.js:207` |
| Phone composition | Read the saved, non-draft contact for the signed caller's tenant; exclude foreign/corrupt/unconfirmed contacts | `server/src/voice/productionVoiceRuntime.js:63` |
| Phone instructions | Distinguish person, business and receptionist; natural handoff; no invented person or answer; saved does not mean sent/read | `server/src/voice/voicePromptCompiler.js:23` |

Names support Unicode letters, combining marks, spaces, periods, apostrophes and
hyphens. The maximum is 100 JavaScript string units. Empty or malformed explicit
contacts return HTTP 400 without changing saved knowledge. A legacy business with
no confirmed contact stays unnamed; this batch adds no new answering shutdown.
No prices, quote arithmetic, plan entitlements, schema or immutable voice-guide
content changed. Price-book AI/interview paths do not write business knowledge.

The new preview is a wording example in the knowledge editor. It is not a full
“Test my agent” chat or a recording of generated speech. Provider-stub tests prove
what the real runtime sends to the model, not that a live model always obeys it.

## Verification

[Final cold GitHub CI run 37516810842](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/37516810842)
passed at the exact implementation source above. It removed installed dependencies,
ran `npm ci`, installed Chromium, built the owner app and widget, and ran both gates.

| Check | Result |
| --- | --- |
| Cold hosted `npm ci` | Passed |
| Hosted `npm run build` | Both builds passed |
| Hosted `npm run test:quote` | **2,099/2,099**, 97 files |
| Hosted `npm test` | **2,480/2,480**, 140 files |
| Hosted failure-list check | Passed; no failures, cancellations, skips or TODOs |
| Hosted production dependency audit | Zero vulnerabilities |
| Focused local regressions after the filename correction | **242/242**, no failures/skips |
| Final cold local install and both builds | Passed |
| Final local quote gate | 2,060 passed; 39 browser setup failures |
| Final local full suite | 2,441 passed; the same 39 browser setup failures |
| Independent D03 dependency diagnostic | **1 experiment, failed product expectation**: notes became null |

All 39 final local test failures explicitly report the missing Chromium executable.
The local download failed with a truncated/non-zip response after the initial
temporary-directory issue was corrected. These are environment failures, not
passing tests. Hosted CI runs the same browser tests successfully, including both
new contact tests. Node 22.23.3 was used locally; project dependencies/lockfiles and
CI definitions were not changed. The standard large-bundle build warning remains.

The earlier hosted runs are retained in the evidence archive: run 37516045021
had 2,099/2,102 quote tests pass (two filename-contract failures and the Role
accessible-label failure); run 37516699043 had 2,098/2,099 pass (the Role issue).
Their full suites did not run. They are not counted as successful gates.

There are **34 new regression tests**: 25 validation/storage/compiler/draft tests,
4 authenticated route tests, 3 production voice composition tests and 2 browser
tests. The voice tests execute 8 signed synthetic HTTP/WebSocket calls using the
real runtime and a fake Google live client. Route tests use real sessions and
middleware; browser tests run the actual editor against the real save service.

Expected behavior was written first in
[`NAMED_REVIEW_CONTACT_IMPLEMENTATION_20261006.md`](../../specs/NAMED_REVIEW_CONTACT_IMPLEMENTATION_20261006.md).
There are no new expected dollar amounts: this change does no pricing arithmetic.
Existing monetary regressions retain their prewritten expectations.

Development checks caught and resolved three test/implementation issues:

1. An existing prompt assertion required `[owner]` to mean the business name. It
   was updated to the explicitly approved person-based rule; other assertions remain.
2. The first voice test filename put it in the quote gate, contrary to the existing
   selection contract. Renaming it to the existing `voice...spec.mjs` convention
   keeps all three tests in the full suite. No runner/filter/known-failure change.
3. The Role selector needed an explicit accessible name. The original browser
   assertion remains; `aria-label="Role"` fixes the actual control's accessible name.

The first fixture also needed unique synthetic phone SIDs and synthetic billing
evidence to satisfy the real migrated database's paid-access triggers. No runtime
or entitlement rule was weakened to make that fixture work.

## Confirmed dependency: D03 still drops the question

**Severity: High.** The contact can be correct while the question and an alternate
callback number disappear, leaving the reviewer unable to follow up accurately.
This is the previously assigned lead-capture defect, not repaired in this batch.

**Source:** `server/src/voice/voiceToolRuntime.js:579` assigns `notes: null`;
`:590` persists those details. The tool schema accepts notes, but persistence
discards them. Routing to the correct tenant does not repair that loss.

**Smallest executed reproduction:** an active synthetic Operator account with a
provisioned synthetic number and saved contact
`{name: "Synthetic Morgan", role: "manager"}`. Open a locally signed voice session,
then invoke `captureLead` with:

```json
{
  "name": "Synthetic Caller",
  "notes": "[SYNTHETIC] Ask Synthetic Morgan whether the warranty covers this repair. Callback +19025550177."
}
```

**Expected:** preserve that exact validated question and callback detail in the
tenant's review record. The approved named-contact decision requires preserving
unknown questions and relevant callback context, never inventing an answer.

**Actual:** result `captured_address_required`; persisted `notes` is `null`.
The independent diagnostic exits 1 and reports `questionPreserved: false`.
The lead is in the correct business inbox, but the question is absent.

**Required fix:** persist validated notes, retain updated caller context under
idempotent capture, and verify owner-visible readback. The separate lead agent
owns this source and D03; this branch does not edit it. After integration, rerun:

```sh
node verification/named-review-contact-20261006/probe-lead-dependency.mjs
```

That diagnostic must report the exact expected text and exit 0. It is deliberately
not a passing regression that treats lost notes as correct behavior.

## Remaining release conditions and policy

- D03 above must be repaired and the combined end-to-end capture path rechecked.
- Owner-alert delivery (D02 in the supplied lead audit) is outside this batch.
  These tests do not establish sent/read/human-received status. No wording claims
  delivery merely because capture succeeded.
- The supplied billing/lead audits and the separate quote-repair branch remain
  independent work. This source does not include those repair branches, and passing
  this branch's suite is not clearance of their findings.
- **Business-policy conflict P01 remains:** historical/default response deadlines
  versus evidence-based timing. The named-contact decision supplies no deadline.
  This batch neither changes the immutable guide nor silently resolves that conflict.

Per AGENTS.md, new UI copy proposed for review before release is “Owner or manager”,
“Name”, “Role”, “Owner”, “Manager” and “Caller preview”, with the inbox-confirmation
help and natural preview shown above. The implementation is on a review branch;
no merge or deployment has occurred.

## Publication and coverage

GitHub source trees were compared with local Git trees before updating the branch.
The final source tree is `1cc3a88ee0eabf0e57dbfc783c995e17021e08e8`.
The report/evidence checkpoint is documentation only and does not change tested code.
Raw logs and exact archive checksums are in [`ARTIFACTS.json`](ARTIFACTS.json) and
[`evidence.tar.gz`](evidence.tar.gz). The archive retains failed development runs
as well as final results; failures were not hidden or added to a known-failure list.

Covered: editor prefill/edit/save/reopen, AI/website draft preservation, strict
validation, tenant/role authorization, private routing projection, production
signed voice composition, missing/corrupt/foreign/draft contacts, repeated saves,
Unicode/bounds, truthful handoff instructions and the existing capture dependency.
All new fixtures are synthetic and all storage disposable. Counts above overlap
between focused and full gates; they must not be added as distinct tests.

Audited foundation: `73c00622d6f2df31f57773b32e41355a7421f1a3`.
Implementation tested source: `4838ed2f3a12e962acfe58e542cd6f00bca31e3d`.
Final counts: 34 new tests; 2,099 quote-gate tests and 2,480 full-suite tests passed
cold on GitHub; 242 focused local tests passed; 1 independent capture diagnostic
confirmed an unresolved dependency. No actual model speech or human delivery test.
