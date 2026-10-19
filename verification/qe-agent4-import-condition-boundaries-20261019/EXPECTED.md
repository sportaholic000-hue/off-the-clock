# Independent expectations before execution

Base: 4a90f73695611bb42bb9fb50d40a16f9e01c3740.
Branch: codex/qe-agent4-import-condition-boundaries-20261019.
All sites, accounts, credentials and calls are synthetic. No provider network.

## Scope and expectations
1. The literal "Site-wide: all prices require membership" is explicitly website-wide, including a condition-only landing page and a later linked page. Every affected retained unit-price paragraph must contain it verbatim; otherwise withhold the paragraph. Site-wide notes discovered after earlier prices must protect those earlier prices too. HTML and plain-text notes, inline markup and multiple notes must retain exact normalized visible wording.
2. "On this page, all prices require membership", section notes and item notes must not be promoted to other pages. Unlabelled "Available to members" does not establish website-wide applicability. Hidden/instruction text must not acquire authority.
3. Page/request/link/body limits must be disclosed and must not release partial bodies. Conditions seen before a limit and late conditions on a fully fetched page must survive entry/text budgeting. Whole qualified paragraphs either fit or are withheld: never cut a note off to fit. Entry caps must not stop condition discovery on pages already being processed. A 500-character condition limit must withhold rather than truncate.
4. Identical fully-qualified paragraphs may deduplicate. Equal raw item/price excerpts with differing qualifications must not lose a qualification through deduplication. A bare and a restricted version of the same exact excerpt do not establish which offer applies; a bare paragraph must not become a selectable unconditional workaround. Different genuinely named products remain independent.
5. Drafting does not mutate saved facts. Explicit owner save preserves each accepted paragraph. Compiled provider-visible OWNER_FACTS_JSON must retain all financial qualifications (apart from existing closed contact-only cleanup). Actual dispatcher reads must preserve saved identity, privacy, tenant isolation and database immutability.
6. Discover a saved listing, then owner-save a changed amount or condition before calculation: the old paragraph must not calculate. Fresh current unconditional $12 x 3 = $36.00; current membership wording returns needs_review without an amount. Repeat the same tool-call ID too, checking whether any read-only replay caches an obsolete amount. Record the implemented revision behavior; do not add revision policy outside ownership.
7. Controls: Widget $10 each x 3 = $30.00; $0.10 x 3 = $0.30; CAD 0.335 x 3 = CAD 1.01. Board-on-board, Nail-in and Plug-in keep $30.00. Membership returns needs_review/no extendedAmount. Existing permitted tax wording remains verbatim and adds no tax. Contact-only cleanup remains unchanged. Other tenant facts/private sentinel fields never appear.

## Boundary limitations to investigate separately
An unvisited linked page may contain a condition the bounded crawler cannot know. Record exact output when the only global condition lies beyond a page/request/body limit. Do not silently expand limits or invent wording. If safe behavior conflicts with the existing explicitly partial-import contract/tests, preserve the unsafe reproduction and identify the policy/owner handoff rather than weakening tests.
Provider instructions already delivered to a running session may remain a snapshot even if calculation rereads current saved knowledge. Inspect and reproduce the actual provider-facing behavior; any session refresh repair is outside the two owned production files.

## Evidence discipline
Capture baseline new-test source, source hashes, command, raw TAP and structured exact examples before production edits. Preserve every initial failing result. Test harness mistakes, if any, must be documented separately and corrected while the original production base is still available. Run the unchanged 874 selection plus new cases, build, then exact-head hosted gates. Existing tests, evidence, workflows, selectors, specs, dependency and arithmetic files remain unchanged.
