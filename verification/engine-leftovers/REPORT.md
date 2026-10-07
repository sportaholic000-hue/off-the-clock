# Four engine leftovers — verification record

Branch: `fix/engine-leftovers`. Exact parent:
`4db13a2945193762bbc4b85f9ab616a00e1dd067`, verified against
`codex/audit-small-repairs-20261007` before source inspection or changes.

The active agent performed all work. All databases, calls, HTTP sites and prices
used for reproduction are synthetic and temporary. No subagents, main merge,
deployment, live data or live provider calls.

## Reproductions before repair

All eight regression checks failed against unchanged production source before
implementation. Dollar expectations were written first in `EXPECTATIONS.md`.
The baseline log is retained as `before.tap.gz`.

| Defect | Source cause | First execution | Second execution |
| --- | --- | --- | --- |
| Wrong underlayment confirmation | `voiceQuoteContract.js` projected the first shared field label without resolving `presentationVariants` against customer inputs; no selected-description proof accompanied the boolean. | A laminate job's projected question named hardwood plywood instead of laminate foam. | The saved, approved production voice runtime released the $852 laminate quote with only the unbound boolean. |
| Lost historical qualifications | `customerHistoryService.js` copied only amounts, currency and tier names; the dispatcher whitelist likewise discarded qualification fields. | A saved $100 per-visit receipt lost its unit, tax treatment, exclusions and allowance disclosure. | Dispatched partial history lost its priced scope, separate stump work and explicit absent whole-job total. |
| CSS-hidden website prices | `websitePriceExtraction.js` checked hidden attributes and limited inline styles without evaluating stylesheets. | Direct extraction included stylesheet-hidden $999 beside visible $20. | A real local HTTP import included the $999 price inside a stylesheet-hidden ancestor. |
| Model multiplication | `voicePromptCompiler.js` explicitly allowed receptionist multiplication; schemas/runtime exposed no authoritative listed-price arithmetic operation. | The actual compiled prompt still contained the model-multiplication permission. | `validateVoiceToolCall` rejected the proposed exact server operation as `UNKNOWN_VOICE_TOOL`. No claim is made that a live model produced a particular incorrect product. |

## Changes

- Scope questions use shared selected-input presentation rules. HMAC confirmation
  tokens bind the selected descriptions to the service, owner, call and book
  revision. Missing answers return resolved questions; bare, forged or stale
  answers release no new quote. Tokens participate in request identity, so a
  different confirmation cannot replay an earlier successful request. Existing
  request identities without scope tokens remain compatible with frozen history.
- Returning-caller context projects frozen customer receipts, retaining units,
  currency, tax treatment, full disclosures, exclusions, per-option qualifications,
  priced scope and separate work. Partial receipts explicitly have no full-job
  total. Oversized or malformed qualifications withhold amounts instead of
  silently stripping the qualifications. Owner costs and current book rates
  remain absent.
- Website extraction evaluates a bounded CSS subset, including ancestor hiding
  and same-host linked stylesheets. Existing DNS, pinned connection, redirect,
  time, byte and request limits also govern CSS. Unresolved visibility omits the
  page's prices and discloses incomplete coverage. Scripts and foreign resources
  are not fetched. This intentionally does not claim arbitrary browser layout
  support; unmodeled CSS can require manual entry of visible prices.
- `calculateListedPrice` reads one exact current saved owner listing and one
  confirmed decimal quantity. Integer coefficients produce an exact decimal
  string, including fractional cents, without floating-point multiplication or
  rounding. The complete listing conditions accompany the spoken result.
  Stale, foreign, draft, ambiguous, nonlinear and unsupported listings are refused.
  The receptionist performs no multiplication, addition, tax/fee computation,
  discounting, unit conversion or other arithmetic.

The owner's requested behavior and the narrow same-host CSS transport amendment
are recorded in `specs/ENGINE_LEFTOVERS_20261007.md`. Engine formulas and the
immutable voice guide are unchanged. CI's existing push allowlist now includes
the requested branch; no test, browser gate or failure checker is disabled.

## Verification

The first expanded focused run passed **179/179**, zero failures, skips,
cancellations or TODOs. It exercised the actual saved/approved quote runtime,
history dispatcher, local HTTP importer, schema validation, exact arithmetic and
signed production voice callback/provider-tool delivery. Additional CSS boundary
checks cover transparent text, zero font size and unresolved styling.

The cold install passed. Local Chromium crashes with SIGTRAP before browser
assertions execute, as independently reproduced with both Chromium builds.
Local full gates are still run and their failures are not converted to skips.
An older regression asserted the superseded permission for model multiplication;
it now asserts the server operation and the explicit ban on receptionist math.
Hosted cold gates and their exact source revision are checked before delivery.
This source checkpoint makes no claim that a pending hosted run has passed.
