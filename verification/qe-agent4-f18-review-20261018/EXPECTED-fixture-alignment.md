# Fixture alignment before repeat execution

The hand-authored normal estimate must mirror its first valid option at the top
level, including skippedAddons, as specified by quote_engine_v2 STEP 2b. Adjust
only that fixture construction rule before repeating the unchanged assertions.
Initial inputs/results are retained under initial-fixtures/. No production or
existing test changes, and no oracle weakening, are permitted. All earlier
semantic expectations still apply. The independent minimal reproductions do
not use this fixture constructor and remain unchanged.
