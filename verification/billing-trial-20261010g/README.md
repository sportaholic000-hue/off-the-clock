# Reproduce the synthetic verification

Read [EXPECTED.md](EXPECTED.md) and [REPORT.md](REPORT.md) first. Application code is deliberately unchanged.

With Node 22 and the repository's locked dependencies installed, from the repository root:

```sh
node verification/billing-trial-20261010g/run-dom.mjs
```

The runner composes real billing/webhook/lifecycle/voice routes, injected fake providers, in-memory SQLite, and the unchanged React app in jsdom. It writes only under this folder. It needs no provider environment variables or real accounts. It forbids unexpected fake-provider writes and blocks frontend requests outside the local test server. The expected current result is exit 1: seven DOM/API checks, two pass and five fail. JSON, text, HTML and the final console log describe observations; HTML is not a screenshot.

`node verification/billing-trial-20261010g/serve.mjs` starts a local synthetic server and prints its loopback address plus synthetic-only session tokens for manual inspection. No automatic checkout or real provider operation is available. Stop it after inspection. The automated runner handles its own server shutdown.

`environment.mjs` confines import-time application storage to ignored `.runtime/`. `harness.mjs` bundles the actual client entry into `.runtime/client`; it never builds into client/dist. Initial setup/measurement failures are retained separately from the final results for traceability.
