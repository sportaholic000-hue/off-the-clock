# Verification checkpoint — running

Incomplete: no product check has completed yet. Local environment setup failures are recorded; they are not product defects. Screenshots are not yet available.

Base `claude/release-candidate-20261010g` was confirmed by `git ls-remote` as `8973f429df487c58f3ad7a49bfdb35ebbb9a274a` before starting. The verification branch is `verify/billing-trial-20261010g`. This checkpoint saves the prewritten expectations, the synthetic-only harness, and initial setup evidence before continuing.

- Node 22.14.0, obtained as the official `node-linux-x64` npm package, exits 139 even for `--version`; the first npm ci consequently failed in bcrypt's install script.
- The available Node 24.19.0 runs. Its npm ci failed while better-sqlite3 attempted to extract Node headers: `EINVAL: invalid argument, fchown`.
- Bundled Playwright had no installed Chromium. Installation first failed because this environment has no writable default `/tmp`; using a workspace temporary directory reached the download, but the download was invalid/truncated, followed by a stale installation lock error.
- The alternate local `@sparticuz/chromium@131.0.1` package installed, but extraction failed on `chown` for libEGL.so. No browser screenshot has been claimed.

Verification continues using a dependency installation without native lifecycle scripts; the harness's existing Stripe fixture uses Node's built-in SQLite. No source fixes are being made. The final report will replace this checkpoint and explicitly distinguish unavailable checks from observed product failures.
