# Security lane checkpoint — September 30, 2026

Source, tests, synthetic browser harnesses, past audits and restart instructions are saved on draft PR #4. Runtime source is `08ee7d529112c8db8098bc002dfd9be732a19d3e`; CI checkpoint is `3d536be8c923892e76a0aeee753734ce8542b546`.

Implemented revocable sessions, 15-minute access/8-hour absolute refresh lifecycle, confirmed logout, transactional password-reset revocation and durable fail-closed auth limits. Final application run passed 382. Earlier complete engine 357, transport 25, browser 9 + 10 and both production builds passed with provenance in FINAL_REPORT.md. Final local browser repeats remain unknown because local execution/file reads stopped responding. The first hosted run (36680944823) returned status 0 for all six verification groups, then failed artifact upload because the action rejected a relative '..' path. A corrected hosted run is pending; final named counts and downloadable evidence will be confirmed from that run.

The peer's 41 engine/booking files and original voice guide are preserved. No new voice implementation has begun; it is authorized after this slice. No merge or deployment was performed.
