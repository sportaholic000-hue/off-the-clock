# Application checkpoint 2 — September 29, 2026

This is a saved application repair checkpoint, not a release or public-launch acceptance. Parent: 4985196f7e41cf24cf9371bed5e51dc905b94734. Frontend product source is still separately preserved at 5adc1ecf0aaa5ee41129e5115576182135194f3d; final combination is pending.

Additional reproduced repairs: onboarding calendar/settings and service-area persistence (original flagged suite 0/10, corrected 14/14); existing Twilio REST API key authentication and sanitized provider failures (4/4 mocked checks); Google Calendar OAuth one-use state connected to the actual application schema/routes. The real callback previously exchanged credentials twice for a replay; after repair it permits one use and rejects replay after restart, expiry and malformed state before any provider call. All provider operations in this evidence are intercepted synthetic fixtures.

Actual quote workflows: 53 complete-request cases pass across public, authenticated and owner-preview routes. Production widget test passes 21 checks including real quote persistence, retry, customer correction, cross-origin restrictions and owner installation check. Its separate booking UI fixture is explicitly not real booking/provider acceptance. Valid no-name mowing control is $50, configured edging gives $70, and 125.125 square feet gives $0.63. Separate work is retained with its on-site estimate notice. Unsupported legacy fields and unresolved scope do not produce a customer-ready total.

The first owner browser timeout was an incorrect test build environment compiling a development API URL, corrected by building with NODE_ENV=production. No login workaround was introduced. Full-page owner and real booking persistence verification and the final regression are still running at this checkpoint. The new booking verification script is unfinished until its retained result is available.

No arithmetic-engine file or original voice guide was edited. Voice implementation remains excluded; its unfinished module tests are not a release gate. No live-data changes, deployment, merge, permission expansion or implementation subagents. PR #3 remains draft and is not advanced by this checkpoint.

Reproduction: Node 22.23.2, repository dependencies, synthetic environment and fresh evidence stores. See the executable verification scripts and retained command arguments in the adjacent result files. No database binary, private session log or previously blocked evidence ZIP is included.
