# A3 task list

- [x] Create unique branch at the requested base; inspect instructions/specs/tests.
- [x] Write independent expected amounts before execution.
- [x] Execute and preserve baseline Chromium reproductions.
- [x] Implement only reproduced customer lifecycle repairs in assigned files (verification pending).
- [ ] Verify new cases plus preserved relevant regression coverage.
- [ ] Record any exact server reproduction and handoff (no server edits).
- [ ] Publish unique branch; verify hosted CI at exact final commit.

No subagents. No main merge or deployment. Specifications, v12, approvals,
pricing formulas, existing tests and workflows remain unchanged.

Current checkpoint: test-only source `6ef935871244643bfb4afac673f587ed5570bfac`
is published and its baseline reproduction completed. Client repair is ready
for hosted qualification; local builds and 59 focused existing checks pass.
Local Chromium startup exits SIGTRAP, so the real browser cases are established
by hosted Chromium. Initial harness
checkpoint `120c2207` is retained; the newer test-only checkpoint corrects enum
control interaction, measurement-method ordering, and option calculation-record
lookup before product repair. The separate local HTTP fixture probe passes for
both services and confirms their stored cents and customer scope.

Hosted `b2d86e4c` ran Chromium 141.0.7390.37 but all 11 cases stopped at a
harness-origin error: Playwright APIRequestContext catalogue GETs lacked native
Fetch Metadata and correctly received HTTP 403. This is **not** a reproduced
product defect. `6ef93587` forwards catalogue GETs natively in Chromium while
retaining real-handler POST response barriers. Raw source-bound results and the
test log excerpt are retained in this evidence folder. No customer source has
been changed in response to these harness failures.

Corrected baseline `6ef93587`, hosted run `39305527431`, now completed. Chromium
141.0.7390.37 reproduces stale preparation takeover after area/service changes,
same-key instance recovery overwrite, and old save completion after key change.
R01 double-submit and R02 retry/reload controls pass. R05 variants stop at the
old busy lock before they can issue a replacement request. R08 correctly rejects
stale confirmation and computes 21,500 cents, then fails the harness's mistaken
fractional-dollar display expectation; the existing outward whole-dollar rule
is now explicitly recorded in EXPECTED.md. Client-only repair is implemented;
local and hosted regression qualification remain open.
