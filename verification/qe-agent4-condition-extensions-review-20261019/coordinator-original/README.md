# Remaining import condition extensions

Personally reproduced at `db1dcb4cb4dedebb59811c390c8fe2ac9a608846` on October 19, 2026.

All thirteen earlier exact runs now behave correctly. Five longer visible, explicitly site-wide conditions still disappear even though both pages are read. The importer returns the bare synthetic listing with `limited:false` and `conditionsUnverified:false`; the direct listed-price calculator returns `calculated` and `30.00` for quantity three.

`reproduce.mjs` contains the exact five strings, complete two-page markup, injected loopback HTTP transport, and assertions requiring literal condition retention or withholding. Run it against a repository checkout with its dependencies installed. It changes no repository files and makes no external network request. The expected result after repair is five passing cases. The preserved baseline is zero passes and five assertion failures.

These are synthetic website terms, not Off The Clock payment or business policies. This reproduction covers the actual importer and direct parser. It does not claim fresh draft/save, dispatcher, browser, provider or ASR coverage. H1 partial-import policy, H2 connected-provider refresh and F2 roofing policy are separate.
