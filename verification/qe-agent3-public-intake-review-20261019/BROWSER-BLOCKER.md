# Real-browser execution boundary

No real-browser service case completed in the local workspace. This is an explicit coverage gap, not a pass and not a product failure.

## Runtime evidence

1. Playwright Chromium 141 started its process but exited with signal `SIGTRAP` before opening a page. A direct headless `about:blank` launch exited 133 with the same trap and no browser log.
2. The workspace has no `/proc` or `/sys`. Firefox 142 exited 255 before a page with `Couldn't find the application directory`; its launcher resolves itself through `/proc/self/exe`.
3. Playwright WebKit 26 was supplied every missing WPE library from packages extracted only into scratch. `ldd` then reported no unresolved library, but the Playwright launch handshake never returned a page. Process inspection itself returned `mount -t proc proc /proc`.
4. The cloud browser was tested against a harmless local HTTP server and returned `net::ERR_CONNECTION_REFUSED`; it does not share the isolated checkout's network namespace.

The sandbox does not grant the mount authority needed to create `/proc`, and this audit did not deploy or tunnel the synthetic application.

## Coverage classification

- Real-browser executed services: **0 of 20**.
- Real-browser untested services: `ROOFING_REPLACEMENT`, `ROOFING_REPAIR`, `FLAT_ROOF_REPLACEMENT`, `FLAT_ROOF_REPAIR`, `INTERIOR_PAINTING`, `EXTERIOR_PAINTING`, `FLOORING_INSTALL`, `FLOORING_REPLACEMENT`, `FENCING_INSTALL`, `FENCING_REPLACEMENT`, `SIDING_REPLACEMENT`, `SIDING_REPAIR`, `CONCRETE_DRIVEWAY`, `CONCRETE_PATIO_SLAB`, `LANDSCAPING_CLEANUP`, `LANDSCAPING_MULCH`, `LANDSCAPING_SOD`, `LANDSCAPING_PLANTING`, `LANDSCAPING_MOWING`, `CUSTOM`.
- Actual React controls exercised in JSDOM, explicitly not counted as browser coverage: `FENCING_INSTALL`, `ROOFING_REPAIR`, `FLOORING_REPLACEMENT`, `CONCRETE_DRIVEWAY`, `LANDSCAPING_MULCH`, `LANDSCAPING_PLANTING`, `LANDSCAPING_MOWING`.
- Public HTTP handlers exercised with valid and correction/invalid cases: **20 of 20**.

`browser-audit.mjs` remains a reproducible real-browser harness for an environment with a working Playwright engine. It covers eight services and eleven distinct rendered patterns, including completed customer outputs. It was not used to claim results here.
