# Owner wording approval — 2026-10-10

The owner approved the wording below on 2026-10-10 for release candidate g.
These decisions supersede the pending-approval labels and the corresponding
earlier proposals in the review documents. This approval changes owner-facing
application copy only; it does not change a public page or a specification.

## Seven approved changes

1. “The AI receptionist connection closed unexpectedly.” becomes
   “The receptionist's connection closed unexpectedly.”
2. “The AI receptionist encountered a connection error.” becomes
   “The receptionist hit a connection error.”
3. “This caller was blocked as spam.” becomes
   “You marked this number as spam.”
4. The AI drafting unavailable message, including `TEXT_AI_UNAVAILABLE_MESSAGE`
   and every screen that displays the returned error, is exactly:
   “AI drafting isn't available right now. You can enter your business information and prices yourself. Contact support@offtheclockai.com for help.”
5. Use only “Starter keeps answering and capturing every pricing request for owner review.”
   in place of either previous variant of that sentence.
6. The forwarding check result is “Reached [time] from [caller].”
   Only when Twilio supplied `ForwardedFrom` with a usable number, append
   “ Forwarded from [number].” Remove the “Twilio forwarded marker: present/absent”
   wording. An absent or unusable number adds no sentence.
7. The set-once forwarding help is exactly:
   “On your business phone, forward calls you don't answer, decline, or get while busy or unreachable to [receptionist number]. Your phone rings for your carrier's usual time first, and Do Not Disturb may not skip that wait.”

## Approved proposal files

All other proposed wording in the following files is approved as proposed:

- `verification/starter-plan-20261009/OWNER_WORDING.md`
- `verification/staff-login-20261009/PROPOSED_COPY.md`
- The “Owner-screen text” table in `verification/forwarding-on-off-20261009/REPORT.md`
- `verification/leads-service-area-20261010/REVIEW.md`

The calendar branch's message is also approved exactly as proposed:
“Reconnect Google Calendar to allow availability checks and booking updates.”
It is defined in `server/src/googleCalendarScopes.js` and documented in
`verification/calendar-scope-20261010b/EXPECTED.md`.

Historical test outputs remain historical evidence. The executable call-failure
wording inventory and assertions that pinned replaced wording are updated to
this approval.
