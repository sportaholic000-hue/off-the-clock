# Environment evidence

- Exact remote base and local checkout: 73c00622d6f2df31f57773b32e41355a7421f1a3.
- Default Node v24.19.0 cold npm ci failed: better-sqlite3 had no matching prebuild; node-gyp header extraction repeatedly failed with TAR_ENTRY_ERROR EINVAL fchown. This is an environment failure, not a billing defect.
- npm ci --ignore-scripts installed 262 packages, but is not counted as a usable native install.
- Downloaded official Node v22.22.0 archive to an isolated scratch runtime using Python tarfile data extraction; cold npm ci with that runtime installed 262 packages successfully (log retained). No package/lockfile changes.
- Initial relevant-suite run failed at worker preload because this workspace has no usable /tmp (ENOENT in mkdtemp). Thirteen workers failed before application tests. Rerun uses a writable scratch TMPDIR; no source change.
- Owner/widget cold builds passed. Chromium download repeatedly returned invalid/truncated ZIPs; both existing browser runners then failed before page creation because no executable was installed. Neither is a product failure or accepted browser workflow. Logs retained.
