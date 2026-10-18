# Read-only F18 compatibility expectations (before execution)

Target A3 commit: `03b29925437e73acb24b916ba6e69e5a002dfff1`.
Parent: `5eee6f6ba502e6622a379be947994f0b40ef4301`.
Tree: `9d3e91adc48861de0b11ba6b087e98ee60b63771`.

This review changes no production file, existing assertion, selector, branch or
remote ref. All new probes and evidence live in this directory. Synthetic
receipts are hand-authored projection inputs; they are not claims of new engine
quotes or browser/runtime acceptance. Each fixture is marked [PLACEHOLDER].

## Oracles

The engine specification requires exclusions per valid option; a shared
exclusion applies globally only if every valid option excludes that work, or
there is one option. Agent 3's F18 expectations require historical false-global
receipts to be normalized on a clone, preserving all amounts and genuine
caller-declared additional work. Existing caller-history test D15 requires
malformed optional non-record entries not to hide valid saved ranges.

Hand-written amounts: Base = low 1000.01, mid 1064.02, high 1100.03 CAD;
Complete = low 1100.04, mid 1164.05, high 1200.06 CAD. Presentation must preserve
these exact JavaScript numbers, option order, names, exclusions, per-option
disclosures, tax wording and units. No multiplication, recalculation, aggregation,
currency conversion or invented whole-job total is permitted.

| Case | Expected presentation and saved voice |
| --- | --- |
| Single option excludes Door sides | Partial; Door sides remains global additional work and on its option. |
| Single option includes Door sides, historical false-global label | Ready; generated global Door sides removed; amount and option survive. |
| Base excludes Door sides, Complete includes it | Ready; only Base excludes Door sides; no global additional work. |
| Base excludes Door sides and Windows, Complete excludes Door sides | Partial; only Door sides global; Windows stays Base-only. |
| Both options exclude Door sides and Windows in different orders | Partial; shared labels preserved once globally, option labels/order untouched. |
| Mixed options plus caller-declared detached repair | Partial; preserve the exact caller text/source, remove only false generated work. |
| Caller-declared Door sides with the same label as generated work | Preserve caller-declared item even when an option includes Door sides. |
| Shared exclusion plus genuine caller work | Both remain; no full-job total invented. |
| Historical single amount without options | Preserve amount and its known shared exclusion. |
| Already-ready mixed receipt | Preserve the complete options and amount fields. |
| Null/string/array/boolean/number optional entries plus one or two valid options | Valid options/ranges and their shared exclusion survive saved projection; junk cannot promote partial to ready. |
| Malformed optional entries plus mixed options and genuine work | Genuine work remains; valid mixed options retained. |
| Empty or reversed-range object alongside a valid option | A malformed object must not erase a valid shared exclusion. Saved voice must omit an invalid option or reject safely, never publish an inverted range. |
| All historical option entries malformed | Preserve known partial scope or fail safely; absence of valid options is not evidence that all requested work is priced. |
| Non-array options container | Saved/live voice should reject malformed option structure rather than silently publish it as valid. |

Live projection may reject malformed options with an exception and no quote;
that is recorded separately from the saved-voice compatibility requirement.
These expectations do not authorize a production repair.

## Stability, storage and privacy

- `customerReceiptPresentation(customerReceiptPresentation(receipt))` is stable.
- Each voice projector gives the same result (or same explicit rejection) on
  repeated reads of the same receipt, and on the customer-normalized receipt.
  Voice output schemas are not fed back as if they were stored receipt schemas.
- Deep-frozen parsed input is unchanged. A seeded synthetic receipt store is
  reopened read-only; its JSON strings and file bytes remain exact after every
  projection. Mutating an output clone must not alias the stored/parsed input.
- Known internal presentation fields (rangeBufferUsed; pricedScope serviceId,
  serviceType, bookRevision; jobSummary bookRevision) are removed from the
  customer clone and never exposed by either voice projection.
- Financial sentinel fields injected only for the two voice-boundary probes
  (lineItems, rates, markup/margin, internalResult) never appear in voice output.
  customerReceiptPresentation consumes already customer-sanitized receipts;
  this review does not assume it is a general raw-engine-result sanitizer.
- Compare every pre-existing tracked file and every local ref with the baseline.

## Scope limits

Run the actual three projection exports at the exact target commit. Record every
input/output/rejection and each failed assertion. This is a projection-level
compatibility review, not a full widget/browser, live provider, deployment or
hosted-release gate. No production repair or publication is part of this task.
The previously delivered `9af52ddc` recovery archive is not read, replaced,
deleted or re-uploaded; its outstanding publication/hosted gates remain outstanding.
Workspace maintenance removed the old local copy; this review uses a fresh
detached clone and does not claim a fresh integrity check of that archive.
