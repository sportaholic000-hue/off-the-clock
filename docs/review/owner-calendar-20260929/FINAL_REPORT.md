# Owner Calendar verification — September 29, 2026

The owner Calendar workflow is implemented and verified in the draft. **The complete product is still not launch-ready:** live-provider acceptance and the previously documented voice/release work remain open. No universal “100% accurate” claim is made.

Tested application source: `aa90b65dd7d88801c5f5dcf720b0e0dfd8ade49f`, directly descended from `7df3fcee45dc3fce19904c67f0cf5575449fdf15`. The later evidence commit changes documentation and evidence only. [Application hashes](APPLICATION_SOURCE.json) bind the code in the final PR head to the tested source; GitHub readback was checked byte-for-byte. PR #3 remains draft.

## Reproduced gap and completed work

- Before repair, Calendar opened onboarding and the authenticated schedule endpoint returned 404. The existing booking configuration endpoint returned 200 as a valid control. [Before screenshot](calendar-before.png).
- Calendar now shows saved confirmed appointments, pending confirmations and preferred-time requests separately, with customer/contact/location details and a link to the exact associated quote or lead. Separate work remains visible on the linked quote with its original wording and no invented price.
- Owners can save working hours, timezone, booking horizon, minimum notice, slot increments, both buffers, blocked periods and service booking type/duration. Unsupported values remain editable; overlapping hours do not overwrite saved settings. Unchanged blocked periods retain exact UTC seconds and preserve their actual times when the timezone changes. The existing optional 45-minute site-visit duration is preserved.
- The real public availability endpoint responds to the saved settings. An independently enumerated slot control checks working hours, blackouts, existing Google busy periods and both buffers. Changing duration invalidates old slot choices. The synthetic mowing control still returns its expected $50; additional hedge work remains separately priced on site.
- Owners can connect/reconnect their existing Google primary calendar, save a validated Calendly link and disconnect while retaining availability. The existing one-use OAuth state remains enforced. The Calendar return is selected before onboarding mounts, preventing a late onboarding response from changing the return URL.
- Staff can read their owner's schedule, but cannot edit availability, change service policies or change calendar connections. Foreign tenants see none of this owner's appointments or requests. Schedule responses exclude credentials, provider event IDs and raw prices. Desktop and mobile workflows pass.
- A failed Google busy-time read clears stale busy results, shows a retryable error and retains saved appointments. It does not claim the calendar is free. [Schedule screenshot](calendar-schedule.png) · [Mobile connection controls](calendar-connection-mobile.png).

## Verification on the bound source

| Check | Result |
|---|---|
| Application regression, including the 10 new calendar/form tests | 293 passed |
| Arithmetic-engine regression | 340 passed |
| Actual Calendar browser/application/database workflows | 12 passed |
| Whole-request public/authenticated/owner-preview checks | 53 passed |
| Customer widget and real booking browser checks | 22 passed |
| Full-page customer/owner browser checks | 7 passed |
| Price-book browser regression | 19 passed |
| Widget/billing transport | 15 passed |
| Both production builds and integration boundary | Passed |

Counts overlap. The earlier 20 focused tests are included in the final regression. All final application runs match the saved server bytes; the final real browser flows also match the client bytes. The 19-file engine tree remains `dcd481193b10c3cfc667cb23d22fb41b16322cff`; the original voice-guide blob remains `7329bde3db8e3b38916e1cd6fbe1ca3fffaffaa5`. Dependencies, pricing rules and voice source were not changed.

## Findings that did not establish a product defect

Early new-test setup mistakenly submitted a review request without its explicit review flag, expected HTTP 400 where the established OAuth replay rejection is HTTP 403, and counted an embedded quote panel as another saved quote. The test setup/assertions were corrected; application safeguards were not relaxed to make them pass. An OAuth navigation wait also matched the pre-connection page; the final test waits for the actual callback navigation. Original failed runs are retained. The new screen's initial syntax error, field labels and return-routing issue were corrected before final acceptance.

## Remaining boundaries and launch blockers

- Google tests intercept provider responses; no real owner's Google account or live calendar was used. OAuth consent/configuration, provider permissions, real busy-time reads and a real confirmed event still need live acceptance in an authorized environment.
- The direct connection currently uses Google's primary calendar. There is no secondary-calendar picker or Outlook integration. Calendly is an external booking link; its appointments are managed in Calendly and are not synchronized into this view.
- This view lists app-saved booking records and separately reads Google busy intervals. It is not a general Google event editor and does not import external event titles or independently reconcile manual edits/deletions of an already confirmed Google event.
- Existing appointment records without the current UTC booking fields are not migrated by this task. No live data was inspected or changed.
- The previous voice status is unchanged: 57 passing and 9 failing checks, with missing modules and inherited schema/test mismatches. Voice, live phone/billing, production email, deployment and backup/restore acceptance remain outside this completed slice. See the [previous project-state report](../resume-20260929/FINAL_REPORT.md).

## Evidence and review

[Commands](REPRODUCE.md) · [Test arguments/results](TEST_RESULTS.json) · [Workflow assertions](WORKFLOWS.json) · [Complete command output](RUN_LOGS.txt) · [Retained response/store hashes](EVIDENCE_INDEX.json).

The original failures, positive controls, full HTTP responses, provider fixtures and SQLite records remain in isolated local evidence stores indexed above. Readable results, executable checks, source and selected screenshots are on GitHub. The previously blocked database-containing archive and private session logs were not uploaded or repackaged. No subagents, permission expansion, merge, deployment, voice implementation or live-data changes occurred.

Draft labels for owner review, where the spec has no exact wording: Schedule, Availability, Connection, Week starting, Days ahead customers can book, Minimum notice (minutes), Start time intervals (minutes), Buffer before/after appointments (minutes), Allow customers to book available times, Blocked period start/end, and Calendly scheduling link. The spec labels Calendar, Working hours, Blackout dates and Service durations are retained. These labels are included in the draft for review; nothing has been deployed.
