# Verification index

The latest recorded code checkpoint is `5e2ea764`. Its local and hosted results,
source bindings and reproducible tests are recorded in the
[October 4 follow-up](independent-followup-20261004/README.md).

## Recent checkpoints

| Evidence | Source checkpoint and meaning |
| --- | --- |
| [Independent follow-up](independent-followup-20261004/README.md) | Verification of `6eb6622`, subsequent repair at `5e2ea764`, and original before/after evidence. |
| [Astra five-finding repair report](astra-five-repairs-20261004/REPORT.md) | PR #23 implementation evidence, tested code `58769d7`; the follow-up above found and then repaired the remaining original QP-05 case. |
| [Final repairs](quote-final-repairs-20261004/REPORT.md) | PR #22, prior save-lock/readiness repair checkpoint. |
| [Small repairs](quote-smalls-20261004/REPORT.md) | Earlier October 4 currency/interview/CI repair checkpoint. |

## Earlier quote/price-book evidence

| Topic | Evidence |
| --- | --- |
| Trade decisions and financial behavior | [Trade decisions](quote-trade-decisions/REPORT.md), [decision follow-up](quote-decision-followup/REPORT.md), [component pricing](component-pricing-repairs/REPORT.md) |
| Owner status and presentation | [Owner status messages](owner-status-messages/REPORT.md), [Claude review fixes](claude-review-fixes-20261003/REPORT.md), [rounding specification](rounding-spec-20261002/REPORT.md) |
| Earlier audit repairs | [Agreed follow-up](agreed-audit-followup/REPORT.md), [re-audit repairs](quote-reaudit-repairs/REPORT.md), [server correctness](quote-server-correctness/REPORT.md), [editor repairs](pricebook-editor-repairs/REPORT.md) |
| Reusable arithmetic/application harnesses | [engine-independent/](engine-independent/), [quote-readiness/](quote-readiness/), [quotedone/](quotedone/), [opus-review/](opus-review/) |
| AI draft verification | [pricebook-ai/](pricebook-ai/) |

## Other retained evidence

Navigation only, outside this follow-up's functional audit:
[dependency security](dependency-security-20261003/REPORT.md),
[auth/email](auth-email/), [sessions](session-security/),
[launch-plan security](launch-plan-security/),
[operator integrations](operator-integrations/),
[Railway](railway/), [widget embed](widget-embed/),
[inspection](inspection/) and [customer wording](customer-wording/).

## Reading a result correctly

- Match the report's tested commit and source hashes to the code being reviewed.
- Keep raw test failures, known-failure allowances, skipped cases and environment
  failures visible. A green workflow may include an explicitly allowed baseline.
- Test counts from overlapping runs are not additive.
- Reproduce the original failing input and preserve independent expected amounts.
  A similar input or a newly written test alone does not establish closure.
- Historical reports and source bindings remain untouched. New observations
  belong in a dated follow-up with links to the earlier evidence.
