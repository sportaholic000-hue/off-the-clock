// Exact reviewed non-tenant SQL exceptions. Categories are limited by AGENTS.md.
// Signatures, method and occurrence are checked; computed access is never allowed.
export const OWNER_QUERY_EXCEPTIONS = Object.freeze([
  {
    "file": "server/src/staffService.js",
    "function": "accept",
    "category": "authentication",
    "reason": "Validates possession of a live, unused staff-invite token before password hashing and tenant binding.",
    "signature": "7990078465aab7faa723334598ba438b84980402d20540c40e859f36428b46e4",
    "occurrence": 1
  },
  {
    "file": "server/priceBookService.js",
    "function": "assertRetainedAccount",
    "reason": "Schema-only check for standalone file stores; the account read itself uses ownerQuery.",
    "signature": "f64feea1f3586e24256576d02ae4fd01a4ad9e951b0a1f83f0a554939925d4a9",
    "occurrence": 1
  },
  {
    "file": "server/src/billingCustomerLifecycle.js",
    "function": "installBillingLifecycleSchema",
    "reason": "Additive migration checks for safe calendar-revocation evidence columns.",
    "signature": "b6d3034770657e7fcde4f03e8114b949c06dba7d737dc8345a62ffac72aa51d1",
    "occurrence": 2
  },
  {
    "file": "server/src/billingCustomerLifecycle.js",
    "function": "erase",
    "reason": "Database-wide WAL checkpoint removes stale pages after tenant-bound deletion; reads no business rows.",
    "signature": "72169fb0b5e93a70ed5564e6e38d92f8b1d8d6625c54244a2c704d3f1af67e39",
    "occurrence": 1
  },
  {
    "file": "server/src/billingTenantErasure.js",
    "function": "eraseTenantRows",
    "reason": "Schema table inventory for optional migrations; all row deletions use ownerQuery.",
    "signature": "fcc4b4cb20dec612668244230b551775d49a62b1d7fad3a1a825e47f07ed955b",
    "occurrence": 1
  },
  {
    "file": "server/src/billingTenantErasure.js",
    "function": "installTenantErasureGuards",
    "reason": "Migration enumerates schema tables before installing tenant-bound erasure triggers.",
    "signature": "fcc4b4cb20dec612668244230b551775d49a62b1d7fad3a1a825e47f07ed955b",
    "occurrence": 2
  },
  {
    "file": "server/src/tenantBackupErasure.js",
    "function": "scrubBundle",
    "reason": "Schema-only migration check in a recovery copy; the account lookup uses ownerQuery.",
    "signature": "f337e4cb63867f8e607be6269f8f62026eef41d4f8aad0f81ebe1b8cf9c51988",
    "occurrence": 1
  },
  {
    "file": "server/quoteLog.js",
    "function": "hasColumn",
    "reason": "Migration checks or schema repair before tenant operations.",
    "signature": "9b532957dcbed18da5ee46065845ac2c17fb3a7120ec749766aa636a33f10447",
    "occurrence": 1
  },
  {
    "file": "server/quoteLog.js",
    "function": "ensureQuoteLogSchema",
    "reason": "Migration checks or schema repair before tenant operations.",
    "signature": "e87f4b062905c13558cda8b09d8aed46104a67291fc2a6d0805bc05d3c235d64",
    "occurrence": 1
  },
  {
    "file": "server/quoteLog.js",
    "function": "ensureQuoteLogSchema",
    "reason": "Migration checks or schema repair before tenant operations.",
    "signature": "ff34b723887d11eae75897cf34adb783435c0d7a7078338cc924a0ee75602cf3",
    "occurrence": 1
  },
  {
    "file": "server/src/auth.js",
    "function": "recentlyIssued",
    "reason": "Authentication or registration before tenant binding.",
    "signature": "acf174f4fd82cc8b95881dd3815e4adcd715eaccd537ac9a3e54588440350069",
    "occurrence": 1
  },
  {
    "file": "server/src/auth.js",
    "function": "accountStatusHandler",
    "reason": "Authentication or registration before tenant binding.",
    "signature": "df77a6c9b691683ac77bea6a6db63d8a92954d8d8636183126fd23b295106636",
    "occurrence": 1
  },
  {
    "file": "server/src/auth.js",
    "function": "resendVerificationHandler",
    "reason": "Authentication or registration before tenant binding.",
    "signature": "e407bca3bd9049e395c781dc54946deb131fcaf00e9110b3d11ba34d553c305f",
    "occurrence": 1
  },
  {
    "file": "server/src/auth.js",
    "function": "resendVerificationPublicHandler",
    "reason": "Authentication or registration before tenant binding.",
    "signature": "8561472ae0b157c721993291f6228883c0a9394ee5b0c66dc0f4018828b70591",
    "occurrence": 1
  },
  {
    "file": "server/src/auth.js",
    "function": "registerHandler",
    "reason": "Authentication or registration before tenant binding.",
    "signature": "9d4859d0f8fac646204deb01e639aa08874a458f354b9c4fc8a9cca8d555ddb0",
    "occurrence": 1
  },
  {
    "file": "server/src/auth.js",
    "function": "registerHandler",
    "reason": "Authentication or registration before tenant binding.",
    "signature": "f991271fcf7e95eca33c1d91aa3fa87bb61850b1b1e6a5b3dc08f93412d39828",
    "occurrence": 1
  },
  {
    "file": "server/src/auth.js",
    "function": "loginHandler",
    "reason": "Authentication or registration before tenant binding.",
    "signature": "060e0283c4ff275956341216cad10392fd3f5facb109eca5599dea3eb0c1253e",
    "occurrence": 1
  },
  {
    "file": "server/src/auth.js",
    "function": "forgotPasswordHandler",
    "reason": "Authentication or registration before tenant binding.",
    "signature": "4fd40f8f823a5c3f92fdfd9f323dfc9c9860887c3b4d245f14a51c08f4006f1e",
    "occurrence": 1
  },
  {
    "file": "server/src/auth.js",
    "function": "resetPasswordHandler",
    "reason": "Authentication or registration before tenant binding.",
    "signature": "badd4ce931fa815b46cca808a5ba50b271ba74d7d49cff439ad485f836695e0b",
    "occurrence": 1
  },
  {
    "file": "server/src/auth.js",
    "function": "verifyEmailHandler",
    "reason": "Authentication or registration before tenant binding.",
    "signature": "3e9fae8da4fb3c45f61a7633d732012207b0406abb27ddbb25d7e139aa96028c",
    "occurrence": 1
  },
  {
    "file": "server/src/authRateLimitService.js",
    "function": "take",
    "reason": "Authentication rate limiting before tenant binding.",
    "signature": "4c86d76b38df2f1a94ffb7ad7927cab50ccdf86acca9ee69f84a78099e15877d",
    "occurrence": 1
  },
  {
    "file": "server/src/authRateLimitService.js",
    "function": "take",
    "reason": "Authentication rate limiting before tenant binding.",
    "signature": "66539f862a6e6c283430de245f7c3d331c9cfd674ca710cd7110fdeca2b02ab7",
    "occurrence": 1
  },
  {
    "file": "server/src/authRateLimitService.js",
    "function": "take",
    "reason": "Authentication rate limiting before tenant binding.",
    "signature": "c32346dae638927ccc087a013c23d151791d9ce858ae3f63421425814e93ce80",
    "occurrence": 1
  },
  {
    "file": "server/src/authRateLimitService.js",
    "function": "take",
    "reason": "Authentication rate limiting before tenant binding.",
    "signature": "d5d30c3ba31a628444fd7d68d0aa1eb5ecec6a4d20957d768b526ca0aa878ad5",
    "occurrence": 1
  },
  {
    "file": "server/src/authRateLimitService.js",
    "function": "release",
    "reason": "Authentication rate limiting before tenant binding.",
    "signature": "c44729e9f92dfa8a951f356f71e00cf0ebf85248fa9af95bd056f75e1e738762",
    "occurrence": 1
  },
  {
    "file": "server/src/authSessionService.js",
    "function": "principal",
    "reason": "Authentication session or refresh token handling.",
    "signature": "882df0bee51f9766658d16f65e76cbcd9bf04736522cbcbf029cabb7d7b176f8",
    "occurrence": 1
  },
  {
    "file": "server/src/authSessionService.js",
    "function": "create",
    "reason": "Authentication session or refresh token handling.",
    "signature": "f37c970624375edc35d21b178b26a9fba5f7749e4a243f700b2107f5e2e50959",
    "occurrence": 1
  },
  {
    "file": "server/src/authSessionService.js",
    "function": "create",
    "reason": "Authentication session or refresh token handling.",
    "signature": "cc0ecad1970e5c1506e9a30bc8159844362a847320f0455a3fc4125a29571d88",
    "occurrence": 1
  },
  {
    "file": "server/src/authSessionService.js",
    "function": "create",
    "reason": "Authentication session or refresh token handling.",
    "signature": "7e2fad0a7e5e561fda3427a2dfbe33dfe370989c09219f78601b011618538b7f",
    "occurrence": 1
  },
  {
    "file": "server/src/authSessionService.js",
    "function": "validateAccess",
    "reason": "Authentication session or refresh token handling.",
    "signature": "b1ad446753d520efdac1a223690d7422608fda3f76c32939ec1808f57d7e0f89",
    "occurrence": 1
  },
  {
    "file": "server/src/authSessionService.js",
    "function": "refresh",
    "reason": "Authentication session or refresh token handling.",
    "signature": "6e4ed03d3424c9fc38ce6ba48777f5763f66b55acf3e4a05882b18287430b570",
    "occurrence": 1
  },
  {
    "file": "server/src/authSessionService.js",
    "function": "refresh",
    "reason": "Authentication session or refresh token handling.",
    "signature": "66663d258fe9f55a7549b240adf13cfbfb55ad64d1df1bd0df9085a93aa023da",
    "occurrence": 1
  },
  {
    "file": "server/src/authSessionService.js",
    "function": "refresh",
    "reason": "Authentication session or refresh token handling.",
    "signature": "9b3cbd4fe2145e6f5ee6ccce66a509b906fe025f109cf735eda4bac7e037da3e",
    "occurrence": 1
  },
  {
    "file": "server/src/authSessionService.js",
    "function": "refresh",
    "reason": "Authentication session or refresh token handling.",
    "signature": "7e2fad0a7e5e561fda3427a2dfbe33dfe370989c09219f78601b011618538b7f",
    "occurrence": 2
  },
  {
    "file": "server/src/authSessionService.js",
    "function": "revokeAll",
    "reason": "Authentication session or refresh token handling.",
    "signature": "bea5eed731212046bbdf6ace46ba71f32e1cf7c72201dc3e686584b92a8fdc62",
    "occurrence": 1
  },
  {
    "file": "server/src/authSessionService.js",
    "function": "cookieMatches",
    "reason": "Authentication session or refresh token handling.",
    "signature": "b3f5a7bd6b9fa373132ebc5e8d7996b837ae7f171276e32303965637f430974a",
    "occurrence": 1
  },
  {
    "file": "server/src/authSessionService.js",
    "function": "revoke",
    "reason": "Authentication session or refresh token handling.",
    "signature": "b3f5a7bd6b9fa373132ebc5e8d7996b837ae7f171276e32303965637f430974a",
    "occurrence": 2
  },
  {
    "file": "server/src/authSessionService.js",
    "function": "revoke",
    "reason": "Authentication session or refresh token handling.",
    "signature": "63fe7c5f94d5a65eee69cecad1aa4dc0ebb2aedbbf27ff137024c6f676c64e28",
    "occurrence": 1
  },
  {
    "file": "server/src/authSessionService.js",
    "function": "revoke",
    "reason": "Authentication session or refresh token handling.",
    "signature": "f12e071723afb10cb0b899e69b17856bc85896897621e51a78e5f58fc823dec6",
    "occurrence": 1
  },
  {
    "file": "server/src/authTokenService.js",
    "function": "installAuthTokenSchema",
    "reason": "Migration inspects the existing auth-token CHECK constraint before rebuilding it.",
    "signature": "5a113c897b59c925ad36b58e4b3a768f238fef73f918e049b08212d7bc2e443a",
    "occurrence": 1
  },
  {
    "file": "server/src/authTokenService.js",
    "function": "createAuthTokenService",
    "reason": "Authentication token handling before tenant binding.",
    "signature": "b0a3f1c8d592ed6536288c3c43f593c830da501eddc373f55b22447df458546f",
    "occurrence": 1
  },
  {
    "file": "server/src/authTokenService.js",
    "function": "createAuthTokenService",
    "reason": "Authentication token handling before tenant binding.",
    "signature": "e624ee637a30dfb66678bf2b2818a89a22e242ec4c0ce31681a8c8c7ef36ffbb",
    "occurrence": 1
  },
  {
    "file": "server/src/authTokenService.js",
    "function": "createAuthTokenService",
    "reason": "Authentication token handling before tenant binding.",
    "signature": "64e73f9c9c3b8dfc795756f16cdac148057681e52f81eae33926624db30d49ea",
    "occurrence": 1
  },
  {
    "file": "server/src/backups.js",
    "function": "checkSqlite",
    "reason": "Admin backup inventory across all owners.",
    "signature": "4933f715c247322691dc4f6768ba0bc806d40ab1df9c0300736eb438c2ac2a9d",
    "occurrence": 1
  },
  {
    "file": "server/src/backups.js",
    "function": "checkSqlite",
    "reason": "Admin backup inventory across all owners.",
    "signature": "fb7c35b7cf45d6e23f396d542be552844d7992ea24687f7c84a9d1be2da105d1",
    "occurrence": 1
  },
  {
    "file": "server/src/billingCoreMigration.js",
    "function": "migrateBillingCheckoutRecovery",
    "reason": "Migration schema inspection and integrity checks.",
    "signature": "ee77820d37d36565f6b5911e631f1ff47ee6544cf3d1f4c0ba067d04c7027207",
    "occurrence": 1
  },
  {
    "file": "server/src/billingCoreMigration.js",
    "function": "work",
    "reason": "Migration schema inspection and integrity checks.",
    "signature": "e7ea4cf2eda723fd657a764359e817f316b66eda376ee925a94d59227fe24016",
    "occurrence": 1
  },
  {
    "file": "server/src/billingCoreMigration.js",
    "function": "work",
    "reason": "Migration schema inspection and integrity checks.",
    "signature": "db3dd82a257d4b7c018fa27ed065cf955616695db8d65d46a6e65f8b5e4e6479",
    "occurrence": 1
  },
  {
    "file": "server/src/billingCustomerLifecycle.js",
    "function": "installBillingLifecycleSchema",
    "reason": "Migration inspection or platform owner inventory.",
    "signature": "b6d3034770657e7fcde4f03e8114b949c06dba7d737dc8345a62ffac72aa51d1",
    "occurrence": 1
  },
  {
    "file": "server/src/billingCustomerLifecycle.js",
    "function": "exportCsv",
    "reason": "Migration inspection or platform owner inventory.",
    "signature": "9b532957dcbed18da5ee46065845ac2c17fb3a7120ec749766aa636a33f10447",
    "occurrence": 1
  },
  {
    "file": "server/src/billingCustomerLifecycle.js",
    "function": "tick",
    "reason": "Migration inspection or platform owner inventory.",
    "signature": "f28047c5fe42843630a7402f21b3f31fb0c16d44b27ac91668f392f2abd05290",
    "occurrence": 1
  },
  {
    "file": "server/src/billingCustomerLifecycle.js",
    "function": "tick",
    "reason": "Migration inspection or platform owner inventory.",
    "signature": "4658b1befcf3a2cf2bd305974e50a7cbe27a48fd2ecea9f2898834586dc4ff3b",
    "occurrence": 1
  },
  {
    "file": "server/src/billingMinuteService.js",
    "function": "tick",
    "reason": "Platform owner inventory or Stripe invoice lookup before owner binding.",
    "signature": "55a72e03f0774fe0ca0a2bc4674684f19fe44421dc99c5cad05c68a0e42c5ceb",
    "occurrence": 1
  },
  {
    "file": "server/src/billingMinuteService.js",
    "function": "tick",
    "reason": "Platform owner inventory or Stripe invoice lookup before owner binding.",
    "signature": "564628cb1324a9b896a6ca7724a85fe9c1b627f875acf6dae223f201caafd65d",
    "occurrence": 1
  },
  {
    "file": "server/src/billingMinuteService.js",
    "function": "applyInvoiceEvent",
    "reason": "Platform owner inventory or Stripe invoice lookup before owner binding.",
    "signature": "4218668bef7664b2e848d5ae42ac48aee3978680a033f7ff446ed74d2ddd8ddd",
    "occurrence": 1
  },
  {
    "file": "server/src/billingStateService.js",
    "function": "resolveAccountContext billingByCustomer",
    "reason": "Verified Stripe customer lookup before the event owner is known.",
    "signature": "f635d5e9638739c3e2ca04f049616353b5360f032fb42b86842fc6000597b142",
    "occurrence": 1
  },
  {
    "file": "server/src/billingStateService.js",
    "function": "resolveAccountContext billingBySubscription",
    "reason": "Verified Stripe subscription lookup before the event owner is known.",
    "signature": "93175ed2e77e5ff886d8a068dd03877b0634801bc9c2d0a2d9633b2ddd85e5f1",
    "occurrence": 1
  },
  {
    "file": "server/src/billingStateService.js",
    "function": "reconcileVerifiedStripeEvent receiptById",
    "reason": "Event-ID receipt lookup before resolving the Stripe event owner.",
    "signature": "d3ec7913ca3674d5ef7ca441cf93caccfe8792063bd1d7c29a1e20c99cf2541d",
    "occurrence": 1
  },
  {
    "file": "server/src/billingStateService.js",
    "function": "resolveAccountContext subscriptionHistoryById",
    "reason": "Verified subscription history lookup before the event owner is known.",
    "signature": "fa254c0f3f7e0fdd2fa284122038689b3daed71eb6cc616b6407d0bf062f3be2",
    "occurrence": 1
  },
  {
    "file": "server/src/billingUsageSchema.js",
    "function": "installBillingUsageSchema",
    "reason": "Migration schema inspection.",
    "signature": "b40712f1d2f468ec37c769c62992528f86925c565aa4fd23f3020016a644533d",
    "occurrence": 1
  },
  {
    "file": "server/src/billingUsageSchema.js",
    "function": "installBillingUsageSchema",
    "reason": "Migration schema inspection.",
    "signature": "b40712f1d2f468ec37c769c62992528f86925c565aa4fd23f3020016a644533d",
    "occurrence": 2
  },
  {
    "file": "server/src/billingUsageSchema.js",
    "function": "installBillingUsageSchema",
    "reason": "Migration schema inspection.",
    "signature": "e21f813e77edf8285c37a9527ae780422bc30889f055a9ac9473b540deefaddd",
    "occurrence": 1
  },
  {
    "file": "server/src/billingUsageSchema.js",
    "function": "installBillingUsageSchema",
    "reason": "Migration schema inspection.",
    "signature": "e21f813e77edf8285c37a9527ae780422bc30889f055a9ac9473b540deefaddd",
    "occurrence": 2
  },
  {
    "file": "server/src/billingVoiceUsage.js",
    "function": "providerComplete",
    "reason": "Signed Twilio callback binding by account and CallSid before owner binding.",
    "signature": "f4ae63cf1af5f2754f75383c3230a6666d9c3bd116c15dfd8f69e7fac31bf4aa",
    "occurrence": 1
  },
  {
    "file": "server/src/bookingService.js",
    "function": "createBookingService",
    "reason": "Public booking token resolution or admin recovery inventory.",
    "signature": "8f1fd3fb5e0b2124197d3b2bc2314706f4c76c9bac3c4dd89241a8c86fcde68b",
    "occurrence": 1
  },
  {
    "file": "server/src/bookingService.js",
    "function": "tick",
    "reason": "Public booking token resolution or admin recovery inventory.",
    "signature": "1a75bf38145025cb1d19da0845747b82fe4f93309f19d33d2053d8f559e35009",
    "occurrence": 1
  },
  {
    "file": "server/src/calendarOAuthState.js",
    "function": "prepareStatements",
    "reason": "OAuth authentication state validation before tenant binding.",
    "signature": "1ef3045a84790ef6045bba4427e594e3f12632aa1d90ac014d7bd8ad4ed243c2",
    "occurrence": 1
  },
  {
    "file": "server/src/continuousOffsite.js",
    "function": "createContinuousOffsiteService.sourceToken",
    "reason": "Admin backup database change detection.",
    "signature": "40d285a42b36efc187184181253c702810868b2a861a7211ff73ef4a14f55036",
    "occurrence": 1
  },
  {
    "file": "server/src/continuousOffsite.js",
    "function": "createContinuousOffsiteService.sourceToken",
    "reason": "Admin backup database change detection.",
    "signature": "9cdb1c2ab94afec4fc65494be1ade65f78f99ce7aca898095b8e82f10a21c198",
    "occurrence": 1
  },
  {
    "file": "server/src/demo/liveDemo.js",
    "function": "installLiveDemoRoutes",
    "reason": "Public demo registration and platform rate limiting.",
    "signature": "a4b96715baa05bd46c33cea5d3d0eb54e2d5b6ae2fce0ee4ce9b0fb168e5ae58",
    "occurrence": 1
  },
  {
    "file": "server/src/demo/liveDemo.js",
    "function": "installLiveDemoRoutes",
    "reason": "Public demo registration and platform rate limiting.",
    "signature": "b8075eb842c7b74ff52c9da1f45098200601086cfdaee9558f49f13b5793dd37",
    "occurrence": 1
  },
  {
    "file": "server/src/demo/liveDemo.js",
    "function": "installLiveDemoRoutes",
    "reason": "Public demo registration and platform rate limiting.",
    "signature": "998d455075b58a789c7f9136a0a0fdc1d1b49eee827c3155d6c93272e5bd4948",
    "occurrence": 1
  },
  {
    "file": "server/src/demo/liveDemo.js",
    "function": "installLiveDemoRoutes",
    "reason": "Public demo registration and platform rate limiting.",
    "signature": "1b204efacc959826e6eae9f3959290e75d36f9941fa0499fcb910b2663900004",
    "occurrence": 1
  },
  {
    "file": "server/src/demo/liveDemo.js",
    "function": "installLiveDemoRoutes",
    "reason": "Public demo registration and platform rate limiting.",
    "signature": "21af296567b8e9663133973e1e84caa217bcdaa52ecd163774efa2f4268f0c4a",
    "occurrence": 1
  },
  {
    "file": "server/src/leadCaptureRepair20261006.js",
    "function": "saveVoiceInquiry",
    "reason": "Migration schema inspection.",
    "signature": "17c7a2c551ac55fe6d7d2531fb73fad4ac4d17483939ff9b559971a9805780ac",
    "occurrence": 1
  },
  {
    "file": "server/src/lifecycle.js",
    "function": "health",
    "reason": "Platform health check.",
    "signature": "bca75e01147abe1e097c2f0941764fff7b0d54cc02aee97ead3fde381f58a2fb",
    "occurrence": 1
  },
  {
    "file": "server/src/migrations.js",
    "function": "tableSql",
    "reason": "Migration schema inspection or cross-tenant repair.",
    "signature": "21688a0761db8bf1ad24d0df4b4fe62cded4384e366c56f6ae76c4ca3ca7239b",
    "occurrence": 1
  },
  {
    "file": "server/src/migrations.js",
    "function": "backfillWidgetLeads",
    "reason": "Startup migration enumerates missing widget leads across tenants; each resulting write binds the quote's owner through ownerQuery.",
    "signature": "adb78314b8c7c2283d390fb9d6ce2422042d8efe3b0c0923727a2d744f1a3e1f",
    "occurrence": 1
  },
  {
    "file": "server/src/migrations.js",
    "function": "backfillWidgetLeads",
    "reason": "Startup migration enumerates confirmed widget bookings needing repair; all joins bind ownerId and the repair uses ownerQuery.",
    "signature": "e450558c987500bbd48ff7a6a026fe029db9c6a29977c9230585096bc03280d1",
    "occurrence": 1
  },
  {
    "file": "server/src/migrations.js",
    "function": "tableColumns",
    "reason": "Migration schema inspection or cross-tenant repair.",
    "signature": "9b532957dcbed18da5ee46065845ac2c17fb3a7120ec749766aa636a33f10447",
    "occurrence": 1
  },
  {
    "file": "server/src/migrations.js",
    "function": "enforceFailClosedTrialEvidence",
    "reason": "Migration schema inspection or cross-tenant repair.",
    "signature": "9cbf044762d0aa9c84cfc0ef42c4342c5115a4c9ef72f5dc251a04f6036ebc22",
    "occurrence": 1
  },
  {
    "file": "server/src/migrations.js",
    "function": "backfillBillingSubscriptionHistory",
    "reason": "Migration schema inspection or cross-tenant repair.",
    "signature": "9fabb4c4eeb7203fa2389ea357668721acdc37ce0e398eba90795a7c9c348e33",
    "occurrence": 1
  },
  {
    "file": "server/src/migrations.js",
    "function": "pragmaRows",
    "reason": "Migration schema inspection or cross-tenant repair.",
    "signature": "ad264d6d9c4463fbb126119b2a8d7c7a6970f7804376a2dfcdb162d4ea08074e",
    "occurrence": 1
  },
  {
    "file": "server/src/migrations.js",
    "function": "pragmaValue",
    "reason": "Migration schema inspection or cross-tenant repair.",
    "signature": "ad264d6d9c4463fbb126119b2a8d7c7a6970f7804376a2dfcdb162d4ea08074e",
    "occurrence": 2
  },
  {
    "file": "server/src/migrations.js",
    "function": "rebuildUsersTableForOwnerConstraint",
    "reason": "Migration schema inspection or cross-tenant repair.",
    "signature": "d78a79a73ef4f96edbb41b8db5501487a1e44fbd0d8d07ef9a89f0e75f167061",
    "occurrence": 1
  },
  {
    "file": "server/src/migrations.js",
    "function": "migrateStarterPlanConstraints",
    "reason": "Schema migration preserves indexes and triggers while adding the Starter CHECK value.",
    "signature": "2f50e250cec642cec78fbf7370e930f3a0913dfc2b0430cd31a0356458f9e820",
    "occurrence": 1
  },
  {
    "file": "server/src/migrations.js",
    "function": "migrateDatabase",
    "reason": "Migration schema inspection or cross-tenant repair.",
    "signature": "c707a97b2785f634b03c8f7961626b6236a4dfc7c5ec2dd06df23c990badf239",
    "occurrence": 1
  },
  {
    "file": "server/src/migrations.js",
    "function": "migrateDatabase",
    "reason": "Migration schema inspection or cross-tenant repair.",
    "signature": "024f41edaa63cc89040a524c3c1b8ec1404e30683fd573e889f4f711a28d87d7",
    "occurrence": 1
  },
  {
    "file": "server/src/ownerAlertSchema.js",
    "function": "installOwnerAlertSchema",
    "reason": "Migration schema inspection.",
    "signature": "715f88cace3a6a3a812a4c6914d0f6a00ab68f0eeba6fde4c4a69a2e05737057",
    "occurrence": 1
  },
  {
    "file": "server/src/quoteDoneRoutes.js",
    "function": "publicContext",
    "reason": "Public quote key resolution before owner binding.",
    "signature": "5bf22113596a2833de39f076eb9528a9a3450c96040058348824701e10f93284",
    "occurrence": 1
  },
  {
    "file": "server/src/staffService.js",
    "function": "pendingInvitation",
    "reason": "Invite token identifies its staff account before the owner is known; reads only ownerId.",
    "signature": "b2cbe55225cdfe3de0f6853a0da85ce6540ade643d928ece872bf67824db790a",
    "occurrence": 1
  },
  {
    "file": "server/src/voice/voiceAdmission.js",
    "function": "state",
    "reason": "Platform-wide voice admission, circuit breaker, and metrics.",
    "signature": "2a98d7a812f93acdd328bc6b7eb0bd53d3beb4594cf4e222c7f449eb5435f299",
    "occurrence": 1
  },
  {
    "file": "server/src/voice/voiceAdmission.js",
    "function": "state",
    "reason": "Platform-wide voice admission, circuit breaker, and metrics.",
    "signature": "5b440eb0c2947c9ac446c1938c364ea63d993048dcac3e18ff39cd4bb0227d75",
    "occurrence": 1
  },
  {
    "file": "server/src/voice/voiceAdmission.js",
    "function": "alert",
    "reason": "Platform-wide voice admission, circuit breaker, and metrics.",
    "signature": "27437fa0239359c7efa7a3c65bd9dcd6b102f8ac23c10c59a013e5ed4775aba0",
    "occurrence": 1
  },
  {
    "file": "server/src/voice/voiceAdmission.js",
    "function": "circuitReason",
    "reason": "Platform-wide voice admission, circuit breaker, and metrics.",
    "signature": "e8e172a9ef5eecce9bd2b681bd923b99f2c0a2d9bb6546634148a759395b2ce6",
    "occurrence": 1
  },
  {
    "file": "server/src/voice/voiceAdmission.js",
    "function": "reserve",
    "reason": "Platform-wide voice admission, circuit breaker, and metrics.",
    "signature": "d394362cf373b7441c3b0e95bdbeaba31c179603120282aede6f48f9daada58e",
    "occurrence": 1
  },
  {
    "file": "server/src/voice/voiceAdmission.js",
    "function": "reserve",
    "reason": "Platform-wide voice admission, circuit breaker, and metrics.",
    "signature": "1b516dba720e6322c4868e9790154eca95ed46ea78db1e06ae822a5156869686",
    "occurrence": 1
  },
  {
    "file": "server/src/voice/voiceAdmission.js",
    "function": "connected",
    "reason": "Platform-wide voice admission, circuit breaker, and metrics.",
    "signature": "fcad4f15a0354a351b4d6b17d91363147987c7aafeb5c08d9705fc748108cff6",
    "occurrence": 1
  },
  {
    "file": "server/src/voice/voiceAdmission.js",
    "function": "connected",
    "reason": "Platform-wide voice admission, circuit breaker, and metrics.",
    "signature": "80923735c885ce62ca4754532ae3fddce9db355d6b5758837716f446a3f37cc7",
    "occurrence": 1
  },
  {
    "file": "server/src/voice/voiceAdmission.js",
    "function": "connected",
    "reason": "Platform-wide voice admission, circuit breaker, and metrics.",
    "signature": "b7c6f23c30e2490f6cf5ef6a124cf2c17e76a212180099cdae4c47c473b07c0b",
    "occurrence": 1
  },
  {
    "file": "server/src/voice/voiceAdmission.js",
    "function": "failed",
    "reason": "Platform-wide voice admission, circuit breaker, and metrics.",
    "signature": "edfefbd5e7206b85bc0d49892a6075be312ed868c55f700c7d1cd2ad4475ea0a",
    "occurrence": 1
  },
  {
    "file": "server/src/voice/voiceAdmission.js",
    "function": "failed",
    "reason": "Platform-wide voice admission, circuit breaker, and metrics.",
    "signature": "a7371c1293d063cf87e206b323f2d8dde40d4c90e5c8b714079af2eb55c212d6",
    "occurrence": 1
  },
  {
    "file": "server/src/voice/voiceAdmission.js",
    "function": "failed",
    "reason": "Platform-wide voice admission, circuit breaker, and metrics.",
    "signature": "afa8aa06f3cb3a58d21e8b243c941395ac97310c2552b77ff578309b644162c3",
    "occurrence": 1
  },
  {
    "file": "server/src/voice/voiceAdmission.js",
    "function": "failed",
    "reason": "Platform-wide voice admission, circuit breaker, and metrics.",
    "signature": "8c836ba3df8029ace33b1f7bab0e365ceb8ededdaeea2d5daa3795d240071732",
    "occurrence": 1
  },
  {
    "file": "server/src/voice/voiceAdmission.js",
    "function": "voiceAdmissionStatus",
    "reason": "Platform-wide voice admission, circuit breaker, and metrics.",
    "signature": "0db0d36ea9340763acbc2cea720005072986246d642d7b5e21b7eb68ab946af8",
    "occurrence": 1
  },
  {
    "file": "server/src/voice/voiceAdmission.js",
    "function": "voiceAdmissionStatus",
    "reason": "Platform-wide voice admission, circuit breaker, and metrics.",
    "signature": "46bcff7a14768d69957a14d9dda0714e6a55894bba9bdb59caf548427a7cd42a",
    "occurrence": 1
  },
  {
    "file": "server/src/voice/voicePersistence.js",
    "function": "loadSessionByNonceHash nonceRow",
    "reason": "Nonce-only signed session loading before the call owner is known.",
    "signature": "01ea51c200ec4e825f279c9384d034b18d689a3e4a9d30e18e3e6a8d9d33479b",
    "occurrence": 1
  },
  {
    "file": "server/src/voice/voicePersistence.js",
    "function": "validateIncomingCall",
    "reason": "Signed Twilio CallSid/account binding before owner resolution.",
    "signature": "3f0ff95289db32cfbdb0d2cb17531042a62d4c436598081bce2e7e7d8e1b108f",
    "occurrence": 1
  },
  {
    "file": "server/src/voice/voicePersistence.js",
    "function": "recoverActiveCalls",
    "reason": "Startup recovery inventory across owners; each mutation uses the persisted owner.",
    "signature": "314c45e633461a3e645a25db473ca773a25f74387e494a5b489452387a66b5e3",
    "occurrence": 1
  },
  {
    "file": "server/src/voice/voicePersistence.js",
    "function": "findVoiceTenantsByNumber",
    "reason": "Incoming Twilio destination lookup before owner resolution.",
    "signature": "e0b0b11134f74e0f56e5475d58f01feb85b16468d318867795f5a260b5e8cd34",
    "occurrence": 1
  },
  {
    "file": "server/src/voice/voiceProviderAdapters.js",
    "function": "transferCall",
    "reason": "Signed Twilio transfer callback binding by event before owner binding.",
    "signature": "e53821e5754217f5370f9d4c4e9ec04ce80d6f2e5817fba6aeabde07fa5b9a51",
    "occurrence": 1
  },
  {
    "file": "server/src/voice/voiceToolRuntime.js",
    "function": "logQuoteRequest",
    "reason": "Migration schema inspection.",
    "signature": "17c7a2c551ac55fe6d7d2531fb73fad4ac4d17483939ff9b559971a9805780ac",
    "occurrence": 1
  },
  {
    "file": "server/priceBookService.js",
    "line": 38,
    "function": "ensureCreationRecords",
    "method": "exec",
    "signature": "e803a4a411b6be6e598279c509b6ad34a1803d63c9e58c27a1c3e49b67627a3e",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Creates the price-book creation ledger during schema setup; subsequent owner records use ownerQuery."
  },
  {
    "file": "server/priceBookService.js",
    "line": 164,
    "function": "withPricebookLock",
    "method": "exec",
    "signature": "cec5ac31f4a5aa5ecb9a92ab24079a84e39aa70f4c0fe608f20fd1a0635c099d",
    "occurrence": 1,
    "category": "admin",
    "reason": "Database administration: fixed transaction/lock boundary only; reads or writes no tenant rows. Statements inside the callback still require ownerQuery or their own explicit exception."
  },
  {
    "file": "server/src/appointmentChangeSchema.js",
    "line": 2,
    "function": "installAppointmentChangeSchema",
    "method": "exec",
    "signature": "599d6759cfb702aac7dcf9cf44aefc7752e5da6a66ef16a460d547f991562834",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Installs appointment change/cancellation ledger and indexes."
  },
  {
    "file": "server/src/auth.js",
    "line": 40,
    "function": "immediate",
    "method": "exec",
    "signature": "cec5ac31f4a5aa5ecb9a92ab24079a84e39aa70f4c0fe608f20fd1a0635c099d",
    "occurrence": 1,
    "category": "authentication",
    "reason": "Authentication transaction boundary only; token/session state changes are separately inventoried."
  },
  {
    "file": "server/src/auth.js",
    "line": 43,
    "function": "immediate",
    "method": "exec",
    "signature": "32942146ce40175ca6f66bacb0e04128a38458024c9d6bcce95f65b6f15a53c5",
    "occurrence": 1,
    "category": "authentication",
    "reason": "Authentication transaction boundary only; token/session state changes are separately inventoried."
  },
  {
    "file": "server/src/auth.js",
    "line": 46,
    "function": "immediate",
    "method": "exec",
    "signature": "3bc40a49d855e0a309070363430a98b1f46ecf0832336a55574c5c49ad9b4168",
    "occurrence": 1,
    "category": "authentication",
    "reason": "Authentication transaction boundary only; token/session state changes are separately inventoried."
  },
  {
    "file": "server/src/authRateLimitService.js",
    "line": 5,
    "function": "installAuthLimitSchema",
    "method": "exec",
    "signature": "93cf6a2a56936062de3d5c20f317c5e031f4fb21dda2d2e4a10d647cac32c9e6",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Installs the public authentication rate-limit schema."
  },
  {
    "file": "server/src/authSessionService.js",
    "line": 10,
    "function": "installAuthSessionSchema",
    "method": "exec",
    "signature": "6ec326f084ea25dc2b2b42f3cc59c08b9e46c83a0005af73f6b629323f5c3a12",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Installs authentication session and refresh-token tables/indexes."
  },
  {
    "file": "server/src/authSessionService.js",
    "line": 39,
    "function": "authImmediate",
    "method": "exec",
    "signature": "cec5ac31f4a5aa5ecb9a92ab24079a84e39aa70f4c0fe608f20fd1a0635c099d",
    "occurrence": 1,
    "category": "authentication",
    "reason": "Authentication transaction boundary only; token/session state changes are separately inventoried."
  },
  {
    "file": "server/src/authSessionService.js",
    "line": 40,
    "function": "authImmediate",
    "method": "exec",
    "signature": "32942146ce40175ca6f66bacb0e04128a38458024c9d6bcce95f65b6f15a53c5",
    "occurrence": 1,
    "category": "authentication",
    "reason": "Authentication transaction boundary only; token/session state changes are separately inventoried."
  },
  {
    "file": "server/src/authSessionService.js",
    "line": 40,
    "function": "authImmediate",
    "method": "exec",
    "signature": "3bc40a49d855e0a309070363430a98b1f46ecf0832336a55574c5c49ad9b4168",
    "occurrence": 1,
    "category": "authentication",
    "reason": "Authentication transaction boundary only; token/session state changes are separately inventoried."
  },
  {
    "file": "server/src/authTokenService.js",
    "line": 188,
    "function": "immediate",
    "method": "exec",
    "signature": "cec5ac31f4a5aa5ecb9a92ab24079a84e39aa70f4c0fe608f20fd1a0635c099d",
    "occurrence": 1,
    "category": "authentication",
    "reason": "Authentication transaction boundary only; token/session state changes are separately inventoried."
  },
  {
    "file": "server/src/authTokenService.js",
    "line": 191,
    "function": "immediate",
    "method": "exec",
    "signature": "32942146ce40175ca6f66bacb0e04128a38458024c9d6bcce95f65b6f15a53c5",
    "occurrence": 1,
    "category": "authentication",
    "reason": "Authentication transaction boundary only; token/session state changes are separately inventoried."
  },
  {
    "file": "server/src/authTokenService.js",
    "line": 194,
    "function": "immediate",
    "method": "exec",
    "signature": "3bc40a49d855e0a309070363430a98b1f46ecf0832336a55574c5c49ad9b4168",
    "occurrence": 1,
    "category": "authentication",
    "reason": "Authentication transaction boundary only; token/session state changes are separately inventoried."
  },
  {
    "file": "server/src/authTokenService.js",
    "line": 213,
    "function": "<anonymous>",
    "method": "exec",
    "signature": "519d173ba319404671ba733260a774baa1dbbb5e0c817ce80da97d5a9221fb2d",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Installs/upgrades durable authentication-token tables, indexes and immutable triggers while preserving existing tokens."
  },
  {
    "file": "server/src/authTokenService.js",
    "line": 228,
    "function": "installAuthTokenSchema",
    "method": "exec",
    "signature": "6316a739742dad931751d99b20c96139516ff9b91ffa63ed6e2c5c229fc5d474",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Installs/upgrades durable authentication-token tables, indexes and immutable triggers while preserving existing tokens."
  },
  {
    "file": "server/src/billingCoreMigration.js",
    "line": 9,
    "function": "work",
    "method": "exec",
    "signature": "f7ee269ace7b78c71d16b0506c96dbfbe15d7c7f5164066cdd874a4f286f5a8d",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Migrates checkout recovery constraints with a transactional table copy and rename."
  },
  {
    "file": "server/src/billingCoreMigration.js",
    "line": 10,
    "function": "work",
    "method": "exec",
    "signature": "a8dd245ed3ab2638fc4b2b2c0d05e91ea1f96eeede8ccf99f058240d957592a4",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Migrates checkout recovery constraints with a transactional table copy and rename."
  },
  {
    "file": "server/src/billingCoreMigration.js",
    "line": 11,
    "function": "work",
    "method": "exec",
    "signature": "ca30d57e820b890fbdc535166dfbda1073c67832bf9b83e499a5c9a31bbed138",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Migrates checkout recovery constraints with a transactional table copy and rename."
  },
  {
    "file": "server/src/billingCoreMigration.js",
    "line": 12,
    "function": "work",
    "method": "exec",
    "signature": "f9397fdc28ba431ea60615c3fadeb83e8b8a9942d43e3b74c09fb6b8d281021c",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Migrates checkout recovery constraints with a transactional table copy and rename."
  },
  {
    "file": "server/src/billingCoreMigration.js",
    "line": 16,
    "function": "migrateBillingCheckoutRecovery",
    "method": "exec",
    "signature": "cec5ac31f4a5aa5ecb9a92ab24079a84e39aa70f4c0fe608f20fd1a0635c099d",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Migrates checkout recovery constraints with a transactional table copy and rename."
  },
  {
    "file": "server/src/billingCoreMigration.js",
    "line": 17,
    "function": "migrateBillingCheckoutRecovery",
    "method": "exec",
    "signature": "32942146ce40175ca6f66bacb0e04128a38458024c9d6bcce95f65b6f15a53c5",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Migrates checkout recovery constraints with a transactional table copy and rename."
  },
  {
    "file": "server/src/billingCoreMigration.js",
    "line": 17,
    "function": "migrateBillingCheckoutRecovery",
    "method": "exec",
    "signature": "3bc40a49d855e0a309070363430a98b1f46ecf0832336a55574c5c49ad9b4168",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Migrates checkout recovery constraints with a transactional table copy and rename."
  },
  {
    "file": "server/src/billingCustomerLifecycle.js",
    "line": 39,
    "function": "installBillingLifecycleSchema",
    "method": "exec",
    "signature": "a6b3b638d50e27f39ab42ee785a3bb39d0918ed4868843cfb469813811479331",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Installs lifecycle notice/cancellation schema and additive retention evidence columns."
  },
  {
    "file": "server/src/billingCustomerLifecycle.js",
    "line": 51,
    "function": "installBillingLifecycleSchema",
    "method": "exec",
    "signature": "f9db03f32a49cc6ae9ea1e3d38cd5724ec14cf3ac45224c1b020f6834bbe02a2",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Installs lifecycle notice/cancellation schema and additive retention evidence columns."
  },
  {
    "file": "server/src/billingCustomerLifecycle.js",
    "line": 52,
    "function": "installBillingLifecycleSchema",
    "method": "exec",
    "signature": "ece41b5eb5cdd92ea3164537845946ffd7dc49565f459cefcf9a1cfc62ca5b31",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Installs lifecycle notice/cancellation schema and additive retention evidence columns."
  },
  {
    "file": "server/src/billingRoutes.js",
    "line": 137,
    "function": "immediate",
    "method": "exec",
    "signature": "cec5ac31f4a5aa5ecb9a92ab24079a84e39aa70f4c0fe608f20fd1a0635c099d",
    "occurrence": 1,
    "category": "admin",
    "reason": "Database administration: fixed transaction/lock boundary only; reads or writes no tenant rows. Statements inside the callback still require ownerQuery or their own explicit exception."
  },
  {
    "file": "server/src/billingRoutes.js",
    "line": 140,
    "function": "immediate",
    "method": "exec",
    "signature": "32942146ce40175ca6f66bacb0e04128a38458024c9d6bcce95f65b6f15a53c5",
    "occurrence": 1,
    "category": "admin",
    "reason": "Database administration: fixed transaction/lock boundary only; reads or writes no tenant rows. Statements inside the callback still require ownerQuery or their own explicit exception."
  },
  {
    "file": "server/src/billingRoutes.js",
    "line": 143,
    "function": "immediate",
    "method": "exec",
    "signature": "3bc40a49d855e0a309070363430a98b1f46ecf0832336a55574c5c49ad9b4168",
    "occurrence": 1,
    "category": "admin",
    "reason": "Database administration: fixed transaction/lock boundary only; reads or writes no tenant rows. Statements inside the callback still require ownerQuery or their own explicit exception."
  },
  {
    "file": "server/src/billingStateService.js",
    "line": 207,
    "function": "immediate",
    "method": "exec",
    "signature": "cec5ac31f4a5aa5ecb9a92ab24079a84e39aa70f4c0fe608f20fd1a0635c099d",
    "occurrence": 1,
    "category": "admin",
    "reason": "Database administration: fixed transaction/lock boundary only; reads or writes no tenant rows. Statements inside the callback still require ownerQuery or their own explicit exception."
  },
  {
    "file": "server/src/billingStateService.js",
    "line": 210,
    "function": "immediate",
    "method": "exec",
    "signature": "32942146ce40175ca6f66bacb0e04128a38458024c9d6bcce95f65b6f15a53c5",
    "occurrence": 1,
    "category": "admin",
    "reason": "Database administration: fixed transaction/lock boundary only; reads or writes no tenant rows. Statements inside the callback still require ownerQuery or their own explicit exception."
  },
  {
    "file": "server/src/billingStateService.js",
    "line": 213,
    "function": "immediate",
    "method": "exec",
    "signature": "3bc40a49d855e0a309070363430a98b1f46ecf0832336a55574c5c49ad9b4168",
    "occurrence": 1,
    "category": "admin",
    "reason": "Database administration: fixed transaction/lock boundary only; reads or writes no tenant rows. Statements inside the callback still require ownerQuery or their own explicit exception."
  },
  {
    "file": "server/src/billingTenantErasure.js",
    "line": 26,
    "function": "eraseTenantRows",
    "method": "exec",
    "signature": "8505da64b619df35330a963265a42cd3f66fb94d4dc943821e703863680844c3",
    "occurrence": 1,
    "category": "admin",
    "reason": "Database administration enables secure page deletion before ownerQuery erases one tenant."
  },
  {
    "file": "server/src/billingTenantErasure.js",
    "line": 69,
    "function": "installTenantErasureGuards",
    "method": "exec",
    "signature": "baf726fcb5257a358ab07a99e05d955609a70ba314fd98152405a9fe50eeaa35",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Installs retention guards; trigger predicates bind NEW.ownerId or erased-account identities."
  },
  {
    "file": "server/src/billingTenantErasure.js",
    "line": 73,
    "function": "installTenantErasureGuards",
    "method": "exec",
    "signature": "b27908f3a259c1537f86f91de5bd15cc6bb768e288104c70b71d937339147897",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Installs retention guards; trigger predicates bind NEW.ownerId or erased-account identities."
  },
  {
    "file": "server/src/billingTenantErasure.js",
    "line": 77,
    "function": "installTenantErasureGuards",
    "method": "exec",
    "signature": "825400974bf03b85cdd8e3bd1063a3d095fc38c8b7e036d875fa6d1de40dc731",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Installs retention guards; trigger predicates bind NEW.ownerId or erased-account identities."
  },
  {
    "file": "server/src/billingTenantErasure.js",
    "line": 98,
    "function": "eraseTenantPricebookFiles",
    "method": "exec",
    "signature": "cec5ac31f4a5aa5ecb9a92ab24079a84e39aa70f4c0fe608f20fd1a0635c099d",
    "occurrence": 1,
    "category": "admin",
    "reason": "Database administration: fixed transaction/lock boundary only; reads or writes no tenant rows. Statements inside the callback still require ownerQuery or their own explicit exception."
  },
  {
    "file": "server/src/billingTenantErasure.js",
    "line": 109,
    "function": "eraseTenantPricebookFiles",
    "method": "exec",
    "signature": "3bc40a49d855e0a309070363430a98b1f46ecf0832336a55574c5c49ad9b4168",
    "occurrence": 1,
    "category": "admin",
    "reason": "Database administration: fixed transaction/lock boundary only; reads or writes no tenant rows. Statements inside the callback still require ownerQuery or their own explicit exception."
  },
  {
    "file": "server/src/billingUsagePolicy.js",
    "line": 65,
    "function": "usageTransaction",
    "method": "exec",
    "signature": "cec5ac31f4a5aa5ecb9a92ab24079a84e39aa70f4c0fe608f20fd1a0635c099d",
    "occurrence": 1,
    "category": "admin",
    "reason": "Database administration: fixed transaction/lock boundary only; reads or writes no tenant rows. Statements inside the callback still require ownerQuery or their own explicit exception."
  },
  {
    "file": "server/src/billingUsagePolicy.js",
    "line": 66,
    "function": "usageTransaction",
    "method": "exec",
    "signature": "32942146ce40175ca6f66bacb0e04128a38458024c9d6bcce95f65b6f15a53c5",
    "occurrence": 1,
    "category": "admin",
    "reason": "Database administration: fixed transaction/lock boundary only; reads or writes no tenant rows. Statements inside the callback still require ownerQuery or their own explicit exception."
  },
  {
    "file": "server/src/billingUsagePolicy.js",
    "line": 66,
    "function": "usageTransaction",
    "method": "exec",
    "signature": "3bc40a49d855e0a309070363430a98b1f46ecf0832336a55574c5c49ad9b4168",
    "occurrence": 1,
    "category": "admin",
    "reason": "Database administration: fixed transaction/lock boundary only; reads or writes no tenant rows. Statements inside the callback still require ownerQuery or their own explicit exception."
  },
  {
    "file": "server/src/billingUsageSchema.js",
    "line": 2,
    "function": "installBillingUsageSchema",
    "method": "exec",
    "signature": "5783561f3f32358fd7c2a5ef336323ad76faa359ea87fdf17224769d24db9d51",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Installs billing usage/annual/trial schemas or migrates installment constraints atomically."
  },
  {
    "file": "server/src/billingUsageSchema.js",
    "line": 36,
    "function": "installBillingUsageSchema",
    "method": "exec",
    "signature": "ea15906981e4f6e9d18e95f1a2b047225a2daa65ebd06e4411dc6c320ed49633",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Installs billing usage/annual/trial schemas or migrates installment constraints atomically."
  },
  {
    "file": "server/src/billingUsageSchema.js",
    "line": 40,
    "function": "installBillingUsageSchema",
    "method": "exec",
    "signature": "88d78b40e3b374ffeaa2acaad228e49858ae3f2111b77d59aa293682956429ba",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Installs billing usage/annual/trial schemas or migrates installment constraints atomically."
  },
  {
    "file": "server/src/billingUsageSchema.js",
    "line": 41,
    "function": "installBillingUsageSchema",
    "method": "exec",
    "signature": "e4b897410c04341e91e8600025e94f534c459ca06b1aab343b953daa940587d7",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Installs billing usage/annual/trial schemas or migrates installment constraints atomically."
  },
  {
    "file": "server/src/billingUsageSchema.js",
    "line": 56,
    "function": "installBillingUsageSchema",
    "method": "exec",
    "signature": "27c8b614bd745dc539bfa82879efdebe47c654c3789887080b5d5aa1d01033b8",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Installs billing usage/annual/trial schemas or migrates installment constraints atomically."
  },
  {
    "file": "server/src/billingUsageSchema.js",
    "line": 58,
    "function": "installBillingUsageSchema",
    "method": "exec",
    "signature": "82edef6c0956efe666e7696dcbe171e2ea2802a350d977ad670bab70f6aa6e2a",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Installs billing usage/annual/trial schemas or migrates installment constraints atomically."
  },
  {
    "file": "server/src/billingUsageSchema.js",
    "line": 60,
    "function": "installBillingUsageSchema",
    "method": "exec",
    "signature": "35dd107421e895b84f5aade7da6e5454ac7ab33c14f760e3a77f146f263c2b83",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Installs billing usage/annual/trial schemas or migrates installment constraints atomically."
  },
  {
    "file": "server/src/billingUsageSchema.js",
    "line": 64,
    "function": "installBillingUsageSchema",
    "method": "exec",
    "signature": "822fb7c96cd1122d4b7ba31549fccdf282b699e6e87a7b8515689e3971a84f5a",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Installs billing usage/annual/trial schemas or migrates installment constraints atomically."
  },
  {
    "file": "server/src/billingUsageSchema.js",
    "line": 65,
    "function": "installBillingUsageSchema",
    "method": "exec",
    "signature": "060f2d7d732d5432a2af0721899b2dc907fed739d34ad948922fc64961d53725",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Installs billing usage/annual/trial schemas or migrates installment constraints atomically."
  },
  {
    "file": "server/src/billingVoiceUsage.js",
    "line": 9,
    "function": "transaction",
    "method": "exec",
    "signature": "cec5ac31f4a5aa5ecb9a92ab24079a84e39aa70f4c0fe608f20fd1a0635c099d",
    "occurrence": 1,
    "category": "admin",
    "reason": "Database administration: fixed transaction/lock boundary only; reads or writes no tenant rows. Statements inside the callback still require ownerQuery or their own explicit exception."
  },
  {
    "file": "server/src/billingVoiceUsage.js",
    "line": 9,
    "function": "transaction",
    "method": "exec",
    "signature": "32942146ce40175ca6f66bacb0e04128a38458024c9d6bcce95f65b6f15a53c5",
    "occurrence": 1,
    "category": "admin",
    "reason": "Database administration: fixed transaction/lock boundary only; reads or writes no tenant rows. Statements inside the callback still require ownerQuery or their own explicit exception."
  },
  {
    "file": "server/src/billingVoiceUsage.js",
    "line": 9,
    "function": "transaction",
    "method": "exec",
    "signature": "3bc40a49d855e0a309070363430a98b1f46ecf0832336a55574c5c49ad9b4168",
    "occurrence": 1,
    "category": "admin",
    "reason": "Database administration: fixed transaction/lock boundary only; reads or writes no tenant rows. Statements inside the callback still require ownerQuery or their own explicit exception."
  },
  {
    "file": "server/src/callSummaryService.js",
    "line": 43,
    "function": "completeVoiceCall",
    "method": "exec",
    "signature": "cec5ac31f4a5aa5ecb9a92ab24079a84e39aa70f4c0fe608f20fd1a0635c099d",
    "occurrence": 1,
    "category": "admin",
    "reason": "Database administration: fixed transaction/lock boundary only; reads or writes no tenant rows. Statements inside the callback still require ownerQuery or their own explicit exception."
  },
  {
    "file": "server/src/callSummaryService.js",
    "line": 44,
    "function": "completeVoiceCall",
    "method": "exec",
    "signature": "32942146ce40175ca6f66bacb0e04128a38458024c9d6bcce95f65b6f15a53c5",
    "occurrence": 1,
    "category": "admin",
    "reason": "Database administration: fixed transaction/lock boundary only; reads or writes no tenant rows. Statements inside the callback still require ownerQuery or their own explicit exception."
  },
  {
    "file": "server/src/callSummaryService.js",
    "line": 44,
    "function": "completeVoiceCall",
    "method": "exec",
    "signature": "3bc40a49d855e0a309070363430a98b1f46ecf0832336a55574c5c49ad9b4168",
    "occurrence": 1,
    "category": "admin",
    "reason": "Database administration: fixed transaction/lock boundary only; reads or writes no tenant rows. Statements inside the callback still require ownerQuery or their own explicit exception."
  },
  {
    "file": "server/src/demo/liveDemo.js",
    "line": 64,
    "function": "installLiveDemoRoutes",
    "method": "exec",
    "signature": "b4a88d6bb1dc90f1a8cfec7ce43eb711ae454cd2b2ccc79283f9a681911614f7",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Installs platform demo-session accounting tables and indexes; no owner data is accessed."
  },
  {
    "file": "server/src/migrations.js",
    "line": 92,
    "function": "addMissingColumns",
    "method": "exec",
    "signature": "ebce4527b3e7920d3b55c45f6ee94fd31afe9e9a16c862b036482d4905f5f6e4",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Schema migration infrastructure: table/column/trigger installation, transactional rebuilds or migration PRAGMA configuration."
  },
  {
    "file": "server/src/migrations.js",
    "line": 158,
    "function": "setPragma",
    "method": "exec",
    "signature": "ad264d6d9c4463fbb126119b2a8d7c7a6970f7804376a2dfcdb162d4ea08074e",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Schema migration infrastructure: table/column/trigger installation, transactional rebuilds or migration PRAGMA configuration."
  },
  {
    "file": "server/src/migrations.js",
    "line": 163,
    "function": "runTransaction",
    "method": "exec",
    "signature": "cec5ac31f4a5aa5ecb9a92ab24079a84e39aa70f4c0fe608f20fd1a0635c099d",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Schema migration infrastructure: table/column/trigger installation, transactional rebuilds or migration PRAGMA configuration."
  },
  {
    "file": "server/src/migrations.js",
    "line": 166,
    "function": "runTransaction",
    "method": "exec",
    "signature": "32942146ce40175ca6f66bacb0e04128a38458024c9d6bcce95f65b6f15a53c5",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Schema migration infrastructure: table/column/trigger installation, transactional rebuilds or migration PRAGMA configuration."
  },
  {
    "file": "server/src/migrations.js",
    "line": 169,
    "function": "runTransaction",
    "method": "exec",
    "signature": "3bc40a49d855e0a309070363430a98b1f46ecf0832336a55574c5c49ad9b4168",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Schema migration infrastructure: table/column/trigger installation, transactional rebuilds or migration PRAGMA configuration."
  },
  {
    "file": "server/src/migrations.js",
    "line": 224,
    "function": "<anonymous>",
    "method": "exec",
    "signature": "b676b148e41bbee3da5b7ef052f5adcc33549447f254d1e08e930561e62d07a5",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Schema migration infrastructure: table/column/trigger installation, transactional rebuilds or migration PRAGMA configuration."
  },
  {
    "file": "server/src/migrations.js",
    "line": 225,
    "function": "<anonymous>",
    "method": "exec",
    "signature": "9c51898226db6c39af9e1c31e8078ce556d34c2479afd6e6e600ec0c98111884",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Schema migration infrastructure: table/column/trigger installation, transactional rebuilds or migration PRAGMA configuration."
  },
  {
    "file": "server/src/migrations.js",
    "line": 230,
    "function": "<anonymous>",
    "method": "exec",
    "signature": "e47f6b02196dbf9c8a40738758b03dc07eb4f32ee631b966a611e3e38ef13081",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Schema migration infrastructure: table/column/trigger installation, transactional rebuilds or migration PRAGMA configuration."
  },
  {
    "file": "server/src/migrations.js",
    "line": 231,
    "function": "<anonymous>",
    "method": "exec",
    "signature": "b779f753f3d97f2c5c5d8733d624c716d0420716b992ca52cae62528af5f901f",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Schema migration infrastructure: table/column/trigger installation, transactional rebuilds or migration PRAGMA configuration."
  },
  {
    "file": "server/src/migrations.js",
    "line": 253,
    "function": "<anonymous>",
    "method": "exec",
    "signature": "e8b5771890789eb777ecbf9a85408631b47a0307bdb720231b3610c55387d344",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Schema migration infrastructure: table/column/trigger installation, transactional rebuilds or migration PRAGMA configuration."
  },
  {
    "file": "server/src/migrations.js",
    "line": 254,
    "function": "<anonymous>",
    "method": "exec",
    "signature": "7ebf267c0c485adfa1b195d5d0fa4e95b5ca798300a0634259bcc39e66f94ce5",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Schema migration infrastructure: table/column/trigger installation, transactional rebuilds or migration PRAGMA configuration."
  },
  {
    "file": "server/src/migrations.js",
    "line": 255,
    "function": "<anonymous>",
    "method": "exec",
    "signature": "5114432b54b7f798d67a93768b929f8a6bb3d3a8d7ec95bc412f078597bac5e9",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Schema migration infrastructure: table/column/trigger installation, transactional rebuilds or migration PRAGMA configuration."
  },
  {
    "file": "server/src/migrations.js",
    "line": 256,
    "function": "<anonymous>",
    "method": "exec",
    "signature": "6b5e4cd6f53086a545a2a758b0fe526363cdfe2395d7d80d4d320ec90fec60b3",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Schema migration infrastructure: table/column/trigger installation, transactional rebuilds or migration PRAGMA configuration."
  },
  {
    "file": "server/src/migrations.js",
    "line": 257,
    "function": "<anonymous>",
    "method": "exec",
    "signature": "0aebc60940dc33ba80690d33a84919e081579620a6be2703f87632b47b24e099",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Schema migration infrastructure: table/column/trigger installation, transactional rebuilds or migration PRAGMA configuration."
  },
  {
    "file": "server/src/migrations.js",
    "line": 292,
    "function": "migrateDatabase",
    "method": "exec",
    "signature": "b111c6e1d318f203063e5c16bab43c108326af0aa2f7b65760c95547a43dbe52",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Schema migration infrastructure: table/column/trigger installation, transactional rebuilds or migration PRAGMA configuration."
  },
  {
    "file": "server/src/migrations.js",
    "line": 316,
    "function": "migrateDatabase",
    "method": "exec",
    "signature": "b111c6e1d318f203063e5c16bab43c108326af0aa2f7b65760c95547a43dbe52",
    "occurrence": 2,
    "category": "migrations",
    "reason": "Schema migration infrastructure: table/column/trigger installation, transactional rebuilds or migration PRAGMA configuration."
  },
  {
    "file": "server/src/migrations.js",
    "line": 319,
    "function": "migrateDatabase",
    "method": "exec",
    "signature": "b111c6e1d318f203063e5c16bab43c108326af0aa2f7b65760c95547a43dbe52",
    "occurrence": 3,
    "category": "migrations",
    "reason": "Schema migration infrastructure: table/column/trigger installation, transactional rebuilds or migration PRAGMA configuration."
  },
  {
    "file": "server/src/notificationHistorySchema.js",
    "line": 2,
    "function": "installNotificationHistorySchema",
    "method": "exec",
    "signature": "b06b9c0adba50c3d6411cfeffd4a103a99c2d85f44dda420d9d5e4c6c909d74f",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Migration-only installation/repair of historical notification state and cancellation of the removed text channel; never sends messages."
  },
  {
    "file": "server/src/notificationHistorySchema.js",
    "line": 31,
    "function": "installNotificationHistorySchema",
    "method": "exec",
    "signature": "2e474363f8a91bf509ff59df3de816c69ede1d5adad7d1a834630a868d484abd",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Migration-only installation/repair of historical notification state and cancellation of the removed text channel; never sends messages."
  },
  {
    "file": "server/src/notificationHistorySchema.js",
    "line": 34,
    "function": "installNotificationHistorySchema",
    "method": "exec",
    "signature": "bab6f07a342d18ad52392175810260fcdff28e4c01d10ec5f8ba8a93faea94c5",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Migration-only installation/repair of historical notification state and cancellation of the removed text channel; never sends messages."
  },
  {
    "file": "server/src/outboundWebhookSchema.js",
    "line": 43,
    "function": "installOutboundWebhookSchema",
    "method": "exec",
    "signature": "3582e57cdd3aa0a2e75c57faf759e6455642a7eee953d82bfbfd641a6af1dccd",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Installs webhook/export tables, indexes and capture triggers; trigger writes carry NEW.ownerId and joined tenant predicates."
  },
  {
    "file": "server/src/outboundWebhookSchema.js",
    "line": 57,
    "function": "installOutboundWebhookSchema",
    "method": "exec",
    "signature": "a3b08f656fff43f3f9eb544217470bda4ce89d92101779837454d146fbb09663",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Installs webhook/export tables, indexes and capture triggers; trigger writes carry NEW.ownerId and joined tenant predicates."
  },
  {
    "file": "server/src/outboundWebhookSchema.js",
    "line": 76,
    "function": "installOutboundWebhookSchema",
    "method": "exec",
    "signature": "97cc0d1dfb85cefce3e0e29138c5249aafc378d98b4bb54be74d10a47d58e8db",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Installs webhook/export tables, indexes and capture triggers; trigger writes carry NEW.ownerId and joined tenant predicates."
  },
  {
    "file": "server/src/outboundWebhookSchema.js",
    "line": 77,
    "function": "installOutboundWebhookSchema",
    "method": "exec",
    "signature": "0ac3eddd2db6c3560f95fb55744013c891e859980b4c05cd682ec466d516eecd",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Installs webhook/export tables, indexes and capture triggers; trigger writes carry NEW.ownerId and joined tenant predicates."
  },
  {
    "file": "server/src/outboundWebhookSchema.js",
    "line": 78,
    "function": "installOutboundWebhookSchema",
    "method": "exec",
    "signature": "b87bbbfdac2b96445b5c015424ffa7b47851011ca0a5487cd7d789f40d9f5bd2",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Installs webhook/export tables, indexes and capture triggers; trigger writes carry NEW.ownerId and joined tenant predicates."
  },
  {
    "file": "server/src/outboundWebhookSchema.js",
    "line": 79,
    "function": "installOutboundWebhookSchema",
    "method": "exec",
    "signature": "cbb99b5a0b919d6e1f917cc946f3b71d7460b74236784b93c157e2c336e9a33b",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Installs webhook/export tables, indexes and capture triggers; trigger writes carry NEW.ownerId and joined tenant predicates."
  },
  {
    "file": "server/src/outboundWebhookSchema.js",
    "line": 80,
    "function": "installOutboundWebhookSchema",
    "method": "exec",
    "signature": "0e669def25196d76a1dbb8214c94f9be636a34e722c0b9d81bd77021150e7c79",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Installs webhook/export tables, indexes and capture triggers; trigger writes carry NEW.ownerId and joined tenant predicates."
  },
  {
    "file": "server/src/outboundWebhookSchema.js",
    "line": 81,
    "function": "installOutboundWebhookSchema",
    "method": "exec",
    "signature": "8b8e49f388dbb53203d70510ed7f2524defa67871432cdd78a1daeee98564823",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Installs webhook/export tables, indexes and capture triggers; trigger writes carry NEW.ownerId and joined tenant predicates."
  },
  {
    "file": "server/src/outboundWebhookSchema.js",
    "line": 84,
    "function": "installOutboundWebhookSchema",
    "method": "exec",
    "signature": "9e8e5ff8cae00a1ccd059b36cc6e868ea7196dedf0e104fc08ed9461231bed91",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Installs webhook/export tables, indexes and capture triggers; trigger writes carry NEW.ownerId and joined tenant predicates."
  },
  {
    "file": "server/src/outboundWebhookSchema.js",
    "line": 86,
    "function": "installOutboundWebhookSchema",
    "method": "exec",
    "signature": "d37dd28639a8d4f18feb0735fa7fe70c098e187d643506b63c4928b657f5b347",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Installs webhook/export tables, indexes and capture triggers; trigger writes carry NEW.ownerId and joined tenant predicates."
  },
  {
    "file": "server/src/outboundWebhookSchema.js",
    "line": 87,
    "function": "installOutboundWebhookSchema",
    "method": "exec",
    "signature": "060f44d8a10a0a8035113a95ade2329f2ecae5c6e803ad62ab5443d6530b81ad",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Installs webhook/export tables, indexes and capture triggers; trigger writes carry NEW.ownerId and joined tenant predicates."
  },
  {
    "file": "server/src/outboundWebhookSchema.js",
    "line": 88,
    "function": "installOutboundWebhookSchema",
    "method": "exec",
    "signature": "bcc97754b042a9d613edce1175ff6f7f93702984caea70587961962b8571bfa8",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Installs webhook/export tables, indexes and capture triggers; trigger writes carry NEW.ownerId and joined tenant predicates."
  },
  {
    "file": "server/src/outboundWebhookSchema.js",
    "line": 90,
    "function": "installOutboundWebhookSchema",
    "method": "exec",
    "signature": "e0ffb16fe61ba0a02f5a53f4bd40fae02888754f2d8d7f8b8227de07f92dd7af",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Installs webhook/export tables, indexes and capture triggers; trigger writes carry NEW.ownerId and joined tenant predicates."
  },
  {
    "file": "server/src/outboundWebhookSchema.js",
    "line": 90,
    "function": "installOutboundWebhookSchema",
    "method": "exec",
    "signature": "bcc97754b042a9d613edce1175ff6f7f93702984caea70587961962b8571bfa8",
    "occurrence": 2,
    "category": "migrations",
    "reason": "Installs webhook/export tables, indexes and capture triggers; trigger writes carry NEW.ownerId and joined tenant predicates."
  },
  {
    "file": "server/src/outboundWebhookSchema.js",
    "line": 92,
    "function": "installOutboundWebhookSchema",
    "method": "exec",
    "signature": "f870db53a6447fcf020fe392dfad587c6caf0b8a866c73bea8ee96cd40f8bab3",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Installs webhook/export tables, indexes and capture triggers; trigger writes carry NEW.ownerId and joined tenant predicates."
  },
  {
    "file": "server/src/outboundWebhookSchema.js",
    "line": 93,
    "function": "installOutboundWebhookSchema",
    "method": "exec",
    "signature": "ce150ba2534de854ca1b5c57ce624725d7fcf87e57784b0a2bb6b459d10cd61d",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Installs webhook/export tables, indexes and capture triggers; trigger writes carry NEW.ownerId and joined tenant predicates."
  },
  {
    "file": "server/src/outboundWebhookSchema.js",
    "line": 96,
    "function": "installOutboundWebhookSchema",
    "method": "exec",
    "signature": "caef3b30eee5155da14c9e1d26a170ab6d76efd664ad2aae5a0c9c5b10b103a1",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Installs webhook/export tables, indexes and capture triggers; trigger writes carry NEW.ownerId and joined tenant predicates."
  },
  {
    "file": "server/src/outboundWebhookSchema.js",
    "line": 103,
    "function": "installOutboundWebhookSchema",
    "method": "exec",
    "signature": "2bd1c1d69fb8e02a8b6f21e4029f6317b05cb64925f35e2350ac6a483f69d301",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Installs webhook/export tables, indexes and capture triggers; trigger writes carry NEW.ownerId and joined tenant predicates."
  },
  {
    "file": "server/src/outboundWebhookService.js",
    "line": 14,
    "function": "transaction",
    "method": "exec",
    "signature": "cec5ac31f4a5aa5ecb9a92ab24079a84e39aa70f4c0fe608f20fd1a0635c099d",
    "occurrence": 1,
    "category": "admin",
    "reason": "Database administration: fixed transaction/lock boundary only; reads or writes no tenant rows. Statements inside the callback still require ownerQuery or their own explicit exception."
  },
  {
    "file": "server/src/outboundWebhookService.js",
    "line": 15,
    "function": "transaction",
    "method": "exec",
    "signature": "32942146ce40175ca6f66bacb0e04128a38458024c9d6bcce95f65b6f15a53c5",
    "occurrence": 1,
    "category": "admin",
    "reason": "Database administration: fixed transaction/lock boundary only; reads or writes no tenant rows. Statements inside the callback still require ownerQuery or their own explicit exception."
  },
  {
    "file": "server/src/outboundWebhookService.js",
    "line": 16,
    "function": "transaction",
    "method": "exec",
    "signature": "3bc40a49d855e0a309070363430a98b1f46ecf0832336a55574c5c49ad9b4168",
    "occurrence": 1,
    "category": "admin",
    "reason": "Database administration: fixed transaction/lock boundary only; reads or writes no tenant rows. Statements inside the callback still require ownerQuery or their own explicit exception."
  },
  {
    "file": "server/src/ownerAlertSchema.js",
    "line": 6,
    "function": "installOwnerAlertSchema",
    "method": "exec",
    "signature": "ec28a0527780759cbb79ee9ee29fe715c9211c759e4c11afd333cde5595b6cee",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Installs owner-alert tables/triggers or backfills pending historic alert work; joins and trigger writes retain ownerId."
  },
  {
    "file": "server/src/ownerAlertSchema.js",
    "line": 28,
    "function": "installOwnerAlertSchema",
    "method": "exec",
    "signature": "61aa10c718ff5f7acbcb113326d9d0a5b7b79292add5d572c0fe6a4fb30777ce",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Installs owner-alert tables/triggers or backfills pending historic alert work; joins and trigger writes retain ownerId."
  },
  {
    "file": "server/src/ownerAlertSchema.js",
    "line": 37,
    "function": "installOwnerAlertSchema",
    "method": "exec",
    "signature": "6e14af57b94f781449493216b12f8ed2143902d761726d6272afcd3c739b7718",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Installs owner-alert tables/triggers or backfills pending historic alert work; joins and trigger writes retain ownerId."
  },
  {
    "file": "server/src/ownerAlertSchema.js",
    "line": 45,
    "function": "trigger",
    "method": "exec",
    "signature": "0387fff49cd9582b520c44539e434b2506217b83e6c9c22ebbfef03a670edb13",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Installs owner-alert tables/triggers or backfills pending historic alert work; joins and trigger writes retain ownerId."
  },
  {
    "file": "server/src/ownerAlertSchema.js",
    "line": 50,
    "function": "installOwnerAlertSchema",
    "method": "exec",
    "signature": "de87e5b3f06ada1220e48498adc366a952ef64b62f80eb1f317b3490406495a4",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Installs owner-alert tables/triggers or backfills pending historic alert work; joins and trigger writes retain ownerId."
  },
  {
    "file": "server/src/ownerAlertSchema.js",
    "line": 62,
    "function": "installOwnerAlertSchema",
    "method": "exec",
    "signature": "bd99b4834393f663e3f432840b19f671c30b350cdd84df173eeda7106ed1dbc2",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Installs owner-alert tables/triggers or backfills pending historic alert work; joins and trigger writes retain ownerId."
  },
  {
    "file": "server/src/ownerAlertSchema.js",
    "line": 67,
    "function": "installOwnerAlertSchema",
    "method": "exec",
    "signature": "8aab9f245a9c0f5abf107beff5c21531c51ed5820866a5fd9436f47db6d0a8ae",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Installs owner-alert tables/triggers or backfills pending historic alert work; joins and trigger writes retain ownerId."
  },
  {
    "file": "server/src/ownerAlertSchema.js",
    "line": 72,
    "function": "installOwnerAlertSchema",
    "method": "exec",
    "signature": "f8b3598d0b30c6c1088180a8fdccd839f5b5895e92f80ef20a3c6b6407d0f949",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Installs owner-alert tables/triggers or backfills pending historic alert work; joins and trigger writes retain ownerId."
  },
  {
    "file": "server/src/ownerAlertSchema.js",
    "line": 83,
    "function": "installOwnerAlertSchema",
    "method": "exec",
    "signature": "fcdacd66533257729ae7c466485aa4b0a15fd4b3fc133ddcfa2855db44d080ce",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Installs owner-alert tables/triggers or backfills pending historic alert work; joins and trigger writes retain ownerId."
  },
  {
    "file": "server/src/ownerDashboardSchema.js",
    "line": 3,
    "function": "installOwnerDashboardSchema",
    "method": "exec",
    "signature": "f28a15639a218d2336e7de45b35ff45b7f3afdbcc94aa883df1a41565e9bb3cf",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Installs owner workflow/history tables and tenant indexes."
  },
  {
    "file": "server/src/platformIntegrations.js",
    "line": 344,
    "function": "transaction",
    "method": "exec",
    "signature": "cec5ac31f4a5aa5ecb9a92ab24079a84e39aa70f4c0fe608f20fd1a0635c099d",
    "occurrence": 1,
    "category": "admin",
    "reason": "Database administration: fixed transaction/lock boundary only; reads or writes no tenant rows. Statements inside the callback still require ownerQuery or their own explicit exception."
  },
  {
    "file": "server/src/platformIntegrations.js",
    "line": 345,
    "function": "transaction",
    "method": "exec",
    "signature": "32942146ce40175ca6f66bacb0e04128a38458024c9d6bcce95f65b6f15a53c5",
    "occurrence": 1,
    "category": "admin",
    "reason": "Database administration: fixed transaction/lock boundary only; reads or writes no tenant rows. Statements inside the callback still require ownerQuery or their own explicit exception."
  },
  {
    "file": "server/src/platformIntegrations.js",
    "line": 346,
    "function": "transaction",
    "method": "exec",
    "signature": "3bc40a49d855e0a309070363430a98b1f46ecf0832336a55574c5c49ad9b4168",
    "occurrence": 1,
    "category": "admin",
    "reason": "Database administration: fixed transaction/lock boundary only; reads or writes no tenant rows. Statements inside the callback still require ownerQuery or their own explicit exception."
  },
  {
    "file": "server/src/quoteEmailSchema.js",
    "line": 2,
    "function": "installQuoteEmailSchema",
    "method": "exec",
    "signature": "a1b0ab25f60f8fa6e0d703bc478bcd98f3b784e40483ccdbf87da0b94aa64312",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Installs owner-bound quote narration, email confirmation and delivery tables/indexes."
  },
  {
    "file": "server/src/telephonyOperationsMigration.js",
    "line": 4,
    "function": "installTelephonyOperationsSchema",
    "method": "exec",
    "signature": "634e77e09fe6ccba559fd18d8f10d3849aff972a80c95a59a159f140f5238ef2",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Installs telephony operation and forwarding-check tables/indexes."
  },
  {
    "file": "server/src/tenantBackupErasure.js",
    "line": 28,
    "function": "scrubBundle",
    "method": "exec",
    "signature": "791884f30097ad42866a8b2c5210a68fb1a017f9c13fcd926215f33365c7fd5e",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Adds the erased-account marker column to a temporary recovery database before tenant-bound deletion."
  },
  {
    "file": "server/src/tenantBackupErasure.js",
    "line": 38,
    "function": "scrubBundle",
    "method": "exec",
    "signature": "3fe30ebba361fbd124a5e5e5e9959db5b7668b76ce6d7eb04f3fd381b9d240d6",
    "occurrence": 1,
    "category": "admin",
    "reason": "Database administration compacts a scrubbed temporary recovery database after ownerQuery erasure; reads no application records."
  },
  {
    "file": "server/src/voice/voiceAdmission.js",
    "line": 20,
    "function": "atomic",
    "method": "exec",
    "signature": "cec5ac31f4a5aa5ecb9a92ab24079a84e39aa70f4c0fe608f20fd1a0635c099d",
    "occurrence": 1,
    "category": "admin",
    "reason": "Database administration: fixed transaction/lock boundary only; reads or writes no tenant rows. Statements inside the callback still require ownerQuery or their own explicit exception."
  },
  {
    "file": "server/src/voice/voiceAdmission.js",
    "line": 21,
    "function": "atomic",
    "method": "exec",
    "signature": "32942146ce40175ca6f66bacb0e04128a38458024c9d6bcce95f65b6f15a53c5",
    "occurrence": 1,
    "category": "admin",
    "reason": "Database administration: fixed transaction/lock boundary only; reads or writes no tenant rows. Statements inside the callback still require ownerQuery or their own explicit exception."
  },
  {
    "file": "server/src/voice/voiceAdmission.js",
    "line": 22,
    "function": "atomic",
    "method": "exec",
    "signature": "3bc40a49d855e0a309070363430a98b1f46ecf0832336a55574c5c49ad9b4168",
    "occurrence": 1,
    "category": "admin",
    "reason": "Database administration: fixed transaction/lock boundary only; reads or writes no tenant rows. Statements inside the callback still require ownerQuery or their own explicit exception."
  },
  {
    "file": "server/src/voice/voicePersistence.js",
    "line": 32,
    "function": "immediate",
    "method": "exec",
    "signature": "cec5ac31f4a5aa5ecb9a92ab24079a84e39aa70f4c0fe608f20fd1a0635c099d",
    "occurrence": 1,
    "category": "admin",
    "reason": "Database administration: fixed transaction/lock boundary only; reads or writes no tenant rows. Statements inside the callback still require ownerQuery or their own explicit exception."
  },
  {
    "file": "server/src/voice/voicePersistence.js",
    "line": 35,
    "function": "immediate",
    "method": "exec",
    "signature": "32942146ce40175ca6f66bacb0e04128a38458024c9d6bcce95f65b6f15a53c5",
    "occurrence": 1,
    "category": "admin",
    "reason": "Database administration: fixed transaction/lock boundary only; reads or writes no tenant rows. Statements inside the callback still require ownerQuery or their own explicit exception."
  },
  {
    "file": "server/src/voice/voicePersistence.js",
    "line": 38,
    "function": "immediate",
    "method": "exec",
    "signature": "3bc40a49d855e0a309070363430a98b1f46ecf0832336a55574c5c49ad9b4168",
    "occurrence": 1,
    "category": "admin",
    "reason": "Database administration: fixed transaction/lock boundary only; reads or writes no tenant rows. Statements inside the callback still require ownerQuery or their own explicit exception."
  },
  {
    "file": "server/src/voice/voiceToolRuntime.js",
    "line": 127,
    "function": "immediate",
    "method": "exec",
    "signature": "cec5ac31f4a5aa5ecb9a92ab24079a84e39aa70f4c0fe608f20fd1a0635c099d",
    "occurrence": 1,
    "category": "admin",
    "reason": "Database administration: fixed transaction/lock boundary only; reads or writes no tenant rows. Statements inside the callback still require ownerQuery or their own explicit exception."
  },
  {
    "file": "server/src/voice/voiceToolRuntime.js",
    "line": 130,
    "function": "immediate",
    "method": "exec",
    "signature": "32942146ce40175ca6f66bacb0e04128a38458024c9d6bcce95f65b6f15a53c5",
    "occurrence": 1,
    "category": "admin",
    "reason": "Database administration: fixed transaction/lock boundary only; reads or writes no tenant rows. Statements inside the callback still require ownerQuery or their own explicit exception."
  },
  {
    "file": "server/src/voice/voiceToolRuntime.js",
    "line": 133,
    "function": "immediate",
    "method": "exec",
    "signature": "3bc40a49d855e0a309070363430a98b1f46ecf0832336a55574c5c49ad9b4168",
    "occurrence": 1,
    "category": "admin",
    "reason": "Database administration: fixed transaction/lock boundary only; reads or writes no tenant rows. Statements inside the callback still require ownerQuery or their own explicit exception."
  },
  {
    "file": "server/src/voiceDurationRecovery.js",
    "line": 11,
    "function": "createVoiceDurationRecovery",
    "method": "exec",
    "signature": "743228855d94991e2ad28f89c1fd7f84d92e41abee341b87be75853a8d33d828",
    "occurrence": 1,
    "category": "migrations",
    "reason": "Installs the duration-confirmation recovery table and due-work index before processing owner-bound calls."
  }
]);

export const OWNER_QUERY_NON_QUERY_USES = Object.freeze([
  {
    "file": "server/quote-engine-vnext\u002ftests/dateContext.spec.mjs",
    "function": "dateContext test fixture",
    "reason": "Synthetic quote-engine test fixture implements a fake database method.",
    "signature": "f52c7812de0671eef1f2a0edc9a2cc36f5b59364e3222d7b846792390456f80c",
    "occurrence": 1,
    "line": 83
  },
  {
    "file": "server/src/auth.js",
    "function": "dependency validation",
    "reason": "Checks the injected SQLite dependency shape without executing a query.",
    "signature": "cffe6b670095a3588205bd6c4f4ec5fd7de0a446aae6c79b74d72c4287850a92",
    "occurrence": 1,
    "line": 92
  },
  {
    "file": "server/src/authTokenService.js",
    "function": "dependency validation",
    "reason": "Checks the injected SQLite dependency shape without executing a query.",
    "signature": "e5ac8ea24d193fdee2095f6e68333587c4a21e90974fa0cb2c117421e8e6474e",
    "occurrence": 1,
    "line": 201
  },
  {
    "file": "server/src/billingRoutes.js",
    "function": "dependency validation",
    "reason": "Checks the injected SQLite dependency shape without executing a query.",
    "signature": "fbbf8364fb73ff9e4b8a8355df87feea1bc33d3ce172ce85b5f4eb80d39f2643",
    "occurrence": 1,
    "line": 349
  },
  {
    "file": "server/src/billingStateService.js",
    "function": "dependency validation",
    "reason": "Checks the injected SQLite dependency shape without executing a query.",
    "signature": "e427edc2b62645b776e651900eb8ac341a3f85f916a29c5053efc57b00b7f044",
    "occurrence": 1,
    "line": 250
  },
  {
    "file": "server/src/billingUsagePolicy.js",
    "function": "usageOwnerQuery",
    "reason": "The injected ownerQuery helper prepares SQL after checking the owner predicate.",
    "signature": "4ec7c53222c8a758c722e2111541035ce700d5ae7bd0898c5f1b1a743e6450fd",
    "occurrence": 1,
    "line": 68
  },
  {
    "file": "server/src/bookingAdminService.js",
    "function": "dependency validation",
    "reason": "Checks the injected SQLite dependency shape without executing a query.",
    "signature": "850c2484d4887ab1f03eb91af48152257ebf25861178890ed2e29235d21c7b7c",
    "occurrence": 1,
    "line": 612
  },
  {
    "file": "server/src/bookingPreferenceService.js",
    "function": "dependency validation",
    "reason": "Checks the injected SQLite dependency shape without executing a query.",
    "signature": "850c2484d4887ab1f03eb91af48152257ebf25861178890ed2e29235d21c7b7c",
    "occurrence": 1,
    "line": 160
  },
  {
    "file": "server/src/bookingService.js",
    "function": "dependency validation",
    "reason": "Checks the injected SQLite dependency shape without executing a query.",
    "signature": "850c2484d4887ab1f03eb91af48152257ebf25861178890ed2e29235d21c7b7c",
    "occurrence": 1,
    "line": 263
  },
  {
    "file": "server/src/calendarOAuthState.js",
    "function": "dependency validation",
    "reason": "Checks the injected SQLite dependency shape without executing a query.",
    "signature": "73925bc4e79a2feea1af31ec29d1eb400b08d3d9bce225e513f5f2b430611910",
    "occurrence": 1,
    "line": 168
  },
  {
    "file": "server/src/db.js",
    "function": "ownerQuery",
    "reason": "The ownerQuery helper is the database preparation boundary.",
    "signature": "4ec7c53222c8a758c722e2111541035ce700d5ae7bd0898c5f1b1a743e6450fd",
    "occurrence": 1,
    "line": 30
  },
  {
    "file": "server/src/quoteDoneRoutes.js",
    "function": "quote routes",
    "reason": "HTTP path segment named draft, not a database access.",
    "signature": "5b060122282a853f532d4dcd0903ac21cb793631302c70e7ca2f3e059b04baf5",
    "occurrence": 1,
    "line": 276
  },
  {
    "file": "server/src/quoteDoneRoutes.js",
    "function": "quote routes",
    "reason": "HTTP path segment named draft, not a database access.",
    "signature": "8621ad257ba4926ce00d97497886875137519b6a6fef92a569637a84e2b7cf2a",
    "occurrence": 1,
    "line": 279
  },
  {
    "file": "server/src/quoteEmailService.js",
    "function": "quote email service",
    "reason": "Quote email application method named draft, not a database access.",
    "signature": "55c15137b2afa99405d2a7fc54c299b619fac5e1dccf838963e9b04e2b515361",
    "occurrence": 1,
    "line": 20
  },
  {
    "file": "server/src/quoteEmailService.js",
    "function": "quote email service",
    "reason": "Quote email application method named draft, not a database access.",
    "signature": "36b890c6677253d910dc009ec080e1fccbfbdafb6e0d1fadfe68448d9a0aa4bf",
    "occurrence": 1,
    "line": 152
  },
  {
    "file": "server/src/voice/productionVoiceRuntime.js",
    "function": "dependency validation",
    "reason": "Checks the injected SQLite dependency shape without executing a query.",
    "signature": "045383ababdcc533677d179156ed2324ae3736c4bd18c1f12905c37a053e2c5e",
    "occurrence": 1,
    "line": 45
  },
  {
    "file": "server/src/voice/voicePersistence.js",
    "function": "dependency validation",
    "reason": "Checks the injected SQLite dependency shape without executing a query.",
    "signature": "cffe6b670095a3588205bd6c4f4ec5fd7de0a446aae6c79b74d72c4287850a92",
    "occurrence": 1,
    "line": 58
  },
  {
    "file": "server/src/voice/voicePersistence.js",
    "function": "dependency validation",
    "reason": "Checks the injected SQLite dependency shape without executing a query.",
    "signature": "cffe6b670095a3588205bd6c4f4ec5fd7de0a446aae6c79b74d72c4287850a92",
    "occurrence": 2,
    "line": 128
  },
  {
    "file": "server/src/voice/voicePersistence.js",
    "function": "dependency validation",
    "reason": "Checks the injected SQLite dependency shape without executing a query.",
    "signature": "cffe6b670095a3588205bd6c4f4ec5fd7de0a446aae6c79b74d72c4287850a92",
    "occurrence": 3,
    "line": 406
  },
  {
    "file": "server/src/voice/voiceToolRuntime.js",
    "function": "quote application adapter",
    "reason": "Quote application method name, not a SQLite method.",
    "signature": "2bf0b7e51bf3386018bf02eae97afcad64ae3202ae19eefe134d9b4dbd67dced",
    "occurrence": 1,
    "line": 204
  },
  {
    "file": "server/src/voice/voiceToolRuntime.js",
    "function": "dependency validation",
    "reason": "Checks the injected SQLite dependency shape without executing a query.",
    "signature": "cffe6b670095a3588205bd6c4f4ec5fd7de0a446aae6c79b74d72c4287850a92",
    "occurrence": 1,
    "line": 221
  },
  {
    "file": "server/src/voice/voiceToolRuntime.js",
    "function": "quote application",
    "reason": "Quote application draft method, not a SQLite method.",
    "signature": "fe4011982aa4327a138ebfa73b9158559738b9948dcbdb19b5e1c26e5c6bc0b5",
    "occurrence": 1,
    "line": 453
  },
  {
    "file": "server/src/voice/voiceToolRuntime.js",
    "function": "quote email application",
    "reason": "Quote email draft method, not a SQLite method.",
    "signature": "0c112520591da856d9dc308d78760862a25fac545ecaf3d9eef03a1a230bc444",
    "occurrence": 1,
    "line": 881
  },
  {
    "file": "server/src/auth.js",
    "line": 92,
    "function": "createAuthHandlers",
    "method": "exec",
    "signature": "cffe6b670095a3588205bd6c4f4ec5fd7de0a446aae6c79b74d72c4287850a92",
    "occurrence": 1,
    "reason": "Checks the injected SQLite dependency shape with typeof; executes no query."
  },
  {
    "file": "server/src/authTokenService.js",
    "line": 201,
    "function": "assertDatabase",
    "method": "exec",
    "signature": "e5ac8ea24d193fdee2095f6e68333587c4a21e90974fa0cb2c117421e8e6474e",
    "occurrence": 1,
    "reason": "Checks the injected SQLite dependency shape with typeof; executes no query."
  },
  {
    "file": "server/src/billingStateService.js",
    "line": 250,
    "function": "createBillingStateService",
    "method": "exec",
    "signature": "e427edc2b62645b776e651900eb8ac341a3f85f916a29c5053efc57b00b7f044",
    "occurrence": 1,
    "reason": "Checks the injected SQLite dependency shape with typeof; executes no query."
  },
  {
    "file": "server/src/voice/voicePersistence.js",
    "line": 58,
    "function": "createVoiceNonceRepository",
    "method": "exec",
    "signature": "cffe6b670095a3588205bd6c4f4ec5fd7de0a446aae6c79b74d72c4287850a92",
    "occurrence": 1,
    "reason": "Checks the injected SQLite dependency shape with typeof; executes no query."
  },
  {
    "file": "server/src/voice/voicePersistence.js",
    "line": 128,
    "function": "createVoiceSessionStore",
    "method": "exec",
    "signature": "cffe6b670095a3588205bd6c4f4ec5fd7de0a446aae6c79b74d72c4287850a92",
    "occurrence": 2,
    "reason": "Checks the injected SQLite dependency shape with typeof; executes no query."
  },
  {
    "file": "server/src/voice/voicePersistence.js",
    "line": 406,
    "function": "requirePersistenceDatabase",
    "method": "exec",
    "signature": "cffe6b670095a3588205bd6c4f4ec5fd7de0a446aae6c79b74d72c4287850a92",
    "occurrence": 3,
    "reason": "Checks the injected SQLite dependency shape with typeof; executes no query."
  },
  {
    "file": "server/src/voice/voiceToolRuntime.js",
    "line": 221,
    "function": "createVoiceToolRuntime",
    "method": "exec",
    "signature": "cffe6b670095a3588205bd6c4f4ec5fd7de0a446aae6c79b74d72c4287850a92",
    "occurrence": 1,
    "reason": "Checks the injected SQLite dependency shape with typeof; executes no query."
  }
]);
