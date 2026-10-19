# QE Agent 3 public intake review — 2026-10-19

Audit target: pending checkpoint `28c1c331e841878cce8edb1f235523e001ca0b25`.

This directory contains independent amount expectations, route/control inventory, synthetic fixture construction, actual public HTTP verification, a focused activation reproduction, actual React-control interaction in JSDOM, and a real-browser harness. The browser execution gap is recorded in `BROWSER-BLOCKER.md`; JSDOM results are never represented as real-browser results.

No production source, shared test, selector, workflow, pricing rule, default, engine version, or speech-confirmation behavior is changed by this branch.

## Reproduction commands

Use Node 22 and a writable `TMPDIR` in environments where `/tmp` is absent.

```sh
node verification/qe-agent3-public-intake-review-20261019/http-audit.mjs . /tmp/qe-agent3-http
node verification/qe-agent3-public-intake-review-20261019/activation-probe.mjs . /tmp/qe-agent3-activation
node verification/qe-agent3-public-intake-review-20261019/dom-control-audit.mjs . /tmp/qe-agent3-http/public-catalog.json /tmp/qe-agent3-dom
```

For a host with Playwright 1.56 and Chromium installed:

```sh
PUBLIC_INTAKE_PLAYWRIGHT_MODULE=/path/to/node_modules/playwright \
PUBLIC_INTAKE_BROWSER=chromium \
node verification/qe-agent3-public-intake-review-20261019/browser-audit.mjs . /tmp/qe-agent3-browser
```

All contacts, books, providers, amounts, and identities used by these scripts are synthetic. No live-provider or ASR claim is made.
