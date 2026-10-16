# Proposed labels, help and wording

These are the proposed strings implemented on this branch for the October 16 owner task. None are represented as separately approved copy. Existing labels remain unless listed here. Braced terms below are populated from saved owner settings or confirmed customer inputs.

## Owner fields

| Field | Proposed label | Proposed help |
|---|---|---|
| `shortLoadThresholdCubicYards` | Supplier short-load threshold (cubic yards) | Orders below this quantity incur your chosen short-load fee, after the ready-mix order increment. Enter either a per-yard-short fee or a flat fee. |
| `shortLoadPerYard` | Short-load fee ($ per cubic yard short) | Supplier charge for each cubic yard below the threshold. Leave the flat fee blank. Blank adds no per-yard short-load charge. |
| `shortLoadFlatFee` | Short-load flat fee ($ per pour) | Supplier charge once when the ordered quantity is below the threshold. Leave the per-yard-short fee blank. Blank adds no flat short-load charge. |
| `controlJointPricing` | Control joints in slab labor | State whether your slab labor includes saw-cut control joints. A separate saw-cut price applies only when you choose Excluded. |
| `controlJointSpacingFt` | Control-joint spacing (feet) | Maximum spacing used to lay out saw cuts. Rectangles use their stated dimensions; other slab shapes use a square of equal area, with joint length confirmed on site. |
| `sawCutPerLF` | Saw-cut control joints ($ per linear foot) | Optional separate labor price when control joints are excluded from slab labor, using the slab labor access adjustment. Blank adds no saw-cut line; the quote states that control joints are extra. |
| `slabLaborMinThicknessInches` | Slab labor minimum thickness (inches) | Set both ends of the thickness range covered by this service or price option. Requests outside the range go to review. Blank range keeps existing pricing. |
| `slabLaborMaxThicknessInches` | Slab labor maximum thickness (inches) | Thickest slab covered by this labor rate. Set the minimum too. Blank range keeps existing pricing. |
| `placementFlat` | Placement flat charge ($ per pour) | Optional charge for each offered placement method. Add a per-yard charge if both apply. Blank methods are not offered. Uses your Additional work category settings; no slab-access multiplier is added. |
| `placementPerCubicYard` | Placement charge ($ per cubic yard ordered) | Optional charge on ready-mix quantity after waste and the order increment. Added to any flat charge for the selected method using your Additional work category settings. |
| `defaultPlacementMethod` | Placement when the chute cannot reach | Choose an offered method for No. With one priced method it is selected automatically; with several and no default the customer chooses. |
| `uncertainPlacementMethod` | Placement allowance for Not sure | Optional offered method to price when chute access is uncertain. Blank quotes without placement and states that placement other than the chute is extra. |
| `baseDepthInches` | Compacted base depth (inches) | Owner-set base depth for this service or price option, stated in quotes using separate base pricing. |
| `baseCompactionAllowance` | Base gravel compaction allowance | Additional gravel fraction for compaction; enter 0.20 for 20%. Gravel quantity is slab area times base depth divided by 324, then multiplied by one plus this allowance. |
| `baseGravelPerCubicYard` | Base gravel ($ per cubic yard) | Optional gravel material price. Any separate base price replaces the old combined Base preparation line. Enter excavation and grading separately if offered. |
| `baseExcavationGradingPerSqft` | Base excavation and grading labor ($ per square foot) | Optional labor price with the same access adjustment as slab labor. Any separate base price replaces the old combined Base preparation line; gravel is charged only when separately priced. |
| `sodRemovalPerSqft` | Old-lawn removal with disposal ($ per square foot) | Optional preparation labor including removal, loading and disposal of the old lawn. Uses sod slope and access adjustments. Any separate preparation price replaces the old combined Ground preparation line. |
| `sodGradingPerSqft` | Sod grading labor ($ per square foot) | Optional grading labor using sod slope and access adjustments. In separate preparation pricing, removal and topsoil are included only when separately priced. |
| `topsoilPerCubicYard` | Imported topsoil ($ per cubic yard) | Optional material price for only the depth missing from your target. When the customer is not sure, use your typical import depth as an allowance confirmed on site. |
| `topsoilTargetDepthInches` | Target usable topsoil depth (inches) | Total usable topsoil depth wanted before sod installation. Existing usable topsoil is deducted; no topsoil charge applies when the target is already met. |
| `topsoilTypicalImportDepthInches` | Typical topsoil import depth (inches) | Depth to import as an allowance when the customer does not know the usable topsoil depth. Set explicitly, including zero when appropriate. |
| `plantSizes` | Owner-defined plant sizes | Optional named shrub and tree sizes. Define shrubs by container number and trees by caliper or height, with stock type. Enter labor and material allowance for each size in the matching price rows. Blank retains Small, Medium and Large. |

Control-joint options: **Included**, **Excluded**. Placement options: Pump, Conveyor, Power buggy, Wheelbarrow. Stock-type options: Container, Balled and burlapped, Bare root. All new amounts and configuration inputs start blank; the existing empty select option remains **Choose**.

Structured placement maps use **Placement method** as the key label. The plant-definition schema labels an entry **Plant size**.

## Plant editor and interview

New labels and controls:

- Plant size {n}
- Customer size name
- Plant type
- Shrub
- Tree
- Stock type
- Container number
- Tree caliper (inches)
- Tree height (feet)
- Remove plant size {n}
- Add plant size
- Remove retired size price

Help: “Enter caliper or height, not both.”

Help: “After adding or removing sizes, update the matching planting labor and material allowance prices.”

Placement price accessibility labels join the field label with the method name. Plant definition accessibility labels append the row number; planting price and customer count labels append the exact owner size name. Review rows join the existing field label, exact owner size name and definition property with “ · ”. The existing planting labor and material-allowance field labels remain.

## Customer questions

| Field | Proposed question | Choices / help |
|---|---|---|
| `chuteAccess` | Can the concrete truck get its chute to the pour? | Yes / No / Not sure |
| `placementMethod` | Which offered placement method is needed? | Pump / Conveyor / Power buggy / Wheelbarrow (only offered methods) |
| `usableTopsoilDepthInches` | About how many inches of usable topsoil are already there? | Your confirmed best estimate is accepted. Choose Not sure to use the business’s typical import allowance. |

The topsoil question uses the existing **Not sure** checkbox, with accessibility label “Not sure — About how many inches of usable topsoil are already there?”. Plant counts keep **Measured plant count by size** followed by the exact owner name. Saved facts use “{count} × {owner size name}”, separated by semicolons.

## Quote lines and disclosures

New internal line names (customer output retains the existing sanitized presentation):

- Supplier short-load charge
- Saw-cut control joints
- {method} placement per pour
- {method} placement by volume
- Base gravel
- Base excavation and grading
- Old-lawn removal with disposal
- Sod grading
- Imported topsoil
- {owner size name} plant installation labor
- {owner size name} plant material allowance

New customer disclosures:

- Control-joint length allowance: {jointLengthToTwoDecimalPlaces} linear feet.
- The control-joint length is an allowance based on a square of the same area and will be confirmed on site.
- Saw-cut control joints are not included in this price; the business will confirm their price on site.
- Concrete placement is an allowance and will be confirmed on site.
- Placement other than the truck chute would be extra and will be confirmed on site.
- Imported topsoil is an allowance using the business’s typical import depth and will be confirmed on site.
- Base preparation is priced for {baseDepthInches} inches of compacted base depth.
- Topsoil import depth: {importDepthInches} inches.
- {count} × {owner size name}.

The existing measurement sentence remains verbatim: “This price is based on the measurements you gave us. The business will confirm them on site.”

## Price-book notices

- Set the thickness range covered by this slab labor rate. Until then, the existing 2–24 inch input range remains available.
- State whether saw-cut control joints are included in the slab labor price.
- Control-joint spacing of {spacing} feet exceeds the NRMCA cap of {cap} feet for a {thickness}-inch slab. Check the spacing for every thickness this rate covers.

Tier notices prefix the exact tier name and “: ”. Warning uses the minimum configured labor thickness, or 4 inches when no range is configured. Boundary choice: 5 inches uses the stricter 10-foot cap; above 5 and below 6 uses 12.5 feet; 6 and above uses 15 feet.

## Review and validation wording

- This slab labor rate covers {minimum}–{maximum} inches; the requested {thickness} inches requires review.
- The truck chute cannot reach and the owner has not priced a supported placement method.
- Choose an owner-priced placement method only when the chute cannot reach.
- Topsoil depth is used only with separately priced topsoil preparation.
- Confirm each distinct offered plant size and its count.
- {plant-count field label} must contain plant counts by offered size
- {plant-count field label} must contain only offered plant sizes
- {field label}: enter a {whole-number, when required}value from {minimum} to {maximum}.
- Choose either a per-yard-short fee or a flat short-load fee, not both.
- Choose Included or Excluded for control joints.
- Set both slab labor thickness limits, with the minimum no greater than the maximum.
- Enter prices by offered placement method.
- Enter a non-negative price for pump, conveyor, power buggy or wheelbarrow; flat charges require whole cents.
- Choose a placement method with a saved flat or per-yard price.
- Define at most 32 named plant sizes.
- Use a distinct plant-size key and definition.
- Plant sizes support only name, plant type, stock type, container number, caliper and height.
- Give the customer a plain plant-size name of 1–160 characters.
- Use a different customer name for every plant size.
- Choose Container, Balled and burlapped, or Bare root.
- Define a shrub by its whole container number only.
- Define a tree by either caliper in inches or height in feet.
- Choose Shrub or Tree.
- {method} placement price
- Planting labor price for {owner size name}
- Material allowance for {owner size name}

The existing required/invalid/zero-price messages use these labels, adding “is required.”, “is invalid.” or the existing explicit-free/included-price explanation. No new generic review template was added.

## Additive phone instructions

Concrete owner ruling (October 16, 2026): accept caller-confirmed approximate slab dimensions, including "about 10 by 10", and recap them as the caller's estimate. Ask "Can the concrete truck get its chute to the pour?" with Yes, No or Not sure. Supply chuteAccess yes, no or unknown separately from project access. If No and the live contract offers a placement choice, ask which offered method is needed. Not sure never requires a guessed method: the quote tool uses the owner's allowance, or states that placement other than the chute is extra. Read every returned on-site placement and control-joint qualification, and the stated base depth. Do not calculate yardage or joint length yourself.

Sod and planting owner ruling (October 16, 2026): accept a caller-confirmed best guess for lawn or bed measurements, recap it as the caller's estimate, and retain the returned on-site measurement sentence. For sod, when the live contract asks usableTopsoilDepthInches, ask "About how many inches of usable topsoil are already there?" Not sure is unknown and uses only the owner's typical import allowance; never invent a depth. Read the returned topsoil allowance and import-depth wording. For planting, use the exact size names in the live plantsBySize choices, including container number, caliper or height and stock type. Ask the count for each selected size, one question at a time. Do not replace owner-defined sizes with Small, Medium or Large.
