#!/usr/bin/env python3
"""Renders EVERY trade's price-book editor and measures each field's shape:
line count, font sizes, colours, and any layout collisions. Consistency audit."""
import subprocess,time,os,json,urllib.request,urllib.error,signal,sys
ROOT="/home/claude/otc";API="http://localhost:3000";CLIENT="http://localhost:4173"
def req(p,m="GET",b=None,t=None):
    d=json.dumps(b).encode() if b else None
    r=urllib.request.Request(f"{API}{p}",data=d,method=m);r.add_header("Content-Type","application/json")
    if t:r.add_header("Authorization","Bearer "+t)
    try:
        with urllib.request.urlopen(r,timeout=15) as x:return x.status,json.loads(x.read().decode() or "null")
    except urllib.error.HTTPError as e:
        try:return e.code,json.loads(e.read().decode())
        except:return e.code,None

env=dict(os.environ,NODE_ENV="development",LOCAL_PREVIEW_MODE="true",JWT_SECRET="x",BCRYPT_COST="10",
         DATABASE_PATH="./data/off-the-clock.sqlite",PRICEBOOK_PATH="./data/pricebooks",EMAIL_PROVIDER="console",CLIENT_PORT="4173")
srv=subprocess.Popen(["node","scripts/serve-for-capture.mjs"],cwd=ROOT,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
try:
    for _ in range(60):
        time.sleep(0.5)
        try:urllib.request.urlopen(f"{CLIENT}/",timeout=3);req("/api/dashboard");break
        except:
            if srv.poll() is not None:print(srv.stdout.read().decode()[:900]);sys.exit(1)

    ALL=json.load(open("/tmp/allfields.json"))
    trades=list(ALL.keys())
    req("/api/auth/register","POST",{"email":"alltrades@test.local","password":"PreviewReview2026!","firstName":"A","businessName":"All Trades","plan":"QuoteDone"})
    _,l=req("/api/auth/login","POST",{"email":"alltrades@test.local","password":"PreviewReview2026!"});t=l["token"]
    st,_=req("/api/onboarding/business-types","POST",{"businessTypes":trades},t)
    print("business-types:",st,"trades:",len(trades))
    # Save every trade with NO pricing -> all fields visible as blockers.
    services=[]
    for ty in trades:
        svc={"serviceType":ty,"service":ty.replace("_"," ").title()}
        if "allowAssumptionBasedQuotes" in ALL[ty]: svc["allowAssumptionBasedQuotes"]=True
        services.append(svc)
    st,r=req("/api/pricebook/save","POST",{"defaults":{"markupMode":"markup","markupPercent":30,"taxMode":"TAX_NONE","taxPercent":0},"services":services},t)
    print("pricebook/save:",st, ("" if st==200 else json.dumps(r)[:200]))

    from playwright.sync_api import sync_playwright
    SHAPE_JS = """() => {
      const fields=[...document.querySelectorAll('.owner-field')];
      return fields.map(f=>{
        const t=f.querySelector('.owner-field-title');
        const d=f.querySelector('.owner-field-definition');
        const h=f.querySelector('.owner-field-help');
        const g=e=>e?{fs:getComputedStyle(e).fontSize,lh:getComputedStyle(e).lineHeight,c:getComputedStyle(e).color}:null;
        return {lines:[t,d,h].filter(Boolean).length,
                title:t?t.textContent.slice(0,38):null,
                hasDef:!!d, hasHelp:!!h,
                defStyle:g(d), helpStyle:g(h)};
      });
    }"""
    COLLIDE_JS = """() => {
      const bad=[];
      document.querySelectorAll('.service-pick').forEach(r=>{
        const name=r.querySelector('strong'), chip=r.querySelector('.status-chip');
        if(!name||!chip) return;
        const a=name.getBoundingClientRect(), b=chip.getBoundingClientRect();
        const overlap=!(a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top);
        if(overlap) bad.push(name.textContent.slice(0,24));
      });
      return bad;
    }"""
    with sync_playwright() as p:
        br=p.chromium.launch(headless=True)
        for w,label in [(1280,"desktop"),(375,"mobile")]:
            ctx=br.new_context(viewport={"width":w,"height":900})
            page=ctx.new_page()
            page.add_init_script(f"localStorage.setItem('otc_token','{t}')")
            page.goto(f"{CLIENT}/pricebook",wait_until="networkidle");page.wait_for_timeout(1800)
            rows=page.query_selector_all(".service-pick")
            print(f"\n===== {label}: {len(rows)} service rows =====")
            col=page.evaluate(COLLIDE_JS)
            print("  name/chip collisions:", col if col else "NONE")
            rowinfo=page.evaluate("""() => {
              const out=[];
              document.querySelectorAll('.service-pick').forEach(r=>{
                const nm=r.querySelector('strong'); if(!nm) return;
                const lh=parseFloat(getComputedStyle(nm).lineHeight)||18;
                const lines=Math.round(nm.getBoundingClientRect().height/lh);
                out.push({n:nm.textContent.trim(), lines, h:Math.round(r.getBoundingClientRect().height)});
              });
              const multi=out.filter(o=>o.lines>2);
              const tall=out.filter(o=>o.h>110);
              return {total:out.length, multiline:multi.slice(0,5), tall:tall.slice(0,5),
                      maxH:Math.max(...out.map(o=>o.h))};
            }""")
            print(f"  sidebar rows: {rowinfo['total']}, max height {rowinfo['maxH']}px")
            print(f"  names wrapping >2 lines: {rowinfo['multiline'] if rowinfo['multiline'] else 'NONE'}")
            three_line=[]; style_mismatch=[]; checked=0
            for i in range(len(rows)):
                rows=page.query_selector_all(".service-pick")
                if i>=len(rows): break
                nm=rows[i].inner_text().split("\n")[0][:26]
                rows[i].click(); page.wait_for_timeout(420)
                shapes=page.evaluate(SHAPE_JS)
                checked+=1
                if len(shapes)==0: print(f"     WARNING {nm}: 0 fields rendered")
                bad=[s for s in shapes if s["lines"]!=2]
                if bad: three_line.append((nm,[(b["title"],b["lines"]) for b in bad[:3]]))
                # any field where def and help both present with differing style
                for s in shapes:
                    if s["hasDef"] and s["hasHelp"]:
                        style_mismatch.append((nm,s["title"]))
            print(f"  trades inspected: {checked}")
            print(f"  fields NOT exactly 2 lines: {len(three_line)} trades")
            for nm,items in three_line[:8]: print(f"     {nm}: {items}")
            print(f"  fields rendering BOTH definition and help: {len(style_mismatch)}")
            for nm,ti in style_mismatch[:6]: print(f"     {nm}: {ti}")
            # contrast + overflow across every trade
            CJS = """() => {
              function lum(c){const f=x=>{x/=255;return x<=0.03928?x/12.92:Math.pow((x+0.055)/1.055,2.4)};return 0.2126*f(c[0])+0.7152*f(c[1])+0.0722*f(c[2])}
              function px(s){const m=s.match(/[0-9.]+/g);return m?m.slice(0,3).map(Number):null}
              function bg(el){let e=el;while(e){const c=getComputedStyle(e).backgroundColor;const a=c.match(/[0-9.]+/g);
                if(a&&(a.length<4||Number(a[3])>0.9))return px(c);e=e.parentElement}return [10,10,10]}
              const bad=[];
              document.querySelectorAll('*').forEach(el=>{
                const txt=[...el.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent.trim()).join('');
                if(!txt)return; const cs=getComputedStyle(el);
                if(cs.display==='none'||cs.visibility==='hidden')return;
                const fg=px(cs.color); if(!fg)return; const b=bg(el);
                const l1=lum(fg),l2=lum(b); const r=(Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05);
                const sz=parseFloat(cs.fontSize); const need=(sz>=24||(parseInt(cs.fontWeight)>=700&&sz>=18.66))?3:4.5;
                if(r<need) bad.push((el.className||el.tagName).toString().slice(0,32)+' '+r.toFixed(2)+' '+sz+'px');
              });
              return {contrast:[...new Set(bad)].slice(0,6),
                      overflow: document.documentElement.scrollWidth > window.innerWidth+1,
                      docW: document.documentElement.scrollWidth, vw: window.innerWidth};
            }"""
            res=page.evaluate(CJS)
            print(f"  contrast failures: {len(res['contrast'])} {res['contrast'] if res['contrast'] else ''}")
            print(f"  page overflow: {'YES doc='+str(res['docW'])+' vw='+str(res['vw']) if res['overflow'] else 'none'}")
            ctx.close()
        br.close()
finally:
    srv.send_signal(signal.SIGTERM);time.sleep(1)
