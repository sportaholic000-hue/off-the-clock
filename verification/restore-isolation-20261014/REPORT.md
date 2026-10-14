# PENDING — bounded hosted restore investigation

Application under test: `95e1631f42461ca8ae7d46d859940bffc302d155` in a separate detached checkout. Annotated tag `rc-20261013m`: `7c7e5a9363ed7113ea8969cdd3e400f58b1b538f`. Repository: `sportaholic000-hue/off-the-clock`.

This diagnostic branch starts at that application commit. Only this directory and the dedicated restore-isolation workflow are added. Existing application, assertions, tests, dependencies, workflows, specs and owner wording are unchanged. No phase gate is passed.

Plan: established Node 22 setup, npm ci, npm run build; exactly one unchanged normal restore rehearsal, then one unchanged rehearsal under kernel tracing after a harmless parent/child write proves tracer operation. Each execution uses a new temporary root. No full/quote suite, intentional-failure campaign, or repeat seeking a pass.

Read AGENTS.md, BUILD_STATUS.md, backup-restore expectations, restore-recheck instructions, the normal rehearsal/helper and the current CI setup. Locally verified remote candidate branch/tag/peel and main (`ed12dca1253a8790c885b071ab6037e05632bea0`) against the owner-provided identities. The diagnostic branch was absent before creation.

Input limitation: `Personal_Full_Audit_rc-20261013m.zip`, expected SHA-256 `bc944f6c275caeec5f110e8cc1694f303a1af8bdae14adf622e85ffb02d72a74`, was mentioned but is not available in the conversation workspace or as an accessible attachment. Its review is NOT RUN. Existing original archives remain unchanged. Their unexplained historical observations and the 27 temporary files' unknown preservation provenance are not reconstructed or treated as contemporaneous snapshots.

Expected behavior: missing/malformed saved books block new quotes; historical receipts replay unchanged; restored valid book produces the handwritten $100 amount. A historical successful quote from a book already valid before HTTP is not quoting from corrupt JSON.

Evidence: allowlisted command metadata, complete outputs, raw descendant traces, source identities/diffs and derived trace references only. No recursive inclusion of temporary volumes or database snapshot claim. strace observes this process tree, not unrelated writers; raw data-buffer arguments are suppressed to avoid capturing credentials or HTTP payloads. Ptrace overhead changes timing. Memory-mapped mutations cannot be mapped to individual memory stores by syscall tracing.

Outcome, diagnostic/report SHAs and hosted URL pending. Automatically triggered ordinary CI is unrelated to this bounded experiment and is not new candidate qualification. No tags, merges, deployments, live-provider operations or release clearance are authorized.
