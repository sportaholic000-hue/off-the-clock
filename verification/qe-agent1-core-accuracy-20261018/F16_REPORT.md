# F16 approval and adoption boundary

Agent1 base: `3b1e4b32c1cf31260ba2344fbf3bbdf418c81b5c`.
A2 dependency tested: `7e9dfcedc6f11f80b45b8ca0554aa5b83935d15b`.

The only production change is in `server/src/quoteDoneBridge.js`: the existing roof-minimum check and shared numeric validation now run before either approval branch can modify receipts or adoption state. Validation uses the shared money conversion/precision implementation, retaining fractional stored values for rejection instead of rounding them. The roof-minimum message and HTTP status 422 are unchanged. No arithmetic or engine-version change; v11 remains current.

A2's suggested insertion was after the adoption return and therefore missed adoption. Its call also omitted the defaults object required by `convertApplicationBook`. The implemented guard calls the shared `convertPricebookMoney` with the selected saved service, then the existing numeric validator. A2 owns the `pipeJackEach` classification; no replacement classification or edits to A2's files are included here.

## Evidence and regression design

`F16_EXPECTED.md` records expectations written before execution. `capture-f16-legacy.mjs` ran against the actual unmodified Agent1 base bridge in a local checkout combined with A2. It captured eight synthetic manual/AI, base/tier receipts in `f16-legacy-approvals.json`. Tests verify those receipts are current before attempting the prohibited write; they do not manufacture new receipt hashes.

The final regression assertions were also run against that pre-fix bridge: **11 pass / 23 fail**, zero skips. Twenty failures demonstrate invalid discrete-price approvals/adoptions or unapproved books receiving receipts; three show adoption bypassing the existing roofing-minimum diagnostic. All eight valid-price/adoption controls and the three ordinary minimum checks pass before the repair.

Repaired local verification:

- **44/44** standalone: new Agent1 approval tests plus existing starting-value, roofing, final-adoption and genuine v10 widget/voice replay tests. Zero failures/skips/cancellations/TODOs.
- **94/94** combined with A2: 20 Agent1 tests, 14 explicit pipe-jack dependency tests and 60 unchanged A2 precision/metadata tests. Zero failures/skips/cancellations/TODOs.
- Owner and widget build: pass.
- `f16-combined-identity.json` pins both unchanged A2 production-file blobs and the tested Agent1 bridge blob.

The shared regression cases assert whole durable book bytes, parsed book, revision, unconfirmed-save marker and owner creation record remain identical after rejection, including the original approval/AI/adoption receipts. Valid controls retain 100 cents per item and 100.5 cents/LF exactly through approval and adoption. Root/base/tier roofing minimums retain the exact diagnostic on both paths.

The standalone Agent1 test file uses already-classified `deckingPerSheet`. `f16-with-agent2.spec.mjs` explicitly requires A2 and runs all pipe-jack cases; it fails if A2's classification is absent and has no conditional skips. The isolated verification checkout includes A2 without changing its bytes; the Agent1 branch does not merge or duplicate A2's files. The coordinator must combine both owners' changes for the complete pipe-jack fix.

Commands (Node 22, writable TMPDIR):

```sh
node --experimental-test-module-mocks --import ./test/pricebookTestEnv.mjs --test test/qeAgent1ApprovalPrecision20261018.spec.mjs test/quoteStartingValues20261017.spec.mjs test/quoteRoofing20261016.spec.mjs test/quoteFinalAdoption20261017.spec.mjs test/qeAgent1Historical20261018.spec.mjs
# In the isolated checkout with A2:
node --experimental-test-module-mocks --import ./test/pricebookTestEnv.mjs --test test/qeAgent1ApprovalPrecision20261018.spec.mjs verification/qe-agent1-core-accuracy-20261018/f16-with-agent2.spec.mjs test/qeAgent2PricePrecision.spec.mjs test/qeAgent2PriceMetadata.spec.mjs
npm run build
```

All failed local runs are retained. Initial test scaffolding omitted the AI zero-policy confirmation field and used fixtures with no pending starting values; later diagnostic assertions initially expected the wrong shared error wording/path. Those scaffold errors were corrected without changing old tests or production diagnostics. The first neighboring run omitted the documented preload and hit one `SQLITE_READONLY_DBMOVED`; the documented command above passed all 44 tests. These failed logs are not represented as product defects or passing runs.

At this evidence commit's authoring, final published-SHA hosted qualification is pending. The handoff will report its actual results separately. No client, workflow, dependency, selector, existing test, spec, shared integration/main, deployment or A2-owned source changes. F2's below-one signed-adjustment policy remains unresolved; the client patch remains with Agent3.
