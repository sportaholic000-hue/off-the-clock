# Expected-name label correction

The first local name-verification probe expected the shorthand `AI` in six F16
case names. A1's unchanged captured receipts and case generator use the exact
source enum `AI_SUGGESTED`. The manifest was corrected to that existing label;
all 94 direct tests and all 14 normal-entry tests had already passed. No test,
assertion, fixture, receipt, or production behavior changed. The initial manifest
is retained as `required-test-names-first.json`.
