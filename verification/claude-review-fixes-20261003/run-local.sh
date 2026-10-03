#!/bin/sh
# Starts the real API server (development mode, temporary SQLite and price-book
# stores, freshly generated secrets) plus a same-origin proxy serving a client
# build from $OTC_DIST, runs one command, then stops both.
# Usage from the repo root:
#   npm --prefix client run build && cp -r client/dist /tmp/otc-dist && git checkout -- client/dist
#   OTC_DIST=/tmp/otc-dist sh verification/claude-review-fixes-20261003/run-local.sh node verification/claude-review-fixes-20261003/browser-check.mjs
set -e
HERE=$(cd "$(dirname "$0")" && pwd); REPO=$(cd "$HERE/../.." && pwd)
mkdir -p /tmp/otc-review-fixes && rm -f /tmp/otc-review-fixes/app.sqlite*
SECRET1=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
SECRET2=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
cd "$REPO"
env PORT=3201 NODE_ENV=development JWT_SECRET="$SECRET1" BOOKING_SLOT_TOKEN_SECRET="$SECRET2" DATABASE_PATH=/tmp/otc-review-fixes/app.sqlite PRICEBOOK_PATH=/tmp/otc-review-fixes/pb EMAIL_PROVIDER=console LOCAL_PREVIEW_MODE=true BCRYPT_COST=12 PUBLIC_BASE_URL=http://127.0.0.1:4173 CORS_ALLOWED_ORIGINS=http://127.0.0.1:4173 node server/src/server.js > /tmp/otc-review-fixes/server.log 2>&1 &
S=$!
node "$HERE/proxy.mjs" > /tmp/otc-review-fixes/proxy.log 2>&1 &
P=$!
for i in 1 2 3 4 5 6 7 8 9 10; do curl -s http://127.0.0.1:3201/api/health >/dev/null && break; sleep 1; done
set +e
"$@"; RC=$?
kill $S $P 2>/dev/null
exit $RC
