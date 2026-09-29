# Application repair checkpoint — September 29, 2026

This is an incomplete application repair checkpoint, not a release. No merge, deployment, live provider request, or live-data mutation was performed. The active agent worked directly without subagents.

Backend base: 3d2eedb74f31494eb2086abcfa1f0702b094d7b7. The separately published frontend remains at 5adc1ecf0aaa5ee41129e5115576182135194f3d pending combined acceptance.

Reproduced and repaired: missing booking administration module; missing booking/calendar/billing database definitions; missing auth-token schema and email-verification column; missing service-area checks in booking availability and confirmation. The frozen arithmetic engine and original voice-flow guide are unchanged.

Verification: 45 checks passed, 0 failed, and one test explicitly skipped pending its required module-mock flag. Tests cover the actual migration path, token consumption across migration/restart, booking availability and confirmation with service-area changes, tenant boundaries, retries, and billing-history preservation. Real HTTP server health returns 200. Registration returned 500 AUTH_TOKEN_STORE_UNAVAILABLE before the auth migration repair and returns 201 after it. The retained HTTP records redact session tokens.

The initial broad discovery run reported 690 passing, 25 failures and 2 skips. Source changed while that discovery run was still executing, so it is not final-source acceptance. Three service-area failures are covered by the passing follow-up. Nineteen browser checks lacked the configured browser module; three provider-credential boundary failures require investigation. Final combined regression/browser acceptance has not passed.

Voice implementation is excluded. Automatic approval review rejected publishing restored voice-provider source under the owner instruction prohibiting voice implementation. Those files are not part of this checkpoint; existing incomplete voice-support tests cannot establish a release gate. No voice routes were wired up and no voice flow was changed.

Remaining work: real public/authenticated/owner/browser quote flows, final regression and source binding, calendar OAuth integration and the other explicitly incomplete launch work. Real phone, calendar and billing-provider acceptance and production email remain unverified. No launch gate is passed.

Reproduce focused checks with Node 22.23.2 and the repository dependencies:

    node --test --test-concurrency=1 test/applicationPersistence.spec.mjs test/authTokenService.spec.mjs test/platformSchema.spec.mjs test/bookingCapabilities.spec.mjs test/bookingService.spec.mjs test/bookingRoutes.spec.mjs test/bookingAdminService.spec.mjs test/onboardingServiceArea.spec.mjs

The onboarding test requires --experimental-test-module-mocks and remains recorded as skipped in this checkpoint. Original failures and passing logs are retained beside this document.
