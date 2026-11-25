# Route source review — 2026-10-15

## `src/server.js`

- Issue: QE-014.
- Previous SHA-256: `dc551df50bcd208c9e4626a3c3d8bd1b70696a476c1f70140b22327e6cbff7c1`.
- Reviewed SHA-256: `ce3a20c0dca5fe751c275733f73b02fc9e3b83f45c7e263ea4047070da6ba457`.
- Route change reviewed: `POST /api/business/jurisdiction` retains the existing path, method, `requireAuth(['owner'])` role restriction, price-book-plan gate, and `req.tenantOwnerId` owner binding. No route was added or removed.
- Handler change: a country-derived currency is now written only when the price book has no currency. Existing currency and numeric prices are never converted by a jurisdiction update.
- Inventory: the existing `{ "route": "POST /api/business/jurisdiction", "policy": "owner" }` entry remains unchanged.
- Matrix evidence: `test/tenantIsolationRoutes.spec.mjs` now explicitly checks unsigned refusal, staff refusal, successful owner mutation, established-currency retention, and no mutation of the other tenant in both development/preview and production matrices. Existing generic forged header/body/owner selector checks remain intact.

## `src/quoteDoneRoutes.js` — 2026-11-26

- Issue: Neon audit of v50, V50-3 (commit `ced230bb`).
- Previous SHA-256: `40272ce3ee55ee7b39b971f6d3df1d228902cb26825e8c3d7aa69f8fc3776c6b`.
- Reviewed SHA-256: `926f76842d8fff3c7a3042a1bc6e0c813a370c910a57e515976efcd66577dc24`.
- Route change reviewed: none. No route, method, middleware, role restriction or owner binding changed; no route was added or removed.
- Handler change: inside `submitQuote`, the contact phone passed to `resolveCustomer` is put in international form (+1) for a Canadian or US business (`server/phoneNumbers.js`). `resolveCustomer` is unchanged and still filters by the request's `ownerId`; no tenant query was added.
- Inventory: unchanged.
- Matrix evidence: `test/tenantIsolationRoutes.spec.mjs` passes unchanged apart from this reviewed hash.

## `src/quoteDoneRoutes.js` — 2026-11-26 (second)

- Issue: Neon audit of v51, V51-1.
- Previous SHA-256: `926f76842d8fff3c7a3042a1bc6e0c813a370c910a57e515976efcd66577dc24`.
- Reviewed SHA-256: `6558b1467e1686d691a80624e11b9b54dcd6bbe513c5625ece43103d00271057`.
- Route change reviewed: none. No route, method, middleware, role restriction or owner binding changed.
- Handler change: the two `leads` inserts in `submitQuote` store the contact phone in its +1 form for a Canadian or US business (the value already passed to the owner-scoped `resolveCustomer`). Both inserts keep `ownerId`; no tenant query was added.
- Inventory: unchanged.
- Matrix evidence: `test/tenantIsolationRoutes.spec.mjs` passes unchanged apart from this reviewed hash.
