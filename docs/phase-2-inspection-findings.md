# Phase 2 Inspection Findings

Branch: `claude/phase-2-audit-fixes`
Base head at inspection: `dd1bfd8af19a2b5b681c63102ab918cfa964d4b3`

This document records source-level inspection of the committed Fable references
against the current implementation. It was produced in an environment with **no
display and no browser**, so it contains **no visual QA**. Every finding below is
derived from reading source. See "Not verified" at the end.

---

## 1. Reference inventory

| Reference | Lines | Establishes |
|---|---|---|
| `design-reference/dashboard/index.html` | 225 | Mission-control composition: left rail, operator master toggle in the top bar, priority-action hero, four-counter grid, live call feed |
| `design-reference/dashboard-live/index.html` | 183 | Live/active dashboard variant |
| `design-reference/pricebook-editor/index.html` | 417 | Progressive disclosure via `<details class="disclose">`, two-column editor with live quote rail, status transitions |
| `design-reference/onboarding/index.html` | 180 | Stepped onboarding with momentum devices |
| `design-reference/homepage/index.html` | — | Marketing surface, out of scope this round |

The references are DC-format design mocks containing **sample data**
(`$23,400`, `14 calls today`, named callers, `(612) 555-0184`). Per the brief,
composition transfers; sample data does **not**. Truthful empty states replace it.

---

## 2. Surface-by-surface comparison

### Dashboard — REBUILD

`client/src/dashboard.jsx` is 83 lines against a 225-line reference.

| Reference element | Current state |
|---|---|
| Left nav rail, 11 items, active-item edge marker | Absent (delegated to `AppShell`) |
| Operator toggle in top bar, bordered, glow when live, animated knob | Present but demoted below `PageHeader` as a plain `<section>` |
| Priority-action hero ("QUOTE REQUESTS WAITING") | **Absent** |
| Four-counter grid | **Absent** |
| Call feed with live pulse row + history rows | **Absent** |
| Mobile nav strip, `isMobile < 860px` breakpoint | Absent |

Two inversions beyond the audit's wording:

1. **Hero slot is spent on the business name.** `PageHeader` renders
   `state.account.businessName` as the dominant element. The reference spends
   that slot on the highest-priority action requiring attention.
2. **Blocker rendering.** `dashboard.jsx` renders
   `service.missingOwnerLabels.join('; ')` inside a `<small>` **nested in a
   `<button>`**. Because the labels are full authoritative sentences, this
   produces a paragraph inside a tap target. This is the "semicolon wall"
   and it is worse on mobile than the audit implies.

Verdict: REBUILD. Retain `toggle()` logic and the simulated/real branching —
those are correct and carry the production guard.

### Price book — REBUILD (composition), RETAIN (validation)

`client/src/pricebook.jsx` is 616 lines with **zero** disclosure primitives:

```
grep -c "collaps|accordion|<details|expanded|isOpen"
  design-reference/pricebook-editor/index.html : 3
  client/src/pricebook.jsx                     : 0
```

The reference disclosure pattern, to be reproduced exactly:

```
<details class="disclose">
  <summary>
    <span>{title}</span>
    <span class="muted">{subtitle}</span>     <!-- e.g. "Defaults are set. Adjust only if your jobs differ" -->
    <span class="mono">{statusChip}</span>    <!-- e.g. "DEFAULTS", "2 SET" -->
    <span class="caret">▸</span>
  </summary>
  ...
</details>
```

Regions confirmed in the reference: Quantity factors (Class 2), Good/Better/Best
tiers, Tax. Each carries a right-side status chip. Per the brief, any collapsed
region containing a blocker must show that in the chip and support direct
navigation — the reference chip slot is where that goes.

Verdict: REBUILD composition. RETAIN all validation, per-field confirmation,
and shaped-input mechanics.

### Label weight — RULING APPLIED

The brief's ruling (short trade title primary, authoritative sentence verbatim
beneath as supporting copy) is approved and unambiguous. Source of the
authoritative sentences is `server/priceBookMetadata.js` lines 40–47. They must
be preserved verbatim; only their rendered prominence changes.

### Onboarding — REBUILD

756 lines of flat form panels. Reference is 180 lines with per-step momentum.
Locked behavior (simulated telephony disclosures, step gating) must not change.

### Motion / responsive — RESTYLE

`styles.css`: 5 `transition` occurrences, 5 `@media` queries.
References: 6 (pricebook) + 7 (onboarding) transitions. Reduced-motion must be honored.

---

## 3. Functional regression: product-offering coverage — **FIXED THIS ROUND**

**Root cause.** `server/priceBookMetadata.js` defined flooring and siding
shaped-key domains as CLOSED with all keys required:

```js
'SIDING_REPLACEMENT.laborPerSqft': { keys:['vinyl','fiber_cement','wood','metal'], ... }
```

`shapedPricingMissing()` in `priceBookService.js` used the full `domain.keys`
list as `requiredKeys`, so activation demanded a price for every supported type.
A vinyl-only contractor was blocked by fiber cement, wood and metal.

**Fix.** Added `ownerSelectable:true` to the four flooring and two siding
product domains. In `shapedPricingMissing`, an owner-selectable domain derives
`requiredKeys` from **keys the owner actually populated** rather than the full
supported list.

**What was deliberately NOT loosened:**

- The write path still rejects keys outside `domain.keys` (unchanged).
- Every **enabled** type is still validated in full — a type with labor but no
  material still blocks activation.
- Zero/blank inside an enabled type is still not a valid price.
- An empty offering map still cannot activate (at least one required).
- `keys:null` domains, `nested` Small/Medium/Large shapes, condition domains
  and the mandated flat-roof `average` fallback are untouched.
- Mowing frequency untouched per the brief.

**Quote-time behavior was already correct.** `shapedKeyMissing()` in
`quoteEngine.js` already returns `ESTIMATE_REQUIRES_REVIEW` for a requested key
with no positive price, and never substitutes another product's rate. Verified
by new regression, not assumed.

**Negative control.** With the fix reverted in place, the new subset test fails
(89/90); with it applied, 90/90. The test is load-bearing, not decorative.

---

## 4. Local-preview production guard

`server/src/previewMode.js` exists and `dashboard.jsx` branches on
`dashboard.operator.simulated` to route to `/api/dev/preview/operator` instead
of `/api/operator/toggle`. Guard **not exhaustively traced** this round —
flagged for the implementation session.

---

## 5. Conflicts requiring owner decision

1. **Reference sample data vs. no-fabrication rule.** The dashboard reference's
   counters, feed and dollar values are mock data. The brief forbids fabricating
   them. Composition must be built with truthful empty states — the reference
   cannot be copied literally here. Confirm this reading before implementation.
2. **`design-reference/dashboard/` vs `dashboard-live/`.** Two dashboard
   references exist. Which is authoritative for the default (non-live) state is
   not stated in the brief.

---

## 6. Not verified in this session

No display or browser was available. The following remain **outstanding**:

- All visual QA at desktop and 375px
- All 13 required screenshot categories
- Rendered comparison against references
- Horizontal overflow, clipped matrices, sticky-control overlap
- Seeded local preview walkthrough

These require a session that can render the application.
