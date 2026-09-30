Engine baseline e2ccbda447425c4a46426f218332ef64e8c93d8a
Node 22.23.2; six files listed in engine-baseline-results.json.
393 tests; 390 pass; 3 fail; duration 416751.9938 ms; native exit 1.

Failures:
- quoteEngineVNextRepairs.spec.js repair 37, line 1686: expected the old exterior-painting-review-only warning; actual warning directs incomplete legacy scalar configuration to supported owner-defined scopes.
- repair 56, line 3610: expected ['purchasable_paint_contract']; actual also includes 'measured_scope_setup'.
- repair 69, line 4701: expected ['floor_overlay_contract']; actual also includes 'measured_scope_setup'.

These diagnostic/message differences are not independently demonstrated wrong amounts. 6c670a4 removes the scopeOwnerDiagnostics append that duplicated the diagnostic kinds. 3dd3b1a changes the legacy warning assertion; no application code is changed by 3dd3b1a. The peer reports a later full passing suite; this auditor did not rerun that whole later suite. Latest independent arithmetic passed 480/480, and the current HTTP controls agree across all three quote paths.
