# Preserved unsuccessful executions

- Unchanged pinned production, core regression:127 tests,37 pass/90 fail.
  All90 failures exercise accepted zero additions. Original TAP/exit retained.
- First repaired core:127 tests,126 pass/1 fail. The remaining case used my
  incorrect sum42502, although its independently listed components are20010,
  11006,6003,100,2001,3282. Their sum is42402. No production arithmetic was
  changed to resolve this test-author arithmetic error. EXPECTED-FIRST.md and
  baseline-test-source.txt retain the original assertion; corrected EXPECTED.md
  and normal test use42402 and independently assert the half-cent material
  result11006 and remaining steep-removal charge3282.
- First integrated run:136 tests,129 pass/7 fail. Six cases had already
  received the correct public cents on both paths; my assertion incorrectly
  looked for voice internalResult at the widget's root path. Actual voice
  storage deliberately nests it under applicationOutcome (voiceToolRuntime.js
  voicePersistedOutcome). Corrected to assert the persisted engine result there.
- The seventh assertion incorrectly expected approval to throw for unconfirmed
  proposals. Existing behavior permits saving a configuration approval, while
  readiness and calculation remain blocked on each used unconfirmed proposal.
  The corrected test checks this actual contract, separately rejects missing
  confirmConfiguration, proves the unconfirmed quote is denied, then explicitly
  confirms settings and reapproves. No confirmation or production policy changed.
  Original integrated test source and TAP are retained.
- Corrected integrated run:136 tests,135 pass/1 fail. The remaining assertion
  expected the application calculation to expose startingValueState; instead
  the route correctly rejects at its earlier inactive-service guard. The test
  now checks that guard and the specific starting-value readiness diagnostic
  separately. This is an assertion-location correction, not a product repair.
- Focused confirmation check:1 test,0 pass/1 fail. It reached the next incorrect
  test-author assumption: confirming provenance alone invalidates an already
  explicit configuration approval. approvalContent intentionally excludes
  startingValueState, so the existing approval survives. The corrected assertion
  proves the approval receipt is unchanged by confirmation. The separate genuine
  v8 replay regression still requires explicit v9 approval and fresh approval
  after the actual zero-factor pricing edit. No approval rule changed.
- Broader focused run:248 tests,243 pass/5 fail. All136 new tests passed.
  The unchanged restore rehearsal and four release-startup checks ran before
  the local build and refused startup because production owner/widget bundles
  were missing. The guard output names deploymentConfig.js's build prerequisite.
  Build next, then rerun only the affected startup/restore files. The version
  guard also gains v8 as a newly stale version while retaining v6/v7/empty tests.
