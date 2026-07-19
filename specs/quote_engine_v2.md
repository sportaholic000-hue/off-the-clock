# OFF THE CLOCK AI — QUOTE ENGINE v2
# Give this to the build agent as a single message.
# Build ONLY what is described here. Backend only.
# No UI changes. Do not touch anything already built.
#
# This spec supersedes all previous quote engine specs.
# If any instruction in this document appears to conflict
# with another, STOP and flag it — do not resolve it silently.

=======================================================
TASK
=======================================================
Build the quote engine: the mathematical brain behind all
job quoting. The voice agent, website widget, and owner
self-quoting all call this same engine.

Files to create:
  /server/quoteEngine.js       ← core pipeline
  /server/quoteTemplates.js    ← all service formulas
  /server/priceBookService.js  ← load/save price books
  /server/taxJurisdiction.js   ← jurisdiction → tax mode mapping
  /server/quoteLog.js          ← SQLite quote logging
  /data/pricebooks/            ← create empty directory

Routes to add to server.js:
  POST /api/quote/calculate     ← main quote endpoint
  POST /api/business/jurisdiction ← set owner tax jurisdiction
  POST /api/pricebook/suggest   ← AI price book builder
  POST /api/pricebook/save      ← save owner price book
  GET  /api/pricebook/:ownerId  ← load owner price book

=======================================================
PRICING PHILOSOPHY — read before writing any formula
=======================================================
Two classes of numbers exist in this engine. Never confuse them.

CLASS 1 — PRICES AND RATES (what the owner charges).
  NO system defaults, ever. Owner must enter their own numbers.
  Missing required price → ESTIMATE_REQUIRES_REVIEW. Never guess.
  Examples: laborPerSquare, materialPerSqft, gatePrice, hourly rates.

CLASS 2 — QUANTITY/PHYSICS FACTORS (how much stuff a job takes).
  Industry-standard defaults ARE allowed, because they describe
  physical reality, not the owner's pricing. Every Class 2 default
  MUST be: (a) declared as a named constant with a comment,
  (b) stored per-service in the price book so the owner can
  override it in the dashboard, (c) visible in the dashboard
  with its default value shown.
  Examples: waste factors, mulch overage, pitch area factors,
  concrete ordering overage, door/window deduction sizes.

=======================================================
JURISDICTION & TAX SETUP (taxJurisdiction.js)
=======================================================
During sign-up the owner selects country + state/province.
POST /api/business/jurisdiction
  Auth: JWT required
  Body: { country: "US"|"CA", region: string }  // 2-letter code

resolveJurisdiction(country, region) returns:
  { taxMode, taxPercent, locked, needsOwnerConfirmation, note }

taxMode is one of exactly three values:
  "TAX_ALL"        — tax applies to the entire pre-tax job total
                     (all line items + markup)
  "TAX_MATERIALS"  — tax applies to taxable line items plus the
                     markup apportioned to them
  "TAX_NONE"       — no customer-facing tax line (owner pays tax
                     at material purchase; it is baked into rates)

LOOKUP TABLE — prefill ONLY what is certain:

CANADA (GST/HST is charged on the contractor's entire invoice —
labor AND materials AND markup — so Canada is always TAX_ALL):
  ON → { taxMode:"TAX_ALL", taxPercent:13, locked:false }
  NB → { taxMode:"TAX_ALL", taxPercent:15, locked:false }
  NL → { taxMode:"TAX_ALL", taxPercent:15, locked:false }
  PE → { taxMode:"TAX_ALL", taxPercent:15, locked:false }
  NS → { taxMode:"TAX_ALL", taxPercent:14, locked:false }
  AB, NT, NU, YT → { taxMode:"TAX_ALL", taxPercent:5, locked:false }
  BC, SK, MB, QC → { taxMode:"TAX_ALL", taxPercent:5,
    needsOwnerConfirmation:true,
    note:"Your province has PST/QST in addition to GST. PST
    treatment of contractor work varies by province and job type.
    Confirm your combined rate with your accountant and update it
    here." }

UNITED STATES:
  OR, MT, NH, DE, AK → { taxMode:"TAX_NONE", taxPercent:0 }
    // no state sales tax
  ALL OTHER STATES → do NOT prefill a mode or rate. Contractor
    sales-tax treatment varies by state and by job type, and this
    system must never guess tax rules. Instead, onboarding asks
    the owner ONE question:

    "How do you handle sales tax on customer invoices?"
      (a) "I pay sales tax when I buy materials and don't add a
          tax line to customer invoices."      → TAX_NONE, rate 0
      (b) "I charge customers sales tax on the materials portion."
                                               → TAX_MATERIALS,
                                                  owner enters rate
      (c) "I charge sales tax on the entire job."
                                               → TAX_ALL,
                                                  owner enters rate
    Default preselection for US owners: option (a) — the most
    common arrangement — but the owner must click through the
    question; it is never silently applied.

Store the result in businessDefaults.taxMode and
businessDefaults.taxPercent. The math engine consumes ONLY these
two fields — all jurisdiction logic stays in taxJurisdiction.js.
The owner can change mode/rate any time in the dashboard.
Dashboard must show: "Tax settings are your responsibility.
Off The Clock applies the mode and rate you set — it does not
provide tax advice."

=======================================================
DATA STRUCTURE
=======================================================

/data/pricebooks/[ownerId].json format:
{
  "ownerId": "string",
  "updatedAt": "ISO string",
  "defaults": {
    "markupPercent": 30,
    "markupMode": "markup",        // "markup" | "margin"
    "overheadFixed": 0,
    "minimumJobPrice": 0,
    "travelFee": 0,
    "disposalFee": 0,
    "permitFee": 0,
    "taxMode": "TAX_NONE",         // set via jurisdiction flow
    "taxPercent": 0,
    "rangeBufferPercent": 10,      // NOT 5 — see STEP 9
    "laborHourlyRate": 0,
    "peakMonths": [],
    "peakSurchargePercent": 0,
    "markupApplies": {             // which categories get markup
      "labor": true, "material": true, "removal": true,
      "prep": true, "addon": true, "equipment": true,
      "travel": true, "disposal": true,
      "permit": false,             // permits are pass-through
      "overhead": true
    }
  },
  "services": [
    {
      "id": "uuid",
      "service": "string",
      "serviceType": "string",
      "low": 0, "high": 0, "unit": "string",
      "taxable": true,
      "minimumJob": 0,             // ENFORCED — see STEP 8
      "active": true,
      "allowAssumptionBasedQuotes": false,
      "pricing": {
        // service-specific pricing fields (Class 1 — owner enters)
        // and quantity factors (Class 2 — defaults shown, overridable)
      },
      "tiers": [                   // OPTIONAL good/better/best
        // { "name": "Good",   "overrides": { field: valueCents, ... } }
        // { "name": "Better", "overrides": { ... } }
        // { "name": "Best",   "overrides": { ... } }
        // Max 3. overrides replace matching keys in pricing for
        // that tier's calculation run. Empty/absent = single-price.
      ],
      "peakMonths": [],
      "peakSurchargePercent": 0,
      "disclaimer": null
    }
  ]
}

CRITICAL: Store ALL money as integers in cents.
$8,500 = 850000. Convert to dollars only at API boundaries.

MARKUP vs MARGIN (markupMode):
  "markup": price = cost × (1 + markupPercent/100)
  "margin": price = cost / (1 − markupPercent/100)
  Dashboard must show the live equivalence next to the field,
  e.g. "30% markup = 23.1% margin". Contractors who think in
  margin but enter markup underprice by ~7–10 points — this
  toggle exists to prevent that.

priceBookService.js functions:
  loadPricebook(ownerId):
    path = /data/pricebooks/[ownerId].json
    if file not found: return { services: [], defaults: {} }
    return parsed JSON
  savePricebook(ownerId, data):
    data.updatedAt = new Date().toISOString()
    write to /data/pricebooks/[ownerId].json
    return { success: true }
  hasPricing(ownerId):
    book = loadPricebook(ownerId)
    return book.services.filter(s => s.active).length > 0

quoteLog.js — SQLite (better-sqlite3), NOT JSON append.
  Table quotes: id, ownerId, quoteId, serviceType,
  customerInputsJson, resultJson, callerType, urgency, createdAt.
  JSON-file appends corrupt under concurrent voice calls; this
  product takes concurrent calls by design.

=======================================================
QUOTE ENGINE PIPELINE (quoteEngine.js)
=======================================================

function generateQuote({
  serviceType, customerInputs, ownerPricing,
  businessDefaults, callerType
})

STEP 0 — INITIALIZE
  appliedRules = []          // ALWAYS initialized here
  urgencyFlags = []
  estimationUsed = false     // set true by any derived/assumed
                             // quantity; drives range widening

STEP 1 — VALIDATE CUSTOMER INPUTS
  requiredFields = getRequiredFields(serviceType, customerInputs)
  // NOTE: takes customerInputs — required fields are CONDITIONAL
  // (e.g. roomCount only required when trimIncluded).
  missingCustomerFields = fields that are undefined, null,
    or "unsure" → collect friendly labels.
  if any missing → return {
    resultType: "ESTIMATE_REQUIRES_REVIEW",
    missingCustomerFields, missingOwnerFields: [],
    reviewReason: "Required project details were not provided.",
    quoteId: uuid() }

STEP 2 — VALIDATE OWNER PRICING
  requiredOwnerFields = getRequiredOwnerFields(serviceType,
    customerInputs)   // ALSO conditional on customer answers
  missing = fields that are undefined, null, or 0
  (Class 2 quantity factors are exempt from the zero check only
   where 0 is meaningful; waste factors may legitimately be 0.)
  OWNER RULING (2026-07-19): minimum fields — minimumJob,
   repairMinimum, minimumServiceCharge — must be PRESENT but 0
   is a valid value meaning "no minimum". Rates keep the
   zero-means-missing rule. A $0/unit rate is unconfigured; a
   $0 minimum is a deliberate choice.
  if any missing → return ESTIMATE_REQUIRES_REVIEW with
    missingOwnerFields and reviewReason: "Pricing not fully
    configured for this service. Owner follow-up required."

STEP 2b — SCOPE vs ADD-ON RULE (replaces old add-on rule)
  Every optional line item in every template is classed as
  SCOPE or ADDON in its template definition.
  SCOPE  = the customer's answers put it in the job; a quote
           without it is wrong. Missing owner price →
           ESTIMATE_REQUIRES_REVIEW (name the field).
  ADDON  = optional extra. Missing owner price → skip the line,
           push "[name] skipped: price not configured" to
           appliedRules, AND append to the customer-visible
           disclaimer: "This estimate does not include: [names]."
  Never silently underbid scope. Never kill a quote over an addon.
  OWNER RULING (2026-07-19): fields commented // ADDON in any
   template's getRequiredOwnerFields() are NEVER hard-fail
   required fields — the ADDON comment wins over list placement.
   When the customer selected the addon and its price is missing,
   apply this STEP 2b behavior: skip the line, push "[name]
   skipped: price not configured" to appliedRules, and append
   "This estimate does not include: [names]." to the
   customer-visible disclaimer. Applies to pondingWaterSurcharge,
   baggingSurchargePercent, and mowing edgingPerLinearFoot.

STEP 3 — TIER LOOP
  tiers = ownerPricing.tiers?.length
    ? ownerPricing.tiers
    : [{ name: null, overrides: {} }]
  For each tier (max 3):
    effectivePricing = { ...ownerPricing.pricing, ...tier.overrides }
    run STEPS 4–9 with effectivePricing
    collect { tierName, lowEstimate, highEstimate, midEstimate,
              priceDrivers, lineItems }
  If a tier's overrides remove/zero a REQUIRED price field, that
  tier alone fails validation: exclude it and push
  "[tierName] tier skipped: incomplete pricing" to appliedRules.
  If ALL tiers fail → ESTIMATE_REQUIRES_REVIEW.
  The top-level result mirrors the FIRST valid tier (or the
  single-price run) for backward compatibility; all valid tiers
  go in result.options[].

STEP 4 — CALCULATE
  calculateService(serviceType, customerInputs,
    effectivePricing, businessDefaults)
  → { lineItems[], laborSubtotal }

  lineItems format:
  { name, category, amountCents (integer), taxable (boolean),
    ownerVisible: true, customerVisible: false }

  categories: labor | material | removal | prep | addon |
    equipment | travel | disposal | permit | overhead |
    markup | tax | surcharge | minimum_adjustment

  TAXABLE DEFAULTS BY CATEGORY (used by TAX_MATERIALS mode;
  TAX_ALL ignores per-line flags by definition):
    material → true, addon → true, all others → false.
    Owner can override per line category per service.

STEP 5 — SEASONAL SURCHARGE
  currentMonth = new Date().getMonth() + 1
  peak months / surcharge %: use the SERVICE-level values if set,
  else businessDefaults. If current month is a peak month:
    surchargeCents = round(sum of labor-category cents ×
      peakSurchargePercent/100)
    push { name:"Peak season adjustment", category:"surcharge",
      taxable:false }

STEP 6 — MARKUP
  markupBase = sum of line items whose category has
    businessDefaults.markupApplies[category] === true
  if markupMode === "markup":
    markupCents = round(markupBase × markupPercent/100)
  if markupMode === "margin":
    markupCents = round(markupBase / (1 − markupPercent/100))
                  − markupBase
  push { name:"Markup", category:"markup", taxable:false }
  subtotalCents = sum of all line items (now incl. markup)

STEP 7 — TAX (mode-dependent; order differs by mode)

  if taxMode === "TAX_NONE":
    no tax line. Skip to STEP 8, order: minimum applies to
    subtotal directly.

  if taxMode === "TAX_MATERIALS":
    taxableBase = sum of line items where taxable === true
    // apportion markup to the taxable share so tax is charged
    // on the customer PRICE of materials, not raw cost:
    taxableMarkupBase = sum of taxable items in
      markup-eligible categories
    taxableMarkup =
      markupMode==="markup"
        ? round(taxableMarkupBase × markupPercent/100)
        : round(taxableMarkupBase / (1−markupPercent/100))
          − taxableMarkupBase
    taxCents = round((taxableBase + taxableMarkup)
      × taxPercent/100)
    push tax line; subtotal += taxCents
    THEN apply STEP 8 minimum to the after-tax subtotal.

  if taxMode === "TAX_ALL":
    // Minimum must be applied PRE-tax so tax is computed on the
    // adjusted amount (Canada: tax is owed on what you charge):
    apply STEP 8 minimum to the pre-tax subtotal FIRST,
    then taxCents = round(subtotalCents × taxPercent/100),
    push tax line, subtotal += taxCents. Skip STEP 8 below.

STEP 8 — MINIMUM JOB PRICE (per-service minimums ENFORCED)
  effectiveMinimumCents = max(
    businessDefaults.minimumJobPrice || 0,
    ownerPricing.minimumJob || 0,
    effectivePricing.repairMinimum || 0,
    effectivePricing.minimumServiceCharge || 0 )
  // all already in cents — never multiply by 100
  if subtotalCents < effectiveMinimumCents:
    push { name:"Minimum Price Adjustment",
      category:"minimum_adjustment",
      amountCents: effectiveMinimumCents − subtotalCents,
      taxable:false }
    subtotalCents = effectiveMinimumCents
    appliedRules.push("Minimum job price applied")

STEP 9 — RANGE (with confidence widening)
  effectiveBufferPercent = businessDefaults.rangeBufferPercent
  if estimationUsed: effectiveBufferPercent += 5
  cap effectiveBufferPercent at 25
  midCents  = round(subtotalCents/1000)*1000   // nearest $10
  lowCents  = round(midCents×(1−effectiveBufferPercent/100)/1000)*1000
  highCents = round(midCents×(1+effectiveBufferPercent/100)/1000)*1000
  // estimationUsed is set by templates whenever a quantity was
  // assumed or derived rather than customer-measured: size
  // categories, derived roof area, estimated accessory/trim/
  // edging LF, unknown layers, average membrane, assumed
  // dimensions. Unverified inputs get a wider honest range —
  // never false precision.

STEP 10 — PRICE DRIVERS
  Sort line items by amountCents desc; take top 4 labor/material.
  Convert to customer-safe strings. NEVER expose: labor rates,
  material unit costs, markup %, overhead, margin.
  Examples: "Roof size: [X] squares", "[N] layer(s) of tear-off
  included", "Steep pitch adjustment", "[N]-story access
  adjustment", "Existing [material] removal".
  ALSO append every mandatory disclosure driver a template
  generated (e.g. "Membrane type unconfirmed — average pricing
  used", "Decking replacement, if needed, billed at $X/sheet").

STEP 11 — DISCLAIMER
  disclaimer = ownerPricing.disclaimer ||
  "This preliminary estimate is based on the project details
  provided and covers the described scope only. Final pricing is
  confirmed after review and, when needed, in-person
  verification. Additional scope, unforeseen conditions, or
  changes to project details may affect the final price."
  Append the STEP 2b exclusion sentence when any addon was
  skipped.

STEP 12 — RETURN
  return {
    resultType: "INSTANT_ESTIMATE_READY",
    lowEstimate, highEstimate, midEstimate,   // dollars
    options: [ { tierName, lowEstimate, highEstimate,
                 midEstimate, priceDrivers } ],  // 1–3 entries
    priceDrivers, lineItems, appliedRules,
    urgencyFlags,          // e.g. ["Active leak reported"]
    rangeBufferUsed: effectiveBufferPercent,
    disclaimer, quoteId: uuid()
  }
  // Arrays are always the real generated arrays — never
  // placeholders. Empty is [] .
  generateQuote() returns EXACTLY one of two resultTypes.

=======================================================
GLOBAL FORMULA RULES (quoteTemplates.js)
=======================================================
- Never double count labor.
- pitchMultiplier: roofing labor + tearOff ONLY
- storyMultiplier: labor + removal ONLY
- accessMultiplier: labor, removal, equipment ONLY
- terrainMultiplier: fencing labor + fence removal labor ONLY
- finishMultiplier: extra finish labor ONLY (never base labor twice)
- wasteFactor / overage factors: material quantities ONLY
- Tax: per STEP 7 modes. Under TAX_MATERIALS, tax applies to
  taxable line items PLUS the markup apportioned to them (this is
  intentional and correct — tax is charged on the customer price
  of materials). Tax never applies to labor-category, travel,
  disposal, permit, overhead, or surcharge lines, nor to the
  non-taxable share of markup. Under TAX_ALL, tax applies to the
  entire pre-tax total by definition.
- Minimum: per STEP 7/8 ordering (pre-tax under TAX_ALL,
  post-tax otherwise).
- Travel, disposal, permit, overhead: flat amounts, NO multiplier
  ever. (Per-quantity disposal overrides below replace the flat
  fee; they are still never multiplied by job multipliers.)
- DISPOSAL SCALING (available to any template): if the owner sets
  a per-quantity disposal price for a service
  (disposalPerSquare / disposalPerSqft / disposalPerLF), it
  replaces businessDefaults.disposalFee for that service. Real
  disposal scales with debris volume; a flat fee across a
  12-square repair and a 60-square 2-layer tear-off is wrong.
- ALL hardcoded multiplier tables below (pitch, story, terrain,
  height, access, slope, finish) are Class 2 DEFAULTS: store them
  per service in pricing, show them in the dashboard, let the
  owner override. The values shipped are industry-plausible
  midpoints, not gospel.

CENTS RULES — follow exactly:
- Owner pricing fields and business defaults are stored in cents.
  /api/pricebook/save converts dollars→cents on write;
  GET converts cents→dollars on read.
- Inside the engine and templates: NEVER multiply a stored
  pricing field by 100. It is already cents.
- amountCents = Math.round(quantity × pricingFieldCents × multiplier)
- Quantities (sqft, squares, LF, hours, count) are plain numbers.

SIZE CATEGORY ASSUMPTION RULE (applies to every template AND to
CUSTOM per_sqft / per_LF paths):
  if the size input is a category (small/medium/large) rather
  than a measurement:
    if !ownerPricing.allowAssumptionBasedQuotes →
      ESTIMATE_REQUIRES_REVIEW, reviewReason: "Exact measurements
      required. Please provide actual square footage or linear
      footage for an accurate quote."
    else → proceed, set estimationUsed = true, push
      "Size estimated from customer description" to appliedRules.
  Dashboard label: "Allow size estimates (small/medium/large)
  instead of exact measurements".

── ROOFING_REPLACEMENT ──────────────────────────────

getRequiredFields(customerInputs):
  base: ['roofSizeInput','roofSizeMethod','roofType','pitch',
    'stories','existingLayers','roofComplexity','serviceScope']
  if serviceScope=partial: add 'partialPercent'
  // roofSizeMethod: 'roof_measured' | 'home_floor_area' | 'assumption'
  // roofComplexity: 'simple' | 'moderate' | 'complex'
  //   voice prompt: "Is the roof a simple A-shape, does it have
  //   some hips and valleys, or is it really cut up with dormers
  //   and multiple sections?"

getRequiredOwnerFields():
  ['laborPerSquare','materialCostPerSquare','tearOffPerSquare',
   'underlaymentPerSquare']
  Class 2 (defaults, owner-overridable):
   wasteSimple=0.10, wasteModerate=0.13, wasteComplex=0.18
   pitchAreaFactor: low=1.05, medium=1.12, steep=1.23, very_steep=1.40
   overhangFactor=1.08
   pitchMultiplier: low=1.00, medium=1.15, steep=1.25, very_steep=1.40
   storyMultiplier: 1→1.00, 2→1.10, 3→1.20
  accessoryPricingMode: 'per_square_allin' (default) | 'itemized'
  if itemized, required: starterPerLF, dripEdgePerLF, ridgeCapPerLF
  Optional (ADDON class): deckingPerSheet, disposalPerSquare

calculate():
  // ---- DERIVE ROOF AREA (the #1 accuracy step) ----
  if roofSizeMethod === 'roof_measured':
    roofAreaSqft = roofSizeInput          // actual roof surface
  if roofSizeMethod === 'home_floor_area':
    // Homeowners quote living area, not roof surface. Convert:
    footprintSqft = roofSizeInput / stories
    roofAreaSqft = footprintSqft × pitchAreaFactor[pitch]
                   × overhangFactor
    estimationUsed = true
    appliedRules.push("Roof area derived from home size, stories,
      and pitch — verified at inspection")
  if roofSizeMethod === 'assumption':
    small=1200, medium=2000, large=3000 (roof surface sqft)
    apply SIZE CATEGORY ASSUMPTION RULE
  // Voice agent MUST ask: "Is that the measured roof size, or
  // your home's floor area?" — never assume.

  if serviceScope=partial: roofAreaSqft ×= (partialPercent/100)

  roofSquares = roofAreaSqft / 100
  wasteFactor = { simple: wasteSimple, moderate: wasteModerate,
                  complex: wasteComplex }[roofComplexity]
  materialSquares = roofSquares × (1 + wasteFactor)

  existingLayersCount: "1"→1, "2"→2, "3+"→3
  tearOffSquares = roofSquares × existingLayersCount

  laborCents = round(roofSquares × laborPerSquare
    × pitchMultiplier × storyMultiplier)
  materialCents = round(materialSquares × materialCostPerSquare)
  tearOffCents = round(tearOffSquares × tearOffPerSquare
    × pitchMultiplier × storyMultiplier)
  underlaymentCents = round(materialSquares × underlaymentPerSquare)
  // underlayment uses WASTE-ADJUSTED squares — it wastes like
  // every other material.

  // ---- ACCESSORIES ----
  if accessoryPricingMode === 'per_square_allin':
    no accessory lines. Dashboard label for materialCostPerSquare
    MUST read: "Your all-in installed material price per square,
    INCLUDING starter, drip edge, ridge cap, flashing, and vents."
  if accessoryPricingMode === 'itemized':
    // Derive lengths from plan-view footprint. Never make these
    // required customer questions — homeowners can't answer them
    // and every call would dead-end.
    footprint = roofAreaSqft / pitchAreaFactor[pitch]
    eavesRakeLF = round(4 × sqrt(footprint) × 1.10)  // perimeter est.
    ridgeLF = round(sqrt(footprint) × 1.2)
    Accept exact values from customerInputs when provided
    (owner self-quoting will have them).
    If derived: estimationUsed = true, appliedRules.push(
      "Accessory lengths estimated from roof size")
    starterCents = round(eavesRakeLF × starterPerLF)      material
    dripEdgeCents = round(eavesRakeLF × dripEdgePerLF)    material
    ridgeCapCents = round(ridgeLF × ridgeCapPerLF)        material

  // ---- DECKING DISCLOSURE (ADDON) ----
  if deckingPerSheet set:
    push priceDriver: "Decking replacement, if needed, billed at
    $[deckingPerSheet]/sheet" — no line item unless owner quoting
    with a known sheet count. Rotten decking is the #1 roofing
    change order; disclosing the unit price up front prevents the
    fight later.

  // ---- DISPOSAL ----
  if disposalPerSquare set:
    disposalCents = round(tearOffSquares × disposalPerSquare)
  else disposalCents = businessDefaults.disposalFee

  + travel, permit, overhead flat lines.
  Line items: labor(labor), field materials(material,taxable),
  tear-off(removal), underlayment(material,taxable),
  accessories(material,taxable) when itemized, travel, disposal,
  permit, overhead.

── ROOFING_REPAIR ───────────────────────────────────

getRequiredFields():
  ['repairType','affectedArea','roofType','pitch','stories',
   'leakPresent']
VALIDATION: repairType==='unknown' → ESTIMATE_REQUIRES_REVIEW,
  reviewReason: "Leak source is unknown. An in-person inspection
  is needed before we can estimate this repair accurately."
if leakPresent === true:
  urgencyFlags.push("Active leak reported — customer flagged
  as urgent"); also store urgency in the quote log.

getRequiredOwnerFields():
  ['laborHourlyRate','repairMinimum','repairHours',
   'repairMaterialAllowance']
  // repairHours keyed [repairType][sizeCategory];
  // repairMaterialAllowance keyed [repairType]. Owner sets all.
  // repairMinimum IS enforced — engine STEP 8.

calculate():
  affectedAreaCategory: number <50→small, 50–200→medium,
    >200→large; category strings map directly.
  pitchMultiplier / storyMultiplier: same Class 2 defaults as
  ROOFING_REPLACEMENT.
  laborCents = round(repairHours[repairType][cat]
    × pitchMultiplier × storyMultiplier × laborHourlyRate)
  materialCents = round(repairMaterialAllowance[repairType])
  + travel, disposal, permit, overhead flat.

── INTERIOR_PAINTING ────────────────────────────────
// BASIS: FLOOR SQUARE FEET. This is deliberate and must not be
// changed: homeowners know their floor area; most painters price
// per floor sqft. Every rate label says FLOOR area explicitly.

getRequiredFields(customerInputs):
  base: ['areaInputMethod','wallHeight','surfaceCondition',
    'coats','ceilingsIncluded','trimIncluded']
  if areaInputMethod=sqft:  add 'floorAreaSqft'
  if areaInputMethod=rooms: add 'roomCount'  // roomSizes optional
  if trimIncluded:          add 'roomCount'  // needed either path

getRequiredOwnerFields(customerInputs):
  base: ['laborPerFloorSqft','materialPerFloorSqft2Coats',
    'minimumJob']
  // Dashboard labels (exact text):
  //  laborPerFloorSqft: "Your labor price per square foot of
  //   FLOOR area — walls only, two coats, standard 8-ft ceilings."
  //  materialPerFloorSqft2Coats: "Your paint/material cost per
  //   square foot of FLOOR area for two coats on walls."
  if surfaceCondition ≠ 'good': add 'laborHourlyRate'   // SCOPE
  if ceilingsIncluded: add 'ceilingLaborPerFloorSqft'   // SCOPE
  if trimIncluded: add ['trimLaborPerLF','trimMaterialPerLF',
    'trimLinearFeetPerRoom']                            // SCOPE
  Class 2 defaults (overridable): roomFloorSqft map
    small=120, medium=200, large=320
  coatLaborFactor:    1 coat=0.70, 2=1.00, 3=1.30
  coatMaterialFactor: 1 coat=0.50, 2=1.00, 3=1.50
  wallHeightMultiplier: standard=1.00, high=1.10, vaulted=1.25

calculate():
  if areaInputMethod=sqft: floorArea = floorAreaSqft
  if areaInputMethod=rooms:
    floorArea = roomSizes provided
      ? sum of mapped roomFloorSqft values
      : roomCount × roomFloorSqft.medium
    estimationUsed = true (rooms path is an estimate)
    apply SIZE CATEGORY ASSUMPTION RULE

  wallLaborCents = round(floorArea × laborPerFloorSqft
    × wallHeightMultiplier[wallHeight]
    × coatLaborFactor[coats])
  // height multiplier on WALL labor+material only — taller walls
  // mean more wall per floor sqft. NEVER applied to ceilings.
  wallMaterialCents = round(floorArea × materialPerFloorSqft2Coats
    × wallHeightMultiplier[wallHeight]
    × coatMaterialFactor[coats])

  prepHours: good=0, fair=floorArea×0.015, poor=floorArea×0.035
  // Class 2 defaults, per FLOOR sqft, overridable
  prepCents = round(prepHours × laborHourlyRate)   // category: prep

  if ceilingsIncluded:
    // ceiling area = floor area. Exact. No ratio, no multiplier.
    ceilingLaborCents = round(floorArea × ceilingLaborPerFloorSqft)
    ceilingMaterialCents = round(floorArea
      × materialPerFloorSqft2Coats × 0.5
      × coatMaterialFactor[coats])
    // 0.5: ceilings take roughly half the paint of two walls of
    // coverage per floor sqft — Class 2 constant, overridable as
    // ceilingMaterialFactor.

  if trimIncluded:
    trimLF = roomCount × trimLinearFeetPerRoom
    trimLaborCents = round(trimLF × trimLaborPerLF)
    trimMaterialCents = round(trimLF × trimMaterialPerLF)
    // NO hardcoded trim price anywhere. Owner sets all three.

  + travel, disposal, permit, overhead flat.

── EXTERIOR_PAINTING ────────────────────────────────
// ONE condition input drives prep. The old spec stacked a prep
// multiplier AND a condition multiplier measuring the same
// thing (worst case 1.69× labor). Do not reintroduce that.

getRequiredFields(customerInputs):
  base: ['areaInputMethod','stories','surfaceCondition','coats']
  if areaInputMethod=sqft: add 'exteriorAreaSqft'
    // "paintable exterior wall area"
  if areaInputMethod=homesize: add 'homeSizeCategory'

getRequiredOwnerFields(customerInputs):
  base: ['exteriorLaborPerSqft','materialPerSqftPerCoat',
    'minimumJob']
  // labels: "per square foot of PAINTABLE WALL area"
  if surfaceCondition ≠ 'good': add 'laborHourlyRate'   // SCOPE
  Class 2 defaults (overridable):
    paintableAreaMap keyed by homeSizeCategory × stories:
      1-story: small=900,  medium=1400, large=2000, xlarge=2800
      2-story: small=1400, medium=2200, large=3100, xlarge=4200
      3-story: multiply 2-story values × 1.4
    // exterior wall area scales with stories; a one-dimensional
    // home-size map ignores that and misquotes 2-story homes.
    storyMultiplier (labor): 1=1.00, 2=1.10, 3=1.20
    prepHoursPerSqft: fair=0.008, poor=0.02

calculate():
  if homesize: area = paintableAreaMap[homeSizeCategory][stories]
    estimationUsed = true; apply SIZE ASSUMPTION RULE
  laborCents = round(area × exteriorLaborPerSqft
    × storyMultiplier)
  prepCents = surfaceCondition==='good' ? 0 :
    round(area × prepHoursPerSqft[surfaceCondition]
      × laborHourlyRate)                         // category: prep
  effectiveCoats = coats + (surfaceCondition==='poor' ? 1 : 0)
  // poor surfaces need primer — one extra material coat
  if primer added: appliedRules.push("Primer coat added for
    surface condition")
  materialCents = round(area × materialPerSqftPerCoat
    × effectiveCoats)
  + travel, disposal, permit, overhead flat.

── FLOORING_INSTALL ─────────────────────────────────

getRequiredFields(customerInputs):
  base: ['sqft','sqftMethod','newFlooringType','existingFloorType',
    'removalNeeded','roomCount','layoutPattern','stairSteps']
  // layoutPattern: 'straight' | 'diagonal_or_pattern'
  // stairSteps: integer, 0 if none — the voice agent ALWAYS asks
  // "any stairs to cover?" Stairs are priced per step everywhere;
  // skipping the question makes multi-level quotes badly wrong.

getRequiredOwnerFields(customerInputs):
  base: ['laborPerSqft','materialPerSqft','minimumJob']
  if removalNeeded: add 'removalPerSqft'                 // SCOPE
  if stairSteps > 0: add 'perStepPrice'                  // SCOPE
  if underlayment applies (see table): add 'underlaymentPerSqft'
                                                         // SCOPE
  Optional ADDON: baseboardPerLF, transitionsEach,
    furnitureMovingFlat
  Class 2 defaults (overridable):
    wasteFactorByType: hardwood=0.10, laminate=0.08,
      vinyl_plank=0.08, carpet=0.10, tile=0.12
    patternWasteAdder: straight=0, diagonal_or_pattern=0.07
    roomComplexityMultiplier: avg room ≥300 sqft→1.00,
      150–300→1.10, <150→1.20   (avg = sqft/roomCount)

underlaymentTypes: hardwood=yes, laminate=yes, carpet=yes,
  vinyl_plank=check owner setting, tile=no
  // Underlayment for types that require it is SCOPE — a missing
  // price fails to review. It is never a silent skip.

calculate():
  if sqftMethod ≠ exact: small=300, medium=600, large=1200;
    apply SIZE ASSUMPTION RULE; estimationUsed = true
  effectiveWaste = wasteFactorByType[newFlooringType]
    + patternWasteAdder[layoutPattern]
  materialSqft = sqft × (1 + effectiveWaste)
  laborCents = round(sqft × laborPerSqft
    × roomComplexityMultiplier)
  materialCents = round(materialSqft × materialPerSqft)
  if removalNeeded: removalCents = round(sqft × removalPerSqft)
    // disposal: disposalPerSqft override supported (global rule)
  if underlaymentApplies:
    underlaymentCents = round(materialSqft × underlaymentPerSqft)
    // waste-adjusted quantity
  if stairSteps > 0:
    stairCents = round(stairSteps × perStepPrice)   // labor
  ADDONs (skip-with-disclosure if unpriced):
    baseboard: LF from customer or derived 4×sqrt(sqft)
      (estimationUsed=true if derived), transitions, furniture
      moving flat.
  + travel, disposal, permit, overhead flat.

── FLOORING_REPLACEMENT ─────────────────────────────
Same as FLOORING_INSTALL plus:
  if subfloorIssues=true:
    subfloorCents = round(sqft × subfloorAllowancePerSqft)  //SCOPE
    appliedRules.push("Subfloor allowance included — final price
    confirmed after inspection")
    Still return INSTANT_ESTIMATE_READY.
    // This disclosure is mandatory. Do not strip it.

── FENCING_INSTALL ──────────────────────────────────

getRequiredFields():
  ['linearFeet','lfMethod','fenceType','fenceHeight','gateCount',
   'cornerCount','terrainSlope']
  // cornerCount — voice prompt: "How many corners does the fence
  // line turn?" Every corner is a post the straight-run formula
  // misses; every gate needs two.

getRequiredOwnerFields():
  ['laborPerLinearFoot','materialPerLinearFoot','postSpacing',
   'postPrice','concretePerPost','postsIncludedInMaterial',
   'gatePrice','minimumJob']
  // concretePerPost label: "Concrete + digging cost per post at
  // your local frost/set depth." Frost-line depth (and post
  // length) lives inside the owner's number — the engine never
  // guesses regional frost depth.
  // gatePrice label: "Installed price per gate INCLUDING gate
  // posts' hardware; gate posts themselves are counted below."
  Class 2 defaults (overridable):
    heightMultiplierLabor:    4ft=0.85, 6ft=1.00, 8ft=1.20
    heightMultiplierMaterial: 4ft=0.80, 6ft=1.00, 8ft=1.35
    // 8ft is 33% more board than the 6ft baseline plus longer
    // posts — 1.20 on material under-prices tall privacy fence.
    terrainMultiplier (labor only): flat=1.00, moderate=1.15,
      steep=1.30

calculate():
  if lfMethod ≠ exact: small=100, medium=180, large=280;
    SIZE ASSUMPTION RULE; estimationUsed = true
  postCount = ceil(linearFeet/postSpacing) + 1
    + cornerCount + 2×gateCount
  laborCents = round(linearFeet × laborPerLinearFoot
    × heightMultiplierLabor × terrainMultiplier)
  materialCents = round(linearFeet × materialPerLinearFoot
    × heightMultiplierMaterial)
  if NOT postsIncludedInMaterial:
    postsCents = round(postCount × postPrice)       // material
  concreteFootingCents = round(postCount × concretePerPost)
                                                    // material
  gatesCents = round(gateCount × gatePrice)         // material
  + travel, disposal, permit, overhead flat.

── FENCING_REPLACEMENT ──────────────────────────────
Same as FENCING_INSTALL plus:
  getRequiredFields() adds 'oldFenceRemoval'
  if oldFenceRemoval: required owner 'removalPerLinearFoot' //SCOPE
    removalCents = round(linearFeet × removalPerLinearFoot
      × terrainMultiplier)      // terrain on removal labor only
    disposal: disposalPerLF override supported (global rule)

── CONCRETE_DRIVEWAY ────────────────────────────────

getRequiredFields(customerInputs):
  base: ['dimensionMethod','thickness','finishType',
    'demolitionNeeded','reinforcement','accessDifficulty',
    'baseNeeded']
  if dimensionMethod='exact': add 'length','width'
  if dimensionMethod='area_only': add 'areaSqft'
  if dimensionMethod='assumption': (small/medium/large)
  // baseNeeded default-suggested TRUE for driveways. A 4–6"
  // compacted gravel base is standard driveway scope; quotes
  // without it are structurally under-scoped.

getRequiredOwnerFields(customerInputs):
  base: ['laborPerSqft','concreteCostPerCubicYard',
    'formworkPerLF','minimumJob']
  if demolitionNeeded: add 'demolitionPerSqft'            // SCOPE
  if baseNeeded: add 'basePrepPerSqft'                    // SCOPE
    // label: "Excavation + compacted gravel base + grading,
    // per square foot."
  if reinforcement='wire_mesh': add 'wireReinforcementPerSqft'
                                                          // SCOPE
  if reinforcement='rebar': add 'rebarReinforcementPerSqft'
                                                          // SCOPE
  if finishType='stamped': add 'stampedMaterialPerSqft'   // SCOPE
    // color hardener, release agent, sealer — real material cost
    // the labor multiplier does not cover
  Class 2 defaults (overridable):
    concreteWasteFactor = 0.10
    // universal ordering practice: chute loss, uneven subgrade,
    // shrinkage. Never order exact yardage.
    assumedDrivewayWidthFt = 11
    finishMultiplier (EXTRA labor): broom=1.00, smooth=1.05,
      exposed_aggregate=1.20, stamped=1.50
    accessMultiplier (labor): easy=1.00, moderate=1.10,
      difficult=1.25
  // laborPerSqft label: "Include forming labor, expansion
  // joints, cure & seal in your per-sqft labor rate."

calculate():
  if dimensionMethod='exact':
    areaSqft = length × width
    perimeterLF = 2 × (length + width)
  if dimensionMethod='area_only':
    // driveways are long rectangles — never assume a square
    width = assumedDrivewayWidthFt
    length = areaSqft / width
    perimeterLF = 2 × (length + width)
    estimationUsed = true
    appliedRules.push("Driveway dimensions estimated from area")
  if dimensionMethod='assumption':
    small=400, medium=800, large=1600 sqft; derive dims as
    area_only; SIZE ASSUMPTION RULE; estimationUsed = true

  cubicYards = areaSqft × (thickness/12) / 27
    × (1 + concreteWasteFactor)

  finishExtraCents = round(areaSqft × laborPerSqft
    × (finishMultiplier − 1.00))
  laborCents = round(areaSqft × laborPerSqft × accessMultiplier)
    + finishExtraCents
  concreteCents = round(cubicYards × concreteCostPerCubicYard)
                                                     // material
  formworkCents = round(perimeterLF × formworkPerLF) // material
  if baseNeeded:
    basePrepCents = round(areaSqft × basePrepPerSqft) // prep
  if demolitionNeeded:
    demolitionCents = round(areaSqft × demolitionPerSqft
      × accessMultiplier)                             // removal
    disposal: disposalPerSqft override supported — concrete demo
    is the heaviest disposal in this product.
  if reinforcement: reinforcementCents = round(areaSqft ×
    [matching owner rate])                            // material
  if finishType='stamped':
    stampedMaterialCents = round(areaSqft
      × stampedMaterialPerSqft)                       // material
  + travel, disposal, permit, overhead flat.

── CONCRETE_PATIO_SLAB ──────────────────────────────
Same as CONCRETE_DRIVEWAY except:
  demolitionNeeded optional (not required)
  baseNeeded asked, default-suggested true
  assumption sizes: small=200, medium=400, large=800
  area_only fallback: assume square → side = sqrt(area),
    perimeter = 4×side (patios are near-square; driveways are not)

── LANDSCAPING_CLEANUP ──────────────────────────────

getRequiredFields():
  ['yardSize','debrisLevel','slope','haulAway']
getRequiredOwnerFields():
  ['cleanupBaseRatePerSqft','debrisPricing',
   'minimumServiceCharge']
  if haulAway: add 'haulAwayFee'                        // SCOPE
  // debrisPricing keyed light/moderate/heavy:
  //   { laborMultiplier, disposalFlat }  — owner sets, no defaults
  Class 2 default: slopeMultiplier (labor only):
    flat=1.00, moderate=1.15, steep=1.35

calculate():
  yardSqft: small=1500, medium=3500, large=6000, or number
    directly; category → SIZE ASSUMPTION RULE, estimationUsed
  laborCents = round(yardSqft × cleanupBaseRatePerSqft
    × debrisPricing[debrisLevel].laborMultiplier
    × slopeMultiplier)
  disposalCents = debrisPricing[debrisLevel].disposalFlat
  // ALREADY IN CENTS. Do NOT multiply by 100. The previous spec
  // multiplied here and turned a $150 fee into $15,000.
  if haulAway: haulingCents = haulAwayFee    // disposal category
  + travel, permit, overhead flat.

── LANDSCAPING_MULCH ────────────────────────────────

getRequiredFields(customerInputs):
  base: ['inputMethod','mulchArea','mulchDepth','mulchType',
    'bedCondition','edgingNeeded']
  if edgingNeeded: add 'edgeLF'
    // ASK for edge length — voice: "roughly how many feet of bed
    // edge?" Beds are long and narrow; deriving perimeter from
    // sqrt(area) under-counts a 3ft×100ft bed's edge by 3x.
    // If the customer can't say: edgeLF = 2 × (mulchArea/3) + 6
    // (assumes ~3ft-wide bed), estimationUsed = true,
    // appliedRules.push("Bed edge length estimated").
  if inputMethod='yards' AND bedCondition ≠ 'clean':
    add 'bedSqft'
    // bed prep is priced per sqft; yards of mulch say nothing
    // about bed size. The old spec multiplied yards by a
    // per-sqft rate here — nonsense math. Ask for bed sqft.

getRequiredOwnerFields(customerInputs):
  base: ['mulchMaterialPerYard','mulchInstallLaborPerYard',
    'minimumServiceCharge']
  // mulchMaterialPerYard keyed by mulchType
  if bedCondition ≠ 'clean': add 'bedPrepLaborPerSqft'   // SCOPE
  if edgingNeeded: add 'edgingPerLinearFoot'             // SCOPE
  Class 2 default (overridable): mulchOverageFactor = 1.15
  // settling/compaction ordering overage — applied to material
  // quantity on BOTH input paths.

calculate():
  if inputMethod='sqft':
    cubicYards = (mulchArea × (mulchDepth/12)) / 27
    prepSqft = mulchArea
  else: cubicYards = mulchArea; prepSqft = bedSqft
  orderYards = cubicYards × mulchOverageFactor
  bedPrepCents: clean=0,
    needs_weeding = round(prepSqft × bedPrepLaborPerSqft × 0.5)
    overgrown    = round(prepSqft × bedPrepLaborPerSqft × 1.0)
  materialCents = round(orderYards
    × mulchMaterialPerYard[mulchType])
  laborCents = round(cubicYards × mulchInstallLaborPerYard)
    + bedPrepCents
  if edgingNeeded:
    edgingCents = round(edgeLF × edgingPerLinearFoot)
  + travel, disposal, permit, overhead flat.

── LANDSCAPING_SOD ──────────────────────────────────

getRequiredFields():
  ['sodSqft','sqftMethod','groundPrepNeeded','slope',
   'accessDifficulty']
getRequiredOwnerFields(customerInputs):
  base: ['sodMaterialPerSqft','sodInstallLaborPerSqft',
    'minimumServiceCharge']
  if groundPrepNeeded: add 'groundPrepPerSqft'          // SCOPE
  // groundPrepPerSqft label: "Per sqft to remove existing grass,
  // haul it away, grade/compact, and add topsoil as needed. Prep
  // is often the majority of a sod job — make sure this number
  // covers disposal of the old lawn."
  Class 2 defaults (overridable):
    sodWasteFactor = 0.05
    slopeMultiplier: flat=1.00, moderate=1.15, steep=1.35
    accessMultiplier: easy=1.00, moderate=1.10, difficult=1.25

calculate():
  sqft: small=500, medium=1500, large=3500 or number;
    category → SIZE ASSUMPTION RULE, estimationUsed
  materialSqft = sodSqft × (1 + sodWasteFactor)
  materialCents = round(materialSqft × sodMaterialPerSqft)
  laborCents = round(sodSqft × sodInstallLaborPerSqft
    × slopeMultiplier × accessMultiplier)
  if groundPrepNeeded:
    prepCents = round(sodSqft × groundPrepPerSqft)   // prep
  + travel, disposal, permit, overhead flat.

── LANDSCAPING_PLANTING ─────────────────────────────

getRequiredFields(customerInputs):
  base: ['plantCount','plantSize','bedCondition','mulchNeeded']
  if mulchNeeded: add 'mulchYards','mulchType'
getRequiredOwnerFields(customerInputs):
  base: ['plantingLaborPerPlant','plantMaterialAllowance',
    'minimumServiceCharge']
  // both keyed {small, medium, large, mixed}
  if bedCondition ≠ 'clean': add 'bedPrepLaborPerSqft' + customer
    'bedSqft'                                           // SCOPE
  if mulchNeeded: add 'mulchMaterialPerYard',
    'mulchInstallLaborPerYard'                          // SCOPE

calculate():
  laborCents = round(plantCount × plantingLaborPerPlant[plantSize])
  materialCents = round(plantCount
    × plantMaterialAllowance[plantSize])
  bedPrep: same logic as mulch (per bedSqft)
  if mulchNeeded:
    // Do NOT invoke the full LANDSCAPING_MULCH template — it
    // requires fields this flow never collects. Internal helper:
    mulchOnly(yards, type):
      material = round(yards × mulchOverageFactor
        × mulchMaterialPerYard[type])
      labor    = round(yards × mulchInstallLaborPerYard)
    add both as line items.
  + travel, disposal, permit, overhead flat.

── LANDSCAPING_MOWING ───────────────────────────────

getRequiredFields():
  ['yardSqft','sqftMethod','serviceFrequency','grassCondition',
   'bagClippings','edgingIncluded']
getRequiredOwnerFields(customerInputs):
  base: ['mowingBaseRatePerSqft','minimumServiceCharge',
    'frequencyMultipliers','overgrowthMultipliers']
  // frequencyMultipliers keyed weekly/biweekly/monthly/one_time
  // overgrowthMultipliers keyed maintained/overgrown/severe
  if bagClippings: add 'baggingSurchargePercent'        // ADDON
  if edgingIncluded: add 'edgingPerLinearFoot'          // ADDON

calculate():
  if sqftMethod ≠ exact: small=2000, medium=5000, large=10000,
    xlarge=21780 (half acre); SIZE ASSUMPTION RULE, estimationUsed
  laborCents = round(yardSqft × mowingBaseRatePerSqft
    × frequencyMultipliers[serviceFrequency]
    × overgrowthMultipliers[grassCondition])
  if bagClippings:
    baggingCents = round(laborCents
      × baggingSurchargePercent/100)
    line { name:"Clipping bagging & disposal",
      category:"disposal", taxable:false }
  if edgingIncluded:
    perimeterLF = round(sqrt(yardSqft) × 4)
    estimationUsed = true
    appliedRules.push("Edging estimated from yard size")
    edgingCents = round(perimeterLF × edgingPerLinearFoot)
    line { name:"Perimeter edging", category:"addon",
      taxable:false }
    // explicit taxable:false — edging here is labor; this
    // intentionally overrides the addon-category default.

── SIDING_REPLACEMENT ───────────────────────────────

getRequiredFields(customerInputs):
  base: ['areaInputMethod','sidingType','stories',
    'oldSidingRemoval','trimIncluded']
  if sqft: add 'sidingAreaSqft'   // paintable/sidable WALL area
  if homesize: add 'homeSize'
  if trimIncluded: 'trimLF' OPTIONAL — accept exact if the caller
    has it; otherwise derive (below). Never a hard requirement:
    homeowners cannot answer it and the call would dead-end.

getRequiredOwnerFields(customerInputs):
  base: ['laborPerSqft','materialPerSqft','minimumJob']
  // both keyed by sidingType
  // materialPerSqft label: "All-in installed material per sqft
  // for this siding type, INCLUDING house wrap, J-channel,
  // corner posts, and starter strip — accessories run 20–30% of
  // vinyl material cost." (Alternatively set houseWrapPerSqft
  // separately — optional owner field, material category.)
  if oldSidingRemoval: add 'removalPerSqft'              // SCOPE
  if trimIncluded: add 'trimPerLinearFoot'               // SCOPE
  Class 2 defaults (overridable):
    wasteFactorByType: vinyl=0.10, fiber_cement=0.12, wood=0.12,
      metal=0.10
    sidingAreaMap keyed homeSize × stories (same shape as
      exterior painting map — wall area scales with stories):
      1-story: small=900,  medium=1400, large=2000, xlarge=2800
      2-story: small=1400, medium=2200, large=3100, xlarge=4200
      3-story: 2-story × 1.4
    trimRatio = 0.15   // derived trim LF per wall sqft
    storyMultiplier (labor AND removal): 1=1.00, 2=1.10, 3=1.20

calculate():
  if homesize: sidingAreaSqft = sidingAreaMap[homeSize][stories]
    SIZE ASSUMPTION RULE; estimationUsed = true
  materialSqft = sidingAreaSqft
    × (1 + wasteFactorByType[sidingType])
  laborCents = round(sidingAreaSqft × laborPerSqft[sidingType]
    × storyMultiplier)
  materialCents = round(materialSqft × materialPerSqft[sidingType])
  if oldSidingRemoval:
    removalCents = round(sidingAreaSqft × removalPerSqft
      × storyMultiplier)
    disposal: disposalPerSqft override supported.
  if trimIncluded:
    trimLF = customer-provided exact value, else
      round(sidingAreaSqft × trimRatio) with estimationUsed=true
      and appliedRules.push("Trim estimated from wall area —
      confirmed at site visit")
    trimCents = round(trimLF × trimPerLinearFoot)
  + travel, disposal, permit, overhead flat.

── SIDING_REPAIR ────────────────────────────────────

getRequiredFields():
  ['affectedArea','sidingType','damageLevel','stories']
getRequiredOwnerFields():
  ['laborHourlyRate','repairMinimum','repairHours',
   'materialAllowance']
  // repairHours and materialAllowance keyed
  // [damageLevel][sizeCategory]; owner sets all; repairMinimum
  // enforced by engine STEP 8.
calculate():
  affectedAreaCategory: sqft<20=small, 20–80=medium, >80=large
  storyMultiplier (labor only): 1=1.00, 2=1.10, 3=1.20
  laborCents = round(repairHours[damageLevel][cat]
    × laborHourlyRate × storyMultiplier)
  materialCents = round(materialAllowance[damageLevel][cat])
  + travel, disposal, permit, overhead flat.

── FLAT_ROOF_REPLACEMENT ────────────────────────────

getRequiredFields(customerInputs):
  base: ['roofSqft','sqftMethod','membraneType','existingLayers',
    'accessDifficulty','serviceScope','buildingType']
  // buildingType: 'residential' | 'commercial'
  if partial: add 'partialPercent'
getRequiredOwnerFields(customerInputs):
  base: ['laborPerSqft','membraneCostPerSqft','tearOffPerSqft',
    'minimumJob']
  // all keyed by membraneType, plus an 'average' key for unknown
  if buildingType='commercial': add 'insulationPerSqft'   // SCOPE
  // Rigid insulation/coverboard is code-required on commercial
  // re-roofs and often the largest material line. Residential
  // porch-scale flat roofs may skip it; commercial may not.
  Class 2 default: accessMultiplier (labor AND tearOff):
    easy=1.00, moderate=1.15, difficult=1.30

calculate():
  sqft: small=500, medium=1500, large=3000 or number;
    category → SIZE ASSUMPTION RULE, estimationUsed
  if partial: roofSqft ×= partialPercent/100
  membraneKey = membraneType==='unknown' ? 'average' : membraneType
  if unknown: estimationUsed = true; push priceDriver
    "Membrane type unconfirmed — average membrane pricing used"
  existingLayerCount: "1"→1, "2"→2, "unknown"→1
  if unknown: estimationUsed = true; appliedRules.push("Layer
    count unconfirmed — estimated 1 layer"); push priceDriver
    "Assumes 1 existing layer — additional layers add tear-off
    cost"
  tearOffSqft = roofSqft × existingLayerCount
  laborCents = round(roofSqft × laborPerSqft[membraneKey]
    × accessMultiplier)
  membraneCents = round(roofSqft
    × membraneCostPerSqft[membraneKey])
  if buildingType='commercial':
    insulationCents = round(roofSqft × insulationPerSqft)
                                                    // material
  tearOffCents = round(tearOffSqft × tearOffPerSqft
    × accessMultiplier)
  disposal: disposalPerSqft override supported (applied to
    tearOffSqft).
  + travel, disposal, permit, overhead flat.

── FLAT_ROOF_REPAIR ─────────────────────────────────

getRequiredFields():
  ['repairType','affectedArea','membraneType','leakPresent',
   'pondingWater']
VALIDATION: repairType='unknown_leak' → ESTIMATE_REQUIRES_REVIEW,
  reviewReason: "Flat roof leak source requires inspection before
  we can estimate accurately."
if leakPresent: urgencyFlags.push("Active leak reported —
  customer flagged as urgent")
getRequiredOwnerFields(customerInputs):
  base: ['laborHourlyRate','repairMinimum','patchRepairHours',
    'patchMaterialAllowance']
  if pondingWater: add 'pondingWaterSurcharge'           // ADDON
calculate():
  affectedAreaCategory: sqft<20=small, 20–80=medium, >80=large
  laborCents = round(patchRepairHours[repairType][cat]
    × laborHourlyRate)
  materialCents = round(patchMaterialAllowance[repairType][cat])
  if pondingWater and priced:
    surchargeCents = pondingWaterSurcharge   // addon category
  + travel, disposal, permit, overhead flat.

── NON-TEMPLATE BUSINESSES (serviceType = "CUSTOM") ─

matchServiceFromPricebook(description, services):
  Step 1 exact: lowercase full-string match → exact_match
  Step 2 keyword: split description, drop words ≤3 chars,
    score each service by matched words (substring match on
    service words). Sort desc.
    score ≥ 2 → matchStatus 'strong_match'
    score = 1 → matchStatus 'needs_confirmation'
    else → no_match

VOICE RULE: the voice agent ALWAYS confirms the matched service
name before quoting — including strong_match and exact_match:
  "Just to make sure — you're looking for [service name]?"
Two seconds of confirmation beats confidently quoting the wrong
job. The WIDGET may auto-proceed on exact_match only, because
the customer can see what was selected.

no_match → ESTIMATE_REQUIRES_REVIEW, reviewReason: "Service not
found in price book. Owner follow-up required."

calculate by unit type:
  flat:     mid = (low+high)/2, quantity 1
  per_hour: "hour or two"=2, "half day"=4, "full day"=8,
            "couple days"=16; mid = hours × (low+high)/2
  per_unit: "a few" → ask once: "2-3"=2.5, "5-10"=7.5;
            mid = count × (low+high)/2
  per_sqft: small=300, medium=800, large=1500
  per_LF:   small=50, medium=150, large=300
  per_square: mid = squares × (low+high)/2
  SIZE ASSUMPTION RULE applies to per_sqft and per_LF category
  inputs — same gate as template services, estimationUsed=true.
  Then: markup → tax (mode-aware) → minimum → range, identical
  pipeline order to template services.

=======================================================
API ROUTES
=======================================================

POST /api/quote/calculate
  Auth: JWT. Body: { serviceType, customerInputs, callerType }
  1. ownerId from JWT
  2. pricebook = loadPricebook(ownerId)
  3. ownerPricing = matching service; defaults = pricebook.defaults
  4. result = generateQuote({...})
  5. quoteLog.insert(ownerId, quoteId, serviceType,
     customerInputs, result, callerType, urgency)
  6. callerType='owner' → return full result (lineItems included)
  7. callerType='customer' → strip: REMOVE lineItems and every
     rate field. KEEP: resultType, low/high/mid, options[] (tier
     names + ranges + drivers only), priceDrivers, disclaimer,
     quoteId. NEVER expose labor rates, material costs, markup %,
     overhead, or margin to customers.

POST /api/business/jurisdiction — per JURISDICTION section above.

POST /api/pricebook/suggest
  Auth: JWT. Body: { industry: string }
  Call the LLM with:
  systemInstruction: "You are a contractor pricing assistant.
  Return ONLY a valid JSON array. No markdown. No code blocks.
  No backticks. No explanation. Response must start with [ and
  end with ] and be parseable by JSON.parse() with zero
  modifications."
  userMessage: "Return a price book for a [industry] business.
  Return between 5 and 12 services. Each object must have EXACTLY
  these fields: { service: string max 40 chars, serviceType: one
  of exactly ROOFING_REPLACEMENT|ROOFING_REPAIR|
  FLAT_ROOF_REPLACEMENT|FLAT_ROOF_REPAIR|INTERIOR_PAINTING|
  EXTERIOR_PAINTING|FLOORING_INSTALL|FLOORING_REPLACEMENT|
  FENCING_INSTALL|FENCING_REPLACEMENT|SIDING_REPLACEMENT|
  SIDING_REPAIR|CONCRETE_DRIVEWAY|CONCRETE_PATIO_SLAB|
  LANDSCAPING_CLEANUP|LANDSCAPING_MULCH|LANDSCAPING_SOD|
  LANDSCAPING_PLANTING|LANDSCAPING_MOWING|CUSTOM,
  low: integer no decimals no $ sign, high: integer greater than
  low, unit: one of exactly flat|per_sqft|per_hour|per_unit|
  per_LF|per_square, taxable: boolean, minimumJob: integer }"
  Response handling: strip ```json fences, JSON.parse, retry once
  on failure, then error "Could not generate suggestions. Please
  build your price book manually."
  Validate entries (all fields present, valid unit, numbers,
  high > low); require ≥3 valid or return error.
  IMPORTANT: suggested numbers are STARTING POINTS. The dashboard
  must show: "These are AI-suggested placeholder ranges — replace
  them with YOUR prices before going live." A suggested price
  book does not satisfy Class 1; template services still require
  the owner's own detailed pricing fields before instant quotes.
  Timeout 15s, one retry.

POST /api/pricebook/save
  Auth: JWT. Validate required fields per service. Convert
  dollars→cents. savePricebook. Return { success: true }.

GET /api/pricebook/:ownerId
  Auth: JWT. Verify requester === ownerId. Convert cents→dollars.

=======================================================
EMPTY PRICE BOOK HANDLING
=======================================================
hasPricing(ownerId) runs at the start of every voice call;
result stored in session state. Never skip.
if false, append to the voice agent system prompt:
  "PRICING NOT CONFIGURED: If any caller asks for a quote or
  pricing, respond exactly: 'I'd love to get you a number on
  that — let me have [ownerFirstName] reach out to you directly
  to go over pricing. Can I get your name and the best number to
  reach you?' Never mention: price book, system, configuration,
  or that you don't have information. Always frame as the owner
  following up personally. After collecting callback info, book
  a callback appointment if calendar is connected."
After the call, if a quote was requested: email the owner
(Subject: "⚠ Quote requested — set up pricing") and show a red
dashboard banner until 1+ active service exists.

=======================================================
TEST ROUTE + MANDATORY VALIDATION GATE
=======================================================
POST /api/quote/test
  Dev only. No auth. Accepts full { serviceType, customerInputs,
  ownerPricing, businessDefaults }. Returns FULL result with a
  console.log breakdown of every step: derived quantities, each
  line item, multipliers, markup, tax mode + base, minimum check,
  buffer used, final range.
  Block in production:
  if (process.env.NODE_ENV==='production')
    return res.status(404).json({error:'Not found'})

VALIDATION GATE — the engine is NOT done until this passes:
1. /test/quoteEngine.spec.js with at least ONE test per service
   type. Each test's expected line-item values are HAND-CALCULATED
   and written into the test BEFORE running the engine. A test
   that asserts whatever the engine returned is not a test.
2. Explicit regression tests for every previously-shipped bug:
   - cleanup disposal is NOT multiplied by 100
   - per-service minimums (minimumJob / repairMinimum /
     minimumServiceCharge) ARE enforced
   - interior painting with trim on the sqft path does not NaN
   - every owner field used in any formula is validated (grep
     each template's formula fields against its required list)
   - TAX_ALL applies minimum pre-tax; TAX_MATERIALS taxes the
     marked-up material base; TAX_NONE produces no tax line
   - tier overrides change only the overridden fields
3. Do not report this engine as complete, verified, or accurate
   unless every test above exists and passes, and say exactly
   which tests were run. Reporting completion without evidence
   is a build failure.

=======================================================
CRITICAL RULES FOR THE BUILD AGENT
=======================================================
1. quoteEngine.js is server-side ONLY. Never import in frontend.
2. All money is integer cents internally; dollars only at API
   boundaries. Never multiply stored pricing fields by 100.
3. generateQuote() returns exactly one of two resultTypes.
4. Class 1 prices: no defaults, ever. Class 2 quantity factors:
   named, dashboard-visible, owner-overridable defaults only.
5. Tax follows STEP 7 modes exactly; the mode+rate come from
   businessDefaults; jurisdiction logic never leaks into math.
6. Minimum ordering: pre-tax under TAX_ALL, post-tax otherwise.
7. Job multipliers never touch travel, disposal, permit,
   overhead, tax, or markup lines.
8. Customer responses never include lineItems, rates, costs,
   markup, overhead, or margin.
9. Every derived/assumed quantity sets estimationUsed and pushes
   a human-readable appliedRules entry. Never deliver an
   estimated quantity as if it were measured.
10. SCOPE items fail to review when unpriced; ADDONs skip with
    customer-visible disclosure. Never silently underbid scope;
    never kill a quote over an addon.
11. If any part of this spec is ambiguous or appears
    contradictory, STOP and ask — do not improvise a resolution.
