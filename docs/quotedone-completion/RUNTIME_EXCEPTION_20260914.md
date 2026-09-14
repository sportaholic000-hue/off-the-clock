# Recorded runtime exception — September 14, 2026

The owner explicitly authorized a disposable Windows x64 verification workspace using the official portable Node 22.23.2 ZIP, without replacing installed Node or changing persistent PATH/settings.

Only these locked native artifacts may be restored in that copy:

- better-sqlite3 11.10.0: better-sqlite3-v11.10.0-node-v127-win32-x64.tar.gz
- bcrypt 5.1.1: bcrypt_lib-v5.1.1-napi-v3-win32-x64-unknown.tar.gz

Use official Node/maintainer origins. Verify the Node ZIP against its published checksum; record all downloaded/extracted hashes and resolved package versions. Invoke portable node.exe explicitly and select it for children using process-local settings only. Verify Windows x64/ABI 127 before SQLite loads.

Before broad regression runs, prove actual SQLite create/write/transaction/close/reopen, actual bcrypt correct/incorrect-password checks, and actual application startup/authenticated login. Synthetic accounts and isolated stores only; no database/authentication substitutes, intercepted fetch, or compatibility shims for acceptance.

Continue the full workflow in START_HERE.md and ACCEPTANCE.md once runnable. Preserve c9404b586b1b43170514d931902ce6dc656645f6 and later legitimate changes. The engine and protected branches remain frozen. No package upgrades, lockfile regeneration, global/Visual Studio installation, canonical dependency changes, paid providers, live data, merge or deployment. Report only an exact additional failed operation and smallest specific prerequisite if one is genuinely necessary.

This exception supersedes the prior Node/runtime and bcrypt restoration exclusion only within its stated bounds. It does not itself constitute application acceptance.
