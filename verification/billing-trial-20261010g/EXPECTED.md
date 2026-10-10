# Billing trial verification — expectations written before execution

Base: `claude/release-candidate-20261010g`, exactly `8973f429df487c58f3ad7a49bfdb35ebbb9a274a`.
The remote ref was checked with `git ls-remote` before cloning or running experiments and matched; local HEAD matched after cloning. Read AGENTS.md and specs/BUILD_STATUS.md first. No prior audit or passing test is evidence for these checks.

All data and provider implementations are synthetic. The harness may compose existing production route/component modules with existing fake Stripe/Google Live/Twilio fixtures. It must not replace the Billing page or fabricate its status responses. No application source, tests outside this folder, specs, provider accounts, deployments, or text messages will be changed or used.

## Policy and hand-calculated values

Sources: `specs/platform_spec_v2.md` §8 (plans, annual billing, overage, trial), §12.11 (14-day trial, hard 60-minute cap and usage visibility), and §12.5 (each connected call rounds up to the next whole minute). The owner's current plan ruling overrides older plan text.

| Plan | Monthly | Annual, charged up front | Minutes each month |
|---|---:|---:|---:|
| Starter | $69 | $690 | 150 |
| Operator | $119 | $1,190 | 300 |
| QuoteDone | $279 | $2,790 | 1,200 |

All three plans: $0.35/minute overage, charged at each $25. Annual billing does not turn the monthly minute allowance into an annual pool. No real checkout or payment is required or permitted for this verification.

Synthetic clock: 2026-10-10 12:00:00 UTC. Trial start: the same instant. Trial end: 2026-10-24 12:00:00 UTC. Fresh trial: 14 days left, 60-minute cap, 0 minutes used, 60 minutes left, $0 owed. Before provider completion, duration is pending/unconfirmed and must not be presented as final billed usage. The one completed call lasts exactly 125 seconds: 125 / 60 = 2 + 5/60; rounded up per call = **3 minutes**, so **57 trial minutes remain**, and overage is **$0**. At completion the clock is 12:02:05; a whole-day display may still show 14 days (ceiling of the remaining trial duration).

## Checks and screenshot plan

1. **Fresh trial — §8, §12.11.** The real Billing screen shows trial status, days left, the 60-minute cap, and 0 minutes used. GET `/api/billing/status` returns HTTP 200 with matching trial and usage values. Capture the screen and the actual JSON response.
2. **Pending call — §12.5, §12.11, task requirement.** Admit one correctly signed synthetic Twilio incoming call, connect the real media route to fake Google Live, then end the media stream while withholding the provider's final duration. The Billing screen must show that duration is pending; capture it and the real billing/usage evidence.
3. **125-second completion — §12.5, §12.11.** Send the signed synthetic completion containing `CallDuration=125`. Expect HTTP 204, a reconciled 3 billed minutes, 57 trial minutes remaining, and the Billing screen to show the correct usage. Capture the screen and route/database evidence.
4. **Refresh — task requirement.** Without reloading the document, change authoritative synthetic billing state through a signed fake Stripe subscription event. Click `Refresh billing status`. Expect another status GET and visible updated billing state. Use a plan change (Operator to QuoteDone) to make stale versus fresh state unambiguous; no price, invoice, or account is real. Capture before/after evidence and the refreshed screen.
5. **Monthly choices — §8 + owner prices.** Inspect each offered plan on the real subscription selection screen; the visible choices must communicate $69/$119/$279 per month, 150/300/1,200 minutes, and $0.35/minute billed each $25. Capture all selections.
6. **Annual choices — §8 + owner prices.** Inspect all three annual selections; expect $690/$1,190/$2,790 annually, the same 150/300/1,200 minutes resetting monthly, and the same overage. Capture all selections. Use a separate synthetic pre-checkout owner if an existing trial correctly hides initial checkout.
7. **Stripe disabled comparison — descriptive, not a repair.** Run the same real screen/route composition with Stripe billing disabled. Record the exact HTTP status/body and visible page message, including whether subscription/usage controls appear. No requirement that disabled billing emulate enabled billing is inferred from §8/§12.11. This row passes if the comparison is successfully observed and documented, even if the route is 404.

Each row is one reported check (7 total); multiple plan selections are sub-observations, not additional checks. Record product failures separately from browser/environment failures. A screenshot that could not be captured is explicitly unavailable, never substituted with a mock image. No fixes are authorized.
