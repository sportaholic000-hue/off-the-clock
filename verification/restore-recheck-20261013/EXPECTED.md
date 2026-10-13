# Fresh targeted verification: expectations recorded before execution

Written 2026-10-13T20:17:10.521Z. No rehearsal or intentional probe has yet run in this checkout.

Pinned tag rc-20261012l: object a8fd712734f334f4edc2aab24cc5797d90e9ea40; peeled commit d38781b35d126f21fed6074844e07d4e9de7c944.

| Execution | Tests | Pass | Fail | Exit |
|---|---:|---:|---:|---:|
| Unchanged normal rehearsal (once) | 9 | 9 | 0 | 0 |
| Assertion-only probe (once) | 9 | 7 | 2 intentional | 1 |
| Assertion-plus-cleanup probe (once) | 9 | 7 | 2 intentional | 1 |

All three executions: zero cancelled, skipped or TODO. In both probes the original INTENTIONAL_OWNER_READ_FAILURE assertion must remain primary; the subsequent invalid-structure and missing-book cases must pass. The unchanged verifier assertions must pass and its own exit must be 0. No retry after an unexpected result.

Invalid JSON should remain exactly seven bytes, {broken, in the actual parent/child book path before and after requests. The child's actual database path must match the parent fixture. Owner read: 503 / PRICEBOOK_UNREADABLE. Fresh quote: denied without low/mid/high dollar estimates. Historical replay: 200, identical receipt. Changed binding: 409. Health: 200 / ok. Submissions: exactly two. Child shutdown: exit 0, no termination signal, before final restoration of exact original bytes.

This is fresh evidence only. Lost historical output is not available and will not be reconstructed. No failed database snapshot is claimed; the existing rehearsal removes its temporary volume.
