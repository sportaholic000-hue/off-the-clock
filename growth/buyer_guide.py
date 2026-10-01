"""Source-backed buying answers and a build-time demo handoff. No voice runtime."""
from pathlib import Path
from html import escape
from urllib.parse import urlsplit, urlencode, parse_qsl, urlunsplit
import json

ROOT = Path(__file__).resolve().parent
DATA = json.loads((ROOT/'competitors/buying-questions.json').read_text(encoding='utf-8'))
SOURCES = json.loads((ROOT/'competitors/content.json').read_text(encoding='utf-8'))['sources']
CTA = 'Talk to Off The Clock about your business'
QUESTIONS = [('quote','Can it quote using my approved prices?'),('booking','How does calendar booking work?'),('website','Does it handle website inquiries too?'),('setup','What setup and phone arrangements are required?'),('cost','What does the comparable cost include?')]

def configured_demo():
    value = json.loads((ROOT/'demo-handoff.json').read_text(encoding='utf-8'))['url']
    if value is None: return None
    if not isinstance(value,str): raise ValueError('Demo URL must be an HTTPS URL or null')
    parsed = urlsplit(value)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or parsed.fragment:
        raise ValueError('Demo URL must be HTTPS without credentials or a fragment')
    return value

def demo_destination(page):
    target = configured_demo()
    if target:
        parsed = urlsplit(target)
        query = [(k,v) for k,v in parse_qsl(parsed.query,keep_blank_values=True) if k != 'comparison_source']
        return urlunsplit((parsed.scheme,parsed.netloc,parsed.path,urlencode(query+[('comparison_source',page)]),''))
    return 'demo/index.html?' + urlencode({'source':page})

def cta(page,url,compact=False):
    return '<a class="button primary demo-cta" data-demo-cta href="'+escape(url(page,demo_destination(page)),quote=True)+'">'+CTA+'<span aria-hidden="true">↗</span></a>'

def invitation(page,url):
    return '<div class="conversation-invite">'+cta(page,url)+'<p>No account or price book needed to explore the product. Talk about your trade and what you want handled.</p><small>30-day money-back guarantee on your first paid month.</small></div>'

def buying_questions(page,url):
    if page not in DATA['pages']: raise ValueError('No buying comparison for '+page)
    vendors = ['otc'] + DATA['pages'][page]
    rows = []
    for key,question in QUESTIONS:
        cells = []
        for vendor_key in vendors:
            vendor = DATA['vendors'][vendor_key]
            answer,*refs = vendor['answers'][key]
            citations = ' '.join('<a class="buyer-source" href="'+escape(SOURCES[r]['url'],quote=True)+'" aria-label="'+escape(SOURCES[r]['title'],quote=True)+'">Official source</a>' for r in refs)
            cells.append('<div><dt>'+escape(vendor['name'])+'</dt><dd>'+escape(answer)+(' <span class="buyer-refs">'+citations+'</span>' if refs else '')+'</dd></div>')
        rows.append('<details class="buyer-question" id="buy-'+key+'"'+(' open' if key=='quote' else '')+'><summary>'+escape(question)+'</summary><dl class="buyer-answers">'+''.join(cells)+'</dl></details>')
    return '<p>Start with the result you need, then check the plan and setup that support it. Open each question for the practical difference.</p><p class="editorial-note">Vendor statements checked October 1, 2026; source limits are marked. Off The Clock’s launch offer is shown here for review. Live phone, calendar and demo acceptance remain separate launch checks.</p><div class="buyer-questions">'+''.join(rows)+'</div><p class="editorial-note">Compare total cost: base subscription + required add-ons + extra usage + phone charges + taxes. Calls, minutes, text conversations and unique customers are different billing units. No currency conversion or savings claim is implied.</p>'+invitation(page,url)

def demo_body(page,url):
    context = {path:' / '.join(DATA['vendors'][v]['name'] for v in vendors) for path,vendors in DATA['pages'].items()}
    context_json = json.dumps(context,ensure_ascii=False).replace('</','<\/')
    return '<section class="section demo-handoff" id="demo"><p class="eyebrow">OFF THE CLOCK AI + QUOTEDONE</p><h1>Talk about your business.</h1><p class="intro">Explore how Off The Clock could handle your calls, approved job prices, bookings and website inquiries.</p><p class="demo-context" data-demo-context hidden></p><div class="handoff-status" role="status"><strong>Voice demo not connected in this review.</strong><p>The live demo destination has not been configured here. No microphone or provider session has started.</p></div><h2>What would you like handled?</h2><p>Your trade, the questions customers ask and the work you want off your plate are enough to start. You do not need your price book in front of you.</p><ul><li>How QuoteDone uses approved prices and handles exceptions.</li><li>How bookings reach your calendar and what needs connecting.</li><li>How the phone agent and website quote widget work together.</li><li>Which phone arrangement fits your existing business number.</li><li>What the monthly plan and extra usage include.</li></ul><p class="editorial-note">The product demo explains Off The Clock. It does not issue real job quotes or book appointments. A live voice session must start with an explicit microphone action on the connected demo.</p><p><a data-demo-return href="'+url(page,'compare/index.html')+'">Back to comparison guides</a></p><script id="comparison-context" type="application/json">'+context_json+'</script></section>'
