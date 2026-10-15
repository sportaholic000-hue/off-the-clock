# Route source review — 2026-10-15

## `src/server.js`

- Issue: QE-014.
- Previous SHA-256: `dc551df50bcd208c9e4626a3c3d8bd1b70696a476c1f70140b22327e6cbff7c1`.
- Reviewed SHA-256: `ce3a20c0dca5fe751c275733f73b02fc9e3b83f45c7e263ea4047070da6ba457`.
- Route change reviewed: `POST /api/business/jurisdiction` retains the existing path, method, `requireAuth(['owner'])` role restriction, price-book-plan gate, and `req.tenantOwnerId` owner binding. No route was added or removed.
- Handler change: a country-derived currency is now written only when the price book has no currency. Existing currency and numeric prices are never converted by a jurisdiction update.
- Inventory: the existing `{ "route": "POST /api/business/jurisdiction", "policy": "owner" }` entry remains unchanged.
- Matrix evidence: `test/tenantIsolationRoutes.spec.mjs` now explicitly checks unsigned refusal, staff refusal, successful owner mutation, established-currency retention, and no mutation of the other tenant in both development/preview and production matrices. Existing generic forged header/body/owner selector checks remain intact.
