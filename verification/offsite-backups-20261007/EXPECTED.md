# Pre-execution expectations

Pinned base: fb7ae652d71610dfe940ed0678449c05c7a8fd1d. Synthetic data only.

- A daily snapshot contains the existing version-1 SQLite/price-book bundle, including two distinct owners' exact book bytes and committed WAL rows. No credentials or environment file is included.
- S3 receives ciphertext only, with SHA-256 in a separate completion record. Success requires a downloaded checksum match. Wiping the entire fake volume and downloading/restoring produces identical records and book bytes through the existing restore function.
- A wrong 32-byte key fails authenticated decryption before any destination is published. Corruption fails checksum verification before decryption; no live/current data is overwritten.
- One completed backup per UTC day. Same-day retries, lost upload responses and restart reuse the immutable encrypted artifact; successful objects are not overwritten.
- Keep the newest 30 complete daily backups, including both ciphertext and completion records. Ignore unrelated keys and incomplete uploads. Do not prune on failed uploads or when fewer than 30 recoverable completed backups remain.
- Failed upload persists a safe operator-visible failure with bounded per-operation attempts, backoff and eventual retry. Secrets and caller records do not appear in status/logs. Admin status is protected from anonymous, owner and staff accounts.
- Missing/invalid production config emits a clear warning and reports unhealthy, while the existing local backup continues. A stopped worker cannot overlap or schedule more work; stop waits for active work.
- Existing quote/price-book/approval amounts are unchanged. No pricing production source is modified.
