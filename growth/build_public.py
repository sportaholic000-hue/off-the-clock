"""Build the isolated review site with Python's standard library. No app imports.
Writes only growth/public and the standalone review runner in growth/.
Preserved V2 source is read, never edited.
"""
from pathlib import Path
from html import escape
import json
import posixpath
import hashlib
from urllib.parse import urlsplit, urlunsplit
import buyer_guide as buyer

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'public'
DATE = 'October 1, 2026'
SOURCES = {
 'smith-ai': ('Smith.ai — AI Receptionist pricing', 'https://smith.ai/pricing/ai-receptionist'),
 'smith-human': ('Smith.ai — Virtual Receptionists pricing', 'https://smith.ai/pricing/receptionists'),
 'ruby': ('Ruby — Plans and pricing', 'https://www.ruby.com/plans-and-pricing/'),
 'rosie': ('Rosie — Plans and pricing', 'https://heyrosie.com/pricing'),
 'goodcall': ('Goodcall — Pricing', 'https://www.goodcall.com/pricing'),
 'answerconnect': ('AnswerConnect — Canadian plans', 'https://www.answerconnect.com/ca/view-pricing'),
 'dialzara': ('Dialzara — Pricing; current numeric price unconfirmed', 'https://dialzara.com/pricing'),
}
CLOCK = '<svg class="clock" viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="11" fill="none" stroke="#00E676" stroke-width="1.7"/><path d="M14 7v7l5 3" fill="none" stroke="#00E676" stroke-width="1.7" stroke-linecap="round"/></svg>'

def url(page, destination):
    parsed = urlsplit(destination)
    if parsed.scheme or parsed.netloc: return destination
    name = posixpath.relpath(parsed.path, posixpath.dirname(page) or '.') if parsed.path else ''
    return urlunsplit(('', '', name, parsed.query, parsed.fragment))

def ref(key, number):
    title, href = SOURCES[key]
    return f'<a class="source" href="{href}" aria-label="Source {number}: {escape(title)}">[{number}]</a>'

def sources(keys):
    items = ''.join(f'<li id="source-{i}"><span>{i:02d}</span><a href="{SOURCES[k][1]}">{escape(SOURCES[k][0])}</a></li>' for i,k in enumerate(keys,1))
    return f'<section id="sources"><h2>Sources &amp; editorial approach</h2><p>Official vendor sources checked {DATE}; unavailable current prices are marked. Prices below are monthly examples, not personalized offers. Check current terms before buying. A published feature is not a hands-on result.</p><ul class="source-list">{items}</ul><p class="editorial-note">Published by Off The Clock AI, a product in this category. Our recommendations are editorial judgments, not independent customer reviews. We do not infer that a feature is impossible merely because a pricing page does not describe it.</p></section>'

def button(page, destination, text, primary=False):
    return f'<a class="button {"primary" if primary else ""}" href="{url(page,destination)}">{text}<span aria-hidden="true">↗</span></a>'

def bridge(page):
    return '<aside class="cta"><div><p class="eyebrow">OFF THE CLOCK AI + QUOTEDONE</p><h2>What would you like off your plate?</h2><p>Talk about your trade, your customer inquiries and the work you want handled. Explore quoting, booking, website inquiries and setup without gathering your price book first.</p><p class="editorial-note">Product conversation only; the demo does not issue real job quotes or book appointments.</p><small>30-day money-back guarantee on your first paid month.</small><p class="editorial-note">Prefer to collect a job example? <a href="'+url(page,'tools/growth-v2.html#challenge')+'">Prepare an optional job brief</a>. A local brief you can save or print; nothing is submitted.</p></div>'+buyer.cta(page,url)+'</aside>'

def frame(page, title, description, body, area):
    nav=''.join(f'<a href="{url(page,dest)}"'+(' aria-current="page"' if label==area else '')+f'>{label}</a>' for label,dest in [('Compare','compare/index.html'),('Alternatives','alternatives/index.html'),('Resources','resources/index.html')])
    brand=f'<a class="brand" href="{url(page,"compare/index.html")}" aria-label="Off The Clock AI, comparison library">{CLOCK}<span><strong>Off The Clock AI</strong><small>When you’re off the clock, your business is not.</small></span></a>'
    # No canonical URL or invented hosted destination: set only at an approved release.
    return f'''<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><meta name="description" content="{escape(description,quote=True)}">
<meta property="og:title" content="{escape(title,quote=True)}"><meta property="og:description" content="{escape(description,quote=True)}"><meta property="og:type" content="website">
<meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; font-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
<title>{escape(title)} | Off The Clock AI</title><style>{(OUT/"assets/site.css").read_text(encoding="utf-8")}</style>
</head><body><a class="skip" href="#main">Skip to content</a><div class="reviewbar"><div class="wrap"><span>OFF THE CLOCK AI / PUBLIC PAGES REVIEW</span><span>NOT PUBLISHED · NO LIVE SUBMISSIONS</span></div></div>
<header class="header"><div class="wrap header-inner">{brand}<nav class="nav" aria-label="Main navigation">{nav}</nav><div class="header-cta">{buyer.cta(page,url)}</div></div></header>
<main id="main" class="wrap" tabindex="-1">{body}</main>
<footer class="footer"><div class="wrap footer-inner"><div>{brand}<nav aria-label="Footer navigation"><a href="{url(page,'compare/index.html')}">Compare</a><a href="{url(page,'alternatives/index.html')}">Alternatives</a><a href="{url(page,'resources/index.html')}">Resources</a></nav></div><p>Private review • not published. Product offer shown for review; live services are not enabled here. Job briefs stay on your device. Published by Off The Clock AI.</p></div></footer><script>{(OUT/"assets/site.js").read_text(encoding="utf-8")}</script></body></html>'''

GUIDES = [
 ('head','HEAD-TO-HEAD','Smith.ai vs Ruby','Smith.ai sells AI-first and human-first services; Ruby bills receptionist minutes. Compare the actual plans with the operator-and-QuoteDone offer.','Who answers first—and what happens next?','compare/smith-ai-vs-ruby/index.html','smith.ai smith ai ruby live human ai pricing calls minutes'),
 ('alternatives','ALTERNATIVES','Looking beyond Ruby?','Compare six named options, including QuoteDone at $279 with 1,200 minutes. See which costs buy answering and which offer adds owner-priced job quotes.','What exactly are you trying to replace?','alternatives/ruby/index.html','ruby alternatives smith ai answerconnect rosie goodcall dialzara quotedone'),
]

def card(page, g):
    kind,label,title,desc,question,dest,terms=g
    return f'<article class="guide" data-guide data-kind="{kind}" data-search="{escape(terms,quote=True)}"><div class="guide-top"><span class="eyebrow">{label}</span><span class="tag">BUYING GUIDE</span></div><h2 class="guide-title"><a href="{url(page,dest)}">{title}</a></h2><p>{desc}</p><p class="question">{question}</p><div class="guide-bottom"><a class="read" href="{url(page,dest)}">Read the guide <span aria-hidden="true">↗</span></a><span class="plain-meta">REVIEWED SEP 11, 2026</span></div></article>'

def compare():
    p='compare/index.html'
    body=f'''<div class="hero"><div><p class="eyebrow">THE SERVICE-BUSINESS BUYING GUIDE</p><h1>Compare the outcome.<br><span class="green">Not just the features.</span></h1><p class="intro">An answered call is the start. What happens to the question, the price conversation and the booking is what you’re actually buying.</p><div class="hero-actions"><a class="button primary" href="#guides">Find a comparison <span aria-hidden="true">↓</span></a>{button(p,'resources/index.html','Explore the free tools')}</div></div><aside class="hero-side"><p class="eyebrow">THREE QUESTIONS TO START WITH</p><h2>Make the shortlist earn its place.</h2><div class="fact"><span class="num">01</span><div><strong>Who handles the call?</strong><small>AI, a live person, or an escalation path?</small></div></div><div class="fact"><span class="num">02</span><div><strong>What gets completed?</strong><small>A message, an answer, a price, a booking?</small></div></div><div class="fact"><span class="num">03</span><div><strong>What are you paying for?</strong><small>Check the product, unit, extras and terms.</small></div></div></aside></div>
<section class="section" id="guides" data-library><div class="section-title"><div><p class="eyebrow">START WITH THE DECISION</p><h2>Find your comparison.</h2></div><p>Two complete guides in this first review set. Every card opens a real page—not a placeholder.</p></div><div class="search-tools" data-search-tools hidden><label class="search-label"><span>Search guides</span><input id="guide-search" type="search" maxlength="160" placeholder="Try Ruby, human answering or billing" autocomplete="off"></label><div class="filters" role="group" aria-label="Guide type"><button type="button" data-filter="all" aria-pressed="true">All guides</button><button type="button" data-filter="head" aria-pressed="false">Head-to-head</button><button type="button" data-filter="alternatives" aria-pressed="false">Alternatives</button></div></div><div class="result-line"><span class="meta" id="result-count" role="status" aria-live="polite">2 guides available</span><button class="text-button" type="button" data-clear data-enhancement hidden>Clear filters</button></div><div class="cards">{''.join(card(p,g) for g in GUIDES)}</div><div class="empty" id="empty-results" hidden><h3>No guide matches that search.</h3><p>Try a product name or remove the category filter.</p><button class="button" type="button" data-clear>Show all guides</button></div><noscript><p>Both guides remain available below without JavaScript. Search and filters require JavaScript.</p></noscript><p class="editorial-note">Our standard: name the product, show the billing unit and cite the claim. Recommendations are our assessment. Listed capabilities are not a substitute for a demonstration.</p></section>
<section class="section"><div class="section-title"><div><p class="eyebrow">A BETTER BUYING TEST</p><h2>One real inquiry. Three things to watch.</h2></div></div><div class="tri"><div><span class="num">01 / THE CUSTOMER</span><h3>What do they leave with?</h3><p>Record the actual answer or next step. Don’t mark “booking” complete when the customer only receives a scheduling link.</p></div><div><span class="num">02 / THE OWNER</span><h3>What comes back to you?</h3><p>Check whether you receive an actionable request or another conversation you have to start from scratch.</p></div><div><span class="num">03 / THE BILL</span><h3>What did that outcome cost?</h3><p>Use your own call mix and the relevant plan. A call allowance and a minute allowance are not interchangeable quantities.</p></div></div></section>{bridge(p)}'''
    return p,frame(p,'Compare AI operators and answering services','Compare products by answering model, call outcomes, billing units and business fit. Source-linked guides for service businesses.',body,'Compare')

def alternatives():
    p='alternatives/index.html'
    body=f'''<div class="hero"><div><p class="eyebrow">ALTERNATIVES / START WITH THE GAP</p><h1>Don’t just switch.<br><span class="green">Solve what’s missing.</span></h1><p class="intro">A different answering service is only an upgrade if it changes the part that isn’t working for your business. Start with that, then choose the product.</p><div class="hero-actions">{button(p,'alternatives/ruby/index.html','Explore Ruby alternatives',True)}</div></div><aside class="hero-side"><p class="eyebrow">YOUR REASON TO MOVE</p><h2>Choose the outcome before the vendor.</h2><div class="fact"><span class="num">01</span><div><strong>A different answering model</strong><small>Keep human-first handling, or evaluate AI.</small></div></div><div class="fact"><span class="num">02</span><div><strong>A different usage model</strong><small>Compare how your actual inquiries are billed.</small></div></div><div class="fact"><span class="num">03</span><div><strong>Less unfinished business</strong><small>Test what still needs your attention.</small></div></div></aside></div><section class="section"><div class="section-title"><div><p class="eyebrow">THE FIRST COMPLETE SHORTLIST</p><h2>Replacing Ruby?</h2></div><p>One researched alternatives guide in this review set. No empty vendor pages.</p></div><div class="cards">{card(p,GUIDES[1])}<aside class="guide"><p class="eyebrow">NOT SURE YOU NEED TO SWITCH?</p><h2 class="guide-title">Test the two operating models.</h2><p>The Smith.ai vs Ruby guide distinguishes Smith.ai’s AI product from its separate live-receptionist offer. Choose the right comparison before comparing prices.</p><div class="guide-bottom"><a class="read" href="{url(p,'compare/smith-ai-vs-ruby/index.html')}">Read Smith.ai vs Ruby <span aria-hidden="true">↗</span></a></div></aside></div></section>{bridge(p)}'''
    return p,frame(p,'Answering-service alternatives for your business','Find an alternative by the outcome you need: answering model, billing unit, booking and the remaining owner follow-up.',body,'Alternatives')

def article_shell(p,title,intro,verdict,sections,keys,area):
    sections = [('buying-questions','Five questions before you choose',buyer.buying_questions(p,url))] + sections
    toc=''.join(f'<a href="#{i}">{label}</a>' for i,label,_ in sections)+ '<a href="#sources">Sources &amp; approach</a>'
    content=''.join(f'<section id="{i}"><h2>{label}</h2>{text}</section>' for i,label,text in sections)+sources(keys)
    body=f'<nav class="breadcrumb" aria-label="Breadcrumb"><a href="{url(p,"compare/index.html")}">Comparisons</a><span aria-hidden="true">/</span>{title}</nav><div class="article-hero"><p class="eyebrow">AN OFF THE CLOCK AI BUYING GUIDE</p><h1>{title}</h1><p class="intro">{intro}</p><div class="article-meta"><span class="meta">REVIEWED {DATE.upper()}</span><span class="tag">OFFICIAL SOURCES</span><a href="#sources">How we compare</a></div>{buyer.invitation(p,url)}</div><div class="verdict"><strong>The decision</strong><p>{verdict}</p></div><div class="article-layout"><nav class="toc" aria-label="On this page"><p class="eyebrow">ON THIS PAGE</p>{toc}</nav><article class="article">{content}</article></div>{bridge(p)}'
    return p,frame(p,title,escape(intro.replace('<strong>','').replace('</strong>','')),body,area)

CALLS='''<ol class="checklist"><li><strong>A straightforward service</strong>Ask for the approved service price and the next available appointment. Record what actually happens.</li><li><strong>A job with several moving parts</strong>Include measurements, removal and an extra. Check what remains for the owner to resolve.</li><li><strong>Something urgent</strong>Test the agreed escalation path without inventing an emergency or contacting real emergency services.</li><li><strong>A reschedule</strong>Check whether the existing booking changes, rather than accepting a new appointment as proof.</li><li><strong>“I need to speak to a person.”</strong>Observe the destination, the handoff and what happens when no one answers.</li></ol>'''

def smith_ruby():
    p='compare/smith-ai-vs-ruby/index.html';s=lambda k,n:ref(k,n)
    sections=[
      ('overview','AI-first, human-first and what you actually buy',f'''<p>Smith.ai has two different offers: AI Receptionist starts with AI and describes live-receptionist escalation; Virtual Receptionists is human-first. Ruby centers its service on live receptionists, alongside its advertised AI enhancements.{s('smith-ai',1)}{s('smith-human',2)}{s('ruby',3)}</p><table class="compare-table"><caption>Compare the actual service and its billing unit.</caption><thead><tr><th scope="col">Decision</th><th scope="col">Smith.ai</th><th scope="col">Ruby</th></tr></thead><tbody><tr><th scope="row">Starting interaction</th><td>AI-first or a separate human-first plan.{s('smith-human',2)}</td><td>Live receptionist.{s('ruby',3)}</td></tr><tr><th scope="row">Usage unit</th><td>Calls.{s('smith-ai',1)}</td><td>Receptionist minutes.{s('ruby',3)}</td></tr><tr><th scope="row">Entry offer</th><td>AI Pro: $150 / 75 calls. Human Starter: $300 / 30 calls.{s('smith-ai',1)}{s('smith-human',2)}</td><td>$250 / 50 minutes.{s('ruby',3)}</td></tr><tr><th scope="row">Pricing task</th><td>Instructions and configured workflows; a contractor project calculation is not established by the reviewed pricing pages.</td><td>Business instructions and intake; those are not themselves a measured project quote.</td></tr></tbody></table>'''),
      ('cost','The monthly amount needs the right unit',f'''<p>Smith.ai AI Receptionist lists a free plan with 25 calls, Pro at $150 for 75 and Enterprise at $500 for 300. Its separate human Starter plan is $300 for 30 calls. The detailed human pricing page lists additional service charges, including appointment booking, separately from the AI-plan pricing.{s('smith-ai',1)}{s('smith-human',2)}</p><p>Ruby lists $250/50 minutes, $395/100, $720/200 and $1,725/500. These are minute allowances, not call allowances.{s('ruby',3)}</p><p>A long project discussion consumes minutes differently from a brief scheduling call. Per-call billing measures a different thing. The actual length of your calls determines how the two usage models compare.</p>'''),
      ('off-the-clock','The third choice: an operator that handles job pricing',f'''<p>Off The Clock is our recommendation for a service business that wants the inquiry answered, the supported job priced and the appointment booked. Business questions, transfers and follow-up are part of the operator. QuoteDone adds calculation from your rates and the customer’s complete job details.</p><p>The difference appears when a customer asks about an installation with selected removal and an extra. A stored service price, a message to the owner and a calculated project quote are three different outcomes. QuoteDone is built for the third where the required information and supported pricing are present; otherwise it preserves a complete request for your review.</p><p>The website quote widget gives visitors the same owner-priced approach without a phone call. Your pricing stays yours, while routine quote preparation no longer has to begin with another conversation with you.</p>'''),
      ('offer','What the QuoteDone plan includes',f'''<div class="price-panels"><div class="price-panel"><p class="eyebrow">OFF THE CLOCK AI / QUOTEDONE</p><span class="metric">$279<span class="plain-meta"> / mo</span></span><p>1,200 minutes. AI operator and website quote widget.</p></div><div class="price-panel"><p class="eyebrow">ADDITIONAL USAGE</p><span class="metric">$0.35<span class="plain-meta"> / min</span></span><p>No setup fee. The price is defined before the sales conversation.</p></div></div><p>This is an AI operator with transfers to your business team, not an outsourced human-receptionist service. The reason to choose it is the owner-priced job and complete customer interaction—rather than an outsourced staffing model.</p>'''),
      ('decision','Keep the welcome. Finish the inquiry.',f'''<p>Choose Off The Clock when a pleasant first response is only the start of the result you need. Your own pricing, the selected job scope and the next appointment belong together. Talk to Off The Clock about how that would work for your business. No rates or job measurements are needed to explore the product.</p>''')
    ]
    return article_shell(p,'Smith.ai vs Ruby','Compare Smith.ai’s AI-first and human-first plans with Ruby’s live-receptionist service—and Off The Clock’s operator with job quoting.','Choose Off The Clock for answering, owner-priced job quotes and booking together. Smith.ai and Ruby offer different staffing and billing models; QuoteDone’s case is what happens to the price question after the greeting.',sections,['smith-ai','smith-human','ruby'],'Compare')

def ruby_alternatives():
    p='alternatives/ruby/index.html'
    entries=[
      ('off-clock','OUR RECOMMENDATION / ANSWER, QUOTE AND BOOK','Off The Clock AI',
       'QuoteDone is $279/month with 1,200 minutes, the AI operator and website quote widget. Additional usage is $0.35/minute, with no setup fee.',
       'Your flat-rate prices and supported project quotes use your own rates. The operator handles business questions, booking, transfers and follow-up. This is an AI operator with transfers to your team, not outsourced human staffing.',None),
      ('answerconnect','LIVE-HUMAN ANSWERING','AnswerConnect',
       'The Canadian site directs buyers to its pricing page; current numerical plans could not be independently read on October 1. Request a Canadian offer.',
       'The offer supplies live answering. Confirm currency, minute allowance, overage, setup and chat inclusions for your region; no current numeric price is asserted here.','answerconnect'),
      ('smith','AI-FIRST WITH A HUMAN ESCALATION PATH','Smith.ai AI Receptionist',
       'AI Pro is $150/month for 75 calls; a free 25-call tier and $500/300-call Enterprise entry configuration are also listed.',
       'The AI product describes live-receptionist escalation. Smith.ai’s separate human-first service starts at $300 for 30 calls. Product choice changes the comparison before usage does.','smith-ai'),
      ('rosie','MINUTE PLANS WITH DISTINCT BOOKING LEVELS','Rosie',
       'Professional is $49/month for 250 minutes; Scale is $149 for 1,000; Growth is $299 for 2,000.',
       'Professional can send appointment links. Scale adds direct calendar booking and warm/live transfers. Those are different customer outcomes, not just larger minute allowances.','rosie'),
      ('goodcall','PER-AGENT, UNIQUE-CUSTOMER BILLING','Goodcall',
       'Starter is $79/month per agent for 100 unique customers, with $0.50 for an additional unique customer and unlimited minutes and tokens.',
       'Repeat callers and long calls affect this model differently from a receptionist-minute allowance. The number of agents and unique customers remains relevant even when minutes are unlimited.','goodcall'),
      ('dialzara','MINUTE-BASED AI ANSWERING','Dialzara',
       'A current numerical plan could not be independently confirmed on October 1. Request the current plan and minute allowance.',
       'Direct retrieval failed and search results included older, inconsistent figures. Those snapshots are not presented as current prices; confirm website chat, booking and overage in the offer.','dialzara')
    ]
    vendors=''
    for ident,label,name,price,detail,key in entries:
        citation=ref(key,['ruby','answerconnect','smith-ai','smith-human','rosie','goodcall','dialzara'].index(key)+1) if key else ''
        extra=ref('smith-human',4) if ident=='smith' else ''
        link=f'<p><a class="read" href="{url(p,"compare/smith-ai-vs-ruby/index.html")}">Read Smith.ai vs Ruby ↗</a></p>' if ident=='smith' else ''
        vendors+=f'<div class="vendor" id="{ident}"><p class="eyebrow">{label}</p><h3>{name}</h3><p><strong>Pricing:</strong> {price}{citation}</p><p>{detail}{extra}</p>{link}</div>'
    sections=[
      ('reason','The price conversation is the reason to change',f'<p>Ruby provides live-receptionist handling, starting at $250 per month for 50 minutes.{ref("ruby",1)} Replacing it can mean changing the staffing model, the billing unit, or what gets completed for the customer. These six alternatives are different purchases, with different staffing, billing and quoting scope.</p><p>For a service business whose next task is still preparing the quote, choose Off The Clock. The operator handles the customer interaction; QuoteDone adds the owner-priced job and a dedicated website quote widget.</p>'),
      ('options','Six named alternatives and what they buy',vendors),
      ('scope','More than a cheaper way to take the message','<p>A customer requesting landscaping with removal and new material needs the whole selected job considered. A message captures the inquiry. A quote applies the relevant quantities, rates and inclusions. Those are different deliverables.</p><p>QuoteDone is built to calculate the supported complete scope from your own pricing. When required information is absent, the collected request comes to you for review without a guessed total. The operator still handles questions, scheduling, transfers and follow-up; the widget gives website visitors another way to begin.</p>'),
      ('cost','Compare the bill without mixing the units','<p>Ruby and AnswerConnect sell receptionist minutes. Smith.ai’s cited plans use calls. Goodcall uses unique customers per agent. QuoteDone includes 1,200 minutes in its $279 offer. One price column cannot make those billing units equivalent.</p><p>The product case for QuoteDone is therefore more than its allowance. The plan includes the operator and website quote widget, owner-priced supported job quotes and a $0.35/minute overage rate. The monthly amount and overage are visible before you choose the service.</p>'),
      ('decision','Choose the next step your customer needs','<p>Choose Off The Clock when you want customers to reach the supported job price and booking—not leave you another pricing callback. Keep control of exceptions without making yourself the starting point for every quote.</p>')
    ]
    return article_shell(p,'Ruby alternatives for service businesses','Compare Off The Clock AI, Smith.ai, AnswerConnect, Rosie, Goodcall and Dialzara by price, answering model and what happens to the job quote.','Our recommendation is Off The Clock for a service business that wants answering, job pricing and booking in one offer. QuoteDone adds your own rates and website quoting to the operator—not another request for you to price later.',sections,['ruby','answerconnect','smith-ai','smith-human','rosie','goodcall','dialzara'],'Alternatives')

def resources():
    p='resources/index.html'
    body=f'''<div class="hero"><div><p class="eyebrow">TOOLS &amp; PRACTICAL GUIDES</p><h1>Know your numbers.<br><span class="green">Make the next move.</span></h1><p class="intro">Check what a job leaves you. Turn your chosen markup into a selling price. Prepare a real job for the QuoteDone Challenge. Useful answers first—no email gate.</p></div><aside class="hero-side"><p class="eyebrow">START WITH YOUR NEXT DECISION</p><div class="fact"><span class="num">01</span><div><strong>Is this job priced the way you want?</strong><small>Your costs, your selling price, your chosen markup.</small></div></div><div class="fact"><span class="num">02</span><div><strong>What should your operator handle?</strong><small>Named-company comparisons, not vague feature claims.</small></div></div><div class="fact"><span class="num">03</span><div><strong>What job would prove the value?</strong><small>A brief built around your actual scope and questions.</small></div></div></aside></div><section class="section"><div class="resources"><article class="resource featured"><div><span class="tag">FREE CALCULATOR</span><h2>Know what’s left.<br><span class="green">Before you name a price.</span></h2><p>See the amount left after the costs you enter, or calculate a selling price from your chosen markup. Add labor, materials and other expenses, then save the result. This is a planning tool, not a customer quote.</p>{button(p,'tools/growth-v2.html#profit','Open job profit check',True)}</div><div class="utility-panel"><p class="eyebrow">YOUR FIGURES. YOUR CHOICE.</p><div class="utility-row"><span class="num">01</span>Check an existing selling price.</div><div class="utility-row"><span class="num">02</span>Calculate from your chosen markup.</div><div class="utility-row"><span class="num">03</span>Save or print the current calculation.</div></div></article><article class="resource"><span class="tag">JOB BRIEF</span><h2>The QuoteDone Challenge</h2><p>Put the whole job in one place: selected scope, measurements you have and facts still missing. Review, edit and save a brief for evaluation. Nothing is submitted.</p><a class="read" href="{url(p,'tools/growth-v2.html#challenge')}">Prepare my job brief ↗</a></article><article class="resource"><span class="tag">DOWNLOADABLE CHECKLIST</span><h2>Five calls. One fair comparison.</h2><p>A fixed-price inquiry, a variable job, an urgent request, a reschedule and a human handoff. Record what the customer receives and what still needs you.</p><a class="read" href="{url(p,'resources/five-call-checklist.txt')}" download>Download the checklist ↗</a></article><article class="resource"><span class="tag">INTAKE PREVIEW</span><h2>Your QuoteDone link</h2><p>Preview how a customer could start from a social profile, card or yard sign. Choose a service, describe the job and edit the review. Collection-only preview: no link is published and no lead is sent.</p><a class="read" href="{url(p,'tools/growth-v2.html#link')}">Explore the customer preview ↗</a></article><article class="resource"><span class="tag">SOURCE-LINKED READING</span><h2>Make the shortlist practical.</h2><p>Compare service-business operators by the company you already know. See the price, the platform requirements and the reason to choose Off The Clock—not another list of disconnected feature names.</p><a class="read" href="{url(p,'compare/index.html')}">Browse the comparison guides ↗</a></article></div><p class="editorial-note">Your figures stay on your device. The calculator and job brief work locally; the quote-link concept does not send requests.</p></section>'''
    return p,frame(p,'Free tools and buying guides for service businesses','Use the local job profit checker, prepare a QuoteDone Challenge brief, download a vendor checklist and explore source-linked buying guides.',body,'Resources')

CHECKLIST='''OFF THE CLOCK AI — FIVE-CALL EVALUATION CHECKLIST
Local worksheet. Not a submitted request or an endorsement.

Vendor and exact product:
Plan, currency, region and quote date:
Setup / recurring / included usage / extra usage / paid features:

Use the same five scenarios with each vendor. Do not place fake emergencies.
1. Straightforward service: approved price and appointment.
2. Variable project: multiple details, measurements and selected extras.
3. Urgent request: agreed escalation, safely demonstrated.
4. Reschedule: modify the existing booking, not create a duplicate.
5. Human request: transfer destination and unanswered-transfer behavior.

For EACH scenario record:
- What did the customer actually receive?
- What facts or requested scope were missed?
- What remains for the business owner to do?
- Which plan or add-on supports the demonstrated behavior?
- What is the failure or unavailable-information outcome?
- Where did the resulting record go, and can the owner act on it?

A listed capability is not a passed demonstration. A missing website description
is not proof that a vendor cannot do something. Calls, minutes and unique
customers are different units. Do not invent a conversion or a saving.

This worksheet was adapted from the five-call tests in the existing
Off The Clock Smith.ai vs Ruby and Ruby-alternatives content drafts.
'''

def main():
    OUT.mkdir(exist_ok=True)
    for make in [compare,alternatives,smith_ruby,ruby_alternatives,resources]:
        name,html=make();target=OUT/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_text(html,encoding='utf-8')
    (OUT/'resources/five-call-checklist.txt').write_text(CHECKLIST,encoding='utf-8')
    # Reconstruct the unchanged, single-file V2 from preserved original sources.
    v2=ROOT/'v2';html=(v2/'index.template.html').read_text(encoding='utf-8')
    for token,name in [('/*__STYLES__*/','styles.css'),('/*__MATH__*/','profit-math.js'),('/*__INTAKE__*/','intake-model.js'),('/*__APP__*/','app.js')]:
        html=html.replace(token,(v2/name).read_text(encoding='utf-8'))
    expected='82c65a675d896339f47da2082a9d11dbaf79056c37dd917e296622c2c5dd3b79'
    if hashlib.sha256(html.encode()).hexdigest()!=expected:raise RuntimeError('Preserved V2 does not match its approved artifact. No substitute will be written.')
    (OUT/'tools').mkdir(exist_ok=True);(OUT/'tools/growth-v2.html').write_text(html,encoding='utf-8')
    (OUT/'START_HERE.html').write_text(frame('START_HERE.html','Public page review','Open the separate comparison, alternatives and resources review pages.','<section class="section"><p class="eyebrow">PRIVATE REVIEW BUILD</p><h1>Off The Clock AI<br><span class="green">Public pages.</span></h1><p class="editorial-note">Five new pages and the unchanged V2 tools. Nothing is published or connected to production.</p><div class="hero-actions">'+button('START_HERE.html','compare/index.html','Open the comparison hub',True)+button('START_HERE.html','resources/index.html','Open resources')+'</div></section>',''),encoding='utf-8')
    demo = OUT/'demo/index.html'
    demo.parent.mkdir(parents=True,exist_ok=True)
    demo.write_text(frame('demo/index.html','Talk to Off The Clock about your business','Explore Off The Clock’s operator, QuoteDone, calendar booking and website inquiries.',buyer.demo_body('demo/index.html',url),''),encoding='utf-8')
    build_review_runner()
    print('Built five public review pages, a review launcher, a checklist and the byte-identical V2 tool.')

def build_review_runner():
    pages={str(p.relative_to(OUT)).replace('\\','/'):p.read_text(encoding='utf-8') for p in OUT.rglob('*.html')}
    pages['resources/five-call-checklist.txt']=(OUT/'resources/five-call-checklist.txt').read_text(encoding='utf-8')
    data=json.dumps(pages,ensure_ascii=False).replace('</','<\\/')
    js=r"""(function(){
'use strict';
const pages=JSON.parse(document.getElementById('pages').textContent),frame=document.getElementById('site');
let current='compare/index.html';
function open(path,hash='',search=''){
 if(!Object.hasOwn(pages,path)||!path.endsWith('.html'))return;
 current=path;document.title='Off The Clock AI | '+path;frame.title='Off The Clock AI — '+path;
 frame.srcdoc=pages[path];history.replaceState(null,'','#'+path+search+(hash?'::'+hash.slice(1):''));
 frame.onload=()=>{
  const doc=frame.contentDocument;
  if(path==='demo/index.html')doc.dispatchEvent(new CustomEvent('growth-demo-context',{detail:{source:new URLSearchParams(search).get('source')}}));
  if(hash){frame.contentWindow.location.hash=hash;}
  doc.addEventListener('click',e=>{
   const a=e.target.closest('a[href]');if(!a)return;
   const href=a.getAttribute('href');if(href.startsWith('#')){e.preventDefault();frame.contentWindow.location.hash=href;const target=doc.getElementById(href.slice(1));if(target){target.scrollIntoView({block:'start',behavior:'instant'});}return;}
   const target=new URL(href,'https://local-preview.invalid/'+current);
   if(target.origin!=='https://local-preview.invalid'){a.target='_blank';a.rel='noopener noreferrer';return;}
   const key=decodeURIComponent(target.pathname.slice(1));
   if(!Object.hasOwn(pages,key))return;
   e.preventDefault();
   if(key.endsWith('.txt')){const blob=URL.createObjectURL(new Blob([pages[key]],{type:'text/plain;charset=utf-8'}));const link=document.createElement('a');link.href=blob;link.download=key.split('/').pop();link.click();setTimeout(()=>URL.revokeObjectURL(blob),3000);}
   else open(key,target.hash,target.search);
  });
 };
}
const [route,fragment]=location.hash.slice(1).split('::'),start=new URL(route||current,'https://local-preview.invalid/'),path=decodeURIComponent(start.pathname.slice(1));open(pages[path]?path:current,fragment?'#'+fragment:'',start.search);
})();"""
    wrapper='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Off The Clock AI — growth review</title><style>html,body{margin:0;width:100%;height:100%;background:#0A0A0A}iframe{display:block;border:0;width:100%;height:100dvh}</style></head><body><iframe id="site" title="Off The Clock AI review" sandbox="allow-scripts allow-same-origin allow-downloads allow-modals allow-popups allow-popups-to-escape-sandbox"></iframe><script id="pages" type="application/json">'+data+'</script><script>'+js+'</script></body></html>'
    (ROOT/'Off_The_Clock_Public_Pages_Review.html').write_text(wrapper,encoding='utf-8')

if __name__=='__main__':main()
