# Every-trade quote audit implementation

Local Chromium cannot launch (SIGTRAP). The local strict gate printed 4573 pass / 120 fail / 0 skipped; the full retry printed 5559 pass / 117 fail / 0 skipped. See exact counts and repairs in COMMANDS.md. Hosted CI for the final pushed commit is required before treating browser coverage as verified. The first full-suite attempt was interrupted after a silent HTTP-test stall and printed no final counts; its standalone startup probe passed. The full retry completed, with Chromium failures and two catalogue timing assertions. The unchanged standalone catalogue file then printed 6 pass / 0 fail / 0 skipped. Hosted results are supplied in the handoff.

The pinned code normally rounds customer-facing range endpoints outward to whole dollars. Exact stored calculations meet 87840/107360 and 92720/112240 cents; displays remain $878–$1,074 and $927–$1,123. This disclosed mismatch with the prompt's literal display examples preserves existing quote presentation. It is not claimed as a display test pass.

Base: 8b53169b2d6019e6769481b5c0551aca42a91f42. Branch: codex/qe-everytrade-20261017. The final remote hash or verified bundle hash belongs in the handoff, after push; it cannot be embedded in its own commit.

## Changed files

FILES.txt is the complete changed-file list. New behavior lives primarily in quoteRangeSettings.js, customPriceSplit.js, ownerJobCosts.js, ownerJobMetrics.js and three owner UI components. The shared engine/contracts/priceBook/bridge changes are bounded hooks and allowlists. No specs, protected trade calculator, quoteDoneApproval receipt implementation, default dollar price, CI workflow, main merge or deployment was changed.

## Specification departures

SPEC_DEPARTURES.md lists each pinned spec line departed from under this task's explicit owner approval. No spec files were edited.

## Commands and evidence

COMMANDS.md lists exact printed counts, including unsuccessful iterations. EXPECTATIONS.md was written before execution. base-quotes.json.gz contains 43 synthetic quote/book cases captured at the pinned base before source changes; the regression compares full deterministic results and book conversions. Every .tap.gz/.log.gz file decompresses to the original output bytes.

## Proposed owner wording

PROPOSED_WORDING.md discloses every added owner label, help paragraph and validation/recovery message, including the saved-configuration confirmation. These are proposed on this review branch for owner review. New job costs and change descriptions are owner-only and are never added to customer, staff or voice receipts.

## Verification limits

Local browser assertions cannot run until Chromium launches. The final hosted workflow must be identified by exact commit and run ID in the handoff. No integration into the other chat's integration branch is attempted; merge compatibility with its painting/flooring starting values is not verified here. The behavior was tested with synthetic records, not production customer data. Actual job costs must be entered in the saved invoice currency/tax basis. Budget comparisons explicitly compare original owner-cost lines with full actual costs including approved changes; selling-price allocations are not imputed costs. No automated price-adjustment recommendation is added.
