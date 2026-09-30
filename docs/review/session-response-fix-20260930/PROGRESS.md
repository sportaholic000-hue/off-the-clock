# Session response-order repair checkpoint

Base runtime: `8a778d5346f10d69e586d0ae46006238e4fd169c`. Independent audit evidence: `57880a48e6b1fea4830e359cd8a940c99929b6ef`.

The original delayed-header reproducer confirmed both defects on unchanged source. Local repair gives each signed session its own refresh-cookie name and makes anonymous logout an idempotent no-op without cookie expiry. Browser requests select only the cookie named by their signed session. No quote, booking, calendar, voice or client API implementation changes.

Focused auth/account/CORS suite: 72 passed. The new production-UI response-order fixture has reported all seven assertions passing, including same-account fresh login, different-account login, and subsequent renewal; process completion and evidence collection are still pending at this checkpoint. Full application, existing browser workflows, acceptance red run against the original source, and hosted exact-commit CI remain pending. This is a source backup, not final acceptance.

The old fixed-name-cookie sessions require fresh sign-in after rollout; SETUP.md records this explicitly. No merge, deployment, live provider traffic or production configuration changes have occurred.
