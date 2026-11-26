# Verdicts report on two audits (run on v53 and v54) — Claude's verification

Claude, November 26, 2026. Repaired version `quote-engine-vnext-accuracy-20261126-v55`.

| # | Item | Verdict | Commit |
|---|---|---|---|
| 1 | Flooring removal held by building age, whatever the floor | Real (reproduced: carpet and laminate before 1978 went to review). Fixed with the engine's existing floor classes | dd533c5b |
| 2 | Siding removal held by building age, whatever the siding | Real. Fixed with an optional owner choice per removal offering | a2ad5d10 |
| 3 | Fence removal priced from the new fence | Real. Not built: it adds a customer question to the fence-replacement flow in specs/voice_quote_flows.md, and it breaks the recorded rule that fence selection never borrows another type's prices. Owner ruling needed | — |
| 4 | Saskatchewan mulch and yard cleanup at 11% | Real (PST-12, July 2024, Section L). Fixed: 5% offer for owner confirmation | e7766136 |
| 5 | Bagging help text describes labor-only | Real. Fixed (text only) | 6cf0504a |
| 6 | Material price entry sentence | Optional copy; not added (needs owner approval) | — |
| — | Stale AUDIT.md boundary note | Fixed: marked historical | 6cf0504a |
| — | Backlog (gravel increment, whole boards, accessory bundles, fence rolls, carpet search) | Not done; none sends a quote to review | — |

## Item 1 rule

- **Quote in older buildings** (with the existing note that testing and abatement are not included): carpet, laminate, cushioned or floating floors, and wood on joists.
- **Keep the review:** sheet vinyl, vinyl tile or plank, unclassified "vinyl", ceramic or stone tile, concrete, wood glued to or laid on concrete or of unknown support, and any floor the engine cannot classify.
- **No new wording:** the review message is unchanged. The auditor's material-named message was not used.

## Item 2 rule

- **New optional owner choice:** "Existing siding material" on each siding removal offering, with the values vinyl, metal, wood, fiber or asbestos cement, and not sure.
- **Quote in older buildings:** vinyl and metal.
- **Keep the review:** every other value, and offerings with no material set (every offering saved before this change).

## Approval versions

FLOORING_INSTALL, FLOORING_REPLACEMENT and SIDING_REPLACEMENT move to approval version 2. Every other service type keeps its approval across v55.

## Owner items

- **Labels and copy not in a spec, all shipped:**
  - the label "Existing siding material" and its five choices;
  - the two Saskatchewan notes for mulch and yard cleanup (the auditor's wording).
- **Ruling needed (item 3):** add the customer question "What is the existing fence made of?" to fence replacement, and price removal from that type's offering.

## Governance facts the report raised

- The v53 test folder names, the v53 engine name and the v51 verdict file carry November 26 although the work was done on November 25. That date was my error.
- The three applications under the November 26 ruling were decisions I made under the owner's instruction. The owner did not rule on each one.
