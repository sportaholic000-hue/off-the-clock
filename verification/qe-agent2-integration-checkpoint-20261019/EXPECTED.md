# Integration checkpoint expectations

Recorded before merging the requested heads, adding the normal F16 test entry point,
or executing the combined tests. These expectations preserve the incoming owners'
assertions; they do not introduce pricing, receipt, presentation, or policy changes.

## Exact histories

- Start from A3 `eaca39b875fd11274ca00bb56a9d67fa8b48142f`.
- Preserve A1 `abc2becff9cd252a63ff30258e9950a07af2c020` as an ancestor.
- Preserve A2 `b06583ec119500762f37d437b434debb11246f29` as an ancestor.
- Preserve reviewed F18 `17d224c421b82f39cb2c6eb786db45e118e13ac3` as an ancestor;
  its sole parent is `03b29925437e73acb24b916ba6e69e5a002dfff1`.
- Retain the identical authorized 45-minute test-job timeout. Do not change selectors.

## F16: all 14 existing pipe-jack cases

Invoke the existing `f16-with-agent2.spec.mjs` unchanged from a normally selected
test entry point. Its existing case generator and captured legacy receipts remain
byte-identical to A1. Each of its 14 individual passing names must occur exactly
once in the hosted strict gate and exactly once in the hosted full suite.

- Eight rejection cases: base/tier, MANUAL/AI, approval/adoption. The stored
  100.5-cent discrete price must be rejected without changing durable book bytes,
  approval/adoption receipts, revision, unconfirmed marker, or creation record.
- Two unapproved legacy cases: base/tier invalid discrete prices cannot gain receipts.
- Four valid controls: base/tier and MANUAL/AI accept 100 cents per item, retain
  the 100.5-cent measured linear-foot rate, and allow legitimate adoption.
- Run the requested dependency suite explicitly alongside A1 approval and A2
  precision/metadata regressions: 20 + 14 + 16 + 44 = 94 existing cases.
- Preserve the correct fractional-rate extension and unchanged historical receipts.

## A3 rendered tier wording and confirmation labels

Run A3's existing real Chromium component tests against the combined code.
Inherited material pricing uses its base receipt; an explicit same-price override
requires its own tier receipt. Pending prices remain Inherited $581 and Premium
$881. Confirming the Same price tier adds $581 without changing the other amounts.
Both pending confirmation labels must identify Base price or Same price exactly;
the actionable Same price confirmation must dispatch that tier's existing ID.
The mode-specific material wording and incoming receipt-preservation assertions
remain unchanged.

## F18

- Preserve both incoming `test/voiceAgent4F18*.spec.mjs` files and all 41 assertions
  without adding another normal entry point. Each individual case must pass exactly
  once in hosted full, and neither file may enter strict quote selection.
- Rerun the original 91-check matrix using byte-identical source in this checkpoint's
  evidence directory, because the original script writes observations and SQLite
  receipts beside itself. Preserve every incoming evidence file unchanged.
- Retain valid option amounts, genuine additional work, per-option exclusions,
  historical receipt bytes, privacy rules, and malformed-range review behavior.

## Remaining scope

This is a separate integration checkpoint, without main integration, deployment,
tags, force pushes, or writes to another agent's branch. The unpublished
`9af52ddc13c78beec84e7f090506da8c9b5fd691` parser recovery and F2 policy remain
outstanding. No selector, dependency, specification, or workflow redesign is authorized.
