# Backend recovery handoff — 2026-09-29

## Status

This branch is an **untrusted recovery snapshot**. Do not merge, deploy, or use
it for live calls, bookings, billing, calendar writes, messages, or production
data. The last known-safe project base is:

`d2b20520cdd056e0b3ffea6f46219df7e8af3f0d`

The accepted pricing engine under `server/quote-engine-vnext/` and the original
`specs/voice_quote_flows.md` had zero diff from that base at the final check.

## Incident

The command that caused the loss was:

`git restore --source=HEAD --worktree -- node_modules`

On Windows, the npm workspace entries `node_modules/off-the-clock-server` and
`node_modules/off-the-clock-client` were workspace links. Restoring them crossed
those links and removed unpublished working-tree contents under this checkout's
`server/**` and `client/**`. GitHub, PR #3, the base commit, the separate frontend
worktree, production data, and provider state were not changed.

Tracked files were restored from the safe base. New backend source was then
replayed from exact Codex session patch payloads. That replay has not completed
full verification and must be treated as untrusted.

## Remote checkpoints

- Branch: `codex/backend-launch`
- First WIP checkpoint: `38e30c53452c92b6b55f0b610095d60967858d2f`
- `38e30c5` is known incomplete and contains a duplicate calendar-credential
  import/migration call in `server.js`. The duplicate is corrected in the next
  snapshot commit containing this document.
- Frontend work is separate on `codex/quotedone-widget-20260929`; the latest SHA
  reported by that lane was `9ce33192c8576c2709987410832ce2c801875d01`.

## Source included in the next snapshot

The snapshot includes the current recovered versions of:

- Pricing-envelope enforcement and booking-token response integration.
- Runtime configuration, CORS policy, provider-write gates, and dependency
  metadata.
- Billing configuration, durable billing state, billing routes, and plan access.
- Durable auth-token and calendar-OAuth-state services.
- Booking tokens, availability/hold/confirm service, public booking routes,
  preferred-time fallback, booking capabilities, and admin routes.
- Calendar credential encryption/migration, calendar time logic, Google adapter,
  and service-area validation.
- Voice persistence/tool runtime plus the currently recovered audio, media,
  session nonce, tenant resolution, dispatcher, schemas, Twilio validation, and
  HTTP runtime route modules.
- Preserved focused tests and shared contract/launch-authority documents from the
  first checkpoint.

## Known missing or incomplete work

These are explicit blockers; the next agent should not have to rediscover them:

1. `server/src/schema.js` and `server/src/migrations.js` do not yet contain the
   complete combined booking, calendar, billing, durable-auth, and OAuth-state
   database changes. The snapshot can therefore import code whose required
   tables or columns do not exist.
2. `server/src/bookingAdminService.js` is still missing.
3. Voice support files still missing are
   `server/src/voice/googleGenAiLiveAdapter.js`,
   `server/src/voice/voicePromptCompiler.js`, and
   `server/src/voiceWebSocketServer.js`.
4. Voice HTTP/WebSocket/tool runtime is not fully wired into `server.js`.
5. `calendarOAuthState.js` exists, but the Google Calendar start/callback routes
   have not been fully converted from in-memory/caller-carried state to atomic,
   owner-bound durable state.
6. `auth.js` and onboarding anti-plan-escalation changes are present in the
   snapshot, but their required auth-token/user-column migrations are missing.
7. Billing source is present, but its combined schema/migrations are missing.
8. Booking/admin/service-area source is present, but its combined schema,
   migration, and onboarding persistence changes are incomplete.
9. Production transactional email remains unimplemented; console delivery must
   never be treated as production-ready.
10. Provider sandbox acceptance, real phone-call acceptance, real calendar
    acceptance, Stripe sandbox acceptance, browser/server end-to-end tests,
    backup/restore tests, and deployment verification have not been completed.

## Verification evidence and limits

Before the incident, recorded focused suites passed for individual booking,
calendar, billing, and voice slices, and the frozen VNext engine suite passed
311/311. Those results do not prove the recovered tree matches the pre-incident
tree.

After recovery:

- Protected engine and voice-guide diff check: clean.
- Pricing application-boundary tests: 9/9 passed.
- Calendar OAuth state tests: 11/11 passed.
- Plan access tests: 11/11 passed.
- Billing configuration tests: 5/5 passed.
- Twenty-six currently recovered JavaScript source files passed `node --check`.
- `server.js` initially failed because the recovery replay duplicated one import
  and migration call; that duplicate was removed and syntax then passed.
- The full combined suite has not passed on the current snapshot.
- SQLite-dependent Windows tests were interrupted by the repository's restored
  Linux native `better-sqlite3` binary unless a local Windows test binary was
  substituted. Native binaries must not be committed.

No passing component result should be presented as release readiness.

## Exact recovery sources

Raw chat/session logs are intentionally not committed. The original source patch
payloads remain in Codex session files under
`C:\Users\money\.codex\sessions\2026\09\29\` with these task IDs:

- Root integration: `01a0ebdc-bc4a-7af1-99be-135de3d00996`
- Engine/application boundary: `01a0ec2d-af49-7e61-b4fa-830152b8dd1f`
- Booking contract: `01a0ec2d-f271-7331-865e-b46a6eebb38e`
- Google calendar adapter: `01a0ec94-08c1-7c91-81bd-9429eaadd37a`
- Entitlement gate: `01a0ece3-ec7c-70f1-a677-5c24522ec5a9`
- Booking admin: `01a0ece4-44b9-7b41-af55-e5f9978fb881`
- Voice runtime: `01a0eceb-ccca-7721-8208-1f97287ac9a6`
- Billing state: `01a0ecf1-f35c-73a1-9e65-3d19f1a6f229`
- Service area: `01a0ed0d-1b7f-7723-9012-cd3d375825a9`
- Billing routes: `01a0ed1e-0256-7901-9d6c-fa2c438d206a`
- Voice media bridge: `01a0ed2d-abfe-7921-9620-30fdcdf59150`
- Voice WebSocket server: `01a0ed60-a269-7660-8e40-57f8557c1cea`
- Voice tool runtime: `01a0ed7d-4f10-7051-b08c-a76615669248`
- Calendar OAuth state: `01a0ed87-fd0a-7d91-83fc-fb5345c9099e`
- Auth tokens: `01a0ed88-3797-7cb0-ab69-9be311e96edd`

`work/extract-session-patches.mjs` is committed with this snapshot as a recovery
utility. It contains no chat content or credentials; it only extracts requested
patch ordinals from a supplied local JSONL file.

## Safety state

- No PR was created or updated.
- No merge or deployment occurred.
- No production/provider operation was invoked.
- No database, credential, `node_modules`, or native binary is included in this
  snapshot.
