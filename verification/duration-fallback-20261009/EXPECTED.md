# Handwritten expectations before execution

Base: 94c0d63f7eace16eac4c97f5a95712eb443118d6.
Synthetic fixtures and fake GET responses only. No provider network or email/SMS.

- Live FALLBACK and AI_FALLBACK, with the AI leg ended but calls.completedAt NULL:
  at +10 minutes, +1 hour and +8 days: zero GETs, no recovery row, no gaveUpAt.
- End that same fallback at phone-end T, one hour after the AI leg:
  T+599,999 ms: zero GETs and no recovery row.
  T+600,000 ms: one GET, one attempt, confirmed duration; zero billed minutes
  and zero overage cents. The fake phone duration is 4,200 seconds (70 minutes),
  all excluded because the receptionist failed.
- Ordinary paid Operator control: 300 confirmed included minutes plus a recovered
  600-second call = 310 confirmed minutes. Ten extra minutes x 35 cents = 350 cents
  ($3.50) overage and 350 cents not yet charged. Zero new invoice (below 2,500 cents).
  Zero GETs at +599,999 ms and one GET at +600,000 ms.
- Seven-day origin: phone end T occurs eight days after the AI leg ended.
  At T+10 minutes and T+6 days, one new failed GET each; no gaveUpAt (two total).
  At T+7 days, no new GET, gaveUpAt set; at T+8 days, still two total GETs.
  Remains unconfirmed and bills zero minutes / zero overage cents.
- Existing billingCalls20261009Recovery.spec.mjs remains byte-for-byte unchanged.
  Its fallback fixture models an ended phone call and must explicitly store that
  phone end; the new live-call tests explicitly clear calls.completedAt.
