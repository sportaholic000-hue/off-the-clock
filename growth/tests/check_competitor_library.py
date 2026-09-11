"""Check the independently built growth library. Uses existing Playwright only.
No calls to application APIs, no installation and no repository mutation.
"""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit, unquote
import hashlib
import json
import re
from datetime import datetime, timezone
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public'
EVIDENCE = ROOT / 'evidence/competitor-expansion'
EVIDENCE.mkdir(parents=True, exist_ok=True)
DATA = json.loads((ROOT/'competitors/content.json').read_text())
for group in ['alternatives', 'comparisons']:
    DATA[group] = [json.loads((ROOT/'competitors'/name).read_text()) for name in DATA[group]]
MANIFEST = json.loads((OUT/'page-manifest.json').read_text())
RESULTS = []


def check(name, condition):
    RESULTS.append({'name': name, 'pass': bool(condition)})
    if not condition:
        raise AssertionError(name)


class Document(HTMLParser):
    def __init__(self, text):
        super().__init__()
        self.tags, self.words, self.title, self.h1 = [], [], '', ''
        self.in_title = self.in_h1 = False
        self.feed(text)
    def handle_starttag(self, tag, attrs):
        self.tags.append((tag, dict(attrs)))
        if tag == 'title': self.in_title = True
        if tag == 'h1': self.in_h1 = True
    def handle_endtag(self, tag):
        if tag == 'title': self.in_title = False
        if tag == 'h1': self.in_h1 = False
    def handle_data(self, data):
        if self.in_title: self.title += data
        if self.in_h1: self.h1 += data
        self.words.append(data)


def verify():
    pages = MANIFEST['pages']
    check('15 pages and 12 named guides', len(pages) == 15 and len(MANIFEST['guides']) == 12)
    check('7 alternatives and 5 head-to-head guides', sum(g['kind']=='alternatives' for g in MANIFEST['guides'])==7 and sum(g['kind']=='head' for g in MANIFEST['guides'])==5)
    docs = {p: Document((OUT/p).read_text()) for p in pages}
    check('Unique descriptive page titles', len({d.title for d in docs.values()})==len(pages))
    for path, doc in docs.items():
        html = (OUT/path).read_text()
        check(path+': one visible-topic H1', sum(t=='h1' for t,a in doc.tags)==1 and bool(doc.h1.strip()))
        check(path+': review stays noindex', any(t=='meta' and a.get('name')=='robots' and 'noindex' in a.get('content','') for t,a in doc.tags))
        check(path+': description and social metadata', all(any(t=='meta' and a.get(k)==v and a.get('content') for t,a in doc.tags) for k,v in [('name','description'),('property','og:title'),('property','og:description')]))
        ids = [a['id'] for t,a in doc.tags if 'id' in a]
        check(path+': unique IDs and resolved source markers',len(ids)==len(set(ids)) and not re.search(r'\[\[[\w-]+\]\]',html))
        for tag, attrs in doc.tags:
            if tag!='a' or 'href' not in attrs: continue
            url = urlsplit(attrs['href'])
            if url.scheme: continue
            target = (OUT/path).parent / unquote(url.path) if url.path else OUT/path
            assert target.is_file(), (path,attrs['href'])
            if url.fragment and target.suffix=='.html':
                destination = Document(target.read_text())
                valid = {a['id'] for t,a in destination.tags if 'id' in a}
                if target.name=='growth-v2.html': valid |= {'profit','challenge','link'}
                assert url.fragment in valid,(path,attrs['href'])
        check(path+': every local link and anchor resolves',True)
    for a in DATA['alternatives'] + DATA['comparisons']:
        path = ('alternatives/' if a['kind']=='alternatives' else 'compare/') + a['slug'] + '/index.html'
        doc=docs[path];html=(OUT/path).read_text()
        check(path+': company names in H1/title',doc.h1==a['title'] and a['seo_title'] in doc.title)
        check(path+': semantic comparison table',any(t=='caption' for t,at in doc.tags) and any(t=='th' and at.get('scope')=='col' for t,at in doc.tags))
        check(path+': inline references and source list',any(t=='a' and at.get('class')=='source' for t,at in doc.tags) and 'Official sources and comparison standard' in html)
        check(path+': no fake live application', 'form-action' in html and 'A local brief' in html and 'noindex' in html)
        if a['kind']=='alternatives':
            check(path+': four named alternatives', all(DATA['vendors'][c[0]]['name'] in ' '.join(doc.words) for c in a['choices']) and len(a['choices'])==4)
    check('V2 generated HTML unchanged', hashlib.sha256((OUT/'tools/growth-v2.html').read_bytes()).hexdigest()=='82c65a675d896339f47da2082a9d11dbaf79056c37dd917e296622c2c5dd3b79')
    check('No gradients in new renderer', 'gradient(' not in (ROOT/'build_competitor_library.py').read_text())
    check('No application or engine import in renderer', not any(s in (ROOT/'build_competitor_library.py').read_text() for s in ['server/','quote-engine-vnext','server.src','requests.get','urllib.request']))
    runner=(ROOT/'Off_The_Clock_Public_Pages_Review.html').read_text()
    with sync_playwright() as pw:
        browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
        context=browser.new_context(viewport={'width':1440,'height':1000},accept_downloads=True)
        page=context.new_page();page.set_default_timeout(8000)
        errors=[];requests=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('request',lambda r:requests.append(r.url))
        # Record, do not assume, the direct-file launch behavior of this environment.
        probe=context.new_page()
        try:
            probe.goto((OUT/'compare/index.html').as_uri(),timeout=5000)
            launch={'verified':probe.locator('h1').count()==1,'url':probe.url}
        except Exception as error:
            launch={'verified':False,'error':str(error).split('Call log:')[0].strip()}
        probe.close()
        (EVIDENCE/'direct-file-launch.json').write_text(json.dumps(launch,indent=2))
        def start():
            page.evaluate("history.replaceState(null,'','#compare/index.html')")
            page.set_content(runner,wait_until='load')
            f=page.frame_locator('#site')
            expect(f.locator('h1')).to_contain_text('Compare the companies.')
            return f
        f=start();expect(f.locator('#result-count')).to_have_text('12 guides available')
        check('Portable runner exposes all 12 guides',f.locator('[data-guide]').count()==12)
        f.locator('#guide-search').fill('Jobber')
        f.locator('[data-filter="head"]').click()
        expect(f.locator('#result-count')).to_have_text('1 guide matched')
        check('Company query and head-to-head filter intersect',f.locator('[data-guide]:visible h2').inner_text()=='Jobber Receptionist vs Housecall Pro CSR AI')
        f.locator('[data-filter="alternatives"]').click()
        expect(f.locator('#result-count')).to_have_text('3 guides matched')
        check('Company query includes its own alternative and two relevant shortlists',f.get_by_role('link',name='Jobber Receptionist alternatives',exact=True).is_visible())
        f.locator('#guide-search').fill('no-such-competitor')
        expect(f.locator('#empty-results')).to_be_visible()
        check('Empty query count is truthful',f.locator('#result-count').inner_text()=='0 guides matched')
        f.locator('#empty-results [data-clear]').click()
        expect(f.locator('#result-count')).to_have_text('12 guides available')
        check('Reset clears query and restores focus',f.locator('#guide-search').evaluate('(e)=>e===document.activeElement'))
        f.locator('#guide-search').fill('<img src=x onerror=alert(1)>')
        check('Search query never becomes injected markup',f.locator('[data-library] img').count()==0)
        f.locator('[data-clear]').first.click()
        f.locator('[data-filter="head"]').focus();page.keyboard.press('Enter')
        expect(f.locator('#result-count')).to_have_text('5 guides matched')
        check('All five head-to-heads reachable by keyboard',True)
        for article in DATA['alternatives']+DATA['comparisons']:
            f=start()
            card_title=article['title'].replace(' Alternatives for Service Businesses',' alternatives')
            f.get_by_role('link',name=card_title,exact=True).click()
            expect(f.locator('h1')).to_have_text(article['title'])
            check(article['slug']+': opens from named card',True)
            f.locator('a.source').first.click()
            check(article['slug']+': inline citation navigates to visible source',f.locator('#source-1').is_visible())
            f.locator('#related a').first.click()
            check(article['slug']+': related guide opens',f.locator('h1').inner_text()!=article['title'])
        f=start();f.locator('nav.nav').get_by_role('link',name='Alternatives',exact=True).click()
        expect(f.locator('#result-count')).to_have_text('7 guides available')
        check('Alternatives hub names seven company pages',f.locator('[data-guide]').count()==7)
        f.locator('#guide-search').fill('ServiceTitan Voice Agent alternatives');expect(f.get_by_role('link',name='ServiceTitan Voice Agent alternatives',exact=True)).to_be_visible()
        f.get_by_role('link',name='ServiceTitan Voice Agent alternatives',exact=True).click()
        check('ServiceTitan indexed-price limitation disclosed','indexed' in f.locator('article').inner_text().lower())
        f.locator('nav.nav').get_by_role('link',name='Resources',exact=True).click()
        with page.expect_download() as info:f.get_by_role('link',name='Download the checklist').click()
        info.value.save_as(str(EVIDENCE/'downloaded-checklist.txt'))
        check('Existing checklist still downloads unchanged',(EVIDENCE/'downloaded-checklist.txt').read_bytes()==(OUT/'resources/five-call-checklist.txt').read_bytes())
        f.get_by_role('link',name='Open job profit check').click()
        expect(f.locator('#page-profit')).to_be_visible()
        check('Calculator still loads $750 original result',f.locator('#profit-left').inner_text()=='$750.00')
        f.locator('[data-profit-mode="markup"]').click()
        check('Calculator target mode preserved',f.locator('#profit-left').inner_text()=='$2,000.00')
        screenshots={('compare/index.html',1440):'comparison-hub-desktop.png',('compare/index.html',390):'comparison-hub-mobile.png',('alternatives/index.html',1440):'alternatives-hub-desktop.png',('alternatives/podium-larry/index.html',1440):'podium-alternatives-desktop.png',('alternatives/servicetitan-voice-agent/index.html',390):'servicetitan-alternatives-mobile.png',('compare/jobber-receptionist-vs-housecall-pro-csr-ai/index.html',1440):'jobber-vs-housecall-desktop.png'}
        for width in [320,375,390,768,1024,1440]:
            page.set_viewport_size({'width':width,'height':1000})
            for name in pages:
                page.set_content((OUT/name).read_text(),wait_until='load')
                check(f'{name}: {width}px page fits',page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
                if (name,width) in screenshots:page.screenshot(path=str(EVIDENCE/screenshots[(name,width)]),full_page=True)
        page.set_viewport_size({'width':390,'height':850})
        page.set_content((OUT/'compare/jobber-receptionist-vs-housecall-pro-csr-ai/index.html').read_text())
        table=page.locator('.competitor-table-wrap')
        table.focus();page.keyboard.press('ArrowRight');page.wait_for_timeout(100)
        check('Wide comparison table scrolls without widening the page',table.evaluate('(e)=>e.scrollWidth>e.clientWidth && e.scrollLeft>0'))
        nojs=browser.new_context(java_script_enabled=False,viewport={'width':390,'height':850})
        off=nojs.new_page();off.set_content((OUT/'compare/index.html').read_text())
        check('All 12 crawlable guide links remain without JavaScript',off.locator('[data-guide]').count()==12 and off.locator('[data-guide]').last.is_visible())
        check('Search controls hidden when JavaScript is off',not off.locator('[data-search-tools]').is_visible())
        nojs.close()
        check('No JavaScript errors',not errors)
        check('No automatic external requests',not [r for r in requests if r.startswith(('https:','http:'))])
        context.close();browser.close()
    return launch


try:
    direct_launch=verify()
except Exception as error:
    RESULTS.append({'name':'Execution completed without an uncaught assertion/error','pass':False,'error':str(error)})
    raise
finally:
    summary={'time_utc':datetime.now(timezone.utc).isoformat(),'checks':len(RESULTS),'passed':sum(r['pass'] for r in RESULTS),'failed':sum(not r['pass'] for r in RESULTS),'results':RESULTS,'method':'Exact generated HTML and portable srcdoc runner exercised in Chromium with set_content; internal navigation, downloads and responsive layouts verified. Direct-file probe is recorded separately. No hosted deployment is tested.','limitations':['Other browser engines','Full screen-reader audit','Real-contractor usability or SEO conversion','Production publishing and live product destinations']}
    (EVIDENCE/'checks.json').write_text(json.dumps(summary,indent=2))
    print(json.dumps({k:summary[k] for k in ['checks','passed','failed','method']},indent=2))
