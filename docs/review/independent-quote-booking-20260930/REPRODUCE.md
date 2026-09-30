# Reproduce the independent review

Checkout the evidence branch, which preserves application source from `1013190bd8e62e5df3aa70750399873bc050e447` and adds only review code/documentation. Use the portable Windows Node 22.23.2 runtime and installed native dependencies compatible with ABI 127. Never rebuild another agent's shared native dependencies.

The saved `verification/quotedone/run-resume-check.cjs` strips inherited provider settings, uses test data, disables billing/voice/live delivery and runs commands with a ten-minute timeout. The application harness requires the exact runtime version and uses its isolated synthetic entitlement fixture. The inspection preload intercepts provider requests and introduces only the deliberate pre-write crash barrier.

Supply a fresh evidence directory outside the checkout and a nonexistent `store` subdirectory. Port 4872 must be free. Example from checkout root, substituting an evidence directory you control:

```powershell
& '.portable-runtime/node-v22.23.2-win-x64/node.exe' 'verification/quotedone/run-resume-check.cjs' 'independent-qbook' 'C:/isolated-review/run-01' 'verification/inspection/quote-booking-review.mjs' (Get-Location).Path 'C:/isolated-review/run-01/store'
```

At the inspected source, expected exit status is **1** with **15 passes and the two named booking failures**. This is a defect reproduction, not a passing launch gate. Inspect `store/REVIEW_RESULTS.json` and retained local records. Run again with a different evidence directory to check durability and determinism.

Existing regression command, with another fresh evidence directory:

```powershell
& '.portable-runtime/node-v22.23.2-win-x64/node.exe' 'verification/quotedone/run-resume-check.cjs' 'booking-existing-regression' 'C:/isolated-review/regression-01' '--test' 'test/bookingService.spec.mjs' 'test/bookingRoutes.spec.mjs' 'test/bookingPreferenceService.spec.mjs' 'test/bookingTokenReceipt.spec.mjs'
```

Observed existing regression: exit 0, 54 passes. Confirm source identity before claiming results on any later engine/calendar repair. These tests do not write a real provider calendar or send real email/calls.
