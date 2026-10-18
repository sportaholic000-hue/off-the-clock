# Evidence setup corrections

No production change, expected-cent change or relaxed assertion was made.

1. The first application execution could not import `jsonwebtoken` from the
   isolated runtime. It reports one file-level failure, not ten executed tests.
   Installed the exact locked JWT9.0.3 and Express4.22.3 dependencies inside
   this directory's ignored runtime; production package/lock files are untouched.
2. The second application execution reports8 pass/2 fail. Its direct-engine
   control mistakenly retained the reference fixture's January `currentMonth`
   while supplying an October quote date. Both failing assertions were direct
   controls stopped by that mismatch. Corrected the evidence caller to October.
   Save/approval/bridge quote results from that run were already meaningful.
3. That run's preview input incorrectly copied unconfirmed intake-flow and
   urgency text into an owner preview. The real scope guard correctly stopped
   it. The corrected preview uses the existing saved-owner-preview input shape,
   with no untriaged free text. An assertion now checks every preview outcome.
4. The first boundary matrix gave the numeric0.5 and text"0.5" rows the same
   display ID although their stored JSON input types and expected results were
   distinct. Added a type prefix to IDs only, preserving the original expected
   file, checksum, results and stdout under `*-first.*`. Reran the same205
   observations after writing the amended expectation file. No formulas or
   expected monetary values changed. Counts are not doubled as new coverage.
5. The next application run reports7 pass/3 fail. Correcting the date exposed
   another direct-call setup mistake: a raw stored row includes priceMetadata
   and quoteDoneApproval, which the engine correctly rejects. Direct calls
   now reuse the actual bridge projection, not the raw saved row. The additional
   preview assertion also exposed an incorrect harness assumption: owner
   previews intentionally allow inactive services. For the complex-shape-half /
   simple request, preview and direct selection should quote391000c even while
   the service-wide customer gate blocks it. This eligibility distinction was
   written before the corrected run; customer expectations were not weakened.
   Original source and both application-result captures are preserved.

The initial local expectation commit is
`cc81c18ef4c69a256ed4c4b3ee3ae8de9675d0bd`, written before any engine run.
Its parent is the exact requested base. The original expected JSON checksum is
`a7b2b2ac14699f71cb53c8969588c57715b3bb14fe518a5c8ff33505521363d0`.
The two intentionally failing factor tests and two rounding tests remain failed.

Publication: native git push failed because no CLI write credentials are installed. The raw local pre-execution commit is retained; connected GitHub publication creates a new evidence commit directly on the exact base. Local commit hashes are not asserted to be remote ancestors. No production or evidence expectation changes are needed for that publication method.
