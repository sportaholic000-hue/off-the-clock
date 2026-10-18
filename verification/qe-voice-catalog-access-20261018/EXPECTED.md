# Voice catalog access — expected before implementation

Authorized base: `1857b7779b83b70f7753b41b72c3677270cd4ffc`.
Review branch: `codex/qe-voice-catalog-access-20261018`.

Read AGENTS.md, the current build-status checkpoint, the relevant voice/engine
specification sections, owner quote decision amendments, and the current compiled
October 16 measurement instructions. No guide, specification, engine, pricing,
workflow, dependency or shared-fixture change is authorized by this task.

The new lookup is a read-only voice tool. It uses an existing saved-service handle,
the current customer input context and a field name. It returns only choice keys,
complete public labels and bounded continuation metadata. Search is literal text,
not a model/provider operation. No price, allocation or new confirmation is returned.
Signed continuation is bound to the call context, service handle, saved revision,
field, current input context, search, page size and handle expiry. Old/foreign or
altered cursors must fail. Lookup must not write a book, handle, quote or lead.

Independently stated financial controls:

- Gate 33: 100 LF at 4,000 cents/LF plus one installed gate at 55,000 cents =
  **455,000 cents**. Width 36 feet and complete installation text must survive.
- Plant 32: two shrubs at 4,500 cents labor + 3,000 cents materials each =
  **15,000 cents**. Use its actual named size and stable choice key.

Reach every gate in 31/32/33/65-choice saved books with no repeats or omissions;
search late choices, preserve duplicate descriptions as distinct choices and return
an empty result for no matches. The existing engine supports at most 32 custom
plant sizes, so exercise two 16-choice pages without changing that restriction.
Complete Unicode gate labels must survive byte-bounded pages; do not truncate them.
Different fence products retain their own applicable gates. Catalog discovery never
replaces existing product recap or scope-token confirmation.

Baseline on unchanged production code: **15 tests, 2 passed, 13 failed, zero skips,
cancellations or TODOs**. A known 33rd gate already quotes at the expected 455,000
cents; its initial question omits it and advertises more choices without a callable
lookup. Failures include absent discovery metadata/tool and missing plan gating.
The duplicate-label projection control also passes. See `baseline.tap`.

An initial oversized Unicode fixture was rejected by the existing complete-delivery
save guard. It was corrected before this baseline to use three long labels within
the supported saved-book envelope. No production limit was changed.
