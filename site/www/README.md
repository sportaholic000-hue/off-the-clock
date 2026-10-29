# Public website (www)

Static files for the marketing site. Upload this folder as-is to any static host.

- `index.html`: the Claude Design homepage with page title, description, social preview tags and the live demo script.
- `support.js`: the Claude Design runtime the page needs. It loads React 18.3.1 from unpkg.com at view time.
- `favicon.svg`, `og-image.png`: tab icon and the 1200 × 630 social preview image.

Source of truth for the design is `design-reference/homepage/index.html`; `site/homepage.claude-design.html` is the single-file bundle of the same page. Edits must land in both, or be re-exported from Claude Design.

## Before going live

1. Host this folder at `https://www.offtheclockai.com` and redirect the bare domain to it (or change the canonical and preview URLs in `index.html` to match the chosen address).
2. On the app service set `DEMO_ENABLED=true` and `DEMO_ALLOWED_ORIGINS=https://www.offtheclockai.com,https://offtheclockai.com` so the Start Live Demo Call button can open a session.
3. The footer links to `/privacy` and `/terms`. Those pages are not here yet; add them once the owner approves the policy text.
4. Every Start free and plan button goes to `https://app.offtheclockai.com/signup`. A new owner cannot sign in until the verification email arrives, so keep signup closed until live email works (branch `claude/launch-hardening-20261029` adds `OWNER_SIGNUP_ENABLED` and refuses to start production with signup open and no live email).

## Known gaps

- The layout has no phone breakpoints. On a 390 px wide screen the page is 663 px wide and scrolls sideways, the brand name is cut off and the live-call panel is squeezed to the right edge. A Claude Design mobile pass is needed before launch.
- React loads from unpkg.com every time the page opens. With unpkg.com unreachable the page shows nothing.
- "Setup: self-serve, ~15 minutes" has not been timed against the real onboarding.
