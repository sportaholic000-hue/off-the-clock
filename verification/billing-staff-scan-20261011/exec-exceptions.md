# New owner-query exception entries

The scanner inventories method, argument signature and occurrence. Computed access is rejected even when listed. All database exceptions and dependency checks live in `server/src/ownerQueryExceptions.js`; this is the source-location index. The scanner recognizes literal/constant regular-expression receivers structurally, without a database exception. Shadowed or unknown receivers still fail unless explicitly classified.

125 database exec calls: 81 migrations, 35 admin database-control statements, 9 authentication transaction boundaries. No additional tenant read/write bypass was found: ordinary tenant DML remains through ownerQuery. Admin here means literal BEGIN/COMMIT/ROLLBACK, secure-delete PRAGMA, or VACUUM; these do not select or alter application rows. Twenty non-query exec uses are regular-expression parsing (13) or dependency-shape checks (7).

Part 2 also adds one authentication prepare exception in `staffService.js:117`: token hash/purpose/expiry/consumption lookup establishes the staff user before ownerQuery can bind the business. The existing user-to-owner lookup now lives in pendingInvitation.

| Source | Category | Reason |
|---|---|---|
| `server/priceBookMoney.js:85,87` | non-query | RegExp.exec parses a string in ownerErrorLocation; this receiver is a regular expression, not a database. |
| `server/priceBookMoney.js:143,149` | non-query | RegExp.exec parses a string in decimal; this receiver is a regular expression, not a database. |
| `server/priceBookService.js:38` | migrations | Creates the price-book creation ledger during schema setup; subsequent owner records use ownerQuery. |
| `server/priceBookService.js:164` | admin | Database administration: fixed transaction/lock boundary only; reads or writes no tenant rows. Statements inside the callback still require ownerQuery or their own explicit exception. |
| `server/quote-engine-vnext/exactMath.js:36` | non-query | RegExp.exec parses a string in decimalTextToRational; this receiver is a regular expression, not a database. |
| `server/src/appointmentChangeSchema.js:2` | migrations | Installs appointment change/cancellation ledger and indexes. |
| `server/src/auth.js:40,43,46` | authentication | Authentication transaction boundary only; token/session state changes are separately inventoried. |
| `server/src/auth.js:92` | non-query | Checks the injected SQLite dependency shape with typeof; executes no query. |
| `server/src/authRateLimitService.js:5` | migrations | Installs the public authentication rate-limit schema. |
| `server/src/authSessionService.js:10` | migrations | Installs authentication session and refresh-token tables/indexes. |
| `server/src/authSessionService.js:39,40,40` | authentication | Authentication transaction boundary only; token/session state changes are separately inventoried. |
| `server/src/authTokenService.js:188,191,194` | authentication | Authentication transaction boundary only; token/session state changes are separately inventoried. |
| `server/src/authTokenService.js:201` | non-query | Checks the injected SQLite dependency shape with typeof; executes no query. |
| `server/src/authTokenService.js:213,228` | migrations | Installs/upgrades durable authentication-token tables, indexes and immutable triggers while preserving existing tokens. |
| `server/src/billingCoreMigration.js:9,10,11,12,16,17,17` | migrations | Migrates checkout recovery constraints with a transactional table copy and rename. |
| `server/src/billingCustomerLifecycle.js:39,51,52` | migrations | Installs lifecycle notice/cancellation schema and additive retention evidence columns. |
| `server/src/billingRoutes.js:137,140,143` | admin | Database administration: fixed transaction/lock boundary only; reads or writes no tenant rows. Statements inside the callback still require ownerQuery or their own explicit exception. |
| `server/src/billingStateService.js:207,210,213` | admin | Database administration: fixed transaction/lock boundary only; reads or writes no tenant rows. Statements inside the callback still require ownerQuery or their own explicit exception. |
| `server/src/billingStateService.js:250` | non-query | Checks the injected SQLite dependency shape with typeof; executes no query. |
| `server/src/billingTenantErasure.js:26` | admin | Database administration enables secure page deletion before ownerQuery erases one tenant. |
| `server/src/billingTenantErasure.js:69,73,77` | migrations | Installs retention guards; trigger predicates bind NEW.ownerId or erased-account identities. |
| `server/src/billingTenantErasure.js:98,109` | admin | Database administration: fixed transaction/lock boundary only; reads or writes no tenant rows. Statements inside the callback still require ownerQuery or their own explicit exception. |
| `server/src/billingUsagePolicy.js:65,66,66` | admin | Database administration: fixed transaction/lock boundary only; reads or writes no tenant rows. Statements inside the callback still require ownerQuery or their own explicit exception. |
| `server/src/billingUsageSchema.js:2,36,40,41,56,58,60,64,65` | migrations | Installs billing usage/annual/trial schemas or migrates installment constraints atomically. |
| `server/src/billingVoiceUsage.js:9,9,9` | admin | Database administration: fixed transaction/lock boundary only; reads or writes no tenant rows. Statements inside the callback still require ownerQuery or their own explicit exception. |
| `server/src/bookingAdminService.js:127` | non-query | RegExp.exec parses a string in normalizedUtcInstant; this receiver is a regular expression, not a database. |
| `server/src/calendarTime.js:23` | non-query | RegExp.exec parses a string in parseLocalDate; this receiver is a regular expression, not a database. |
| `server/src/calendarTime.js:31` | non-query | RegExp.exec parses a string in parseLocalTime; this receiver is a regular expression, not a database. |
| `server/src/callSummaryService.js:43,44,44` | admin | Database administration: fixed transaction/lock boundary only; reads or writes no tenant rows. Statements inside the callback still require ownerQuery or their own explicit exception. |
| `server/src/demo/liveDemo.js:64` | migrations | Installs platform demo-session accounting tables and indexes; no owner data is accessed. |
| `server/src/googleCalendarAdapter.js:107` | non-query | RegExp.exec parses a string in utcInstant; this receiver is a regular expression, not a database. |
| `server/src/migrations.js:92,158,163,166,169,224,225,230,231,253,254,255,256,257,292,316,319` | migrations | Schema migration infrastructure: table/column/trigger installation, transactional rebuilds or migration PRAGMA configuration. |
| `server/src/notificationHistorySchema.js:2,31,34` | migrations | Migration-only installation/repair of historical notification state and cancellation of the removed text channel; never sends messages. |
| `server/src/outboundWebhookSchema.js:43,57,76,77,78,79,80,81,84,86,87,88,90,90,92,93,96,103` | migrations | Installs webhook/export tables, indexes and capture triggers; trigger writes carry NEW.ownerId and joined tenant predicates. |
| `server/src/outboundWebhookService.js:14,15,16` | admin | Database administration: fixed transaction/lock boundary only; reads or writes no tenant rows. Statements inside the callback still require ownerQuery or their own explicit exception. |
| `server/src/ownerAlertSchema.js:6,28,37,45,50,62,67,72,83` | migrations | Installs owner-alert tables/triggers or backfills pending historic alert work; joins and trigger writes retain ownerId. |
| `server/src/ownerDashboardSchema.js:3` | migrations | Installs owner workflow/history tables and tenant indexes. |
| `server/src/ownerDate.js:4` | non-query | RegExp.exec parses a string in ownerUtcInstant; this receiver is a regular expression, not a database. |
| `server/src/platformIntegrations.js:344,345,346` | admin | Database administration: fixed transaction/lock boundary only; reads or writes no tenant rows. Statements inside the callback still require ownerQuery or their own explicit exception. |
| `server/src/quoteEmailSchema.js:2` | migrations | Installs owner-bound quote narration, email confirmation and delivery tables/indexes. |
| `server/src/telephonyOperationsMigration.js:4` | migrations | Installs telephony operation and forwarding-check tables/indexes. |
| `server/src/tenantBackupErasure.js:28` | migrations | Adds the erased-account marker column to a temporary recovery database before tenant-bound deletion. |
| `server/src/tenantBackupErasure.js:38` | admin | Database administration compacts a scrubbed temporary recovery database after ownerQuery erasure; reads no application records. |
| `server/src/voice/googleGenAiLiveAdapter.js:121` | non-query | RegExp.exec parses a string in onmessage; this receiver is a regular expression, not a database. |
| `server/src/voice/listedPriceCalculation.js:30` | non-query | RegExp.exec parses a string in calculateSavedListedPrice; this receiver is a regular expression, not a database. |
| `server/src/voice/voiceAdmission.js:20,21,22` | admin | Database administration: fixed transaction/lock boundary only; reads or writes no tenant rows. Statements inside the callback still require ownerQuery or their own explicit exception. |
| `server/src/voice/voicePersistence.js:32,35,38` | admin | Database administration: fixed transaction/lock boundary only; reads or writes no tenant rows. Statements inside the callback still require ownerQuery or their own explicit exception. |
| `server/src/voice/voicePersistence.js:58,128,406` | non-query | Checks the injected SQLite dependency shape with typeof; executes no query. |
| `server/src/voice/voiceToolRuntime.js:127,130,133` | admin | Database administration: fixed transaction/lock boundary only; reads or writes no tenant rows. Statements inside the callback still require ownerQuery or their own explicit exception. |
| `server/src/voice/voiceToolRuntime.js:221` | non-query | Checks the injected SQLite dependency shape with typeof; executes no query. |
| `server/src/voiceDurationRecovery.js:11` | migrations | Installs the duration-confirmation recovery table and due-work index before processing owner-bound calls. |
| `server/src/websitePriceVisibility.js:80` | non-query | RegExp.exec parses a string in applyWebsiteVisibility; this receiver is a regular expression, not a database. |
