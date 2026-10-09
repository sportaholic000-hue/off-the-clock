// Exact direct prepare exceptions: a query must identify an owner first, or be
// part of authentication, registration, migrations, admin or platform metrics.
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
    "signature": "b557be4508e492c6d272fdba628d01f7eddc5de018507df282c17a5fdea43dbc",
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
    "file": "server/src/billingEvidence.js",
    "function": "recordSubscription",
    "reason": "Stripe webhook identity lookup before owner binding.",
    "signature": "2ac2872e9ca2d18cbb75ab6a646dab382c402116d283e99a5aa3ce1b947b52c3",
    "occurrence": 1
  },
  {
    "file": "server/src/billingEvidence.js",
    "function": "recordInvoice",
    "reason": "Stripe webhook identity lookup before owner binding.",
    "signature": "79f44fadf8c25eba90e1574499036a7cbb92702f9439d0f699beac815da3de7d",
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
    "function": "createBillingStateService",
    "reason": "Registration role lookup or Stripe webhook identity lookup before owner binding.",
    "signature": "17aa46e0d58f9c07fcfafe29f62c4d3b78d90efd8a39ff67d9d5c8f954de9f70",
    "occurrence": 1
  },
  {
    "file": "server/src/billingStateService.js",
    "function": "createBillingStateService",
    "reason": "Registration role lookup or Stripe webhook identity lookup before owner binding.",
    "signature": "f635d5e9638739c3e2ca04f049616353b5360f032fb42b86842fc6000597b142",
    "occurrence": 1
  },
  {
    "file": "server/src/billingStateService.js",
    "function": "createBillingStateService",
    "reason": "Registration role lookup or Stripe webhook identity lookup before owner binding.",
    "signature": "93175ed2e77e5ff886d8a068dd03877b0634801bc9c2d0a2d9633b2ddd85e5f1",
    "occurrence": 1
  },
  {
    "file": "server/src/billingStateService.js",
    "function": "createBillingStateService",
    "reason": "Registration role lookup or Stripe webhook identity lookup before owner binding.",
    "signature": "d3ec7913ca3674d5ef7ca441cf93caccfe8792063bd1d7c29a1e20c99cf2541d",
    "occurrence": 1
  },
  {
    "file": "server/src/billingStateService.js",
    "function": "createBillingStateService",
    "reason": "Registration role lookup or Stripe webhook identity lookup before owner binding.",
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
    "file": "server/src/bookingAdminService.js",
    "function": "createBookingAdminService",
    "reason": "Admin booking operation across tenants.",
    "signature": "e0d243063f727fd45d738e903f78bba7fdfe53db625a54557f503308c4ad2a3c",
    "occurrence": 1
  },
  {
    "file": "server/src/bookingAdminService.js",
    "function": "createBookingAdminService",
    "reason": "Admin booking operation across tenants.",
    "signature": "30332a17f58e44fcf6f92f42276f22a1626317a6851c2dd63ddcc512df79bcf1",
    "occurrence": 1
  },
  {
    "file": "server/src/bookingAdminService.js",
    "function": "createBookingAdminService",
    "reason": "Admin booking operation across tenants.",
    "signature": "9b690afa69caa173bcb7815babdec679430f9bb9b2f8f35ec79609cdbdb8e5ca",
    "occurrence": 1
  },
  {
    "file": "server/src/bookingAdminService.js",
    "function": "createBookingAdminService",
    "reason": "Admin booking operation across tenants.",
    "signature": "7c58460f10c95ae96b021056c240164a2ff3e93d1079751e0fd27c859dd3f826",
    "occurrence": 1
  },
  {
    "file": "server/src/bookingAdminService.js",
    "function": "createBookingAdminService",
    "reason": "Admin booking operation across tenants.",
    "signature": "8f512672882d88cbfa4e2b2c3c0643058e5a54633e2a5180eababb4858dd0236",
    "occurrence": 1
  },
  {
    "file": "server/src/bookingAdminService.js",
    "function": "createBookingAdminService",
    "reason": "Admin booking operation across tenants.",
    "signature": "c7b6083ce9079b968f69bc65aee4fea5784d685aca29e4df07ed31bd7011792a",
    "occurrence": 1
  },
  {
    "file": "server/src/bookingAdminService.js",
    "function": "createBookingAdminService",
    "reason": "Admin booking operation across tenants.",
    "signature": "1352372ee5c02da5cb5b35614eaadc575d731f1ade832665a9e8b20dc9cbaf0e",
    "occurrence": 1
  },
  {
    "file": "server/src/bookingAdminService.js",
    "function": "createBookingAdminService",
    "reason": "Admin booking operation across tenants.",
    "signature": "41205e1c6a43770330aaad42eda83eb4863db3db0bed0bddac7047e976920fac",
    "occurrence": 1
  },
  {
    "file": "server/src/bookingAdminService.js",
    "function": "catalog",
    "reason": "Admin booking operation across tenants.",
    "signature": "7f5152529be7183cfabf8bd1f0200f414ab990253143240d3c716ccf01a64598",
    "occurrence": 1
  },
  {
    "file": "server/src/bookingAdminService.js",
    "function": "getReadiness",
    "reason": "Admin booking operation across tenants.",
    "signature": "558de83185903b34aabb31e3944993bdbddcaf2451d6894558480e57317951c9",
    "occurrence": 1
  },
  {
    "file": "server/src/bookingAdminService.js",
    "function": "getReadiness",
    "reason": "Admin booking operation across tenants.",
    "signature": "b0bd1101e6d73383c5090c2701dfa8d6a1f5d6486e10dcf45e901e3ed40a9bb4",
    "occurrence": 1
  },
  {
    "file": "server/src/bookingAdminService.js",
    "function": "updateSettings",
    "reason": "Admin booking operation across tenants.",
    "signature": "712b47e6eeca7d2d7b5b0b14f8cbb941a9b2541f34b16cecb714227ebe5686f3",
    "occurrence": 1
  },
  {
    "file": "server/src/bookingAdminService.js",
    "function": "updatePolicy",
    "reason": "Admin booking operation across tenants.",
    "signature": "f9d2df33b2c5bfd6cdec3a780d754d3314907bd8b7fa57508fed195ccda51198",
    "occurrence": 1
  },
  {
    "file": "server/src/bookingAdminService.js",
    "function": "updatePolicy",
    "reason": "Admin booking operation across tenants.",
    "signature": "f63e1f4abce9d22f91c5e651dd915a040b9b6ed720a4885a94af3fa55a91cd8a",
    "occurrence": 1
  },
  {
    "file": "server/src/bookingAdminService.js",
    "function": "updatePolicy",
    "reason": "Admin booking operation across tenants.",
    "signature": "162c2358ccf28455b4ba34045f00c770b8ebb2044005fc21c6f5615d6533ff2c",
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
    "function": "nonceRow",
    "reason": "Signed Twilio webhook binding, nonce validation, or platform recovery before tenant binding.",
    "signature": "01ea51c200ec4e825f279c9384d034b18d689a3e4a9d30e18e3e6a8d9d33479b",
    "occurrence": 1
  },
  {
    "file": "server/src/voice/voicePersistence.js",
    "function": "validateIncomingCall",
    "reason": "Signed Twilio webhook binding, nonce validation, or platform recovery before tenant binding.",
    "signature": "3f0ff95289db32cfbdb0d2cb17531042a62d4c436598081bce2e7e7d8e1b108f",
    "occurrence": 1
  },
  {
    "file": "server/src/voice/voicePersistence.js",
    "function": "validateCallBinding",
    "reason": "Signed Twilio webhook binding, nonce validation, or platform recovery before tenant binding.",
    "signature": "f4fe3415ea27da76fa4ecddd228848ffc5c1bd2297d06412e07cae996c51421d",
    "occurrence": 1
  },
  {
    "file": "server/src/voice/voicePersistence.js",
    "function": "createVoiceSessionStore.createSession",
    "reason": "Signed Twilio webhook binding, nonce validation, or platform recovery before tenant binding.",
    "signature": "f7e2084ea8cd96a573bbf15c6d179f5ce5961b82b15cefeb618b902ad1eb350b",
    "occurrence": 1
  },
  {
    "file": "server/src/voice/voicePersistence.js",
    "function": "loadSessionByNonceHash",
    "reason": "Signed Twilio webhook binding, nonce validation, or platform recovery before tenant binding.",
    "signature": "ba0b9759a9fad1bc7282d932e7520e163dd2dda878a285bf94102817c6177cf9",
    "occurrence": 1
  },
  {
    "file": "server/src/voice/voicePersistence.js",
    "function": "recordFallback",
    "reason": "Signed Twilio webhook binding, nonce validation, or platform recovery before tenant binding.",
    "signature": "f7e2084ea8cd96a573bbf15c6d179f5ce5961b82b15cefeb618b902ad1eb350b",
    "occurrence": 2
  },
  {
    "file": "server/src/voice/voicePersistence.js",
    "function": "recoverActiveCalls",
    "reason": "Signed Twilio webhook binding, nonce validation, or platform recovery before tenant binding.",
    "signature": "314c45e633461a3e645a25db473ca773a25f74387e494a5b489452387a66b5e3",
    "occurrence": 1
  },
  {
    "file": "server/src/voice/voicePersistence.js",
    "function": "findVoiceTenantsByNumber",
    "reason": "Signed Twilio webhook binding, nonce validation, or platform recovery before tenant binding.",
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
