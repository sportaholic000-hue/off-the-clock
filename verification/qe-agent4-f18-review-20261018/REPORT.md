# Agent 4 read-only F18 compatibility review

**F18 compatibility is not clean at the reviewed A3 commit.** Malformed
historical option entries can erase a valid shared additional-work exclusion
and promote a partial receipt to ready. No production repair was made.

Reviewed commit: `03b29925437e73acb24b916ba6e69e5a002dfff1`.
Parent: `5eee6f6ba502e6622a379be947994f0b40ef4301`.
Tree: `9d3e91adc48861de0b11ba6b087e98ee60b63771`.
The exact SHA/tree were obtained from GitHub and verified in a detached clone.

## Findings and exact reproductions

### F18-R1: malformed optional entries remove shared global scope

Locations: `server/src/quoteScopeDisclosure.js:8–14,57–64` and
`server/src/voice/voiceQuotePresentation.js:160–186`.

Minimal input (complete executable version is `minimal-reproductions.mjs`):

```json
{
  "resultType": "PARTIAL_ESTIMATE_READY",
  "pricedEstimate": {
    "resultType": "INSTANT_ESTIMATE_READY",
    "options": [
      null,
      "invalid",
      {
        "tierName": "[PLACEHOLDER] Saved",
        "lowEstimate": 221.23,
        "highEstimate": 243.35,
        "currency": "CAD",
        "skippedAddons": ["Door sides"]
      }
    ]
  },
  "additionalWork": [{"source":"unpriced_surface_work","description":"Door sides"}],
  "additionalWorkStatus": "ON_SITE_ESTIMATE_REQUIRED",
  "fullJobTotal": null
}
```

Expected: the one valid option's Door sides exclusion remains global additional
work; customer and saved-voice presentation remain `PARTIAL_ESTIMATE_READY`.

Actual:

| Projection | Exact relevant outcome |
| --- | --- |
| customerReceiptPresentation | `INSTANT_ESTIMATE_READY`; `additionalWork` and `additionalWorkStatus` absent; original options retained; `fullJobTotal: null` |
| projectSavedQuoteContext | `INSTANT_ESTIMATE_READY`; one valid option at CAD 221.23–243.35; its `skippedAddons: ["Door sides"]` remains, but global additional work/status and `fullJobTotal` are absent |
| projectVoiceQuote | Throws `TypeError: Invalid voice quote range.`; no quote returned |

This is loss of **global partial/additional-work semantics**, not complete
erasure of the option-level exclusion and not a change to the valid amount.
The same estimate without the partial wrapper passes the existing D15-style
saved-history control: null/string entries are ignored and the range survives.

Cause: any non-record option makes sharedSurfaceExclusions return an empty
intersection. The presenter removes the old generated work before it knows
that empty means uncertain/malformed, then promotes the receipt to ready. Saved
voice filters the malformed entries only after that promotion. The matrix also
reproduces promotion with junk after a valid option, two valid shared options
plus null, an empty option object, a reversed-range option and all-junk options.
An empty/malformed option is not proof that some valid priced option includes
the work. The supplied F18 oracle and spec refer to valid options.

### F18-R2: saved voice accepts malformed option records

Location: `server/src/voice/voiceQuotePresentation.js:169–186`.

For an instant receipt with the sole option
`{tierName:"[PLACEHOLDER] Reversed",lowEstimate:300,highEstimate:200,currency:"CAD"}`,
saved voice returns the same ready option with low **300** and high **200**.
Live voice rejects it with `Invalid voice quote range.` An empty object alongside
a valid option is likewise retained by saved voice as a price-less option.

This is a malformed-history validation asymmetry. The range is preserved
numerically but is invalid; preserving numbers does not make it safe to publish.
The guard/filter logic predates this A3 repair: comparison against A3's recorded
base `0b59a401e1d8f2c2c43188c7355abb9939504b9b` shows only the new receipt-presenter
import/calls in the voice file. That is source-comparison evidence, not an
independent execution of the older revision.

### F18-R3: live voice silently drops a malformed options container

Location: `server/src/voice/voiceQuotePresentation.js:124–131`.

Input: an instant receipt with low **221.23**, high **243.35**, currency CAD,
and `options: {invalid:"[PLACEHOLDER] malformed options"}`.
Live voice returns `status: "quoted"`, repeats **$221.23 to $243.35 CAD**, and
omits `options`. Saved voice rejects it with `Invalid saved options.`
This pre-existing guard difference is visible in the same source comparison;
it is not attributed to a newly changed range validator in A3.

## Requested coverage and preserved properties

| Area | Result |
| --- | --- |
| Single excluded option | Partial scope and its shared exclusion retained through all three projections |
| Single included option with historical false-global work | False generated global work removed; option/amount retained |
| Mixed exclusions | Base-only exclusion remains per option; no false global exclusion |
| Shared exclusion intersection / all shared exclusions | Only shared labels become global work; each option's exact labels remain |
| Genuine caller-declared work | Literal caller text/source retained, including a caller item named Door sides and a shared-plus-genuine case |
| Historical singleton without options | Saved amount and known exclusion retained |
| Malformed historical options | Failures above; live rejects malformed array members while saved handles non-record optional members after unsafe scope normalization |
| Repeated projection | All 18 cases stable; repeated wrong results remain wrong |
| Stored receipts and aliasing | Frozen input unchanged; read-only synthetic SQLite receipt JSON and database file bytes unchanged; mutating returned clones does not mutate input |
| Valid amounts/options | Exact valid low/mid/high amounts, order, names, per-option disclosures, currency, tax and units retained; no computed whole-job total |
| Privacy | No tested internal metadata or financial sentinel exposed by either voice projector when it returned output |

The direct customer presenter was tested with already customer-sanitized receipts
plus its documented removable internal metadata. Raw lineItems/rate/markup/margin
sentinels were injected separately into the voice-boundary probes. No claim is
made that customerReceiptPresentation is a general raw-engine-result sanitizer.

## Execution evidence

- Primary matrix: **91 checks; 76 pass, 15 fail; zero skipped/cancelled/TODO**.
  Ten normal cases pass all 50 associated checks. The remaining failures are
  malformed-input assertions, not arithmetic changes.
- Minimal reproductions independently confirm R1–R3 and the D15 instant control.
  Their script exits zero because reproductions and stability checks completed;
  that exit is not a passing compatibility verdict.
- Expectations were recorded before execution. A fixture-only follow-up aligned
  top-level fields with the first valid option per the spec; assertions were not
  weakened. The initial inputs/source/log are preserved under `initial-fixtures/`.
  Both matrix executions yield the same 76/15 result. Independent minimal
  reproductions do not use that fixture constructor.
- Runtime: Node **v24.19.0**. No dependency installation, build, provider call,
  browser run, production data access or hosted gate was performed.
- `observations.json` and `minimal-results.json` contain exact inputs, outputs
  and exceptions. `review.tap` records every assertion. `execution.json` and
  `minimal-execution.json` bind commands to pre-execution expectation/probe hashes.
- `summary.json`, `retention.json` and `baseline.json` bind the review to the
  target tree. All **3,146** pre-existing tracked files and all local refs remain
  unchanged; HEAD remains detached. All new work is confined to this directory.

From the exact target checkout, after extracting the archive at repository root:

```sh
node --test --test-concurrency=1 --test-reporter=tap verification/qe-agent4-f18-review-20261018/review.spec.mjs
node verification/qe-agent4-f18-review-20261018/minimal-reproductions.mjs
```

The first command is expected to fail with the reported assertions at this SHA.
Both commands write only their local synthetic evidence files in this directory.
The SQLite file is synthetic fixture storage; this review does not substitute for
the production submit/retry route, browser or full hosted integration gates.

## Agent 4 recovery status

The previously delivered `9af52ddc` recovery archive was not opened, changed,
replaced or re-uploaded by this review. Workspace maintenance had removed its
old local copy; no fresh archive-integrity claim is made. Its outstanding
publication and exact-final hosted gates remain outstanding. No branch was
pushed, committed, merged, tagged or deployed during this review.
