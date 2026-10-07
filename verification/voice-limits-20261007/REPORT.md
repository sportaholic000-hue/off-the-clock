# Voice limits — 2026-10-07

Requested base: `codex/audit-small-repairs-20261007`, `4db13a2945193762bbc4b85f9ab616a00e1dd067`.
Work branch: `fix/voice-limits`. Active agent only; fake providers; no calls,
messages, main merge or deployment. Nothing under `specs/` was edited.
The attachment mentioned in the request was not available in this conversation.
The six listed findings and platform §§5.2, 12.2, 12.4, 12.15 supplied the scope.
The owner's no-texts ruling takes precedence over obsolete specification text.

## Reproductions before application changes

All twelve scenarios below ran on the unchanged base. The two demo-race scenarios
each exercise three limits, giving **18 failed results / 0 passed / 0 skipped**
(including their parent results). They failed on the defect assertions, not setup.
`baseline-summary.txt` records the result. To repeat, copy
`baseline-regressions.mjs` to `test/voiceLimits20261007.spec.mjs` in a separate
checkout of the base, install with Node 22, then run:

```
node --experimental-test-module-mocks --test test/voiceLimits20261007.spec.mjs
```

| Finding | First reproduction | Second reproduction | Baseline observation |
| --- | --- | --- | --- |
| Repeat callers | Six historical answered calls plus signed inbound webhook | Six complete fake-model HTTP/WebSocket calls, then a seventh | Seventh call received a new model stream in both cases |
| Spam controls | Owner HTTP mark-spam/blocklist flow | Render actual owner call detail through Vite/React | HTTP action returned 404; rendered component had no spam control |
| Demo race | Hold the token response while concurrent HTTP requests enter one server | Two separate SQLite connections and HTTP servers share one database | Both requests minted tokens for each limit of one: hourly, daily, concurrent |
| Demo facts | Generate the instruction string | Capture the actual locked system instructions passed to the fake token provider | Both contained text follow-ups, a refund guarantee, universal ranges, and obsolete toggle instructions |
| Platform ceiling | Two owners compete for an environment limit of one | Four concurrent signed requests compete for a limit of two | Both owners admitted; all four concurrent requests admitted |
| Circuit breaker | Three fake model-open failures, then another signed request | Three connected model error callbacks, then another request | Subsequent calls still received model streams |

## Implementation

- Repeat admission uses answered-call history over a rolling 24 hours and counts
  unexpired pending reservations atomically. Caller numbers are normalized and
  scoped to the owner; withheld identities are not treated as one person.
  Overflow uses capture with a review notice, no forwarding to the owner, no AI
  session and excluded minutes. Dashboard/email and admin warnings are durable.
  The owner warning is deduplicated per number per UTC day.
- Owners can mark a call as spam, maintain a normalized blocklist and unblock.
  The mark and block commit together, with the marked call's minutes excluded.
  Signed blocked calls are rejected before model connection, saved as filtered,
  and cannot gain billed minutes through later provider callbacks. Owner controls
  exclude staff; all reads and mutations bind the session tenant. Filtered calls
  are collapsed in Calls and the dashboard feed.
- Demo quota reservations commit before awaiting token minting. Explicit provider
  refusal releases the reservation; ambiguous timeout/success retains it until
  the existing quota windows expire, preventing an unsafe re-mint storm.
- Demo facts remove text messaging, caller booking messages, the unsupported
  refund guarantee, a fixed exhaustive trade questionnaire and universal range
  claims. Setup describes the master toggle separately from carrier forwarding.
- Production atomically enforces both owner and platform ceilings; capacity
  warnings begin at 80 percent. The circuit counts model-open and mid-call
  failures, persists across reconstruction/restarts, falls back while open,
  and allows one recovery probe after cooldown. Old sessions cannot close an
  open breaker. Admin warnings and resolution are visible at `/admin`.
- New data participates in migrations and owner offboarding erasure. No new
  text-message sender, tool or provider call was added. This independent branch
  starts from the requested base, not the separate SMS-removal feature branch.

## Configuration

All values are positive integers validated at startup; defaults are documented
in `.env.example`. Production replicas must share the same SQLite database for
these platform-wide limits. Independent database files are independent platforms.

| Environment variable | Default |
| --- | ---: |
| VOICE_MAX_CONCURRENT | 100 |
| VOICE_MAX_CONCURRENT_PER_OWNER | 5 |
| VOICE_CALLER_DAILY_LIMIT | 6 |
| VOICE_BREAKER_FAILURE_THRESHOLD | 3 |
| VOICE_BREAKER_WINDOW_SECONDS | 60 |
| VOICE_BREAKER_COOLDOWN_SECONDS | 30 |

The recovery probe lease is 60 seconds, matching the inbound nonce lifetime;
unused reservations cease occupying capacity after expiry. Healthy active calls
are never ended to reduce capacity. A recovered connection closes the breaker;
a failed recovery probe immediately reopens it.

## Verification

The defect regressions and boundary checks pass **28/28**, zero failures/skips.
The pre-expansion related voice/owner/demo run passes **187/187** (overlapping).
The existing native Node SQLite billing-call regression plus the new cases pass
**29/29** after using adapter-neutral immediate transactions.
The final targeted voice/owner/lifecycle run passes **84/84** (overlapping).
The reviewed real-server route matrix passes **243/243**, zero failures/skips.
Cold full/quote/build/install results are reported from the final exact-head
GitHub Actions run in the task response; CI was enabled for this branch only.
No gates or skip checks were weakened. The real model's spoken output was not
sampled: instruction and transport behavior are verified with fake providers.

## Local cold gate limits and hosted retry

Cold `npm ci` and `npm run build` passed with Node 22.23.3. Native SQLite was
built against the matching local Node headers because the prebuilt binary
endpoint was unavailable. No lockfile or dependency version changed.

Local `npm run test:quote` completed: **2,541 passed / 2,597 results / 56 failed /
0 skipped / 0 cancelled**. Every reported failure requires an unavailable local
Chromium browser. This is not a passing local quote gate. The local full-suite
attempt also hit unavailable browser prerequisites and was stopped without a
complete summary; its SQLite adapter incompatibility was separately corrected
and verified by the 29/29 native billing-call and new-regression run above.

First hosted attempt: `37679286368`, source `46f1cc91aaa1cebbefa97168bf0674ee1a44ba03`.
It passed cold installation but remained in Chromium setup while local checks
completed (the preceding successful repository run installed Chromium in 34
seconds). This documentation-only checkpoint records the local limits and
triggers a fresh cold hosted run. Application, test and workflow files are
identical to that first uploaded source. The final task response reports the
exact final-head hosted result, not a passing claim for these local attempts.

## Browser setup recovery

The first two hosted attempts stalled in the combined browser-install step.
Browser setup is now split into package installation, Chromium download and
an actual launch check, with five-minute limits on each setup operation. Existing
runner libraries are used only when Chromium successfully launches; otherwise
Playwright installs its system dependencies and the launch check runs again.
The Playwright version, browser version, cold application install, builds,
full/quote commands, zero-failure/skip check and audit are unchanged. No browser
test is omitted or made optional. Application and test source is unchanged.
