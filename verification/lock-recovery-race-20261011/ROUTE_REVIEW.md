# Route review — 2026-10-11

Only route-bearing file changed: server/src/offsiteBackups.js.
Reviewed diff: daily worker acquisition/release now uses the SQLite mutex.
GET /api/admin/backups/offsite remains requireAuth([admin]), no-store, with
unchanged status payload and 200/503 predicate including pending erasure.
No paths, authentication, roles, middleware, selectors or matrix assertions changed.
Only its SHA-256 changed in route-sources.json; all other entries are untouched.
