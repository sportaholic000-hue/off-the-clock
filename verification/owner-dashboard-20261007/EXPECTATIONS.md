# Synthetic expectations, written before execution

Base: `4db13a2945193762bbc4b85f9ab616a00e1dd067`.

- One successful booking, including a same-key confirmation retry: one durable `booking.confirmed` notification and one accepted email to `synthetic-a@example.invalid`; zero caller emails, texts, invites or reminders. Pending/failed requests are not confirmed bookings.
- Stored duration 120 seconds and stored billed minutes 3: show 120 seconds and **3**, never recompute billed minutes as 2. Preserve `PROVIDER_COMPLETED`, call ID, stream ID and destination separately from the semantic call outcome.
- Search `repair my gate` matches one synthetic transcript. Search in the other tenant matches zero. Status/spam/date/outcome/service filters compose and apply before pagination/counting.
- Reviewed labor-only gate estimate: low **CAD $100.10**, high **CAD $120.20**; customer-supplied materials remain explicit. The original receipt is unchanged; nothing is sent. An unpriced booking contributes no monetary value.
- Report arithmetic: CAD $100.10–$120.20 plus CAD $200.20–$240.40 = **CAD $300.30–$360.60**. USD $50.05 remains a separate **USD $50.05–$50.05** group. Partial scope and unit-only prices are excluded from whole-job totals with counted reasons. An invoice of **CAD $110.15** contributes **CAD $110.15** once. Alternative tiers are a min/max envelope, not a sum: CAD $100.10–$120.20 and CAD $200.20–$240.40 represent **CAD $100.10–$240.40** before tier selection. Selected second tier is **CAD $200.20–$240.40**.
- Period bounds are owner-local midnight, inclusive start/exclusive next day. In America/Moncton, 2026-11-01 is 25 hours: **03:00Z November 1 through 04:00Z November 2**. Unconfigured business hours produce an unknown after-hours count, never zero asserted as measured.
- Service funnel: two distinct calls for a service, one quoted, one confirmed job booking, one invoice: **50% calls→quoted, 100% quoted→booked, 100% booked→invoiced**. Site visits are appointments, not booked job value. A repeated quote or appointment for the same call/service does not duplicate funnel conversion.

Reproductions run against an in-memory or temporary SQLite database and fake calendar/email adapters only. Source inspection plus independent service and actual HTTP/render assertions precede production edits.
