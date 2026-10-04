# Astra's five quote-engine / price-book findings — scoped repair

Base: `eda14525dca5c25f15ac9e9f005343cc9ec172ee` (`codex/quote-final-repairs-20261004`, draft PR #22). Candidate: `codex/astra-five-repairs-20261004`. The owner authorized these five repairs and will have Claude audit the candidate. No subagents, merge, deployment or live customer data were used.

## Resulting behavior

1. **Confirmed gate widths remain project facts.** The saved base gate key fixes its measured opening width; a gate introduced only by tiers uses its first offered definition. An option that changes that width is excluded when the gate is requested. Other complete options remain available. Requests without gates remain quotable, including when every gate option conflicts; owner scope coverage identifies the conflicting gate option. Same-width upgrades retain their separate prices.
2. **Customer questions cover effective tier configuration.** The form and wizard receive the union of the actual tier contracts. Tier-only underlayment, roof products, insulation/coverboard, stairs and gates expose their required questions and measurements. Registered confirmation booleans for another option are accepted as evidence, without allowing unpriced or unrecognized measurements. A question required by one option therefore does not exclude another otherwise complete option.
3. **Approved baseline jobs stay available.** Activation probes use flat ground, standard-height walls and one-story buildings. A retained non-baseline setting still requires the explicit baseline-price confirmation. Selected non-baseline jobs still require the necessary labor shares; the owner sees that coverage. No saved condition, share, price or multiplier is changed.
4. **Scope confirmation text follows the selected product.** Product/option wording is retained separately from the shared field. Both customer controls and job summaries resolve the label and details from the measured selection. Different tier products are identified in the displayed details. Changing the selected product clears its earlier confirmation so it must be answered for the new product. Existing boolean field names and saved prices are retained.
5. **Shared readiness failures do not repeat across the catalog.** Owner fee choices are checked once per variant before product calculations. Included disposal retains scenario validation. Customer live/not-live checks return promptly for disabled or globally blocked drafts. The reproduced missing-fee 40 × 40 catalog no longer performs 1,600 repeated failing quote pipelines; actual requested jobs still receive complete calculation and validation.

## Verification checkpoint

- The 21 non-browser regressions detect 18 failures on the unmodified base, with three passing controls. Final focused run: **123 / 123**, zero failures, skips or cancellations.
- All **65** existing independent/measured-scope fixtures retain identical internal quotes, sanitized customer quotes and ordinary status objects. Only generated `quoteId` fields are normalized. See `unchanged-snapshots.json`.
- Both owner and widget builds passed. Source syntax checks and whitespace validation passed.
- Three new real-browser cases exercise answering tier-only confirmation in the measurement form and wizard, selected-product labels, and clearing a previous Yes when changing the product. Hosted results are pending at this checkpoint.
- Local broad non-browser run: 1,032 passes and three incomplete/environment-failing records. One process fixture raced the concurrent build; two native application processes aborted under this workspace's custom Node 24 runtime. This is **not** a full-suite pass. Local isolated native checks retain genuine database/statement objects in an external harness; actual SQL, filesystem, locks and prices remain real. Hosted Node 22 runs ordinary commands without that workaround.
- Local Chromium startup failed with SIGTRAP before rendering; those attempted browser tests are **not** counted as passes. Hosted browser verification is required before completion.

## Review boundaries

Nine production source files change: the configured-offering contract/activation, customer contract, exported fee validator, readiness, shared form definitions, application bridge, job summary, measurement controls and wizard. Two new test files cover the repairs. Monetary formulas, stored prices, dependency lockfile and engine approval version are unchanged. Unaffected fixture results are compared to the base, not merely to new expected values.

The performance repair is based on reproduced shared-blocker/disabled cases. It does not claim constant-time exhaustive pricing for every possible catalog or numeric boundary. The owner's exact 14 KB fixture was not supplied; independent pre-repair 80-product tests measured approximately 6.2–6.5 seconds with 7.8–9.0 KB books. Cache hits were already fast. Real business price books, deployed builds and independently priced real jobs remain outside this synthetic verification.

This report records a repair candidate for independent audit, not whole-product or public-launch acceptance. Hosted CI and immutable GitHub source binding will be recorded after publication.
