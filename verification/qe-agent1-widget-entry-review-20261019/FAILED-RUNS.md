# Preserved failed executions

## Initial rendered harness — 7aac065d08fa6339dade2aa25891513a8dbc110c

Hosted run [39310251440](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/39310251440).
All 120 new case checks failed, followed by their parent test. The widget launcher
never appeared because the reused booking application fixture seeded `synthetic-a`
as the public key. This 11-character test key does not satisfy the actual loader’s
16–128 character contract. The access handler retained that fixture key. The
application normally issues 32-character keys. This is a test-fixture failure,
not evidence of a customer-facing product defect.

The complete source-bound 105-file bundle is `hosted-checkpoint-01.bundle.json.gz`;
`hosted-checkpoint-01-summary.json` includes the result and every extracted file’s
SHA-256. Run `python3 extract-evidence.py BUNDLE NEW_DIRECTORY` to inspect it.
No original evidence was replaced. The extracted working copy was removed only
after validating the complete archive and recording its file hashes.

The correction removes only this seeded key from the isolated synthetic fixture,
then uses the real POST /api/quotedone/access handler to issue a new key. It does
not set a synthetic replacement key, change the loader, or loosen key validation.

Build, the existing browser gate and Docker passed on this failed checkpoint.
Strict failed. Full suite, checker and dependency audit did not run; no pass is
inferred for them.

## Intermediate checkpoint — f3fd1753d8feed79b90af048e3646875c6c6c5fc

Run [39313837055](https://github.com/sportaholic000-hue/off-the-clock/actions/runs/39313837055)
started before the short-key cause was diagnosed. It retains that same fixture
error. All 120 new case checks again failed before entry. The complete bundle
is preserved as `hosted-checkpoint-02.bundle.json.gz`, with result and source
binding in `hosted-checkpoint-02-summary.json`. This is not verification of the
corrected key setup at af0fd1c.

## Local Chromium

`local-chromium-probe-01.log` records the default missing executable. The supplied
local Chromium then exits with SIGTRAP; `local-chromium-01.log` and its source-bound
JSON evidence preserve that failure. No local rendered pass is claimed. Hosted
Chromium is required for this task.
