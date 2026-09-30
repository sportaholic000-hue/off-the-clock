# Independent quote-to-booking review

Target: PR #3 commit `1013190bd8e62e5df3aa70750399873bc050e447`.
These expected outcomes were written before running this new review. All data and provider traffic are synthetic, using an isolated SQLite store and intercepted Google requests.

- Installed fence: 123.5 measured fence LF at $40 + one $250 gate = $5,190.
- Replacement fence: the same work + 17.25 measured removal LF at $8 = $5,328.
- Installed interior paint: 177.25 wall sqft at $6 + 80.5 ceiling sqft at $3 + 17.75 trim LF at $2 = $1,340.50.
- Installed exterior paint: 311.25 measured wall sqft at $6 = $1,867.50.
- Owner preview, authenticated submission and public submission must agree on each expected amount; no private rates/costs/line items may appear in the public response. Saved requests must bind the exact approved book revision and inputs.
- An exact quote retry returns the original result. Changing inputs under a prior signed confirmation or changing the book before submission must reject without issuing a price.
- Two simultaneous requests for the same slot yield one hold; foreign-owner, disallowed-origin, changed-scope and unconfirmed requests must not create calendar events.
- Review work may schedule a site visit, but cannot book the job directly. A changed booking policy invalidates a prior hold. Busy or expired holds cannot confirm.
- A mismatched provider event stays pending without a booked outbox entry; correction to the intended event/times can confirm exactly once.
- Reopening a confirmed quote's booking link must not create a second appointment for the same booking intent at another time. A deliberate reschedule belongs in the reschedule flow.
- A process crash after durable confirmation intent but before the calendar write must have a recoverable outcome. Exact retry/polling should resolve to a confirmed event or a truthful terminal failure that releases the blocked time; it must not leave a permanent pending appointment with no provider event.

The last two are product reliability expectations being independently checked, not assertions that the current implementation already enforces them. This scoped review does not establish voice, carrier routing, live Google acceptance, business-mail delivery or complete trade coverage.
