# Handwritten expectations — recorded before execution

Base: `c99ea0519c3966b9b6a2bc4c750c036cd16d6b80`.
All owners, callers, prices and provider responses below are synthetic.

1. Untiered concrete patio: 20 ft × 10 ft = 200 sqft, perimeter 60 ft,
   thickness 4 inches. Labor: 200 × 600 = 120,000 cents. Concrete with
   10% waste: (200 × 4 / 324) × 1.10 × 18,000 = 48,888.888… cents,
   rounded half-up = 48,889 cents. Forms: 60 × 2,500 = 150,000 cents.
   Base prep: 200 × 175 = 35,000 cents. No tax, markup or range buffer.
   Total: 353,889 cents = **CAD $3,538.89**. The real phone quote must
   retain one null-named option and progress SENT → ACCEPTED → INVOICED;
   owner invoice input `3538.89` must persist exactly `353889` cents.
   A supplied option name must match exactly, including null; empty text
   does not match null. Two options require the unique exact string name.
2. After account service ends, all four new-booking POST operations return
   403 / BOOKING_UNAVAILABLE, create zero rows and call no calendar client.
   Existing hold release and confirmation status reads remain available.
   An active account still creates exactly one confirmed appointment.
3. Six unconfirmed ten-minute trial calls: 0 used, 60 left, 6 pending calls,
   next call allowed, zero warnings and **0 cents** overage. After receipt:
   60 used, 0 left, 0 pending; next call refused, warnings 30/0 once each,
   still **0 cents** overage. Replaying receipts adds nothing.
   Paid Operator: 30 confirmed ten-minute calls = 300 included minutes;
   one unconfirmed ten-minute call contributes no usage or money. Expected
   300 used, 0 left, 1 pending, **0 cents** overage / not yet charged.
   Once confirmed: 310 used, 10 extra × 35 = **350 cents ($3.50)**,
   0 pending. Below the 2,500-cent threshold: no mid-month invoice.
   At month end, exactly 350 cents is charged once. A failed receptionist
   call contributes 0 throughout, even when its signed duration arrives.
   Unconfirmed calls alone must never create a monetary pending-charge row.

DOM checks use the real bundled React components in JSDOM, with only the
transport replaced by a synthetic function; they do not assert visual layout.
