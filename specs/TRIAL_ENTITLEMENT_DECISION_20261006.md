# Selected-plan trial entitlement — October 6, 2026

## Owner decision

The owner approved selected-plan trials in this conversation on October 6, 2026.
An Operator trial receives Operator features. A QuoteDone trial receives
QuoteDone features. Trial status alone does not grant a higher tier.

This resolves **PC01** in the billing reliability audit of source revision
`73c00622d6f2df31f57773b32e41355a7421f1a3`, published at
`b302075eb8f3ff92bb7db030f37afea3a30f6905`.

## Governing rule

- Feature entitlement follows the selected plan during both its trial and paid
  subscription. Operator trials do not acquire QuoteDone access merely because
  they are trials.
- QuoteDone trial access remains subject to the existing configuration,
  approval and readiness requirements for the feature being used.
- Trials remain 14 days, card required, with a 60 voice-minute cap.
- The existing section 12.11 rule remains: finish an in-progress call, absorb
  the trial overrun, and apply fallback from the next call. Do not cut off a
  caller when the cap is reached.
- Existing payment verification, expiry, conversion, cancellation, prices,
  supported signup plans and plan-change rules are unchanged by this decision.

This decision supersedes section 8's earlier statement that every trial has
“full QuoteDone features.” Section 8 is amended to agree with selected-tier
onboarding in section 4 and plan-specific access in section 5.5.

## Repair acceptance

Billing repairs must demonstrate that verified Operator and QuoteDone trials
receive their own plan's features, that neither pending Checkout nor an
unverified payment method grants access, and that trial expiry is enforced at
protected HTTP, public and voice entry points. The voice-minute cap must prevent
the next AI call under the existing section 12.11 rule.
The UI must describe the selected plan's trial consistently with backend access.

This is a policy clarification, not evidence that those workflows pass.
The **11 defects** and incomplete billing capabilities in the audit remain
open until repaired and verified. The historical audit report is unchanged.
No refund, proration, repeat-trial or offboarding policy is invented here.

## Change scope and verification

This checkpoint changes only this decision record and
`specs/platform_spec_v2.md`. It adds no application code, tests, migrations,
provider operations or live-data changes. No merge or deployment is authorized
by this checkpoint. No application tests are claimed for this documentation-only
change; publication is checked by commit comparison and exact file readback.
