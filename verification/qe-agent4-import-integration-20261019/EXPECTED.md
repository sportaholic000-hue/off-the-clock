# Integration expectations — recorded before merge and execution

Ordered parents:
1. 04df35cd8e9ced136ef611cfc2b25f2de64c21bf — verified combined quote/widget checkpoint.
2. 0e3f1da02cffbc16e97355eb182c238ff91dfba0 — reviewed importer repair.

Integration only: no new production edits or assertion changes. A three-way
tree comparison must preserve every inherited blob from the appropriate parent.
The only path changed on both sides since 4a90f736 is the CI workflow, whose
incoming blobs are identical. Its 45-minute test timeout must remain unchanged.
Both v12 engine identifiers, selectors, combined quote/widget code and all
historical evidence must survive. H1, F2 and A2's separate H2 work are unchanged.

The existing 1,208-case importer selection must pass with every original name
present, no weakened assertions and no failures/skips/cancellations/TODOs.
The five original condition-extension reproductions run unchanged: both pages
must be fetched; each complete explicit note must remain verbatim (or the
affected listing must be withheld); quantity 3 and confirmed=true must require
review without an extended amount. Existing route/save/provider/dispatcher,
unconditional 30.00 and exact-arithmetic controls remain selected.

The combined parent's completed hosted run 39302616280 reports 6,070 strict,
7,701 full and 12 dedicated browser tests. The importer adds four voice-prefixed
files with 334 cases (74 + 82 + 105 + 73). Therefore this unmodified merge should
select the same strict files and cases, add exactly those four full-suite files,
and report 6,070 strict / 8,035 full / 12 dedicated browser passes. These are
pre-execution expectations, not results. Investigate any mismatch rather than
changing assertions or selectors.

Verify every passing name from the combined parent's strict/full suites, all
1,208 importer names, and the combined widget/quote groups individually. Existing
PI-01 through PI-05 expectations and monetary controls remain authoritative.
Build, Docker, failure checker and production audit must complete at the exact
published ordered-parent merge. Parent CI does not qualify the new merge.
