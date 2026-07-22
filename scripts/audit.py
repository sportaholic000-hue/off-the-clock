#!/usr/bin/env python3
"""Behavioral audit: drives the seeded app through Playwright and asserts on
real rendered behavior for each contract area in the brief."""
import subprocess, time, os, json, urllib.request, urllib.error, signal, sys

ROOT="/home/claude/otc"; API="http://localhost:3000"; CLIENT="http://localhost:4173"
EMAIL,PASSWORD="preview@offtheclockai.test","PreviewReview2026!"

def req(path,method="GET",body=None,token=None):
    data=json.dumps(body).encode() if body is not None else None
    r=urllib.request.Request(f"{API}{path}",data=data,method=method)
    r.add_header("Content-Type","application/json")
    if token: r.add_header("Authorization",f"Bearer {token}")
    try:
        with urllib.request.urlopen(r,timeout=15) as resp: return resp.status,json.loads(resp.read().decode() or "null")
    except urllib.error.HTTPError as e:
        try: return e.code,json.loads(e.read().decode())
        except: return e.code,None

env=dict(os.environ,NODE_ENV="development",LOCAL_PREVIEW_MODE="true",JWT_SECRET="local-preview-only-not-a-production-secret",BCRYPT_COST="10",DATABASE_PATH="./data/off-the-clock.sqlite",PRICEBOOK_PATH="./data/pricebooks",EMAIL_PROVIDER="console",CLIENT_PORT="4173")
server=subprocess.Popen(["node","scripts/serve-for-capture.mjs"],cwd=ROOT,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
def cleanup(*_):
    try: server.send_signal(signal.SIGTERM)
    except: pass

try:
    for _ in range(60):
        time.sleep(0.5)
        try:
            urllib.request.urlopen(f"{CLIENT}/",timeout=3); req("/api/dashboard"); break
        except:
            if server.poll() is not None: print("SERVER DIED:",server.stdout.read().decode()[:1500]); sys.exit(1)
    req("/api/auth/register","POST",{"email":EMAIL,"password":PASSWORD,"firstName":"Preview","businessName":"Ridgeline Fence Co.","plan":"QuoteDone"})
    _,login=req("/api/auth/login","POST",{"email":EMAIL,"password":PASSWORD})
    token=login["token"]
    _,dash0=req("/api/dashboard",token=token)
    if len(dash0.get("pricebookStatuses",[]))<3:
        req("/api/onboarding/business-types","POST",{"businessTypes":["FENCING_INSTALL","SIDING_REPLACEMENT","FLOORING_INSTALL"]},token)
        req("/api/business/jurisdiction","POST",{"country":"CA","region":"NB"},token)
        req("/api/dev/preview/telephony","POST",{"existingNumber":"(506) 214-7788"},token)
        req("/api/onboarding/knowledge-base","POST",{"about":"Ridgeline Fence Co. installs fencing.","hours":"Mon-Fri 7-5","serviceArea":"Saint John","policies":"Free estimates."},token)
        req("/api/dev/preview/operator","POST",{"enabled":True},token)
        req("/api/pricebook/save","POST",{"defaults":{"markupMode":"markup","markupPercent":30,"taxMode":"TAX_MATERIALS","taxPercent":10,"disposalFee":75},"services":[{"serviceType":"FENCING_INSTALL","service":"Fencing installation","laborPerLinearFoot":14,"materialPerLinearFoot":22,"postSpacing":8,"postPrice":38,"concretePerPost":18,"postsIncludedInMaterial":False,"gatePrice":285,"minimumJob":450,"allowAssumptionBasedQuotes":True,"tiers":[{"name":"Good","overrides":{"materialPerLinearFoot":18}},{"name":"Better","overrides":{"materialPerLinearFoot":22}},{"name":"Best","overrides":{"materialPerLinearFoot":29}}]},{"serviceType":"SIDING_REPLACEMENT","service":"Siding replacement","laborPerSqft":{"vinyl":3.10,"metal":3.80},"materialPerSqft":{"vinyl":4.25,"metal":6.10},"removalPerSqft":1.20,"trimPerLinearFoot":4.50,"disposalPerSqft":0.65,"minimumJob":900,"allowAssumptionBasedQuotes":True,"tiers":[]},{"serviceType":"FLOORING_INSTALL","service":"Flooring installation","laborPerSqft":{"carpet":2.00,"vinyl_plank":2.50},"materialPerSqft":{"carpet":3.00,"vinyl_plank":3.50},"minimumJob":400,"allowAssumptionBasedQuotes":True,"source":"AI_SUGGESTED","confirmedFields":{},"tiers":[]}]},token)

    FINDINGS=[]
    def defect(area,desc): FINDINGS.append(("DEFECT",area,desc)); print(f"  DEFECT [{area}]: {desc}")
    def ok(area,desc): FINDINGS.append(("OK",area,desc)); print(f"  ok [{area}]: {desc}")

    # ===== Area 4/7: API-level quote contract for offered subset & disabled product =====
    print("\n--- Area 4/7: quote engine contracts ---")
    # Disabled flooring type (hardwood not offered) must return review, no substitution.
    _,q=req("/api/quote/calculate","POST",{"serviceType":"FLOORING_INSTALL","customerInputs":{"areaInputMethod":"sqft","floorAreaSqft":600,"newFlooringType":"hardwood","existingFloorType":"none","removalNeeded":False},"callerType":"owner"},token)
    # Flooring is AI-draft/unconfirmed so may block on confirmation; check both paths
    if q and q.get("resultType")=="ESTIMATE_REQUIRES_REVIEW":
        ok("disabled-product","hardwood (not offered) returns ESTIMATE_REQUIRES_REVIEW")
        if q.get("low") or q.get("lowEstimate"): defect("disabled-product","review result carries a customer estimate number")
    else:
        defect("disabled-product",f"hardwood did not return review: {json.dumps(q)[:200]}")

    # Siding vinyl (offered) should quote; metal offered too. Request fiber_cement (not offered) -> review
    _,qs=req("/api/quote/calculate","POST",{"serviceType":"SIDING_REPLACEMENT","customerInputs":{"areaInputMethod":"homeSize","homeSize":"medium","sidingType":"fiber_cement","stories":1,"oldSidingRemoval":True,"trimIncluded":True},"callerType":"owner"},token)
    if qs and qs.get("resultType")=="ESTIMATE_REQUIRES_REVIEW":
        ok("disabled-product","fiber_cement (not offered) returns review")
    else:
        defect("disabled-product",f"fiber_cement siding did not return review: {json.dumps(qs)[:200]}")

    # Offered vinyl siding should produce an estimate
    _,qv=req("/api/quote/calculate","POST",{"serviceType":"SIDING_REPLACEMENT","customerInputs":{"areaInputMethod":"homeSize","homeSize":"medium","sidingType":"vinyl","stories":1,"oldSidingRemoval":True,"trimIncluded":True},"callerType":"owner"},token)
    if qv and qv.get("resultType")=="INSTANT_ESTIMATE_READY":
        ok("offered-product","vinyl siding (offered, priced) produces an estimate")
        # Check customerVisible filtering in API line items
        owner_only=[li for li in qv.get("options",[{}])[0].get("lineItems",[]) if li.get("customerVisible") is False]
        cust=[li for li in qv.get("options",[{}])[0].get("lineItems",[]) if li.get("customerVisible") is True]
        print(f"    (api line items: {len(cust)} customer-visible, {len(owner_only)} owner-only)")
    else:
        defect("offered-product",f"vinyl siding did not produce estimate: {json.dumps(qv)[:200]}")

    # Customer-caller path must be sanitized (no lineItems reach customer)
    _,qc=req("/api/quote/calculate","POST",{"serviceType":"SIDING_REPLACEMENT","customerInputs":{"areaInputMethod":"homeSize","homeSize":"medium","sidingType":"vinyl","stories":1,"oldSidingRemoval":True,"trimIncluded":True},"callerType":"customer"},token)
    if qc and qc.get("options"):
        has_li=any("lineItems" in o for o in qc["options"])
        raw=json.dumps(qc)
        if has_li: defect("customer-sanitize","customer-caller quote still contains lineItems")
        elif "Markup" in raw or "markup" in raw: defect("customer-sanitize","customer quote contains markup")
        else: ok("customer-sanitize","customer-caller quote sanitized (no lineItems, no markup)")

    # ===== Browser-driven UI audit =====
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True)
        ctx=browser.new_context(viewport={"width":1280,"height":900})
        page=ctx.new_page()
        page.add_init_script(f"localStorage.setItem('otc_token','{token}')")

        # ----- Area 3: AI confirmation gating (Flooring is AI-sourced) -----
        print("\n--- Area 3: AI confirmation gating ---")
        page.goto(f"{CLIENT}/pricebook",wait_until="networkidle"); page.wait_for_timeout(1500)
        # Select flooring
        rows=page.query_selector_all(".service-row")
        floor=[r for r in rows if "Flooring" in r.inner_text()]
        if floor:
            floor[0].click(); page.wait_for_timeout(800)
            html=page.content()
            # Draft warning present?
            if "AI-suggested placeholder prices" in html or "DRAFT" in html or "Confirm" in html:
                ok("ai-gating","AI draft indicator present on AI-sourced service")
            else:
                defect("ai-gating","no AI draft/confirm indicator on AI-sourced flooring service")
            # Confirm toggles present?
            confirms=page.query_selector_all(".field-confirm-row")
            if confirms:
                ok("ai-gating",f"{len(confirms)} per-field confirmation controls rendered")
            else:
                defect("ai-gating","no per-field confirmation controls on AI-sourced service")

        # ----- Area 5: blocker navigation -----
        print("\n--- Area 5: blocker navigation ---")
        blockrows=page.query_selector_all(".blocker-row")
        print(f"    blocker rows on flooring: {len(blockrows)}")
        if blockrows:
            txt=blockrows[0].inner_text()
            if txt.strip(): ok("blocker-nav",f"blocker row names a requirement: '{txt[:40]}'")
            # Click and see if it focuses a field
            fid_before=page.evaluate("document.activeElement && document.activeElement.tagName")
            blockrows[0].click(); page.wait_for_timeout(500)
            focused=page.evaluate("document.activeElement && (document.activeElement.tagName + (document.activeElement.getAttribute('aria-label')||''))")
            print(f"    after blocker click, focused: {focused}")

        # ----- Area 9: accessibility - nested buttons, aria-checked -----
        print("\n--- Area 9: accessibility ---")
        # operator switch aria-checked
        page.goto(f"{CLIENT}/dashboard",wait_until="networkidle"); page.wait_for_timeout(1200)
        sw=page.query_selector('[role="switch"]')
        if sw:
            checked=sw.get_attribute("aria-checked")
            ok("a11y",f"operator switch has aria-checked={checked}")
        # nested buttons: a <button> inside a <button>
        nested=page.evaluate("""() => {
            let count=0;
            document.querySelectorAll('button').forEach(b => { if (b.querySelector('button')) count++; });
            return count;
        }""")
        if nested>0: defect("a11y",f"{nested} nested <button> elements (invalid HTML)")
        else: ok("a11y","no nested buttons on dashboard")
        # duplicate IDs
        dupes=page.evaluate("""() => {
            const ids={}; let d=[];
            document.querySelectorAll('[id]').forEach(e=>{ids[e.id]=(ids[e.id]||0)+1;});
            for(const k in ids) if(ids[k]>1) d.push(k+'x'+ids[k]);
            return d;
        }""")
        if dupes: defect("a11y",f"duplicate IDs: {dupes}")
        else: ok("a11y","no duplicate IDs on dashboard")

        # Check pricebook for nested buttons too (disclosure summaries are buttons; blocker rows are buttons)
        page.goto(f"{CLIENT}/pricebook",wait_until="networkidle"); page.wait_for_timeout(1200)
        nested_pb=page.evaluate("""() => { let c=0; document.querySelectorAll('button').forEach(b=>{if(b.querySelector('button'))c++;}); return c; }""")
        if nested_pb>0: defect("a11y",f"{nested_pb} nested buttons on pricebook")
        else: ok("a11y","no nested buttons on pricebook")
        dupes_pb=page.evaluate("""() => { const m={};let d=[];document.querySelectorAll('[id]').forEach(e=>{m[e.id]=(m[e.id]||0)+1;});for(const k in m)if(m[k]>1)d.push(k);return d; }""")
        if dupes_pb: defect("a11y",f"duplicate IDs on pricebook: {dupes_pb}")
        else: ok("a11y","no duplicate IDs on pricebook")

        # ----- Area 1: owner-only leakage across ALL services' previews -----
        print("\n--- Area 1: owner-only leakage in customer preview ---")
        rows=page.query_selector_all(".service-row")
        for r in rows:
            name=r.inner_text().split("\n")[0][:20]
            r.click(); page.wait_for_timeout(700)
            pv=page.query_selector(".quote-preview")
            if pv:
                pvtext=pv.inner_text()
                leaks=[w for w in ["Markup","Margin","Minimum Price Adjustment","Peak season","Overhead"] if w in pvtext]
                if leaks: defect("owner-leak",f"{name} preview leaks: {leaks}")
                else: ok("owner-leak",f"{name} preview clean")

        browser.close()

    print("\n=== SUMMARY ===")
    defects=[f for f in FINDINGS if f[0]=="DEFECT"]
    print(f"defects: {len(defects)}, ok: {len([f for f in FINDINGS if f[0]=='OK'])}")
    for _,a,d in defects: print(f"  DEFECT [{a}]: {d}")
finally:
    cleanup(); time.sleep(1)
