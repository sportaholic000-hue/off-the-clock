Expected values recorded before execution

Synthetic owner-entered fixture only: Core E2L/E2M = 0 cents; Outer E2H/E2J = 3500 cents. No default prices are introduced.

Widget HTTP and phone, each independently:
- E2L 4L1 quote -> E2L 4L2 booking: CONFIRMED; one provider event.
- E2L 4L1 quote -> E2M 1A1 booking: CONFIRMED; one provider event.
- E2L 4L1 quote -> E2J 2A1 booking: REQUOTE_REQUIRED; no appointment/provider event.
- E2J 2A1 quote -> E3B 5A3 booking: REQUOTE_REQUIRED; no appointment/provider event.
- Changing to an incompatible address after availability must be refused at confirmation too.
- Same charge in a different named zone: allowed.
- Saved charge controls comparison after owner changes rates; current quoted-postal charge cannot substitute for it.
- ZIP5 and ZIP+4 at equal charges: allowed; incompatible/outside ZIP: refused.
- Quote without postal code: no new restriction.
- A quote whose travel fee was not applied: no new restriction, even if the saved defaults contain zones. An applied zero-cent travel line still binds the quote.
- Quote made without zones: no new restriction, even if zones are saved later.
- Owner zones without a configured service area: PREFERRED_TIME_ONLY, matching 98d4e0f.
- Existing city service-area restrictions and calendar capability remain in force.
- bookingService.js must be baseline 98d4e0f plus its guard import and returned-interface wrapper; update only its candidate-n SHA-256 in the same commit under the owner-approved exception. bookingRoutes.js, server.js, every route source pin and all other guard entries stay unchanged.
- Existing no-zone booking tests and candidateNTagGate20261014.spec.mjs: unchanged, pass.
- Every existing quote-side assertion in travelZones20261020.spec.mjs remains unchanged. Core total 10500 cents; Outer total 14000 cents; legacy no-zone total 13000 cents; outside every zone remains review. Quote-producing code and calculators remain byte-identical to de38e4da.
