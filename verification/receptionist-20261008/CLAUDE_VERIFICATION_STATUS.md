# Claude verification status — paused 2026-10-08

## fix/quote-presentation-20261008 — DONE
- Codex 4330b25 + Claude 9bbce18 (test-only: interview map test expects omission).
- Own checks: 960/1000/2000-char scope descriptions project on phone with full text; tier notice in phone output and narration once; cleanup asks no disposal question, travel still asked; last-entry removal omits the field.
- npm test at 4330b25: 3,923/3,924, only failure = that stale test. test:quote after fix: 2,805/2,805.

## fix/receptionist-20261008 — IN PROGRESS
Base Codex efba22b. This commit adds the two-word unit fix.
- Item 1 startup: VERIFIED in a real container with the runtime-stage layout, no specs/, voice on -> /api/health 200; branch's docker-voice-smoke.mjs PASS.
- Item 3 texting rewrite: VERIFIED ("plus HST", "$89 each", "Custom text engraving" reach the prompt; "Window washing: $6 each / Call us for a quote." x10 = $60.00).
- Item 4 listed prices: 24/24 acceptance cases pass. GAP FOUND AND FIXED HERE: any two-word unit was accepted ("$75 per hour minimum" x0.5 = $37.50, "$10 per item daily", "$2 per sqft twice"). Now two-word units only for standard measures (square/linear/cubic/board + foot/yard/meter/inch); test/claudeListedUnits20261008.spec.mjs (13 cases) + receptionist20261008: 48/48.
- Item 5 names/limits: VERIFIED ("$99 Synthetic Plumbing", "Low Cost Roofing 24/7", "5 Dollar Fence Co", "Best Rate Painting 2" compile; knowledge 20,001 and 201 never-say rejected).

### Remaining before this branch is done
1. Guide regression: server/src/voice/receptionistGuide.md (128 lines) dropped still-valid content from specs/voice_quote_flows.md (462 lines). Restore from the old guide: tone rules (acknowledgment variety, contractions, no robotic repetition), capture volunteered answers / never re-ask, question order, number read-back, concise quote and tier presentation, urgency empathy (claim notification only after the tool confirms), booking close offering two concrete slots, and the tuned spoken question lines per trade. Change ONLY what contradicts rulings: pacing/rough numbers/size categories/"wider range"/"I'll work it out" estimate paths, fence height menu, floor area for painting, "convert silently", "Most folks go [owner's default]" and "[owner] can walk you through samples", texts. Ask only fields in the current customer contracts (MEASUREMENT_CONTRACTS). Then re-pin IMMUTABLE_VOICE_GUIDE_SHA256 in voicePromptCompiler.js and keep receptionist 2 tests green.
2. Cold npm test + npm run test:quote on the final branch (browser module: PRICEBOOK_BROWSER_MODULE=$(npm root -g)/playwright).

## Combine notes
- claude/homepage-copy-20261008 (bd37e74) overlaps this branch in client/src/ownerAlerts.jsx and server/src/voice/productionVoiceRuntime.js; re-pin verification/tenant-isolation-20261007/route-sources.json after combining.
- Calendar/billing/dashboard agent has not reported.
- Codex commits use the owner's personal email as author.

## Added 2026-10-08 (owner)
- Guide tone: owner wants occasional natural filler words ("um", "hmm", "uh", "let's see") so the receptionist never sounds robotic or perfect. Use them sparingly and naturally; never inside a price, measurement or read-back, and never in the quote narration.
- Calendar/billing/dashboard agent pushed fix/calendar-billing-dashboard-20261008 at e34e5f4 (base c68b9bc). Its sandbox reported 3,865 passed / 57 Chromium-launch failures; test:quote unfinished. Claude to verify after the receptionist branch: review six items, own reproductions, cold npm test + test:quote.
