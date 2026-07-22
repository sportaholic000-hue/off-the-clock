#!/usr/bin/env python3
"""Local visual-review capture. Starts the API + static client servers as a
Node subprocess, seeds, then drives Chromium via Python Playwright to capture
desktop and mobile screenshots. Preview-only; operator toggles route through
the /api/dev/preview/* guard that always keeps real operator disabled."""
import subprocess, time, sys, os, json, urllib.request, signal

ROOT = "/home/claude/otc"
API = "http://localhost:3000"
CLIENT = "http://localhost:4173"
EMAIL, PASSWORD = "preview@offtheclockai.test", "PreviewReview2026!"

def req(path, method="GET", body=None, token=None):
    url = f"{API}{path}"
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, method=method)
    r.add_header("Content-Type", "application/json")
    if token: r.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(r, timeout=15) as resp:
            return resp.status, json.loads(resp.read().decode() or "null")
    except urllib.error.HTTPError as e:
        return e.code, None

# 1. Start the combined server (Node) as a subprocess.
env = dict(os.environ,
    NODE_ENV="development", LOCAL_PREVIEW_MODE="true",
    JWT_SECRET="local-preview-only-not-a-production-secret",
    BCRYPT_COST="10", DATABASE_PATH="./data/off-the-clock.sqlite",
    PRICEBOOK_PATH="./data/pricebooks", EMAIL_PROVIDER="console",
    CLIENT_PORT="4173")
server = subprocess.Popen(["node", "scripts/serve-for-capture.mjs"], cwd=ROOT, env=env,
                          stdout=subprocess.PIPE, stderr=subprocess.STDOUT)

def cleanup(*_):
    try: server.send_signal(signal.SIGTERM)
    except Exception: pass
signal.signal(signal.SIGTERM, cleanup)

try:
    # Wait for both servers.
    for _ in range(60):
        time.sleep(0.5)
        try:
            urllib.request.urlopen(f"{CLIENT}/", timeout=3)
            req("/api/dashboard")
            break
        except Exception:
            if server.poll() is not None:
                print("SERVER EXITED EARLY:")
                print(server.stdout.read().decode()[:2000]); sys.exit(1)
    print("servers up")

    # 2. Seed.
    req("/api/auth/register", "POST", {"email":EMAIL,"password":PASSWORD,"firstName":"Preview","businessName":"Ridgeline Fence Co.","plan":"QuoteDone"})
    _, login = req("/api/auth/login", "POST", {"email":EMAIL,"password":PASSWORD})
    token = login["token"]
    _, dash = req("/api/dashboard", token=token)
    if len(dash.get("pricebookStatuses", [])) < 3:
        req("/api/onboarding/business-types","POST",{"businessTypes":["FENCING_INSTALL","SIDING_REPLACEMENT","FLOORING_INSTALL"]},token)
        req("/api/business/jurisdiction","POST",{"country":"CA","region":"NB"},token)
        req("/api/dev/preview/telephony","POST",{"existingNumber":"(506) 214-7788"},token)
        req("/api/onboarding/knowledge-base","POST",{"about":"Ridgeline Fence Co. installs cedar, chain link and vinyl fencing across greater Saint John.","hours":"Mon-Fri 7-5, Sat 8-12","serviceArea":"Saint John, Rothesay","policies":"Free estimates."},token)
        req("/api/dev/preview/operator","POST",{"enabled":True},token)
        req("/api/pricebook/save","POST",{
            "defaults":{"markupMode":"markup","markupPercent":30,"taxMode":"TAX_MATERIALS","taxPercent":10,"disposalFee":75},
            "services":[
                {"serviceType":"FENCING_INSTALL","service":"Fencing installation","laborPerLinearFoot":14,"materialPerLinearFoot":22,"postSpacing":8,"postPrice":38,"concretePerPost":18,"postsIncludedInMaterial":False,"gatePrice":285,"minimumJob":450,"allowAssumptionBasedQuotes":True,"tiers":[{"name":"Good","overrides":{"materialPerLinearFoot":18}},{"name":"Better","overrides":{"materialPerLinearFoot":22}},{"name":"Best","overrides":{"materialPerLinearFoot":29}}]},
                {"serviceType":"SIDING_REPLACEMENT","service":"Siding replacement","laborPerSqft":{"vinyl":3.10,"metal":3.80},"materialPerSqft":{"vinyl":4.25,"metal":6.10},"removalPerSqft":1.20,"trimPerLinearFoot":4.50,"disposalPerSqft":0.65,"minimumJob":900,"allowAssumptionBasedQuotes":True,"tiers":[]},
                {"serviceType":"FLOORING_INSTALL","service":"Flooring installation","laborPerSqft":{"carpet":2.00,"vinyl_plank":2.50},"materialPerSqft":{"carpet":3.00,"vinyl_plank":3.50},"minimumJob":400,"allowAssumptionBasedQuotes":True,"source":"AI_SUGGESTED","confirmedFields":{},"tiers":[]}
            ]}, token)
        print("seeded")
    else:
        print("already seeded")

    # 3. Capture.
    from playwright.sync_api import sync_playwright
    os.makedirs("/tmp/shots", exist_ok=True)
    shots = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        def cap(name, path, width, height, setup=None):
            ctx = browser.new_context(viewport={"width":width,"height":height})
            page = ctx.new_page()
            page.add_init_script(f"localStorage.setItem('otc_token','{token}')")
            page.goto(f"{CLIENT}{path}", wait_until="networkidle")
            page.wait_for_timeout(1200)
            if setup: setup(page)
            out = f"/tmp/shots/{name}.png"
            page.screenshot(path=out, full_page=True)
            shots.append((name, out, f"{width}x{height}"))
            ctx.close()

        for label, path in [("dashboard","/dashboard"),("pricebook","/pricebook"),("onboarding","/onboarding?step=4")]:
            cap(f"{label}_desktop", path, 1280, 900)
            cap(f"{label}_mobile", path, 375, 812)

    print("\n=== SCREENSHOTS ===")
    for n, o, d in shots:
        sz = os.path.getsize(o)
        print(f"  {n}: {o} ({d}, {sz} bytes)")
finally:
    cleanup()
    time.sleep(1)
