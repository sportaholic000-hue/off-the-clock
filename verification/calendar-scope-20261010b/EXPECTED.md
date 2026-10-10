# Calendar scope regression expectations (written before test execution)

Base: `00142cee28e4cadbeb373c20de94233c702ffb2f`.
All providers and credentials in these tests are synthetic.

1. The authorization URL has exactly two Calendar scopes: `calendar.events.owned` and `calendar.freebusy`; it does not request full `calendar`.
2. A saved connection with those two scopes returns the fake provider's busy intervals and creates a booking event on the connected calendar. Exactly one Calendar API call is made for each operation.
3. A connection missing event write or availability permission raises `CALENDAR_SCOPES_INSUFFICIENT`, status 409, with `Reconnect Google Calendar to allow availability checks and booking updates.`; zero provider requests occur. Booking readiness shows the same blocker text, and onboarding refuses an incomplete token grant.
4. A legacy saved connection with the old full `calendar` scope continues to return busy intervals and create an event without reconnecting.
5. If a refresh response loses either required permission, the token endpoint is called once, no Calendar API endpoint is called, no refreshed credentials are persisted, and the same 409 owner message is returned.

The base is expected to fail cases 1, 3 (for the adapter and wording), and 5; the existing adapter can already use the fake provider in cases 2 and 4 without enforcing the grant.
