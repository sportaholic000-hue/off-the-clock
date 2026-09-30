# Quote flow repair progress — September 28, 2026

**The quoting repair remains incomplete.** Work instructions or measurement uncertainty inside a supported name/address string can still escape the scope check. The ordinary-customer improvements below do not close that finding. Keep PR #3 in draft; this is not approval to launch, merge or deploy.

## Customer and business behavior

The customer selects the work, supplies its measurements and a callback contact, checks the recap and receives an estimate when the supported job can be priced. A name is optional. The business's saved, approved prices and fee decisions remain authoritative. The application does not infer rates or change the accepted arithmetic engine.

The current candidate restores normal names, addresses and defined timing preferences. Additional details and the free-text unknown-facts answer can now be clarified without deleting the original text. The form asks whether additional details change the job, and whether any supplied job facts remain unknown. No answer is preselected. A customer who identifies a message as a message, or confirms that their updated measurements are now complete, can continue to an estimate after the engine checks the actual inputs. Unknown measurements, unpriced selected extras, unknown structured fields and explicitly unresolved work remain review cases.

These answers are customer clarification, not automatic interpretation of prose. The application does not understand arbitrary additional work in a name/address field, and a signed recap is not evidence that it does. The known scope finding remains open rather than being replaced by a passing assertion.

When the customer changes details after a recap, the earlier request and a server-issued receipt are retained with the new answers. The business's stored evidence contains the current and earlier measurements and the clarification questions/answers. Leads expose the safe clarification answers to authorized staff without exposing owner pricing.

Rejected-request recovery previously replaced a supplied work description with the selected saved service's name. A missing-email correction could consequently turn a request for mowing plus other work into a mowing-only estimate. Recovery now preserves the description, displays it in the recap, and exposes an editable **Requested work** field. This optional recovery label identifies the existing submitted service description; it adds no pricing rule. Choosing to edit the work is explicit.

## Verification and evidence

The retained before-state is `3ea5b0e38b18f93f2d02a101698198679e9c4edc`. Actual HTTP reproductions retain complete requests, responses and stored records for ordinary controls, courtesy text, no remaining unknown facts, unresolved work, uncertainty and misplaced work. A separate real-browser reproduction captures the work-description loss during callback correction and its complete positive control.

The executable repairs are exercised by:

```sh
node verification/quotedone/clarification-workflow.mjs . <new-evidence-directory>
node verification/quotedone/clarification-browser.mjs . <new-evidence-directory>
node verification/quotedone/request-recovery-browser.mjs . <new-evidence-directory>
```

These use the existing authorized Node 22.23.2 environment, real application authentication, HTTP, browser and synthetic SQLite stores. Browser dependency/executable variables and the existing esbuild binary are required as documented in the existing verification setup. No dependencies or provider integrations are installed by these commands.

The independent expected controls are $50 for 10,000 square feet at $0.005 and $60 after the customer changes the measurement to 12,000 square feet, with the fixture's neutral factors. Tests also cover incomplete inputs, tenant-bound clarification receipts, stale pricing, approval, unchanged originals, restart and immutable retry. The new workflows are included in the application and browser groups in `run-completion.mjs`; use the final source-bound delivery results for their actual exits. Initial browser load timeouts are retained, not called passes.

The final evidence must identify the exact tested source and published PR source, verify identical application bytes if their commits differ, retain the original failures, and include the final numerical/build/integration results. A pass for the focused fixes must not be described as whole-flow or public-launch acceptance.

## Preserved scope and open release work

- Frozen 19-file engine tree: `dcd481193b10c3cfc667cb23d22fb41b16322cff`.
- Original 459-line voice guide and original engine specification remain restored unchanged.
- Decimal fidelity, callback requirement, retry, partial-option disclosure, permissions, approval, tenant isolation and persistence safeguards remain required regression controls.
- No new markup cap, invented pricing rule, voice runtime, provider integration, live-data change, merge, deployment or permission expansion.
- Name/address prose interpretation remains a confirmed incomplete-request risk. Actual customer clarification is not a universal prose classifier.
- Production operation, provider delivery, voice/booking, billing and public-site release checks are separate unfinished gates. Local quote-flow checks do not establish their readiness.
