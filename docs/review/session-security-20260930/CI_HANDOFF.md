# Hosted verification and restart handoff

Final application runtime: `08ee7d529112c8db8098bc002dfd9be732a19d3e`. Hosted source checkpoint: `67000e668a0da81fa1a85152256705c843429ca8`; runtime bytes are identical. Actions run [36681673043](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/36681673043) passed all six verification groups and saved sanitized evidence. A separate read-only hosted job bound 184 files to GitHub hashes and retrieved all seven evidence files for permanent storage under `hosted/` in this directory. Artifact expiration does not remove those committed copies.

The initial hosted attempt passed test groups but failed evidence upload on a relative path; corrected upload and full verification passed. Final local browser repeats remain unknown after local execution/file reads stopped responding. Their verification was completed independently by fresh hosted runs; no live providers were used.

On a working computer, clone `sportaholic000-hue/off-the-clock`, switch to `codex/auth-email-recovery-20260929`, read `docs/WORKING_DIRECTION_20260930.md`, AGENTS.md and the original specifications, then follow REPRODUCE.md. Locked dependencies and runtime binaries can be installed again. Credentials and private runtime databases are excluded from source control.

Voice work is owner-authorized after this verified security slice. The other engine/booking chat is idle. No new voice implementation is included in PR #4. Read VOICE_NEXT.md before starting that separate lane.
