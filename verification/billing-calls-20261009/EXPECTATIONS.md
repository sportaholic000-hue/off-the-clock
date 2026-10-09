# Expectations written before execution

Base: fc6efdea1266ed0e4be750d3cc4f3ed6d336645b.
All records, credentials, durations and provider responses are synthetic.

- Operator includes 300 minutes. A confirmed 300-minute call plus an
  unconfirmed 600-second call uses 300 minutes and owes 0 cents overage.
  Recovery of 600 seconds adds exactly 10 minutes: 310 used and
  10 × 35 = 350 cents ($3.50) overage / not yet charged. A late identical
  callback and a worker restart leave that total unchanged. A conflicting
  660-second callback is refused; the total remains 350 cents.
- A recovered 61-second call rounds up to 2 minutes. On a 60-minute trial,
  2 minutes used leaves 58; trial overage remains 0 cents.
- Failed receptionist and spam calls contribute 0 minutes and 0 cents,
  even when Twilio returns a completed 600-second call.
- No fetch occurs before ten minutes after local completion, for an active
  call, for already confirmed calls, or at/after seven days since completion.
  Retry state persists across worker creation/restart. Failed reads retry
  after 5 minutes, then 10, then 20, doubling to a maximum of 24 hours.
- Wrong account, call, caller, destination, direction, incomplete status or
  invalid duration never becomes a confirmed receipt. No provider writes.
- The owner call page shows a plain-English failure reason and a separate
  Technical detail line containing the unchanged original code.
- Knowledge drafting and both price-book text features use only the explicit
  GEMINI_TEXT_MODEL. Missing or invalid configuration makes zero Google
  requests and exposes a fixed owner message; no model name is guessed.
