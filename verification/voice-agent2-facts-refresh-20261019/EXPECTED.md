# H2 voice facts refresh — independent expectations

Base: `04df35cd8e9ced136ef611cfc2b25f2de64c21bf`.
Branch: `codex/qe-agent2-voice-facts-refresh-20261019`.
Read-only reproduction source: `db1dcb4cb4dedebb59811c390c8fe2ac9a608846`,
`verification/qe-agent4-import-condition-boundaries-20261019/handoff-probes.mjs`
and its unchanged `handoff-fixture.mjs` dependency. No A4 history is merged.

These expectations are written before executing the reproduction or changing
production. All businesses, calls, prices and provider messages used here are
synthetic fixtures, never live provider traffic or customer data.

## Public facts and arithmetic controls

1. An already connected provider initially receives the owner's saved literal
   listing `Widget $10 each`. A caller-confirmed quantity of three produces
   `30.00`: three times ten dollars. This amount is a listed-price calculation,
   not an engine price-book disclosure.
2. After the authenticated owner saves `Widget $12 each`, the provider receives
   the new saved facts. The current listing with quantity three produces `36.00`.
   The old listing is rejected without an amount, including replaying its old
   tool-call identifier. No cached success can authorize a stale listing.
3. Adding `Available to members` must reach the connected provider verbatim.
   The dispatcher requires review without an amount for the qualified listing;
   it must not silently apply an unqualified multiplication. Removing that
   qualification must replace the old facts with the actual current saved text.
4. Consecutive owner saves must not let a delayed earlier refresh overwrite the
   newest facts. Unchanged facts must not create unnecessary replacement sessions.
5. Provider reconnect/resumption must load current saved facts, preserve call
   context and stop accepting output or tool calls from retired provider sessions.
6. While a refresh is pending, stale provider output must not reach the caller.
   If fresh facts cannot be compiled or delivered, use the existing session
   failure path; never acknowledge refresh success or continue with stale facts.
7. A refresh is bound to its authenticated owner and call. Another tenant's
   saves, facts, private rates, tool results and resume handles must not leak.
   Independent calls for the same owner must each obtain the current facts.
8. Existing historical receipts, persisted transcripts and real dispatcher
   safeguards remain intact. A settings edit never recalculates a frozen receipt
   or silently renews approval.

## Scope and acceptance

Production changes are limited to necessary voice runtime/provider-session
files. New normal regressions have a `voice` prefix; all new evidence stays in
this directory. Importer, widget, arithmetic, F2, specifications, dependencies,
selectors, prior assertions and the 45-minute CI test timeout are unchanged.

The supplied H2 reproduction must first demonstrate the defect on the exact
base. Preserve that failed output. New regressions must inspect actual provider
connection/message arguments and exercise the real dispatcher with synthetic
saved owner data. Provider API behavior must be grounded in the installed SDK
and official documentation. Synthetic provider tests establish our boundary
behavior, not actual model speech or a live provider acceptance result.

Run focused and neighboring voice/provider/session/privacy/history regressions,
then publish only this unique branch and verify the final commit's own hosted
strict, full, browser, build, Docker, checker and production dependency-audit
results. Record actual counts; do not change selection or assertions to force
an expected total.
