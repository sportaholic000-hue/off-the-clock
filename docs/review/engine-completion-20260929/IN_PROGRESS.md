# Implementation checkpoint — September 30, 2026

This is a source backup for ongoing work, not final acceptance or a launch-ready claim. The owner approved both complete installed prices and itemized measured-component prices; see OWNER_OFFERINGS.md. The historical starting checkpoint's pending question has been answered.

Implemented in this checkpoint:
- Opt-in owner offerings for both fence services and both painting services, preserving existing rate meanings and the previously supported measured interior path.
- Dynamic application/customer fields, owner editor, explicit inclusions, price conversion, saved approval and persistence through the existing application boundary.
- One booking-confirmation check shared by create acknowledgement, ambiguous-write recovery and status polling. Confirmation requires the matching deterministic event, confirmed provider status and exact start/end instants. Pending records retain the intended event identity.

Verified before this backup:
- 75 focused engine, booking-service and Google-adapter tests pass.
- Eight complete offerings through public submission, authenticated calculation and owner preview: 24 independent price controls; 10 scope checks; 8 exact-retry controls. Records include 17 quotes and 10 follow-up/review leads, including the lead for separately declared on-site work.
- Both production client builds pass.
- 24 browser workflows pass: eight owner configuration/save/approval/preview workflows and all eight offerings through both the normal full-page form and production widget. Saved definitions and submitted records were checked.
- Original booking reproduction: 9 false confirmations in 24 real application cases against a synthetic provider, with full replies and stored appointment/outbox records retained.

Still running or pending: repaired real-provider-boundary replay, full regression and the final integration/source-boundary check. The provider is synthetic; this does not establish live Google acceptance. Email verification/password-reset work belongs to the separate owner-designated chat and is not claimed here. No subagents, voice edits, live-data writes, deployment or merge.

New test-script setup errors are retained separately from product defects: paid-account setup in the original baseline, missing guided-intake confirmations/review acknowledgement, expected retry HTTP 201 instead of the existing 200, owner-preview internal line visibility, a wrong table name corrected before execution reached it, and omission of the expected separate-work follow-up lead from a record-count assertion. The independent money expectations were preserved. The first engine test draft had an arithmetic transcription typo for interior painting and used the wrong status property; these were corrected and the original logs retained.
