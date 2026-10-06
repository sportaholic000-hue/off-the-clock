# Named review contact implementation expectations

Base: `4e4b5ebaab12ef42e56149a7be35ccf1da90fbe9`. The owner authorized implementation
on October 6, 2026. No subagents, merge, deployment or live-provider operations.

## Expected behavior written before execution

1. The owner reviews a person's name and selects Owner or Manager in the existing
   knowledge editor. The signup first name prefills a new contact but is not
   silently adopted until Review and save. Preview shows normal receptionist
   language using that name. New UI labels proposed for review: “Owner or manager”,
   “Name”, “Role”, “Owner”, “Manager”, and “Caller preview”.
2. The owner save endpoint accepts a bounded name and the closed owner/manager
   role, stores them atomically with knowledge, and binds them to the authenticated
   business's review inbox. It does not create a staff account or change delivery
   destinations. That inbox remains the existing tenant-bound handoff destination.
3. Missing legacy fields preserve an existing confirmed contact. A missing legacy
   contact remains unnamed until confirmed in the editor; it never adopts a
   guessed manager. This change does not interrupt existing calls with a new
   go-live gate. Explicit malformed/empty contacts fail without partial saves.
4. AI drafts and website imports cannot replace this owner-controlled contact.
   Editing a contact is a draft until Review and save; rejected/failed saves do
   not change production knowledge.
5. Owner/staff/other-tenant requests cannot select another tenant's inbox. Stored
   corrupt or foreign-bound contact data is excluded from caller instructions.
6. Production instructions receive only the person's name and role, never their
   routing ID. They distinguish that person from the business and receptionist.
   Unknown answers become captured review questions; flags/saves never imply
   notification delivery or reading. Existing deadline policy is not amended.
7. The same confirmed contact appears when reopening the editor and when the real
   production voice composition opens a synthetic provider session. Editing from
   Owner to Manager updates the next call; an unfinished AI draft cannot do so.
8. Names containing Unicode letters/apostrophes/hyphens are preserved. Empty,
   oversized, control-bearing, non-string, instruction-delimiter and extra-field
   inputs reject. Contact facts remain inert data in the compiled prompt.

All fixtures are explicitly synthetic, all storage temporary, and all provider
sessions local stubs. This change produces no dollar amount and changes no prices.
Owner-alert delivery, the broader timing conflict and other agents' billing and
lead-capture repairs remain outside this batch. Tests must not claim actual model
speech or human receipt from a compiled prompt/provider stub.

## Verified implementation

Source `4838ed2f3a12e962acfe58e542cd6f00bca31e3d` passed cold hosted
`npm ci`, both builds, 2,099 quote-gate tests and 2,480 full-suite tests.
There are 34 new tests, including real editor/API browser checks and signed
production HTTP/WebSocket sessions with a fake live provider.
See the [implementation report and retained evidence](../verification/named-review-contact-20261006/REPORT.md).
The contact feature does not close D03 (lost callback notes), D02 (owner alerts),
the broader P01 timing conflict, or the other agents' audit findings. This is a
verified review branch, not a merged or deployed release.
