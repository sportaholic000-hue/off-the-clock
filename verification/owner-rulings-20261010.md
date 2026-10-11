# Owner rulings — 2026-10-10

- Operator Price Book preview text for a live service: “This service can issue quotes on your website widget.” QuoteDone keeps “This service can issue quotes on a live call.” Trials follow their selected plan.
- The development test endpoint described in specs/quote_engine_v2.md (around line 1479) stays as implemented: it requires owner login, the Price Book plan and a saved service. There is no unauthenticated pricing endpoint. This supersedes the spec’s description; the spec file is not edited.
- Previewing a service that has never been saved keeps returning 409 “Save this service before previewing it.”
- GET /api/pricebook/meta stays available to Starter (static field definitions only, no owner rates).
- A mowing area above 10,000,000 sqft goes to owner review instead of being priced.
