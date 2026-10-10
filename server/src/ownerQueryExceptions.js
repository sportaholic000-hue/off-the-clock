// Allowed non-tenant query categories. Regenerated from the merged source inventory.
// The scan test validates every signature and rejects unused entries.
export const OWNER_QUERY_EXCEPTIONS = Object.freeze([
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
    "function": "accept",
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
  }
]);

// Query-wrapper plumbing and non-query uses, pinned to their merged source.
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
    "line": 632
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
    "line": 262
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
  }
]);
