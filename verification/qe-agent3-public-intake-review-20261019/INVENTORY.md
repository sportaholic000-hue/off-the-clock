# Public widget intake inventory

Inventory taken from checkpoint `28c1c331e841878cce8edb1f235523e001ca0b25` before test construction.

## Public routes and persistence boundary

- `GET /api/public/quote/:publicKey` returns only live services, their sanitized field contracts, and public capabilities.
- `POST /api/public/quote/:publicKey/prepare` validates the full public body and, only when ready, signs a `job-details-v1` confirmation bound to the owner, book revision, service and exact submitted scope.
- `POST /api/public/quote/:publicKey` enforces saved/live service identity, origin, entitlement, signed confirmation, request digest/idempotency, then writes the immutable submission receipt, quote and lead in one transaction.
- Exact retries return the historical response. A changed body under an existing request ID is a conflict.
- Pricing and owner-only calculation evidence are not catalog/customer fields.

## Browser entry and transport

- `/quote/:publicKey` renders `CustomerQuote` from `client/src/quotedone.jsx` through `client/src/main.jsx`.
- `client/src/quoteWizard.jsx` is the progressive widget entry; `client/src/quoteDoneControls.jsx` renders measurement controls.
- `client/src/widgetTransport.js` creates catalog, prepare and final requests.
- `client/src/pricebookInputs.jsx` owns exact numeric drafts and the feet-plus-inches fence-height transform.
- Scope-dependent clearing is implemented in the customer-control update path; server contracts remain the authority for direct HTTP submissions.

## Input families observed

- scalar number/integer and number-or-unknown
- boolean, enum and multi-enum
- registered product slug plus explicit identification confirmation
- fence height entered as feet plus decimal inches
- fence runs, orthogonal concrete outlines and surface rows
- carpet rooms and connected-area groups
- plant counts and configured offering counts
- mutually exclusive measurement methods and dependent optional-work quantities

## Existing-test boundary

- Existing all-service coverage calls internal application functions; it does not cross the public HTTP/browser boundary for all 20 types.
- Existing browser tests cover individual control families and selected services, but no exact 20-service public matrix.
- Existing public-route tests cover entitlement, origin, persistence, retries, leads and selected quote types.
- This audit targets the missing cross-product: every registered service through public prepare/final HTTP, plus representative real-browser transformations and stale hidden fields.

## Registered-service inventory

`ROOFING_REPLACEMENT`, `ROOFING_REPAIR`, `FLAT_ROOF_REPLACEMENT`, `FLAT_ROOF_REPAIR`, `INTERIOR_PAINTING`, `EXTERIOR_PAINTING`, `FLOORING_INSTALL`, `FLOORING_REPLACEMENT`, `FENCING_INSTALL`, `FENCING_REPLACEMENT`, `SIDING_REPLACEMENT`, `SIDING_REPAIR`, `CONCRETE_DRIVEWAY`, `CONCRETE_PATIO_SLAB`, `LANDSCAPING_CLEANUP`, `LANDSCAPING_MULCH`, `LANDSCAPING_SOD`, `LANDSCAPING_PLANTING`, `LANDSCAPING_MOWING`, `CUSTOM`.
