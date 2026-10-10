# Verification checkpoint — first product result

0 PASS / 1 FAIL so far. The enabled Billing route returns 200 and the real React page renders Trial, but both omit minute usage; the page also omits days left and the 60-minute trial cap. The real minute service correctly reports 0 used / 60 included / 60 left. Remaining checks are running. Screenshots are blocked by the browser environment.

Base `claude/release-candidate-20261010g` was confirmed by `git ls-remote` as `8973f429df487c58f3ad7a49bfdb35ebbb9a274a` before starting. The verification branch is `verify/billing-trial-20261010g`. This checkpoint saves the prewritten expectations, the synthetic-only harness, and initial setup evidence before continuing.

- Node 22.14.0, obtained as the official `node-linux-x64` npm package, exits 139 even for `--version`; the first npm ci consequently failed in bcrypt's install script.
- The available Node 24.19.0 runs. Its npm ci failed while better-sqlite3 attempted to extract Node headers: `EINVAL: invalid argument, fchown`.
- Bundled Playwright had no installed Chromium. Installation first failed because this environment has no writable default `/tmp`; using a workspace temporary directory reached the download, but the download was invalid/truncated, followed by a stale installation lock error.
- The alternate local `@sparticuz/chromium@131.0.1` package installed, but extraction failed on `chown` for libEGL.so. No browser screenshot has been claimed.

The first checkpoint was confirmed on GitHub by `git ls-remote` at `f82bd98ff4d1023491c9ab0bca3836b91080df2b`.

Resolved setup issues: the first Node 22 executable had been truncated during extraction (33,832,960 instead of 120,177,224 bytes). Re-extraction with a byte-count check restored Node 22.14.0. `npm ci --ignore-scripts` and `npm rebuild better-sqlite3 bcrypt esbuild` under Node 22 succeeded. All product experiments use Node 22. The DOM harness supplies the standard structuredClone API absent from jsdom; application code is unchanged.

Unresolved browser environment: the fully extracted Chromium 131 binary reports its version but both launch attempts exit with SIGTRAP before a page opens. The cloud browser cannot reach the loopback server (`net::ERR_CONNECTION_REFUSED`). The saved HTML/text are actual React DOM evidence, explicitly not screenshots. No browser or product fixes are being made.
