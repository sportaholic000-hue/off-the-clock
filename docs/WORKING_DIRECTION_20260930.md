> **Current account/session checkpoint — September 30:** A subsequent independent audit reopened this slice for delayed refresh/logout response headers. The auth-only repair is saved at `3e406d2107522319038c6cdd982cfcf08c91e657` and passed exact-commit hosted builds, 388 application / 357 engine / 25 transport tests and 9 + 10 + 7 browser checks. [Permanent repair proof](review/session-response-fix-20260930/FINAL_REPORT.md). Earlier shared-cookie sessions require fresh sign-in after rollout. Independent peer recheck is pending alongside its active engine audit; voice has not begun. Earlier source/count checkpoints below are historical and remain preserved.

# Owner direction and lane checkpoint — September 30, 2026

The product is an AI receptionist/operator that accurately quotes service jobs from each business owner's approved price book and books jobs or estimate visits into that owner's calendar, over the phone and through a website widget. Primary markets are Canada and the United States.

Read AGENTS.md, docs/LAUNCH_AUTHORITY_20260929.md, the governing specifications and the original specs/voice_quote_flows.md before changing implementation. The original voice guide remains authoritative. This checkpoint records accepted owner direction; it does not replace those specifications.

The owner explicitly requested no subagents. The separate user-owned chat “quotedone engine accuracy” owns the engine/booking repairs. Its final saved source is 1979792d766d6c2b2fe0dfb856d1651de03eee3f, tested runtime 06c6fbeec94e3c87040964c24a7a0f45f2837e2d. The account/security chat owns draft PR #4 and preserves all 41 peer files at the tested runtime checkpoint. A later report commit adds a separate security progress paragraph to BUILD_STATUS.md and preserves every prior paragraph; engine/booking runtime files remain identical.

Security source: 08ee7d529112c8db8098bc002dfd9be732a19d3e. See docs/review/session-security-20260930/FINAL_REPORT.md and its evidence for the completed slice and actual launch limits. Earlier inspection reports are historical and preserved under docs/review/thread-deliverables-20260930.

The owner authorized voice/runtime work after the security slice, with coordination to avoid overlap. The other chat confirmed no active source work or pending edits and supplied these contract boundaries:
- Use quoteDoneBridge, the shared quote engine and approved owner offering definitions. Keep rates and model-generated arithmetic out of model context.
- Preserve installed and itemized fencing/painting offerings. Never infer fence post layout or paintable wall area from floor area.
- Require callback contact for an estimate; a name is optional.
- Price supported selected work while retaining separate unpriced work for the owner's on-site estimate.
- Confirm a booking only from the shared booking service's verified status, intended event identity and exact requested instants.
- Follow the original voice guide and preserve tenant privacy, integer cents and explicit booking confirmation.

Owner phone-switch intent is exact: ON lets the AI answer calls; OFF lets the existing business phone ring normally so the owner answers, without a permanent Twilio bridge or a second answering device. A server-side Twilio reject response alone does not satisfy that routing outcome. Carrier forwarding/number control must be verified before the UI claims this works universally.

Source, tests, reports and progress must be saved frequently on GitHub and fetched back to verify each checkpoint because the local computer may fail. Keep draft changes reviewable and separate from main/production. Runtime credentials, private sessions/databases and installed dependency binaries belong outside GitHub.

Current remaining launch work includes the incomplete voice runtime, real provider acceptance, deployment/store restoration and the full phone-to-calendar acceptance path. Do not mark the complete product launched based only on this slice's local synthetic checks.

Recover on another computer from branch `codex/auth-email-recovery-20260929` (draft PR #4). Its final runtime passed hosted application/engine/transport/build/browser checks: 382 / 357 / 25 tests and 9 + 10 browser checks, with counts overlapping. Permanent proof is under `docs/review/session-security-20260930/hosted/`; see that directory's VOICE_NEXT.md for pending voice work. Do not mistake historical failed/interrupted run records for the accepted hosted result.
