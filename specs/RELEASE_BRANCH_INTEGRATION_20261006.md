# Approved branch integration — October 6, 2026

Starting candidate: `f049499999fd24c3e0c4ca04924a1065e2a97775` on
`codex/quote-release-candidate-20261006`. The owner authorized these real merges:

| Branch | Pinned revision |
| --- | --- |
| `fix/pricebook-persistence-editor-20261005` | `efea10717a6c3788cc07596513059fc868694cd3` |
| `fix/telephony-provisioning-20261005` | `2b6e5c5263abdebe872593982d1f2cb529ba4be9` |
| `feat/owner-call-visibility-20261006` | `83f666ccbc122b4ac667992d60449454e0629e84` |
| `claude/demo-annual-pricing-20261005` | `68a48d14ff34238456ffa4d63523c4635dfdd162` |

No subagents, merge to main, deployment, provider writes or live business data.
The demo branch's provider-backed workflows are retained but not dispatched;
their push triggers do not match the release candidate branch.

## Every textual conflict

| File and conflict | Resolution |
| --- | --- |
| `server/priceBookService.js`: imports | Keep shared structure/UUID validation and add the durable ledger's application database import. |
| Same file: saved-book read | Validate the complete structure first, then backfill the durable creation record. Malformed persisted containers still fail closed. |
| Same file: service IDs on save | Retain the candidate's stricter original-ID protection, invalid-ID rejection and case-insensitive duplicate rejection. Preserve incoming missing-file refusal and creation recording. Remove the redundant, weaker normalizer. |
| `server/src/quoteDoneBridge.js`: status cache | Combine the incoming distinct unsaved-service identity with the candidate's effective profile/book time-zone key and trusted date context. |
| Same file: draft validation/status functions | Use the incoming shared numeric converter/validator and case-insensitive saved-ID matching; preserve date context in status and validation callers. |
| Same file: save/approve functions | Retain incoming creation receipts and locked read/check/write behavior; preserve candidate date context on save and approval responses. |
| Same file: preview | Calculate and describe the draft service; retain trusted quote instant/time zone and current saved-approval checks. |
| `.github/workflows/ci.yml`: summary publication | Retain the candidate's `awk` form: an empty failure list succeeds, but a missing report still fails. Preserve both branches' tests and all CI gates. |

Telephony and demo merged without textual conflicts. Owner-call route changes
also merged without textual conflicts; the CI publisher above was that branch's
only conflict. No test from either parent was removed.

## Release guards and expectations written before execution

- Production must start only with
  `quote-engine-vnext-date-context-20261006-v7`; a stale or empty compiled
  engine version must terminate before the server listens. A current-version
  control must start successfully. These cases calculate no money.
- Mowing: 5,000 measured square feet at $0.02 = **$100.00** labor. No markup,
  tax, fees, minimum uplift or range buffer. October's 10% labor surcharge is
  **$10.00**, producing **$110.00**.
- At `2026-11-01T06:30:00.000Z`, Los Angeles is in October (**$110.00**),
  UTC in November (**$100.00**). At `2026-09-30T15:30:00.000Z`, UTC is in
  September (**$100.00**), Tokyo in October (**$110.00**). Changing the profile
  zone alone must refresh owner status, the public catalog and quote context;
  the saved price-book bytes and another tenant's status must stay unchanged.
- With an invalid book zone and invalid profile zone, that seasonal service is
  not ready, absent from the public catalog and produces no dollar estimate.
  Restoring a valid profile zone restores readiness without a book save.
- An old-version approval must show exactly: **Pricing rules changed — review
  and re-approve this service before customer quotes resume.** It must not
  quote. Explicit re-approval restores the unchanged **$100.00** control.
- The owner time-zone notice must not promise UTC fallback when neither zone
  is valid. Preserve the existing notice heading and its presence/absence tests;
  explain that a valid saved profile zone is used, while seasonal quoting is
  paused if neither zone is valid.
- Incoming monetary assertions stay unchanged: fixed custom **$100.00** /
  tier **$125.00**; 10,000 square feet at $0.005 = **$50.00**, and the edited
  draft at $0.0075 = **$75.00**. Stored call receipts remain **$221.23**.
  Annual plan copy remains **$1,190** / **$2,790**, ten times $119 / $279.
  Other existing suites retain their prewritten financial expectations.

The profile-zone guard uses the real saved book, database profile, authenticated
owner validation and public catalog route. Production-version tests launch the
real server in synthetic storage. Provider operations remain disabled.

## Integration gate correction

The architecture check previously treated the literal pinned engine version as
a module import. Match the engine directory path (`quote-engine-vnext/`) instead,
preserving rejection of static imports, re-exports, dynamic imports and CommonJS
loads. Seven execution tests cover the version control and those forbidden
paths, direct calculation outside the bridge, and legacy engine imports. An
empty selected test set still fails. No pricing arithmetic or expected amounts
changed.

The existing `quoteReviewFixes` stale-version regression expected the old generic
confirmation copy. Its one text assertion now requires the owner's exact new
stale-approval message; its readiness/approval assertions remain intact. No
financial assertion was changed.
