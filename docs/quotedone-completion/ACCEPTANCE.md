# Current acceptance evidence

The workflow criteria below still apply. Current September 27 repair results are recorded in [REPAIR_STATUS_20260927.json](REPAIR_STATUS_20260927.json) and [REPAIR_REPORT_20260927.md](REPAIR_REPORT_20260927.md). `status.json` preserves the earlier e936370 checkpoint. No local acceptance record certifies production launch.

---

# QuoteDone non-production application acceptance

These are exit criteria for the owner-authorized workflow, not an assertion that they have passed. Use the real running application, authenticated HTTP and browser transport with synthetic tenants and isolated persistent stores. Keep them in `status.json`; do not substitute unit-test counts for these rows.

| ID | Workflow | Required acceptance evidence |
|---|---|---|
| ENV | Runnable application | Actual approved runtime/package/binary identification; locked SQLite restored only in disposable copy where needed; real server starts; no canonical dependency changes. |
| BOOK | Owner entry, approval and persistence | Owner signs in, configures actual rates/units/settings through the application, saves/reloads and reopens. Exact fractional rates and ordinary fixed amounts survive repeated saves. Invalid text cannot save a previous value. |
| EDIT | Existing editor integrity | D1/D2, unchanged focus/blur, root/nested/equal/conflicting copies, A→B→A switches, maps/tiers and AI approval controls pass through the genuine UI/server. Explicit disabling survives unrelated edits. |
| READY | Real eligibility and preview | Supported services can be approved and enabled from actual owner configuration, without fabricated test approvals. Disabled/unapproved services cannot quote to customers. Preview changes no approval, enabled state or saved data. |
| QUOTE | Supported customer quote | Owner-configured book flows through trusted adapters into frozen VNext. Actual customer JSON matches independent amounts, scope, basis, fees, markup, tax, minimum and range expectations. Ordinary positive cases stay ready. Evidence identifies the called engine version and selected saved revision. |
| LEAD | Durable complete review outcome | Missing measurement, missing selected price, unsupported service/scope and not-ready configuration produce correctly owned, actionable saved leads retaining all supplied scope and unknowns. No fabricated price, contact or measurement; no acknowledgement before commit. |
| RETRY | Faults, retries and concurrency | Failed writes preserve existing data and return failure rather than success. Lost response/retry and concurrent duplicate requests yield one correct record. Same identifier with changed content does not silently reuse/replace a different request. Cross-tenant identifiers stay isolated. |
| ACCESS | Trusted identity and private output | Owner/staff/customer/unauthenticated/cross-tenant request matrix. Forged tenant/service/callerType/revision/approval inputs cannot escalate access. Customers and unauthorized staff never receive raw pricing, calculations or private diagnostics. |
| FRESH | Current preview only | Deliberately reorder real preview responses. Old success/error/loading completion cannot replace the latest service/input/revision. Invalid current input is not represented by a prior ready result. |
| RESTART | Persistence across process restart | Stop the actual app; restart it against exactly the same test stores without reseeding; sign in and reopen the UI. Complete books, approvals, enabled choices, quotes/leads and retry records retain their meaning. |
| RELEASE | Final source-bound candidate evidence | All workflow rows above pass at the tested candidate, affected/new regressions and original suites pass, client build succeeds, engine tree is unchanged, controlled bridge has its integration-boundary verification, and no protected branch/provider/live data/deployment changes occurred. |

## Coverage of accepted behavior

Cover every currently supported service adapter with a valid fixture under its actual saved-book contract and representative full browser paths. Cover all wholly review-only types and their retained lead details. Do not claim that one mowing example establishes all service integrations. Do not require new pricing formulas for review-only jobs.

Test both ordinary and boundary amounts, exact missing/invalid/zero distinctions, selected versus unselected extras, costs versus selling prices, relevant fees/taxes/minimums/ranges, valid/invalid sibling tiers and approval edits. Expected amounts must be calculated independently, not obtained from the implementation under test.

## Evidence discipline

Each ledger row needs the tested commit, actual command, a short observed outcome and relative evidence paths. A mocked browser response is not a real server acceptance pass. A component request subsequently supplied to a store proves that narrower path, not authentication or restart. Synthetic fault injection is appropriate for failure controls but must be separately identified.

Allowed row states: `pending`, `in_progress`, `passed`, `failed`, `blocked`. Blocked requires the concrete failed command/prerequisite and what can proceed without it. Completion means all required rows pass; a failing row should be repaired inside the authorized scope rather than converted to a permanent disclaimer.
