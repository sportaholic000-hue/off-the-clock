"""Render current HTML/CSS/client JS in the existing Chromium.
The browser environment blocks HTTP/file navigation. These UI tests explicitly
substitute media and transport; real HTTP/protocol tests are the Node suites.
No packages, providers, credentials or network connections are installed/used.
"""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'evidence';OUT.mkdir(exist_ok=True)
results=[]
def check(name,condition):
    results.append({'name':name,'pass':bool(condition)})
    if not condition: raise AssertionError(name)

def rendered_html():
    s=(ROOT/'public/index.html').read_text()
    return s.replace('<link rel="stylesheet" href="styles.css">','<style>'+ (ROOT/'public/styles.css').read_text()+'</style>').replace('<script src="app.js" defer></script>','')

with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    errors=[]
    def fresh(mode='enabled',width=1440):
        p=browser.new_page(viewport={'width':width,'height':940})
        p.on('pageerror',lambda e:errors.append(str(e)))
        p.set_content(rendered_html())
        p.evaluate('(m)=>window.fixtureMode=m',mode)
        p.add_script_tag(content=(ROOT/'tests/browser-fixture.js').read_text())
        p.add_script_tag(content=(ROOT/'public/app.js').read_text())
        p.wait_for_function("document.querySelector('#status').textContent !== 'CHECKING CONNECTION'")
        return p
    try:
        for width in [320,375,390,768,1024,1440]:
            p=fresh('disabled',width)
            check(f'{width}px no horizontal overflow',p.evaluate('document.documentElement.scrollWidth<=innerWidth'))
            check(f'{width}px disabled truthfully',p.locator('#status').inner_text()=='NOT CONNECTED' and p.locator('#start-voice').is_disabled())
            check(f'{width}px never requests microphone on load',p.evaluate('fixtureStats.micRequests===0'))
            if width in [390,1440]:p.screenshot(path=str(OUT/f'demo-{width}.png'),full_page=True)
            p.close()
        p=fresh();check('voice selectable before starting',p.locator('input[value=nova]').is_enabled());p.locator('input[value=nova]').check()
        check('Nova selected',p.locator('input[value=nova]').is_checked());p.locator('#start-text').click();p.wait_for_function("document.querySelector('#status').textContent==='LIVE TEXT CHAT'")
        check('text requires no microphone',p.evaluate('fixtureStats.micRequests===0'))
        check('agent selection locks during a session',p.locator('input[value=miles]').is_disabled())
        p.locator('#message').fill('<img src=x onerror="window.injection=1">');p.locator('#send').click();p.wait_for_function("document.querySelector('#transcript').textContent.includes('<img')")
        check('untrusted transcript is text not executable HTML',p.locator('#transcript img').count()==0 and p.evaluate('window.injection!==1'))
        check('actual entered text appears', '<img' in p.locator('#transcript').inner_text())
        p.locator('#end').click();check('text end cleans up session',p.locator('#ended').is_visible() and p.evaluate('fixtureStats.ends===1'))
        check('no fabricated signup link',p.locator('#signup').is_hidden());p.close()
        p=fresh('denied');p.locator('#start-voice').click();p.wait_for_selector('#ended:not([hidden])')
        check('permission denial has useful text fallback guidance','text chat' in p.locator('#end-detail').inner_text())
        check('denial does not open server session',p.evaluate('fixtureStats.starts===0'))
        check('denial closes audio context',p.evaluate('fixtureStats.contextsClosed===1'))
        p.locator('#again').click();check('retry returns to selectable voice/text choices',p.locator('#idle').is_visible() and p.locator('#start-text').is_enabled());p.close()
        p=fresh('pending');p.locator('#start-voice').click();p.wait_for_function('fixtureStats.micRequests===1');p.locator('#end').click();p.evaluate('resolveFixtureMedia()');p.wait_for_timeout(30)
        check('late permission resolution stops returned tracks',p.evaluate('fixtureStats.stops===1'))
        check('cancelled permission cannot start stale session',p.evaluate('fixtureStats.starts===0'));p.close()
        p=fresh();p.locator('#start-voice').click();p.wait_for_function("document.querySelector('#status').textContent==='LIVE CONVERSATION'")
        check('voice requests microphone exactly once',p.evaluate('fixtureStats.micRequests===1'))
        check('voice capture path connects after server ready',p.evaluate('Boolean(fixtureCapture.port.onmessage)'))
        p.evaluate("fixtureCapture.port.onmessage({data:new ArrayBuffer(3200)})");p.wait_for_timeout(30)
        check('capture frame uses audio endpoint',p.evaluate("fixtureStats.requests.some(x=>x.path.endsWith('/audio'))"))
        p.evaluate("fixtureEmit({type:'audio',data:'AAAAAA==',sampleRate:24000});fixtureEmit({type:'interrupted'})");p.wait_for_timeout(20)
        check('interruption clears playback',p.evaluate('fixtureStats.audioStopped>=1'))
        p.locator('#end').click();check('end stops track and closes audio context',p.evaluate('fixtureStats.stops===1 && fixtureStats.contextsClosed===1'));p.close()
        p=fresh();p.locator('#start-voice').click();p.wait_for_function("document.querySelector('#status').textContent==='LIVE CONVERSATION'")
        p.evaluate("fixtureEmit({type:'closing',reason:'silence',message:'Test sign-off'})");p.wait_for_timeout(20)
        check('server closing stops microphone immediately',p.evaluate('fixtureStats.stops===1'))
        p.evaluate("fixtureEmit({type:'ended',reason:'silence'})");p.wait_for_selector('#ended:not([hidden])')
        check('server end closes context without duplicate end POST',p.evaluate('fixtureStats.contextsClosed===1 && fixtureStats.ends===0'));p.close()
        for kind in ['budget','hourly','connection-failure']:
            p=fresh(kind);p.locator('#start-voice').click();p.wait_for_selector('#ended:not([hidden])')
            check(kind+' releases microphone and context',p.evaluate('fixtureStats.stops===1 && fixtureStats.contextsClosed===1'))
            check(kind+' is not displayed as a live session',not p.locator('#status').evaluate("e=>e.classList.contains('live')"));p.close()
        p=fresh();p.locator('#start-voice').click();p.wait_for_function("document.querySelector('#status').textContent==='LIVE CONVERSATION'");p.evaluate("window.dispatchEvent(new Event('pagehide'))")
        check('tab/page exit releases microphone',p.evaluate('fixtureStats.stops===1 && fixtureStats.contextsClosed===1'));check('tab/page exit requests server close',p.evaluate('fixtureStats.ends===1'));p.close()
        check('no unexpected JavaScript page errors',not errors)
    except Exception as e:
        results.append({'name':'uncaught test error','pass':False,'detail':str(e)})
        raise
    finally:
        browser.close()
        report={'method':'Exact current source rendered with inline local assets; explicit UI media/transport test doubles. Not live Gemini or real browser networking.','checks':results,'passed':sum(r['pass'] for r in results),'total':len(results),'page_errors':errors}
        (OUT/'browser-results.json').write_text(json.dumps(report,indent=2))
        print(json.dumps({'passed':report['passed'],'total':report['total'],'errors':errors}))
