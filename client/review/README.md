# GitHub backup and review entry point

The owner explicitly requested GitHub backups because the working computer is unreliable. This branch is a source/evidence checkpoint, not a merged or deployed release. PR #3 stays draft; backend integration remains in progress on its own branch.

## Verified frontend source

- GitHub snapshot: `8a85931e46f0b992e8433289f5e6b52879dcb881`.
- Original tested local commit: `75336c44da14473c329dc17adf4c238ddcb1a752`.
- Identical complete source tree: `5c79e1c225e84a8937c844173bc65f23cbd77a46`.
- The two commits have different publication metadata, not different source files. The evidence archive preserves the original local Git bundle and patch.
- [Detailed results and limits](VERIFIED_FRONTEND_20260929.md) describe that exact checkpoint. Its historical statements about not being published have been superseded by this backup.
- Full original evidence archive: 10,880,158 bytes. GitHub attachment is pending the owner-specific approval requested by automatic approval review because the archive includes synthetic databases. Source and readable reports can be backed up independently.
- Archive SHA256: `3db228a3feb384d9833ba7fdb9dffb89ee5044ce16c9cb2eb123f5b6c725ba90`.
- Archive Git blob: `951954096182897b635ed1e2e97aee331cff81b9`.
- All 1,863 archive payload hashes were verified. Publication scan found no non-synthetic user emails in the seven fixture databases, unexpected environment files, or matching live-credential patterns. This scan does not substitute for review.

Supported measured work still quotes with a callback and no name. Separate work remains excluded for an owner on-site estimate. Both builds, 10 transport cases, 21 widget/API rows, 9 booking UI fixture cases, and 7 original customer/owner workflows passed. Counts overlap. The broader regression was 465/466; booking fixtures do not prove real provider integration. The main-area/location concern and whole-product acceptance remain open for the combined backend.

## Work in progress after that checkpoint

The initial billing scaffold preceded the implementation checkpoint below. Its first two browser attempts timed out and remain under `billing-wip/`; neither is claimed as a reproduction or successful test. Later billing evidence is listed below.

The next combined acceptance work covers the versioned pricing-only form, legacy location-shape rejection, selected-work measurements, separate-work exclusion, structured service area, real booking holds/release/pending polling, exact retry/reload, and new/canceled-owner billing access. These are outstanding checks, not passed gates.

No arithmetic engine, voice guide, server implementation, live provider state, production data, dependency installation, environment permissions, PR head, merge, or deployment was changed by this backup.
## Billing implementation checkpoint (in progress)

The Settings billing screen is now implemented in client source. It consumes the agreed owner-only `/api/billing/status`, `/api/billing/checkout`, and `/api/billing/portal` interfaces. Pending/canceled accounts retain an entry point; only server account state describes activation. Checkout/portal retries retain the exact request key and body across reload, and no price IDs or client prices are submitted. The account profile form preserves the unchanged current plan for compatibility instead of offering a direct plan-change control.

Fifteen transport tests passed (five billing and ten existing widget cases). Browser acceptance is not yet passed. An initial build from the development checkout failed because its tracked vendor tree lacks the Windows Rollup optional binary; no dependency install or lockfile change was attempted. Verification will use the existing Windows-compatible dependency set in an isolated source snapshot, as in the earlier accepted frontend run. This section is a backup checkpoint, not a launch or billing-provider acceptance claim.

## Verified billing interface checks

On source `3560815d1475a650d5062a9aab31ab7bae62fe69` (matching client files in GitHub `9ce33192c8576c2709987410832ce2c801875d01`), both production builds, all 15 transport tests, and all 11 billing browser fixture cases passed. [Complete browser responses](billing-ui-20260929/browser-result.json), [source hashes](billing-ui-20260929/source-binding.json), [transport output](billing-ui-20260929/transport-tests.log), and build logs are retained with the mobile screenshot and browser runtime.

The browser cases cover pending/canceled owner access, mobile checkout, exact checkout/portal retry across reload, explicit rejection and correction, invalid destination rejection, provider-unavailable controls, staff denial, recovery from a blocked dashboard, sign-in recovery, and server-controlled activation. These are synthetic HTTP/provider interface fixtures. They do not establish real Stripe delivery, webhook behavior, backend recovery correctness, or public-launch readiness.

The original full-page helper now also follows the advertised form mode. Its expected quote amounts and persistence assertions are unchanged. Running that adapted helper against the recovered combined backend remains outstanding. No arithmetic-engine, original voice-guide, or server-source change is included in this frontend checkpoint.


A third baseline browser attempt, using an explicitly rebuilt pre-billing source, also timed out before any fixture API request was recorded. Its [complete failed result](billing-wip/before-attempt-3.json) is retained. No before/after reproduction pass is claimed for these attempts; the eleven passing billing cases establish the implemented interface behavior only. The older database-containing ZIP remains excluded pending the previously requested specific upload approval.
