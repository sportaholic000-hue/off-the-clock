# Controlled account-email acceptance

Source candidate: `ad925d0fa368f295fd2f22b53ef115c55b5f4bdb`. This procedure is prepared and has not run against a real provider or deployed environment.

## Establish the target

Record the frontend/API origins, hosting environment, deployed source identity, verified From domain, and designated test inbox. Confirm the build includes the PR #4 auth changes; route presence alone does not prove source identity. Review protected sender configuration without copying secrets to evidence. Use an isolated staging store where available.

For each recovery route (/verify-email, /reset-password, /forgot-password, /resend-verification, /account/email), open a direct URL and confirm the built app loads. A synthetic fragment can check routing without consuming any real account token. Check the actual same-site/proxy setup and exact CORS origins.

## Expected workflow

1. Register the designated test owner through the actual frontend. Expect one account and pending_payment. Provider acceptance is recorded separately from inbox receipt.
2. Receive the verification email in the designated inbox. Record From, public link origin, received time, and inbox/spam placement. Keep message body/token private.
3. Open the actual verification link in a fresh browser context. The app must load, remove the token fragment, and require explicit confirmation. Confirm verification; opening the page alone must not consume the token.
4. Open the same link again and attempt confirmation. Expect rejection and a usable recovery path.
5. On a separately designated unverified test account, request another verification email after the cooldown. Confirm delivery and correct account binding. After successful verification, remaining verification links must be unusable. Do not silently create additional recipient accounts.
6. Sign the verified test account in on two devices/contexts. Request password recovery through the real frontend and receive the reset message.
7. Check password confirmation mismatch preserves the form and does not consume the link. Complete reset with matching passwords.
8. Expect old-password failure, new-password success, and rejection of old sessions on both devices. Confirm the reused reset link fails and payment/plan state is unchanged.
9. In the controlled environment, restart the actual server and confirm token/session outcomes remain durable. Restart only when that environment action is authorized.
10. Confirm public recovery uses the same response for known and unknown accounts and shows provider failure truthfully. The application limits, token expiration boundaries and simulated provider failures already have synthetic coverage; do not disable a production provider or alter token rows to manufacture a failure.

A real Gmail/Outlook placement check can be run with separately designated inboxes. Report only the inboxes actually tested. This account test alone does not certify spec 13.10 owner-alert emails.

## Evidence and acceptance

Record release/source identity, tested origin/topology, provider domain status, DNS review, safe HTTP outcomes, provider receipt and inbox receipt as distinct facts, successful verification/reset, reuse rejection, session revocation, and preserved billing state. Use labels/hashes for test-account identity in committed evidence. Never commit passwords, API keys, account links/tokens, email bodies, cookie values, browser storage or private databases.

Retain incomplete or failed attempts. Mark each check pass/fail/unverified with its observed result. One provider receipt or a passing synthetic CI run cannot establish this gate. Report the exact code source and actual deployed source separately if they differ.
