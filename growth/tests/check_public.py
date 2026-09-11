"""Verify local review artifacts. Requires existing Playwright; installs nothing.
Chromium file/URL navigation is blocked in this audit environment. The exact
single-file runner is loaded with set_content; its embedded pages and local
navigation are exercised. Separate static-file paths are validated on disk.
"""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit, unquote
import hashlib, json, sys
from playwright.sync_api import sync_playwright, expect

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public';E=ROOT/'evidence';E.mkdir(exist_ok=True)
results=[]
def check(name,condition):
    results.append({'name':name,'pass':bool(condition)})
    if not condition:raise AssertionError(name)

class Document(HTMLParser):
    def __init__(self,text):
        super().__init__();self.tags=[];self.feed(text)
    def handle_starttag(self,tag,attrs):self.tags.append((tag,dict(attrs)))

pagepaths=['compare/index.html','alternatives/index.html','compare/smith-ai-vs-ruby/index.html','alternatives/ruby/index.html','resources/index.html']
for name in pagepaths:
    html=(OUT/name).read_text();doc=Document(html)
    check(name+': one H1',sum(t=='h1' for t,a in doc.tags)==1)
    check(name+': noindex review boundary',any(t=='meta' and a.get('name')=='robots' and 'noindex' in a.get('content','') for t,a in doc.tags))
    check(name+': description and social title',all(any(t=='meta' and a.get(k)==v and a.get('content') for t,a in doc.tags) for k,v in [('name','description'),('property','og:title')]))
    ids=[a['id'] for t,a in doc.tags if 'id' in a];check(name+': unique IDs',len(ids)==len(set(ids)))
    for tag,a in doc.tags:
        if tag!='a' or 'href' not in a:continue
        href=a['href'];parts=urlsplit(href)
        if parts.scheme:continue
        destination=(OUT/name).parent/unquote(parts.path) if parts.path else OUT/name
        assert destination.is_file(),(name,href)
        if parts.fragment and destination.suffix=='.html':
            target=Document(destination.read_text());valid={a['id'] for t,a in target.tags if 'id' in a}
            if destination.name=='growth-v2.html':valid|={'profit','challenge','link'}
            assert parts.fragment in valid,(name,href)
    check(name+': every local link and fragment resolves',True)
check('Preserved V2 HTML SHA256',hashlib.sha256((OUT/'tools/growth-v2.html').read_bytes()).hexdigest()=='82c65a675d896339f47da2082a9d11dbaf79056c37dd917e296622c2c5dd3b79')
check('New assets contain no gradient', 'gradient(' not in (OUT/'assets/site.css').read_text())
check('Search uses no network/persistence API',not any(k in (OUT/'assets/site.js').read_text() for k in ['fetch(','XMLHttpRequest','localStorage','sessionStorage']))

runner=(ROOT/'Off_The_Clock_Public_Pages_Review.html').read_text()
with sync_playwright() as w:
    browser=w.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':1440,'height':1050},accept_downloads=True)
    page=context.new_page();page.set_default_timeout(8000)
    errors=[];requests=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.on('request',lambda req:requests.append(req.url))
    def start():
        page.evaluate("history.replaceState(null,'','#compare/index.html')");page.set_content(runner,wait_until='load');return page.frame_locator('#site')
    f=start();expect(f.locator('h1')).to_contain_text('Compare the outcome.')
    check('Runner starts at comparison hub',True)
    expect(f.locator('#result-count')).to_have_text('2 guides available')
    check('Initial count reflects two complete guides',True)
    f.locator('#guide-search').fill('Smith')
    expect(f.locator('#result-count')).to_have_text('2 guides matched')
    f.locator('[data-filter="head"]').click()
    expect(f.locator('#result-count')).to_have_text('1 guide matched')
    check('Query and category intersect',f.locator('[data-guide]:visible').count()==1)
    f.locator('#guide-search').fill('not-a-vendor')
    expect(f.locator('#empty-results')).to_be_visible()
    check('Empty search state with accurate zero count',f.locator('#result-count').inner_text()=='0 guides matched')
    f.locator('#empty-results [data-clear]').click()
    expect(f.locator('#result-count')).to_have_text('2 guides available')
    check('Clear resets query and filter and focuses search',f.locator('#guide-search').evaluate('(el)=>el===document.activeElement'))
    f.locator('#guide-search').fill('<img src=x onerror=alert(1)>')
    check('Search input is not interpreted as HTML',f.locator('[data-library] img').count()==0)
    f.locator('[data-clear]').first.click()
    f.locator('[data-filter="alternatives"]').focus();page.keyboard.press('Enter')
    expect(f.locator('#result-count')).to_have_text('1 guide matched')
    check('Filter can be activated by keyboard',True)
    f.locator('[data-clear]').first.click()
    f.get_by_role('link',name='Smith.ai vs Ruby',exact=True).click()
    expect(f.locator('h1')).to_have_text('Smith.ai vs Ruby')
    check('Guide card opens full article inside standalone runner',True)
    check('Separate Smith human-product price preserved', '$300 for 30 calls' in f.locator('main').inner_text())
    check('Ruby AI enhancement distinction visible','AI enhancements' in f.locator('main').inner_text())
    f.locator('a[href="#cost"]').first.click()
    check('Article contents link points to pricing section',f.locator('#cost').is_visible())
    f.locator('nav.nav').get_by_role('link',name='Alternatives',exact=True).click()
    expect(f.locator('h1')).to_contain_text('Don’t just switch.')
    f.get_by_role('link',name='Looking beyond Ruby?',exact=True).click()
    expect(f.locator('h1')).to_have_text('Ruby alternatives for service businesses')
    check('Alternatives hub opens full alternatives article',True)
    check('Canada rate identified', 'CAD $325' in f.locator('main').inner_text())
    check('Dialzara retrieval limitation remains visible','Direct retrieval of this page failed' in f.locator('#dialzara').inner_text())
    f.locator('nav.nav').get_by_role('link',name='Resources',exact=True).click()
    expect(f.locator('h1')).to_contain_text('Less guessing.')
    check('Resources distinguish working and collection-only concepts',f.get_by_text('COLLECTION-ONLY CONCEPT',exact=True).count()==1)
    with page.expect_download() as info:
        f.get_by_role('link',name='Download the checklist').click()
    downloaded=info.value;downloaded.save_as(str(E/'downloaded-checklist.txt'))
    check('Checklist download matches original artifact',(E/'downloaded-checklist.txt').read_bytes()==(OUT/'resources/five-call-checklist.txt').read_bytes())
    f.get_by_role('link',name='Open job profit check').click()
    expect(f.locator('#page-profit')).to_be_visible()
    check('Resources open preserved calculator mode',f.locator('#profit-left').inner_text()=='$750.00')
    f.locator('[data-profit-mode="markup"]').click()
    check('Preserved markup calculation runs unchanged',f.locator('#profit-left').inner_text()=='$2,000.00')
    f=start();f.locator('nav.nav').get_by_role('link',name='Resources',exact=True).click()
    f.get_by_role('link',name='Prepare my job brief').click()
    expect(f.locator('#page-challenge')).to_be_visible()
    check('Resources open local challenge, not a submission',True)
    f=start();f.locator('nav.nav').get_by_role('link',name='Resources',exact=True).click()
    f.get_by_role('link',name='Explore the customer preview').click()
    expect(f.locator('#page-link')).to_be_visible()
    check('Resources open collection-only link concept',True)
    for width in [320,375,390,768,1024,1440]:
        page.set_viewport_size({'width':width,'height':950})
        for name in pagepaths:
            # Test exact generated standalone page without navigation-policy dependence.
            page.set_content((OUT/name).read_text(),wait_until='load')
            no_overflow=page.evaluate('document.documentElement.scrollWidth<=window.innerWidth')
            check(f'{name}: {width}px no horizontal overflow',no_overflow)
            if (width,name) in [(1440,'compare/index.html'),(390,'compare/index.html'),(1440,'resources/index.html'),(390,'resources/index.html'),(1440,'compare/smith-ai-vs-ruby/index.html'),(390,'alternatives/ruby/index.html')]:
                shot=name.replace('/index.html','').replace('/','-')+f'-{width}.png'
                page.screenshot(path=str(E/shot),full_page=True)
    check('No JavaScript errors in tested interactions',not errors)
    check('No external resources requested automatically',not [r for r in requests if r.startswith(('http:','https:'))])
    nojs=context.browser.new_context(java_script_enabled=False,viewport={'width':390,'height':850})
    off=nojs.new_page();off.set_content((OUT/'compare/index.html').read_text())
    check('Without JS both article links remain visible',off.locator('[data-guide]').count()==2 and off.locator('[data-guide]').first.is_visible())
    check('Without JS inactive search controls are hidden',not off.locator('[data-search-tools]').is_visible() and not off.locator('[data-enhancement]').is_visible())
    nojs.close();context.close();browser.close()
summary={'checks':len(results),'passed':sum(r['pass'] for r in results),'failures':sum(not r['pass'] for r in results),'results':results,
'method':'Exact single-file runner and exact generated pages rendered with Playwright set_content in Chromium. Wrapper navigation and interactions exercised; static paths checked on disk. Direct file/URL launch blocked by browser policy and not claimed as verified.',
'not_verified':['Production publishing','Direct file or hosted navigation','Safari/Firefox','Physical print','Real user conversion','Production CTA integration']}
(E/'public-checks.json').write_text(json.dumps(summary,indent=2))
print(json.dumps({k:summary[k] for k in ['checks','passed','failures','method']},indent=2))
