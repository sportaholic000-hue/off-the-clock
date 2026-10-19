# First run retained

geometry-first.tap: 527 tests, 520 pass, 7 fail, 0 skipped/cancelled/TODO. All 287 original audit comparisons passed, all eight v11 historical replay/reapproval tests passed.

Three new partial-area negative checks expected diagnostic objects although invalidCustomerFields is an array of field-name strings. The engine correctly refused each contradictory area. Correct the assertions to require the precise field name plus the unchanged contradiction message.

Four failures (two direct, two delivery) arose because offline decimal 400.05000156249995 rounded to the same JavaScript Number as the tie 400.0500015625 during JSON serialization. The oracle had computed a below-tie expectation for a tie-valued submitted input. The repaired engine correctly charged 8001 cents. Use the immediately adjacent representable input 400.0500015624999 below and 400.05000156250003 above; the handwritten 80.00/80.01/80.01 LF expectations do not change. Original generator, oracle and assertions are retained as first-* files. No production change was made in response to these test-harness failures.
