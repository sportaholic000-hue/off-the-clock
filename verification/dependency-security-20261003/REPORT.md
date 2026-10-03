# Dependency security repair — October 3, 2026

The security audit on PR #19 failed on commit `a662b76766eaa827a247ed564b624665c30ed41e`. The builds and existing test-result gate passed. The failing step was `npm audit --omit=dev --audit-level=high`.

## Cause and repair

The unused `tailwindcss` 3.4.19 dependency pulled in `braces` 3.0.3 through `chokidar`, `micromatch` and `fast-glob`. [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) reports a high-severity stack-exhaustion denial of service in braces, with no patched braces version listed when checked. npm reported five affected dependency-tree entries from this advisory. These were not five quote-engine calculation failures.

The application uses its own CSS. Source/configuration inspection found no Tailwind imports, directives, configuration or build invocation. Removing the unused direct dependency removes its 56 exclusive dependency entries from the lockfile. Every retained package entry, version and integrity value is unchanged. No replacement package, forced upgrade or audit exception was introduced.

The repository also tracked an old `node_modules` directory, including the affected packages, despite its existing `node_modules/` ignore rule. This commit removes that tracked directory. Install dependencies with `npm ci`; the CI and Docker build already do so. Locally installed dependencies remain available for verification but are not uploaded. This removes stale installed copies from the new Git tree; it does not rewrite repository history.

Production source changes are limited to `client/package.json`, `package-lock.json`, and removal of tracked installed dependencies. No quote formula, application source, styling, workflow or audit threshold changes.

## Verification

- Clean `npm ci --no-audit --no-fund`: passed; installed 255 packages. The affected five-package chain is absent from the installed tree and lockfile.
- `npm audit --omit=dev --audit-level=high --json`: exit 0; zero known vulnerabilities at every severity.
- `npm audit --json`: exit 0; zero known vulnerabilities across all project dependencies.
- Owner and widget production builds: passed. SHA-256 comparison confirms all five generated files are byte-identical to the builds before dependency removal.
- Full regression suite: 1,270 records; 1,259 passed, nine unchanged baseline voice failures, two skipped. Existing `.github/scripts/check-test-results.mjs` exits 0 and confirms exactly the nine known failures. No new test failure.

Local runtime: Node 22.23.2, npm 11.9.0, fresh isolated project dependencies. The full-suite command used the existing local Playwright browser/module paths and `node --test --test-concurrency=1 test/*.spec.js test/*.spec.mjs`. The raw test process exits 1 because of the nine documented voice failures; the existing known-failure checker passes. These failures have not been hidden or fixed by this dependency repair.

Evidence in this directory: `before-ci-audit.txt`, `clean-install.log`, `production-audit.json`, `all-dependencies-audit.json`, `build.log`, before/after build hashes, `lockfile-diff.json`, `source-binding.json`, `full-suite.tap.gz`, `test-check.txt`, and `MANIFEST.json`.

The pre-fix CI run is [37094013514](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/37094013514). GitHub checks for the repair commit are verified separately after publication. This report records local verification and is not a claim of deployment or a complete product security audit. Zero known dependency advisories does not establish that all application security issues are absent.
