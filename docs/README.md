# Documentation index

Specifications, source navigation, and dated project records are indexed below.
The current checkpoint is recorded at the top of
[BUILD_STATUS.md](../specs/BUILD_STATUS.md).

## Specifications and owner decisions

| Document | How to use it |
| --- | --- |
| [AGENTS.md](../AGENTS.md) | Repository working rules and verification requirements. |
| [quote_engine_v2.md](../specs/quote_engine_v2.md) | Base quote-engine specification. |
| [QUOTE_TRADE_DECISIONS_20261003.md](../specs/QUOTE_TRADE_DECISIONS_20261003.md) | Explicit owner amendments and follow-ups; its stated overrides govern the listed decisions. |
| [BUILD_STATUS.md](../specs/BUILD_STATUS.md) | Current checkpoint summary followed by preserved historical records. |
| [build_guide.md](../specs/build_guide.md) | Phase-by-phase build plan. |
| [platform_spec_v2.md](../specs/platform_spec_v2.md) | Platform specification. |
| [voice_quote_flows.md](../specs/voice_quote_flows.md) | Voice-flow specification; separate from this quote/price-book verification. |

Do not infer a new pricing rule from an old audit finding, a test count, or a
historical handoff. Use the governing specification and explicitly recorded owner
decisions, then verify their implementation on the selected commit.

## Review and evidence

- [Active source map](../README.md#repository-map)
- [Verification index](../verification/README.md) — current follow-up and earlier
  reports, all scoped to their recorded source versions.
- [Historical review index](review/README.md) — navigation for the retained
  `docs/review/` material.
- [September QuoteDone completion records](quotedone-completion/) — dated
  integration contracts, owner decisions and repair evidence. Later recorded
  amendments may supersede their earlier capability or policy statements.

## Other retained documentation

These links organize existing material; their inclusion is not a new audit or
fresh verification of these areas.

- [September 29 backend recovery handoff](BACKEND_RECOVERY_HANDOFF_20260929.md)
- [September 29 launch authority](LAUNCH_AUTHORITY_20260929.md)
- [September 29 shared API contract](SHARED_API_CONTRACT_20260929.md)
- [September 30 working direction](WORKING_DIRECTION_20260930.md)
- [Railway setup](RAILWAY_SETUP.md)
- [Operator integrations](operator-integrations.md)
- [Historical Phase 2 inspection findings](phase-2-inspection-findings.md)
- [Live-demo documentation](live-demo/)

Historical files remain in their original locations so existing reports,
source bindings, scripts and links keep their meaning.
