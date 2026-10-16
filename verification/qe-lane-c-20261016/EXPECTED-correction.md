# Compatibility fixture correction, before rerunning that check

The original new test copied 252,400/179,400 cents from stale comments in the
existing independent fixtures. Those comments are not the current 92a5510
baseline output. The first failed source and both outputs remain in runs/.

Before the baseline control ran, its source recorded these independent sums:

- Itemized interior: 100000+33000+25000+11000+70000+15400+32000+11000+8000+
  3300+20000 = **328700 cents**.
- Itemized exterior: 110000+33000+27500+11000+55000+11000 = **247500 cents**.
  The two-story factor is 1.10 and applies only to labor.
- Basic walls: **106400 cents**; siding: **1170000 cents**.

All four detached 92a5510 controls matched these sums on their first execution.
Only the invalid expected literals in the new compatibility test are corrected.
No baseline source or existing assertion is changed. The serialization failure
in the first focused run was a separate implementation bug and was fixed in
configuredOfferings.js by projecting an ordinary numeric derivation input while
retaining exact result evidence.

The first expanded persistence check used approved.status.status, but the actual
adapter returns statuses (an array). Its assertion now checks statuses[0].status;
the expected QUOTING LIVE behavior is unchanged. The original failed source and
30-test output are retained; only that affected check is rerun after correction.

The first DOM/voice run passed both DOM checks and prompt compilation, but the real voice fixture lacked JWT_SECRET. The transparent diagnostic wrapper preserved the underlying 'application signing key is unavailable' error in voice-cause. The fixture now supplies a marked synthetic key like existing voice integration tests; no application receipt or runtime code was changed.

The initial quote gate is preserved:4563tests/4443pass/120fail/0cancel/skip/todo. It exposed the new voice test's filename (now voiceSurfacePricing20261016.spec.mjs), expected choice lists that legitimately need the new owner-authorized numeric methods, and a real adapter regression that masked legacy inspection classification. The existing inspection assertions are unchanged; the adapter now remaps only actual dimension requests. Only the exact method-choice expectation was updated in the existing measurement-choice test.
