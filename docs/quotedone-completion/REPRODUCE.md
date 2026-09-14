# Reproduce the non-production application evidence

Tested implementation commit: e936370165cb23bbb0087d245ecd64bc82178fe0. Delivery documentation/evidence commits do not change these application or regression source files.

Use a disposable Windows x64 copy named quotedone-verification, with the existing locked dependencies. Follow RUNTIME_EXCEPTION_20260914.md. Restore only the official Node 22.23.2 portable archive and the matching better-sqlite3 11.10.0 / bcrypt 5.1.1 native artifacts. The evidence ZIP contains origins, downloaded hashes, extracted hashes and Node's published checksum. It contains no runtime binaries, credentials or live stores.

Do not install packages or change the lockfile. Use the portable node.exe explicitly. Set PRICEBOOK_BROWSER_MODULE to an already available Playwright module, PRICEBOOK_BROWSER_EXECUTABLE to the existing Chrome executable, ESBUILD_BINARY_PATH to the existing matching Windows esbuild executable and QUOTEDONE_GIT to the existing Git executable for this process only. No browser download or global configuration is part of these commands.

The committed runner records the exact child executable, arguments, working directory, runtime, full output and exit. All child Node commands inherit only a process-local runtime path. Replace the example absolute paths with the corresponding disposable directories:

    <portable-node.exe> verification/quotedone/run-completion.mjs <disposable-copy> <fresh-evidence> runtime
    <portable-node.exe> verification/quotedone/run-completion.mjs <disposable-copy> <fresh-evidence> application <git-candidate> <prior-synthetic-database>
    <portable-node.exe> verification/quotedone/run-completion.mjs <disposable-copy> <fresh-evidence> browser
    <portable-node.exe> verification/quotedone/run-completion.mjs <disposable-copy> <fresh-evidence> regression <git-candidate>

Runtime runs first: actual SQLite create/write/transaction/rollback/close/reopen, real bcrypt correct/incorrect-password checks and real server registration/login. The application group uses the earlier synthetic database only for its non-destructive schema-upgrade control. The prior database can be reproduced by running runtime-preflight.mjs against preserved c9404b586b1b43170514d931902ce6dc656645f6 with a fresh store; do not reset an existing checkout to do so.

The browser group uses real sign-in, the real React application, real HTTP and SQLite. editor-integrity-workflow.mjs forwards unchanged real HTTP response bytes through a local relay to vary delivery order; it does not intercept fetch, supply fake responses or replace authentication/database behavior. Synthetic legacy fixtures and a genuine SQLite abort trigger are explicitly identified where used.

The regression group runs npm test, test:vnext, phase1:test, the original independent precision wrapper, the existing focused editor/store/fixture tests, the instrumented engine replay, the historical isolation gate, the separate integration boundary and the client build through the existing locked Vite JavaScript entrypoint (`<portable-node.exe> <disposable-copy>/node_modules/vite/bin/vite.js build`, with `<disposable-copy>/client` as the working directory). The npm workspace wrapper previously failed because its Windows Vite command launcher was absent; no dependencies or launchers were installed to address that wrapper failure. Existing component tests use their original controlled transport and are reported separately from application acceptance.

The unchanged historical gate:quote-vnext exits 1 because it forbids every application VNext import. This completion branch intentionally contains one authorized bridge. The runner requires exactly that reported bridge and the separate integration-boundary check must pass; the historical gate is not called a pass. No Phase 0 command, workflow edit, production merge, provider call or deployment is included.

Every application run records complete request/response and internal quote/lead evidence, with secrets omitted, plus hashes of the actual executed source. SOURCE_MANIFEST.json ties the disposable bytes to Git blobs and records line-ending normalization separately. Inspect these together with the command logs; an older worktree reproduction is not a final-commit pass.

After extracting the evidence ZIP, run its read-only inspector from the tested candidate repository (or the delivery commit, which has identical implementation): `<portable-node.exe> <extracted-evidence>/inspect-evidence.mjs <extracted-evidence>`. Set QUOTEDONE_GIT to your existing Git executable. It checks command exits, full customer object allowlists, persisted relationships, executed source hashes, runtime results, boundary outcomes and original numerical counts. ARCHIVE_MANIFEST.json independently lists each archived member hash; EVIDENCE_INDEX.json records the ZIP hash.
