# Merge of `claude/launch` into `quote-engine` — November 26, 2026

Owner direction, November 26, 2026: the two branches had to become one build before anything could launch. `claude/launch` at `f9345746` was merged into `quote-engine` at `3b8c319b` (engine v59). Nothing was pushed to `claude/launch`. No sub-agents. `/specs/` files changed only as the launch branch had already changed them; this merge edited none. The engine version stays v59: no quote arithmetic changed, and no frozen job result changed.

## Six merges

1. `claude/launch` at `f9345746` into `quote-engine` at `3b8c319b`: merge commit `14915b55`. Everything below describes this merge.
2. Merge commit `dc981314`. While the first merge was being verified the launch branch gained one commit, `40d59191` (launch audit fixes: voice and language, documents, sign-up terms and email, owner app wording; 26 files). It was merged the same day. Git reported one conflict, the built app bundle, which was rebuilt. Its changes to the phone instructions (the steady-voice rule), the onboarding screen, the Leads page and the allow-list sit beside the first merge's resolutions without overlapping them. The comparison of compiled phone instructions was repeated against `40d59191`: the same eight lines differ and nothing else.
3. The launch branch then gained `98b9235c` (odd-sized call audio is carried instead of ending the call; demo export facts; a competitor price on the public site; 6 files). It was merged in the commit that follows `dc981314`, with no conflict: it touches no file the engine branch changed and no app source, so the built bundle is unchanged.
4. The launch branch then gained `27528a91` (call audio stays in step after a reply ends on half a sample; a notice in the business hours editor; a demo fact; the "How your AI employee behaves" page; 13 files). Git reported one conflict, the built app bundle, which was rebuilt. The onboarding screen, which the first merge had also changed, merged automatically: the new notice sits beside the country-change confirmation without overlapping it. No route file, allow-list line or compiled phone instruction changed; the website demo's facts changed by one sentence.
5. The launch branch then gained `5842c802` (homepage wording, a "Technical details" fold on a call's details, heading order on the public site) and `9b5b8cf9` (the launch side's own audit fixes: overage re-checks, owner alert links, Starter quote counters, business hours order and midnight, greeting preview audio). Both were merged in one merge commit (85 files). Git reported one conflict, the built app bundle, which was rebuilt. Every other file the two commits changed is exactly as it is on the launch branch, except one reviewed list, `verification/tenant-isolation-20261007/route-sources.json`, where the launch branch's new fingerprint for `voicePreviewRoutes.js` sits beside the three recorded by the first merge.
6. The launch branch then gained `54da5bc3` (the Starter report counts calls by service; the homepage quote demo offers only landscaping work the product quotes; 6 files). Git reported one conflict, the built app bundle, which was rebuilt. The other files are exactly as they are on the launch branch.

## What each branch brought

- `quote-engine`: 179 commits since the November 5 split. Quote engine v19 to v59, the price book and its editor, the website quote form, the phone quote path.
- `claude/launch`: 142 commits since the split. Phone receptionist, onboarding, business hours, billing and trial, backups, the public site, calendar booking on calls, caller identity.

Git reported conflicts in 24 files (60 places). Each was read on both sides and resolved by hand; none was resolved by taking one side wholesale except where stated below.

## Decisions made while merging

| Area | The two sides | What the merged build does |
|---|---|---|
| Phone instructions for a job outside the travel areas | Both sides had corrected the same wrong sentence, in different words. | The launch branch's sentence, which the owner approved on November 12. Same meaning. |
| Phone instruction for the work month | Launch: says the busy-season price is used. Engine branch: also names the winter concrete charge. | One sentence that names both, and ends with the launch branch's rule that only the fixed spoken notes are said. |
| What the caller hears about the winter concrete charge | Launch (November 12): the phone says only fixed sentences, never the written quote. The winter charge did not exist on that branch. Engine branch: the receptionist read the written notes. | Two new fixed spoken sentences, built from the engine's own dates (listed under "New wording"). A quote whose month was given says nothing extra. |
| Booking refused by a quote rule (busy season, winter period, expired quote) | Launch: the caller hears the booking service's own sentence, and a callback request is saved naming the reason. Engine branch: expected refusals (time just taken, hold expired, already booked) answer with what to do next. | Both. Quote-rule refusals follow the launch branch; the other expected refusals follow the engine branch. |
| Rescheduling by phone into a different pricing season | Engine branch: the phone layer checks the new date before the calendar changes. Launch: the booking service checks it when the change is saved, and saves a callback request naming the reason. | Both checks run. The phone-layer check now refuses through the same path as the booking service's, so the callback request is saved either way. |
| Caller identity ("Am I speaking with ...?") | Launch: the owner's November 19 ruling, a new module. Engine branch: repairs to the older check (audits V50-5, V51-5). | The launch branch's ruling. Under it, an answer with "no" in it outside a courtesy is not recognised, so three answers the V51-5 repair recognised ("Yes, that's me, I have no idea what the square footage is yet") are now served as a new caller. This is the safe side: no saved history is read out. |
| Website price importer: which prices a page hides | Both branches rewrote the same file after the owner's November 19 ruling. | The engine branch's version (the later one, re-audited in v45), which tells the owner when styling could not be checked. The launch branch's reading of `@import` stylesheets was added to it. One launch-branch behaviour is not carried over: it skipped, without a warning, a price whose `display` value cannot be read (`var()`); here that price stays in the draft and the owner is warned. |
| Phone number a visitor types on the website | Engine branch: stored in +1 form for a Canadian or US business. Launch: stored in the form the Leads page uses. | Both are applied; the results agree for valid numbers. |
| Returning-caller history | Launch: numbers compared in the business's own country form. Engine branch: also finds records the website linked to the customer. | Both. |
| Jurisdiction step in onboarding | Launch: Starter saves country and region only. Engine branch: changing country with approved services asks for confirmation. | Both. |
| Tenant-isolation check on database queries | Launch tightened it on November 12. Two of the engine branch's newer business-profile queries failed the tighter check (git reported no conflict). | Both queries now name the owner's own account row, as the launch branch's own queries do. Results are unchanged. |
| Receptionist guide | Launch: 52 lines changed. Engine branch: 2 lines (roof pitch bands). | Both, merged automatically. Guide fingerprint updated. |

## Launch-branch tests changed for the engine's newer rules

Each was read and run; none was skipped or removed.

| Test file | Why it changed |
|---|---|
| `test/spokenQuote20261112.spec.mjs` | A quote that charges tax needs the job's postal or ZIP code (engine rule since the split). The taxed phone cases now give one. |
| `test/callerPhoneNorthAmerica20261116.spec.mjs` | An approval covers the business country. The test approved a price book as a US business and then switched the country to Canada directly in the database; the country is now set before approval. |
| `test/bookingRescheduleAndService20261116.spec.mjs` (2a) | Times the quote's price does not hold for are no longer offered, for a reschedule or a new booking. The test now expects the refusal when the times are asked for, and still proves the change itself refuses such a time. |
| `test/spokenNotes20261112.spec.mjs`, `test/spokenQuoteOnlyFlows20261112.spec.mjs` | The work-month sentence, and the fingerprints of the compiled phone instructions (84 of them). Every plan and every service was compiled before and after the merge (264 cases): the only lines that differ are the engine branch's eight wording changes (fencing, repairs, two roof-pitch lines, work month, painting rooms, siding openings, in two plan variants for repairs). |
| `test/quoteEngineLeftovers20261007.spec.mjs` | The importer cases described above. |

## Engine-branch tests changed for the launch branch's rules

| Test file | Why it changed |
|---|---|
| `test/audit-neon-v51/v51_5IdentityNoPhrases.spec.mjs` | Three answers are no longer recognised, under the owner's November 19 identity ruling (see the table above). |
| `test/qeAuditFixesV58_20261126.spec.mjs` | The travel-area sentence is the launch branch's approved wording. |

## New wording (shipped, not yet approved by the owner)

Said by the receptionist on a QuoteDone call, only when the written quote carries the matching note:

- "The price includes the winter concrete charge. It is lower if the concrete is poured outside [start] to [end]."
- "A winter concrete charge is added if the concrete is poured from [start] to [end]."

Phone instruction (not said to callers): "If the caller is not sure, send not_sure; the quote then uses the busy-season price or includes the winter concrete charge, never both for two different times of year."

Jurisdiction step, for plans with a price book: "Your quotes use this country for sales tax, for which jobs you quote directly, for lead-paint screening on painting jobs and for your roofing building code." (the engine branch's sentence; the launch branch kept the older one).

## Reviewed lists updated

- `verification/tenant-isolation-20261007/route-sources.json`: three route files changed by the merge itself (`quoteDoneRoutes.js`, `server.js`, `voice/productionVoiceRuntime.js`). No route was added or removed by the merge; each side's own routes were already in the reviewed matrix.
- `server/src/ownerQueryExceptions.js`: eight line numbers in `voice/voiceToolRuntime.js` moved. No exception was added.
- Receptionist guide fingerprint: `64decc9921f92b097bc2702749e7f384d1cc8c70937084432d83cf65b054a151`.

## Hosted test runs

The hosted job had a 90-minute limit, which the merged build sits close to: how long the two suites take depends on the runner.

- First merge, `14915b55` (run 889): the quote gate step passed in 46 minutes; the job was cut off at 90 minutes, 43 minutes into the full suite, before that suite had finished.
- Second merge, `dc981314` (run 891): passed. Quote gate 37 minutes, full suite 41 minutes, 78 minutes in all.
- Third merge, `8e1087cd` (run 892), and the correction to this record, `d712c688` (run 893): both passed.

The limit is now 150 minutes (`.github/workflows/ci.yml`), so a slower runner is not cut off.

## Not done

- `claude/launch` itself is unchanged. It does not have the engine work until it is brought up to this merge. Commits added to it after `54da5bc3` are not in this build.
- Nothing is deployed. The Railway service still tracks `main`, has no settings, storage or web address, and has never deployed successfully (checked November 26, 2026).
- The live checks in `verification/launch-pack-20261012/` have not been run.
- `/specs/quote_engine_v2.md` and `/specs/BUILD_STATUS.md` do not describe engine versions after v7.

## Tests

The counts for this merge are in the merge commit's message and in the hosted run for that commit: the quote gate (`npm run test:quote`) and the full suite (`npm test`), both run on the merged build after the last change.
