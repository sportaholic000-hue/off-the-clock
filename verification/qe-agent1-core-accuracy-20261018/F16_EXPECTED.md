# F16 approval boundary — expectations recorded before execution

Starting Agent1 SHA: `3b1e4b32c1cf31260ba2344fbf3bbdf418c81b5c`.
A2 dependency: `7e9dfcedc6f11f80b45b8ca0554aa5b83935d15b` adds `pipeJackEach` to the shared fixed-price classification. Agent1 does not reproduce that classification or edit A2's files.

- 100.5 stored cents is $1.005: invalid for a discrete each-price. Reject base and tier values before ordinary approval or starting-value adoption changes any state. Never round to 100 or 101 cents.
- A rejected operation must preserve the complete durable book bytes, revision, approval receipt, confirmed/approved values, origin, adoption state and unconfirmed-save marker. Existing current receipts used in these regressions are captured from the actual pre-fix approval endpoint, not fabricated.
- An invalid unapproved legacy book must remain unapproved.
- 100 stored cents is $1.00: a valid discrete each-price. 100.5 cents per linear foot is $1.005/LF: a valid measured rate. Both values must survive ordinary approval and legitimate adoption unchanged in base and tier configurations, for manual and AI services.
- The existing roofing-minimum diagnostic and status 422 must remain exact for fractional root, nested and tier minimums, on both paths.
- Normal Agent1 regressions exercise the shared guard with the already-classified `deckingPerSheet`. The dependency integration regressions exercise `pipeJackEach` against A2's exact committed files in an isolated combined checkout. Neither suite conditionally skips a test or changes suite selection. A2 integration is required for pipe-jack classification.
- No quote arithmetic or engine-version change is needed: this repair prevents an invalid approval/adoption write. F2's below-one policy remains unresolved.
