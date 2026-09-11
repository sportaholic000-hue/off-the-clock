"""Build named-competitor review pages, reusing the preserved growth renderer.
No application/engine imports, installs, network requests or publication changes.
All generated files stay beneath growth/. Existing V2 inputs are read-only.
"""
from pathlib import Path
from html import escape
import json
import re
import hashlib
import build_public as base

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'public'
DATA = json.loads((ROOT / 'competitors/content.json').read_text(encoding='utf-8'))
ARTICLE_FILES = [ROOT / 'competitors' / name for group in ['alternatives', 'comparisons'] for name in DATA[group]]
for group in ['alternatives', 'comparisons']:
    DATA[group] = [json.loads((ROOT / 'competitors' / name).read_text(encoding='utf-8')) for name in DATA[group]]
ARTICLES = DATA['alternatives'] + DATA['comparisons']
TOKEN = re.compile(r'\[\[([a-z0-9-]+)\]\]')
EXTRA_CSS = '''
.article-layout,.article,.toc{min-width:0}.article-hero h1{overflow-wrap:break-word}.guide-title{overflow-wrap:break-word}
.competitor-table-wrap{overflow:auto;border:1px solid #344334;border-radius:3px;margin:22px 0;max-width:100%}
.competitor-table{border-collapse:collapse;min-width:660px;width:100%;font-size:13px;text-align:left}
.competitor-table caption{text-align:left;padding:16px;color:#BAC4BA;caption-side:top}
.competitor-table th,.competitor-table td{padding:17px;vertical-align:top;border-top:1px solid #344334;line-height:1.7}
.competitor-table thead th{background:#111411;color:#F2F5F2;font-weight:600}
.competitor-table tbody th{width:23%;color:#F2F5F2;font-weight:500}
.competitor-table td{color:#BAC4BA}.article .vendor h3{font-size:26px;line-height:1.3}
.article .vendor h4{font-size:17px;margin:12px 0}.article .vendor .vendor-link{margin-top:18px}
.source-list small{display:block;margin:6px 0 0 28px;color:#AAB6AA;line-height:1.7}
.related-links{display:grid;gap:12px;list-style:none;padding:0}.related-links a{display:block;padding:14px 0;border-bottom:1px solid #344334}
.faq-item{border-top:1px solid #344334;padding:20px 0}.faq-item h3{font-size:20px;line-height:1.45;margin-bottom:12px}
.article .scenario{padding:24px;border-left:3px solid #00E676;background:#111411}.article ul li{margin-bottom:12px;line-height:1.8;color:#BAC4BA}
.library-note{display:flex;gap:24px;flex-wrap:wrap;margin:30px 0 0;color:#BAC4BA;font-family:var(--mono);font-size:12px}
@media(max-width:600px){.article-hero h1{font-size:36px;letter-spacing:-1.4px}.guide .guide-title{font-size:27px}.article .scenario,.article .vendor{padding:19px}.article .vendor h3{font-size:24px}.article-layout{gap:25px}}
@media(max-width:360px){.article-hero h1{font-size:32px}.guide .guide-title{font-size:25px}.article section h2{font-size:26px}}
@media print{.competitor-table-wrap{overflow:visible}.competitor-table{min-width:0;font-size:10px}.competitor-table th,.competitor-table td{padding:8px;color:#111}.competitor-table thead th{background:#eee;color:#111}.source-list small{color:#333}}
'''


def destination(article):
    return ('alternatives/' if article['kind'] == 'alternatives' else 'compare/') + article['slug'] + '/index.html'


TITLES = {destination(a): a['title'] for a in ARTICLES}
TITLES.update({'compare/smith-ai-vs-ruby/index.html': 'Smith.ai vs Ruby',
               'alternatives/ruby/index.html': 'Ruby alternatives',
               'resources/index.html': 'Free tools and practical resources'})


def source_renderer():
    keys = []
    def cite(key):
        if key not in DATA['sources']:
            raise ValueError('Unknown source: ' + key)
        if key not in keys:
            keys.append(key)
        number = keys.index(key) + 1
        return f'<a class="source" href="#source-{number}" aria-label="Source {number}">[{number}]</a>'
    def text(value):
        return TOKEN.sub(lambda match: cite(match.group(1)), escape(value))
    def refs(names):
        return ' '.join(cite(name) for name in names)
    def footer():
        items = []
        for number, key in enumerate(keys, 1):
            src = DATA['sources'][key]
            items.append(f'<li id="source-{number}"><span>{number:02}</span><a href="{escape(src["url"],quote=True)}">{escape(src["title"])}</a><small>{escape(src["note"])}</small></li>')
        return '<section id="sources"><h2>Official sources and comparison standard</h2><p>Reviewed September 11, 2026. Vendor descriptions are sourced below; recommendations and evaluation scenarios are Off The Clock AI’s editorial assessment, not hands-on test results. Dollar signs follow vendor displays; confirm currency, account eligibility and the complete written offer.</p><ul class="source-list">' + ''.join(items) + '</ul><p class="editorial-note">Off The Clock AI publishes this comparison and offers a product in this category. The recommendations reflect the service-business use case described on this page. An undocumented capability is not proof that a vendor cannot support it. Verify specific integrations and plan inclusions before purchase.</p></section>'
    return text, refs, footer


def paragraphs(values, text):
    return ''.join('<p>' + text(value) + '</p>' for value in values)


def bullet_list(values, text):
    return '<ul>' + ''.join('<li>' + text(value) + '</li>' for value in values) + '</ul>'


def render_article(article):
    path = destination(article)
    text, refs, source_footer = source_renderer()
    sections = []
    if article['kind'] == 'alternatives':
        sections.append(('reason', 'Why look for an alternative?', paragraphs(article['reason'], text)))
        rows, cards = [], []
        for index, (key, heading, advice) in enumerate(article['choices'], 1):
            vendor = DATA['vendors'][key]
            rows.append('<tr><th scope="row"><a href="#option-' + key + '">' + escape(vendor['name']) + '</a></th><td>' + text(heading) + '</td><td>' + text(vendor['pricing']) + ' ' + refs(vendor.get('pricing_sources', [])) + '</td></tr>')
            cards.append(f'<div class="vendor" id="option-{key}"><p class="eyebrow">{index:02} / {escape(heading)}</p><h3>{escape(vendor["name"])}</h3><p>{text(vendor["fact"])} {refs(vendor["sources"])}</p><p><strong>{("Why choose Off The Clock:" if key == "otc" else "Product fit:")}</strong> {text(advice)}</p><p><strong>{("Scope and control:" if key == "otc" else "Scope to check:")}</strong> {text(vendor["boundary"])}</p><p class="vendor-link"><a href="{base.url(path,vendor["link"])}">{("Prepare a QuoteDone Challenge brief" if key == "otc" else "Explore " + vendor["name"] + " alternatives")} <span aria-hidden="true">↗</span></a></p></div>')
        table = '<div class="competitor-table-wrap" tabindex="0" role="region" aria-label="Alternatives comparison table; scroll horizontally on small screens"><table class="competitor-table"><caption>Named alternatives at a glance. Different products and usage units are not identical offers.</caption><thead><tr><th scope="col">Company / product</th><th scope="col">When to consider it</th><th scope="col">Published pricing / offer</th></tr></thead><tbody>' + ''.join(rows) + '</tbody></table></div>'
        sections.append(('shortlist', 'The alternatives, by company', table + ''.join(cards)))
        scenario = article['scenario']
        sections.append(('test', scenario['title'], '<div class="scenario">' + paragraphs([scenario['text']], text) + bullet_list(scenario['checks'], text) + '</div>'))
        sections.append(('questions', 'Questions before you switch', bullet_list(article['questions'], text)))
        faqs = ''.join('<div class="faq-item"><h3>' + text(question) + '</h3><p>' + text(answer) + '</p></div>' for question, answer in article['faqs'])
        sections.append(('faq', 'Common buying questions', faqs))
    else:
        left, right = article['title'].split(' vs ', 1)
        rows = ''.join('<tr><th scope="row">' + text(label) + '</th><td>' + text(a) + '</td><td>' + text(b) + '</td></tr>' for label, a, b in article['rows'])
        table = f'<div class="competitor-table-wrap" tabindex="0" role="region" aria-label="{escape(article["title"],quote=True)} comparison table; scroll horizontally on small screens"><table class="competitor-table"><caption>Compare the actual offer—not just the company name.</caption><thead><tr><th scope="col">Decision</th><th scope="col">{escape(left)}</th><th scope="col">{escape(right)}</th></tr></thead><tbody>{rows}</tbody></table></div>'
        sections.append(('overview', 'Side-by-side comparison', table))
        sections += [(ident, label, paragraphs(values, text)) for ident, label, values in article['sections']]
        sections.append(('questions', 'What to ask in the demonstration', bullet_list(article['questions'], text)))
    sections.append(('decision', 'Why choose Off The Clock', paragraphs([article['decision']], text)))
    related = '<ul class="related-links">' + ''.join('<li><a href="' + base.url(path, link) + '">' + escape(TITLES[link]) + ' <span aria-hidden="true">↗</span></a></li>' for link in article['related']) + '</ul>'
    sections.append(('related', 'Related comparisons and alternatives', related))
    toc = ''.join(f'<a href="#{ident}">{escape(label)}</a>' for ident, label, _ in sections) + '<a href="#sources">Official sources</a>'
    contents = ''.join(f'<section id="{ident}"><h2>{escape(label)}</h2>{body}</section>' for ident, label, body in sections) + source_footer()
    hub, label = ('alternatives/index.html', 'Alternatives') if article['kind'] == 'alternatives' else ('compare/index.html', 'Comparisons')
    body = f'''<nav class="breadcrumb" aria-label="Breadcrumb"><a href="{base.url(path,hub)}">{label}</a><span aria-hidden="true">/</span><span>{escape(article['title'])}</span></nav>
<div class="article-hero"><p class="eyebrow">AN OFF THE CLOCK AI BUYING GUIDE</p><h1>{escape(article['title'])}</h1><p class="intro">{text(article['intro'])}</p><div class="article-meta"><span class="meta">REVIEWED SEPTEMBER 11, 2026</span><a href="#sources">Official sources &amp; methodology</a></div></div>
<div class="verdict"><strong>Our recommendation</strong><p>{text(article['verdict'])}</p></div><div class="article-layout"><nav class="toc" aria-label="On this page"><p class="eyebrow">ON THIS PAGE</p>{toc}</nav><article class="article">{contents}</article></div>{base.bridge(path)}'''
    # All factual statements in verdicts must use sources already gathered above.
    return path, decorate(base.frame(path, article['seo_title'], article['description'], body, 'Alternatives' if article['kind'] == 'alternatives' else 'Compare'))


def decorate(html):
    return html.replace('</head>', '<style>' + EXTRA_CSS + '</style></head>')


def registry():
    guides = []
    for article in ARTICLES:
        title = article['title'].replace(' Alternatives for Service Businesses', ' alternatives')
        guides.append((article['kind'], 'ALTERNATIVES' if article['kind'] == 'alternatives' else 'HEAD-TO-HEAD', title, article['description'], '', destination(article), title.lower() + ' service business home services contractor'))
    # Keep both original completed guides. Do not manufacture a page for an unbuilt target.
    guides += [tuple(g) for g in base.GUIDES]
    guides[-1] = (*guides[-1][:2], 'Ruby alternatives', *guides[-1][3:])
    return guides


def render_hub(alt_only=False):
    path = 'alternatives/index.html' if alt_only else 'compare/index.html'
    guides = [g for g in registry() if not alt_only or g[0] == 'alternatives']
    title = 'AI Operator Alternatives for Service Businesses' if alt_only else 'AI Operator Comparisons for Service Businesses'
    headline = 'Find your next operator.' if alt_only else 'Compare the companies.<br><span class="green">Choose the right fit.</span>'
    intro = 'Explore alternatives to Podium Larry, Sameday AI, Avoca, Jobber Receptionist, Housecall Pro CSR AI, ServiceTitan Voice Agent and Ruby. Choose Off The Clock for answering, supported job quotes, booking and follow-up—with QuoteDone on your website too.' if alt_only else 'Podium Larry. Sameday AI. Avoca. Jobber. Housecall Pro. ServiceTitan. Compare the operators, then see why Off The Clock brings answering, supported job quotes, booking and follow-up together with QuoteDone.'
    filters = '' if alt_only else '<button type="button" data-filter="head" aria-pressed="false">Head-to-head</button><button type="button" data-filter="alternatives" aria-pressed="false">Alternatives</button>'
    cards = ''.join(base.card(path, g) for g in guides)
    body = f'''<div class="hero"><div><p class="eyebrow">{'ALTERNATIVES BY COMPANY' if alt_only else 'THE SERVICE-BUSINESS COMPARISON LIBRARY'}</p><h1>{headline}</h1><p class="intro">{intro}</p><div class="hero-actions"><a class="button primary" href="#guides">{'Find an alternative' if alt_only else 'Find a comparison'} <span aria-hidden="true">↓</span></a>{base.button(path,'resources/index.html','Explore free tools')}</div><div class="library-note"><span>{len(guides)} COMPLETE GUIDES</span><span>NAMED COMPANIES · SOURCE-LINKED</span></div></div><aside class="hero-side"><p class="eyebrow">WHY OFF THE CLOCK AI</p><h2>The operator.<br>The quote.<br>The next appointment.</h2><div class="fact"><span class="num">01</span><div><strong>The call, handled.</strong><small>Business questions, booking, transfers and follow-up.</small></div></div><div class="fact"><span class="num">02</span><div><strong>Your prices, applied.</strong><small>Flat-rate services and supported variable jobs with QuoteDone.</small></div></div><div class="fact"><span class="num">03</span><div><strong>Your website, quoting too.</strong><small>A quote widget for customers who would rather start online.</small></div></div></aside></div>
<section class="section" id="guides" data-library><div class="section-title"><div><p class="eyebrow">SEARCH BY THE COMPANY YOU KNOW</p><h2>{'Which company are you replacing?' if alt_only else 'Find your comparison.'}</h2></div><p>Start with the name on your shortlist. Every card opens a completed guide.</p></div><div class="search-tools" data-search-tools hidden><label class="search-label"><span>Search companies and guides</span><input id="guide-search" type="search" maxlength="160" placeholder="Try Sameday, Podium or Jobber" autocomplete="off"></label><div class="filters" role="group" aria-label="Guide type"><button type="button" data-filter="all" aria-pressed="true">All {'alternatives' if alt_only else 'guides'}</button>{filters}</div></div><div class="result-line"><span class="meta" id="result-count" role="status" aria-live="polite">{len(guides)} guides available</span><button class="text-button" type="button" data-clear data-enhancement hidden>Clear filters</button></div><div class="cards">{cards}</div><div class="empty" id="empty-results" hidden><h3>No guide matches that search.</h3><p>Try the product name, or clear the filters to see the completed library.</p><button class="button" type="button" data-clear>Show all guides</button></div><noscript><p>All named guide links remain available without JavaScript.</p></noscript><p class="editorial-note">Recommendations are Off The Clock AI’s assessment, not independent customer reviews. Vendor facts have dated official sources. No invented prices, test results or unsupported feature exclusions.</p></section>{base.bridge(path)}'''
    return path, decorate(base.frame(path, title, intro, body, 'Alternatives' if alt_only else 'Compare'))


def main():
    paths = [destination(a) for a in ARTICLES]
    if len(set(paths)) != len(paths):
        raise ValueError('Duplicate article route')
    for article in ARTICLES:
        if not re.fullmatch(r'[a-z0-9-]+', article['slug']):
            raise ValueError('Invalid route slug')
        for link in article['related']:
            if link not in TITLES:
                raise ValueError('Unbuilt related route: ' + link)
    base.main()  # Builds the revised base articles and verifies the V2 byte identity.
    for path, html in [render_hub(), render_hub(True)] + [render_article(a) for a in ARTICLES]:
        file = OUT / path
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text(html, encoding='utf-8')
    resources = OUT / 'resources/index.html'
    resources.write_text(resources.read_text(encoding='utf-8').replace('Start with Smith.ai vs Ruby or explore Ruby alternatives.', 'Explore Podium Larry, Sameday AI, Avoca, Jobber Receptionist, Housecall Pro CSR AI, ServiceTitan Voice Agent and the original Smith.ai / Ruby guides.'), encoding='utf-8')
    launcher = OUT / 'START_HERE.html'
    launcher.write_text(launcher.read_text(encoding='utf-8').replace('Five new pages and the unchanged V2 tools.', 'Fifteen review pages: twelve named guides, three hubs and the unchanged V2 tools.'), encoding='utf-8')
    manifest = {'reviewed': DATA['reviewed'], 'guides': [{'kind': g[0], 'title': g[2], 'path': g[5]} for g in registry()], 'pages': ['compare/index.html', 'alternatives/index.html', 'resources/index.html', 'compare/smith-ai-vs-ruby/index.html', 'alternatives/ruby/index.html'] + paths, 'source_sha256': {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in [ROOT/'competitors/content.json'] + ARTICLE_FILES}, 'published': False}
    (OUT/'page-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    base.build_review_runner()
    print(f'Expanded review complete: {len(manifest["pages"])} pages; {len(manifest["guides"])} named guides. No merge, deployment or engine changes.')


if __name__ == '__main__':
    main()
