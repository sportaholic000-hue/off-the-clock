# Off The Clock AI — current voice quote collection contract

Updated September 27, 2026 to reflect the owner's no-assumption requirement and the accepted measured VNext contract. This specifies future voice integration; it does not certify an implemented live voice journey. The previous v2 trade scripts are preserved verbatim in `history/voice_quote_flows_legacy_v2.md` as historical evidence, not active prompts.

## Conversation and service selection

Ask one question per turn, use short familiar wording, acknowledge naturally and retain answers already supplied. Confirm the selected saved offering with the customer. The application resolves the owner and service; never accept customer-supplied pricing, approval, owner identity or fee authorization.

Preserve the whole request, including extra work, contradictions, unknown facts, contact, location, urgency and context. Do not discard additional scope because one part matches a configured service. Nonempty untriaged context, explicit unknowns, or a differing service description must receive review under the current application boundary. A caller's assertion that a note is harmless does not establish a priced contract.

## Measurements and uncertainties

Use the current service's customer-field metadata and conditional contracts in `server/quote-engine-vnext/contracts.js`, served through the trusted application catalog. Legacy trade-script field names are not a schema for this candidate.

Ask for actual measured dimensions in the declared units. Offer to wait while the customer retrieves a measured value. Example: "Do you have a measured length and width, or should the business verify those before estimating?" Read back the number and unit and obtain confirmation. A value described as a guess remains unknown even if a number was also supplied.

Never derive measurements from walking steps, standard widths, small/medium/large guesses, a house floor area substituted for a measured roof/wall area, or assumed layer counts. Never widen a range to legitimize an unknown fact. If a required fact cannot be established, preserve it as unknown and collect contact for review.

Measured geometry must use the engine's supported representation. Do not close an outline, invent a coordinate, reconcile competing partial-scope representations, or infer measured new scope from old material. Offering identification must retain the supported confirmation and saved offering identifier where the engine requires them. Named condition/access/size categories are customer declarations, not independently verified site facts.

## Scope prompts and current capability

Collect every selected conditional scope field from the current metadata/contract. Ask explicitly about removal, disposal, bagging, edging, ceilings, trim, preparation, stairs, layers, reinforcement and other relevant selections. A missing scope charge is not silently excluded from an otherwise complete quote. The engine's safe disclosures and review guards determine the result.

- Roofing and flat roofing: measured whole/partial scope, identified existing/replacement offering, actual existing layers and explicitly selected removal/accessories. Unsupported purchase-package or commercial insulation contracts require review.
- Interior painting: measured walls/ceilings, explicit coats, selected trim and supported preparation/height/zone facts. Do not substitute legacy floor-area rates. Exterior painting currently always requires review.
- Flooring: measured area, identified new/existing floor, room count, pattern, removal, stairs and underlayment selections. Overlay, stairs, unsupported product underlayment and exact configured room thresholds remain review-only.
- Concrete: measured supported rectangle or closed orthogonal outline, thickness, finish, reinforcement, access and preparation. Do not assume a driveway width. Unsupported demolition/exposed-aggregate scope requires review.
- Landscaping: actual area/quantity/identified offering, service-specific preparation and every selected add-on. Mowing bagging and edging, cleanup disposal, and mulch/planting quantities must follow their explicit contracts.
- Siding: measured supported area and identified offering or bounded repair facts. Unsupported trim/removal allocations require review.
- FENCING_INSTALL, FENCING_REPLACEMENT and CUSTOM currently always require review. Do not derive post/gate geometry or invent a custom charge category to release a price.

These are collection boundaries, not substitute formulas. `docs/quotedone-completion/OWNER_DECISIONS.md` records the precise unresolved contracts. Owner pricing/rules must be approved in the saved application book before live customer calculation.

## Contact, submission and result

The owner ruled: "any estimate would have to have a contact of some sort". Collect a valid email address or phone number before submitting any request, whether it may quote instantly or need review. Read the contact back. Syntax validation is not proof of ownership, reachability or messaging consent.

Use one stable request UUID and immutable body for a submission. Say it was saved only after the real transaction commits. If the connection fails, retry that exact request. Correcting a definitively rejected request creates a new UUID. An old successful retry returns a historical receipt, not a newly calculated current price.

For an instant estimate, present only sanitized customer totals/ranges, available option names, safe drivers and disclaimers. Preserve `optionAvailabilityNotice` if configured options could not be priced. Never expose owner rates, costs, markup, margin, raw line items or owner-only diagnostics. A range is not evidence that an unmeasured request is complete.

For review, explain that the business needs to verify the request. Keep all details on the lead. Never invent a promised callback deadline, appointment or price. Do not announce successful follow-up, booking or messaging without an authorized, successful operation.

## Runtime boundary

Plan gating remains in the routes. Operator includes CRM/lead capture but not quote calculation. The accepted master-toggle rule is ON = answer every call, OFF = the business's own line; no coverage-hours override. No call recording/audio storage is permitted. Voice models receive only customer-safe quote output. Real provider, multilingual, call-transfer, booking and messaging acceptance remain separate uncompleted gates.
