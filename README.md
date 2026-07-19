# Off The Clock AI

AI phone operator + QuoteDone quoting platform for home service businesses.

## Repo layout
- `/specs/` — the four spec documents. `build_guide.md` is the phase-by-phase
  build plan; `quote_engine_v2.md` wins all conflicts on engine behavior;
  `platform_spec_v2.md` covers product/site/dashboard; `voice_quote_flows.md`
  covers per-trade call flows.
- `/design-reference/homepage/` — Claude Design build of the public site.
  Phase 5 wires live functionality INTO this (demo agents, cost controls,
  QuoteDone widget, ROI calculator) rather than rebuilding the visual layer.
- `/design-reference/dashboard/` — Claude Design build of the owner dashboard.
  VISUAL REFERENCE ONLY for Phase 4: match the look; rebuild structure
  against real data models.

## Build
Follow `/specs/build_guide.md` phase by phase, starting with the AGENTS.md
setup and Phase 0. Gates are mandatory: real assert/expect test output,
never prose summaries.
