# Route inventory review — 2026-10-11

Expected before rerunning: the full tenant matrix continues to reject cross-tenant access in both preview and production; the only source-hash changes are the two files reviewed below. No route or middleware coverage is removed.

- `server/src/server.js`: imports the existing persistent authentication limiter and injects an instance into the staff route installer. No route registration or global middleware order changes.
- `server/src/staffRoutes.js`: keeps the existing origin check and no-store response, then applies the shared recovery-route limiter to the public staff-invite acceptance route before its service handler. Owner/team route authorization is unchanged.

Hosted CI run 38101433537 at 9211d4405c2795acfd51e47c885e114e44788d95 produced 4,077 quote-gate tests: 4,073 passed, 4 failed, 0 skipped. The failures were the two source-inventory assertions and their parent tests. Every per-route tenant assertion passed. Only these two reviewed hashes in `verification/tenant-isolation-20261007/route-sources.json` are updated.

Additional scanner expectation: a mutable or shadowed property key cannot be treated as a known harmless string. `let key="close"; key="ex"+"ec"; database[key](...)` and a shadowing function parameter must each produce one forbidden computed-access finding. The new regression failed before the fix (0 findings instead of 1).
