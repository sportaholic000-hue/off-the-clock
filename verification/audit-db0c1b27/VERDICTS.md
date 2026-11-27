# Audit of `db0c1b27` — verdicts (November 27, 2026)

The owner forwarded an audit of `quote-engine` at `db0c1b27` (v58, v59 and the launch merge). It reported two problems for whoever is fixing things. Each was reproduced or checked against the rule it cites before anything changed. No sub-agents. `/specs/` is unchanged.

| # | Problem | Checked | Result |
|---|---|---|---|
| 1 | Concrete can be quoted too low when the customer does not know the month (v58) | Reproduced | Fixed (engine v61) |
| 2 | Every wood siding repair in a home built in 1990 or earlier goes to review (v59) | Checked against the EPA rule | Changed for repairs of 20 square feet or less (engine v61) |

## 1. Concrete with no work month

**Reproduced.** The v58 test slab, busy season June to August at 15% (180.00), winter concrete charge 200.00 a cubic yard (543.21):

| Month | Price |
|---|---|
| July (busy season) | 3,718.89 |
| January (winter) | 4,082.10 |
| Not sure, before this fix | 3,718.89 |

The quote also said "The price is lower if the work is scheduled outside June, July, August", which was not true for a winter month.

**Cause.** v58 stopped one quote from combining a summer surcharge with a winter charge, and did it by always pricing the busy-season month. That is the highest price only while the busy-season surcharge is larger than the winter charge.

**Changed** (`server/quote-engine-vnext/engine.js`, `templates.js`). With no work month, each price option is priced for its most expensive single month:
- the busy-season month (as before) when that costs more;
- a winter month, with the winter charge and no busy-season surcharge, when that costs more;
- both, when a busy-season month is in the winter period (as before).

The quote says which it includes, with the sentences it already had. A quote priced for a winter month can be booked on a winter date; a busy-season date or a date in neither period is cheaper and asks for a new quote, as the booking check already did for the other cases.

**Checked to the cent.** At 66.27 a yard the winter month is 3,718.88 and the busy month (3,718.89) is quoted; at 66.28 a yard the winter month is 3,718.91 and is quoted. Across 16 combinations of winter charge and busy season, the "Not sure" quote equals the highest of the twelve monthly prices.

**Release steps.** `ENGINE_VERSION` `quote-engine-vnext-accuracy-20261127-v61`. Approval versions: `CONCRETE_DRIVEWAY` and `CONCRETE_PATIO_SLAB` 2 to 3, because what an approved concrete service quotes can change. No earlier frozen result changed: the 1,370 earlier jobs keep the v60 fingerprint. Thirteen new frozen jobs in this version (eight concrete, five siding), for 1,383.

**New wording (shown to customers, not yet approved by the owner).** On the work-month question, only when a concrete service has both a busy season and a winter charge:

- "Busy-season pricing follows the month the work is done. If you are not sure, the price for the most expensive month is shown."

It replaces "... If you are not sure, the busy-season price is shown." there, which is no longer always true. Every other sentence is unchanged.

Tests: `test/qeAuditFixesV61_20261127.spec.mjs`, finding 1 (nine tests), expected values worked out by hand before the fix.

## 2. Small wood siding repairs in older homes

**What the audit said.** The EPA lead-paint rule exempts small exterior repairs, 20 square feet or less of painted surface, so some of these repairs could be quoted with a note instead of going to review.

**What the rule says** (EPA Renovation, Repair and Painting rule, 40 CFR 745.83, and EPA's published answers):
- Exterior work that disturbs 20 square feet or less of painted surface is minor repair and maintenance, outside the rule, when no prohibited work practice is used, no window is replaced and no painted surface is demolished.
- EPA counts as demolition removing a painted part in a way that destroys or ruins it. A hole made with a hammer is demolition; a section cut out without destroying it is not. By that definition, boards taken off whole are not demolition.
- The 20 square feet is the paint disturbed on the whole exterior job, not per side, and a removed part counts its whole surface.
- The rule is United States law for homes built before 1978. Health Canada says a home built before 1960 probably has lead paint and that the outside of one built from 1960 to 1990 may have it; its guidance gives precautions and no size of its own.

The audit is right: a small repair can be outside the rule. My first reading, that taking boards off is always demolition, was wrong; it depends on how they are taken off.

**Changed** (`server/quote-engine-vnext/buildingAgeRules.js`). A wood siding repair of 20 square feet or less is quoted at any building age. The quote carries the sentence every quoted siding repair already has: "Repair does not include testing for or removing asbestos or lead paint. Older siding can contain them; if found, that work is priced separately." The year built is still asked, so the business sees it on the quote. A repair given by its length and width is measured the same way.

**Unchanged.** A wood repair over 20 square feet in a building built in 1990 or earlier, or of unknown age, goes to the business. Fiber cement is held at every size: asbestos has no size exemption. Siding removal on a replacement job is unchanged. The size limit is applied in Canada as well; Canada has no size of its own, so the one published limit is used for both. A larger wood repair on a United States home built from 1978 to 1990 is still held, although the United States rule covers only homes built before 1978: the year-built check does not know the job's country.

**What the engine cannot know.** The exemption also depends on the work itself: boards taken off without wrecking them, no prohibited practice, and no more than 20 square feet of paint disturbed on the whole job. The area used is the damaged area the customer states. The business confirms the scope on site, and the quote's sentence covers lead paint that is found.

**Release steps.** Approval version `SIDING_REPAIR` 3 to 4. Five new frozen jobs (15 and 20 square feet quoted at 250.00 and 500.00; 20.01 square feet and fiber cement held).

**New wording (shown to owners, not yet approved by the owner).** One sentence added to the help under "Removal in older buildings": "A wood siding repair of 20 square feet or less is quoted at any age, with the note that testing and removal are not included."

Tests: `test/qeAuditFixesV61_20261127.spec.mjs`, finding 2 (six tests), expected values worked out by hand before the change.

## Guards added against these kinds of defect

Four of the five findings in this audit and the Neon audit of `d712c688` came from the two versions before them: the v58 rule that led to the concrete under-quote, and from v59 the planting setting that was hidden while still checked, the business-settings confirmation offered where it could not work, and a siding hold wider than the rule it follows. (The fifth, the withheld caller's number, was older.) Two tests now fail if the same kind of defect is left behind again (`test/qeAuditFixesV61_20261127.spec.mjs`, 3a and 3b):

- "Not sure" is never cheaper than a month the customer could pick: for a service with a busy season, the quote with no work month equals the highest of its twelve monthly prices. The concrete tests cover the winter charge as well.
- Every setting the engine checks is offered in the price book (68 settings across all services today). Only a setting marked unused is left out, and it is not checked.

## The audit's "checked and fine" list

No action needed on any of it: the November 12 and 13 spec edits, the v58 flooring approval version, saved planting price books (now also covered by v60), the business-settings confirmation (tightened in v60) and the absence of gradients. Its own test run on `db0c1b27` reported no failing test once its three browser files could load Playwright; this session's run on that commit was 10,448 of 10,448.

## Sources for finding 2

- EPA, minor repair and maintenance activities: https://www.epa.gov/lead/please-provide-guidance-how-agency-will-interpret-term-minor-repair-and-maintenance-activities
- EPA, a hole made with a hammer and a cut-out section: https://www.epa.gov/lead/if-i-use-hammer-make-hole-wall-two-feet-each-side-does-rrp-rule-apply
- EPA, 20 square feet on several sides of one property: https://19january2021snapshot.epa.gov/lead/if-renovator-disrupts-20-square-feet-or-less-painted-surface-side-several-sides-exterior-one_.html
- 40 CFR 745.83: https://www.law.cornell.edu/cfr/text/40/745.83
- Health Canada, lead-based paint: https://www.canada.ca/en/health-canada/services/home-safety/lead-based-paint.html
