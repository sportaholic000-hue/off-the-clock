"""Build the isolated review site with Python's standard library. No app imports.
Writes only growth/public and the standalone review runner in growth/.
Preserved V2 source is read, never edited.
"""
from pathlib import Path
from html import escape
import json
import posixpath
import hashlib

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'public'
DATE = 'September 11, 2026'
SOURCES = {
 'smith-ai': ('Smith.ai — AI Receptionist pricing', 'https://smith.ai/pricing/ai-receptionist'),
 'smith-human': ('Smith.ai — Virtual Receptionists pricing', 'https://smith.ai/pricing/receptionists'),
 'ruby': ('Ruby — Plans and pricing', 'https://www.ruby.com/plans-and-pricing/'),
 'rosie': ('Rosie — Plans and pricing', 'https://heyrosie.com/pricing'),
 'goodcall': ('Goodcall — Pricing', 'https://www.goodcall.com/pricing'),
 'answerconnect': ('AnswerConnect — Canadian plans', 'https://www.answerconnect.com/ca/'),
 'dialzara': ('Dialzara — Indexed official pricing; direct fetch unavailable', 'https://dialzara.com/pricing'),
}
CLOCK = '<svg class="clock" viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="11" fill="none" stroke="#00E676" stroke-width="1.7"/><path d="M14 7v7l5 3" fill="none" stroke="#00E676" stroke-width="1.7" stroke-linecap="round"/></svg>'

def url(page, destination):
    name, sep, fragment = destination.partition('#')
    return posixpath.relpath(name, posixpath.dirname(page) or '.') + (sep + fragment if sep else '')

def ref(key, number):
    title, href = SOURCES[key]
    return f'<a class="source" href="{href}" aria-label="Source {number}: {escape(title)}">[{number}]</a>'

def sources(keys):
    items = ''.join(f'<li id="source-{i}"><span>{i:02d}</span><a href="{SOURCES[k][1]}">{escape(SOURCES[k][0])}</a></li>' for i,k in enumerate(keys,1))
    return f'<section id="sources"><h2>Sources &amp; editorial approach</h2><p>Official vendor material reviewed {DATE}. Prices below are monthly examples, not personalized offers. Check current terms before buying. A published feature is not a hands-on result.</p><ul class="source-list">{items}</ul><p class="editorial-note">Published by Off The Clock AI, a product in this category. Our recommendations are editorial judgments, not independent customer reviews. We do not infer that a feature is impossible merely because a pricing page does not describe it.</p></section>'

def button(page, destination, text, primary=False):
    return f'<a class="button {"primary" if primary else ""}" href="{url(page,destination)}">{text}<span aria-hidden="true">↗</span></a>'

def bridge(page):
    return f'<aside class="cta"><div><p class="eyebrow">LESS SALES PITCH. MORE PROOF.</p><h2>Bring a job you already know.</h2><p>Prepare a QuoteDone Challenge brief using your scope and known details. A local brief—not a staged result or a submitted application.</p></div>{button(page,"tools/growth-v2.html#challenge","Prepare my job brief",True)}</aside>'

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
<header class="header"><div class="wrap header-inner">{brand}<nav class="nav" aria-label="Main navigation">{nav}</nav><div class="header-cta">{button(page,'tools/growth-v2.html#challenge','Test a real job')}</div></div></header>
<main id="main" class="wrap" tabindex="-1">{body}</main>
<footer class="footer"><div class="wrap footer-inner"><div>{brand}<nav aria-label="Footer navigation"><a href="{url(page,'compare/index.html')}">Compare</a><a href="{url(page,'alternatives/index.html')}">Alternatives</a><a href="{url(page,'resources/index.html')}">Resources</a></nav></div><p>Private review build. Vendor facts are linked to their sources. Local tools and draft exports are functional; pilot enrollment and hosted lead delivery are not connected. No production homepage, account or quote system is changed.</p></div></footer><script>{(OUT/"assets/site.js").read_text(encoding="utf-8")}</script></body></html>'''

GUIDES = [
 ('head','HEAD-TO-HEAD','Smith.ai vs Ruby','AI-first or human-first? Choose the actual product, compare its billing unit, then test the call you need handled.','Who answers first—and what happens next?','compare/smith-ai-vs-ruby/index.html','smith.ai smith ai ruby live human ai pricing calls minutes'),
 ('alternatives','ALTERNATIVES','Looking beyond Ruby?','Compare six options by the job you need done: live answering, AI call handling, a different billing model, or the price conversation.','What exactly are you trying to replace?','alternatives/ruby/index.html','ruby alternatives smith ai answerconnect rosie goodcall dialzara quotedone'),
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
    toc=''.join(f'<a href="#{i}">{label}</a>' for i,label,_ in sections)+ '<a href="#sources">Sources &amp; approach</a>'
    content=''.join(f'<section id="{i}"><h2>{label}</h2>{text}</section>' for i,label,text in sections)+sources(keys)
    body=f'<nav class="breadcrumb" aria-label="Breadcrumb"><a href="{url(p,"compare/index.html")}">Comparisons</a><span aria-hidden="true">/</span>{title}</nav><div class="article-hero"><p class="eyebrow">AN OFF THE CLOCK AI BUYING GUIDE</p><h1>{title}</h1><p class="intro">{intro}</p><div class="article-meta"><span class="meta">REVIEWED {DATE.upper()}</span><span class="tag">OFFICIAL SOURCES</span><a href="#sources">How we compare</a></div></div><div class="verdict"><strong>The decision</strong><p>{verdict}</p></div><div class="article-layout"><nav class="toc" aria-label="On this page"><p class="eyebrow">ON THIS PAGE</p>{toc}</nav><article class="article">{content}</article></div>{bridge(p)}'
    return p,frame(p,title,escape(intro.replace('<strong>','').replace('</strong>','')),body,area)

CALLS='''<ol class="checklist"><li><strong>A straightforward service</strong>Ask for the approved service price and the next available appointment. Record what actually happens.</li><li><strong>A job with several moving parts</strong>Include measurements, removal and an extra. Check what remains for the owner to resolve.</li><li><strong>Something urgent</strong>Test the agreed escalation path without inventing an emergency or contacting real emergency services.</li><li><strong>A reschedule</strong>Check whether the existing booking changes, rather than accepting a new appointment as proof.</li><li><strong>“I need to speak to a person.”</strong>Observe the destination, the handoff and what happens when no one answers.</li></ol>'''

def smith_ruby():
    p='compare/smith-ai-vs-ruby/index.html';s=lambda k,n:ref(k,n)
    sections=[
      ('overview','Compare the actual products',f'''<p><strong>Smith.ai is not an AI-only company.</strong> Its AI Receptionist and Virtual Receptionists are different offers. The AI plan answers with AI first and describes escalation to live receptionists; the Virtual Receptionists offer is human-first.{s('smith-ai',1)}{s('smith-human',2)}</p><p>Ruby centers its service on live receptionists and also advertises AI enhancements. “Human-first” does not mean “no AI anywhere.”{s('ruby',3)}</p><div class="callout">Our recommendation: first decide whether a live person must answer initially. Then compare the relevant plans—not one brand’s AI entry price against another brand’s human service as though they were identical.</div><table class="compare-table"><caption>The product distinction, not a feature-score contest.</caption><thead><tr><th scope="col">Decision</th><th scope="col">Smith.ai</th><th scope="col">Ruby</th></tr></thead><tbody><tr><th scope="row">First response</th><td>AI-first or a separate human-first product.{s('smith-human',2)}</td><td>Live-receptionist service.{s('ruby',3)}</td></tr><tr><th scope="row">Billing unit</th><td>Calls on the cited plans.{s('smith-ai',1)}</td><td>Receptionist minutes.{s('ruby',3)}</td></tr><tr><th scope="row">What to demonstrate</th><td>Choose the product, then test escalation and your calendar.</td><td>Test your instructions, intake depth and calendar.</td></tr></tbody></table>'''),
      ('cost','The price needs its unit',f'''<div class="price-panels"><div class="price-panel"><p class="eyebrow">SMITH.AI / AI PRO</p><span class="metric">$150<span class="plain-meta"> / mo</span></span><p>75 calls. Monthly entry configuration.{s('smith-ai',1)}</p></div><div class="price-panel"><p class="eyebrow">RUBY / RECEPTIONISTS</p><span class="metric">$250<span class="plain-meta"> / mo</span></span><p>50 receptionist minutes. Entry plan.{s('ruby',3)}</p></div></div><p>Smith.ai also lists a free AI plan with 25 calls, and Enterprise at $500 for 300 calls. Its separate human Starter offer is $300 for 30 calls, with $11.50 per additional call. Appointment booking on that human-service pricing page is listed at $1.50 per call.{s('smith-ai',1)}{s('smith-human',2)}</p><p>Ruby’s next listed tiers are $395 for 100 minutes, $720 for 200 and $1,725 for 500. The page states that receptionist plans share the same features and have no activation or setup fee.{s('ruby',3)}</p><div class="callout">These are the dollar amounts on the linked U.S. vendor pages, not converted Canadian quotes. Do not turn 75 calls into 75 minutes. Ask each vendor to price the same call history, including long conversations, transfers and paid extras.</div>'''),
      ('workflow','Test the workflow, not the label',f'''<p>Smith.ai’s AI page lists qualification, routing, scheduling and integrations. Ruby lists intake, scheduling and payment collection. Those labels establish the advertised offer—not that either service handles your exact workflow without configuration.{s('smith-ai',1)}{s('ruby',3)}</p><p>A contractor’s demonstration should separate three things: giving a stored service price, calculating a variable job, and arranging a visit to estimate it. Ask the vendor which one it is actually doing, and what information the owner receives when the job cannot be priced.</p><p>The reviewed pricing pages are not evidence of universal job-quoting support or its absence. Request a demonstration with your own service requirements instead of accepting a broad “AI” or “custom workflow” label as proof.</p>'''),
      ('fit','Which belongs on your shortlist?',f'''<h3>Choose based on the first response.</h3><p>Consider Smith.ai’s AI offering when you are comfortable testing an AI-first conversation and want to evaluate its escalation path. When human-first answering is non-negotiable, compare Ruby with Smith.ai’s separate human offer.</p><h3>Then choose based on the remaining task.</h3><p>Neither a pleasant greeting nor a low entry price tells you whether your own inquiry is finished. Ask what still needs a callback, who owns that callback and whether a booked appointment is the actual outcome you wanted.</p><h3>Where Off The Clock fits</h3><p>Off The Clock’s product focus is the service-business journey from answering to supported job pricing and booking. QuoteDone is the reason to evaluate it when the price conversation is the unfinished step—not a reason to pretend an outsourced human team and an AI operator are identical.</p><p>Use the <a href="{url(p,'tools/growth-v2.html#challenge')}">local QuoteDone Challenge brief</a> to describe the job that would convince you. This review build does not run a live sales call, submit an application or establish that a production workflow has passed.</p>'''),
      ('test','Use the same five calls',CALLS+f'<p>Write down the customer outcome, the task left for the owner, any missed detail and the paid plan required. Use the <a href="{url(p,"resources/five-call-checklist.txt")}" download>five-call evaluation checklist</a> to keep the comparison consistent.</p>')
    ]
    return article_shell(p,'Smith.ai vs Ruby','AI-first, human-first and the real cost of the call. Start with the product—not just the brand.','Choose whether the caller should begin with AI or a person. Then test the actual task. Smith.ai offers both starting points through distinct products; Ruby’s cited offer centers on live receptionists.',sections,['smith-ai','smith-human','ruby'],'Compare')

def ruby_alternatives():
    p='alternatives/ruby/index.html'
    entries=[
      ('off-clock','THE PRICE CONVERSATION','Off The Clock AI','Evaluate when the service price—not only the answering—is the missing step. QuoteDone is the product’s dedicated quoting proposition alongside the operator and website experience.','The review build provides a local job brief, not a live production demonstration. It does not include an outsourced human receptionist team.','Prepare a job you understand before judging the product. Do not substitute a sample total for verified performance.',None),
      ('answerconnect','KEEP LIVE ANSWERING','AnswerConnect','The Canadian offer is a 24/7 live-answering service with business-specific handling. Entry is CAD $325/month for 100 minutes plus CAD $75 setup; Growth is CAD $425 for 300 minutes with no setup fee.','These are Canadian prices, not a direct dollar-for-dollar comparison with U.S. offers.','Ask for an all-in price for your actual region and call mix.','answerconnect'),
      ('smith','EVALUATE AI-FIRST ANSWERING','Smith.ai AI Receptionist','The AI product lists Free at 25 calls, Pro at $150/month for 75 calls, and Enterprise at $500 for 300. Live-receptionist escalation is described; ask how it applies to your configuration.','Human-first Virtual Receptionists is a separate product with different pricing.','Use the head-to-head guide to avoid comparing the wrong plan.','smith-ai'),
      ('rosie','CHECK THE BOOKING TIER','Rosie','Professional is $49/month for 250 minutes. Scale is $149 for 1,000 minutes and includes direct calendar booking plus warm/live transfers. Growth is $299 for 2,000 minutes.','Professional advertises appointment links; a link is not the same outcome as direct booking.','Test the plan that includes the workflow you need, not just the lowest advertised price.','rosie'),
      ('goodcall','COMPARE A DIFFERENT USAGE UNIT','Goodcall','Monthly per-agent pricing starts at $79 for 100 unique customers, then $129 for 250 and $249 for 500. Extra unique customers are $0.50 each; minutes and tokens are unlimited.','The billed unit is a unique customer, not a call or minute. Repeat inquiries need different cost comparisons.','Ask how your returning callers, agent count and required flows affect the bill.','goodcall'),
      ('dialzara','EXAMINE A MINUTE-BASED AI PLAN','Dialzara','The indexed official pricing page lists Lite at $29/month for 60 minutes and Pro at $99 for 220. Lite overage is $0.48/minute; Pro is $0.45.','Direct retrieval of this page failed during this review. The official search snapshot was available but had been crawled about three months earlier. These figures need reconfirmation.','Check the current vendor page and the required transfer/calendar tier before buying.','dialzara')
    ]
    vendors=''
    for ident,label,name,detail,tradeoff,test,key in entries:
        citation=ref(key,['ruby','answerconnect','smith-ai','smith-human','rosie','goodcall','dialzara'].index(key)+1) if key else ''
        link=f'<p><a class="read" href="{url(p,"compare/smith-ai-vs-ruby/index.html")}">Compare Smith.ai and Ruby ↗</a></p>' if ident=='smith' else ''
        vendors+=f'<div class="vendor" id="{ident}"><p class="eyebrow">{label}</p><h3>{name}</h3><p>{detail}{citation}</p><p><strong>The distinction:</strong> {tradeoff}</p><p><strong>What to test:</strong> {test}</p>{link}</div>'
    sections=[
      ('reason','Start with why Ruby no longer fits',f'<p>Ruby may still belong on the shortlist when live-receptionist handling is the requirement. Its pricing starts at $250 for 50 minutes; its page also describes AI enhancements, so this is not a simple “AI versus no AI” decision.{ref("ruby",1)}</p><p>Our recommendation is to define the gap before switching: an unsuitable billing model, a different first response, a booking requirement, or a price conversation that still returns to you. The alternatives below are grouped by those questions, not ranked as universal winners.</p>'),
      ('options','Six options, different reasons',vendors),
      ('cost','Compare the same task and the full bill','<p>Call counts, talk minutes and unique customers measure different things. Dollar amounts also need a currency and region. A lower entry price does not establish a lower cost for the same workload.</p><p>Request a proposal that names the plan, included usage, overage, setup charges, relevant add-ons and cancellation terms. Use the same recorded call mix or clearly labeled hypothetical scenario for each vendor. Do not invent average call length to manufacture a saving.</p>'),
      ('test','Five checks before you switch',CALLS),
      ('decision','Our recommendation',f'<p>Keep a human-first shortlist when a person answering initially is the priority. Evaluate AI options when that starting point can change. Evaluate Off The Clock when the unanswered business question is the job price and the resulting next step.</p><p>Then make the shortlist prove it against the same real requirements. A vendor’s missing description is not proof that it cannot support a workflow; an attractive feature label is not proof that it can.</p><p><a href="{url(p,"resources/five-call-checklist.txt")}" download>Download the evaluation checklist</a> or <a href="{url(p,"tools/growth-v2.html#challenge")}">prepare your job brief</a>. Both are local resources; nothing is submitted.</p>')
    ]
    return article_shell(p,'Ruby alternatives for service businesses','Keep live answering, try AI, change the billing model—or finish the price conversation. The right alternative depends on the gap.','Do not replace a brand before defining the outcome. This shortlist covers six different offers and makes the billing units, product boundaries and research limitations explicit.',sections,['ruby','answerconnect','smith-ai','smith-human','rosie','goodcall','dialzara'],'Alternatives')

def resources():
    p='resources/index.html'
    body=f'''<div class="hero"><div><p class="eyebrow">TOOLS &amp; PRACTICAL GUIDES</p><h1>Less guessing.<br><span class="green">A better next step.</span></h1><p class="intro">Check your own figures. Put a real job into words. Compare the call you need handled. Useful resources without an email gate.</p></div><aside class="hero-side"><p class="eyebrow">KNOW WHAT YOU’RE OPENING</p><div class="fact"><span class="num">01</span><div><strong>Working local tools</strong><small>Calculate or export on your device.</small></div></div><div class="fact"><span class="num">02</span><div><strong>Source-linked guides</strong><small>Separate vendor facts from recommendations.</small></div></div><div class="fact"><span class="num">03</span><div><strong>Clearly marked concepts</strong><small>No pretend enrollment, links or lead delivery.</small></div></div></aside></div><section class="section"><div class="resources"><article class="resource featured"><div><span class="tag">WORKING LOCAL TOOL</span><h2>Know what’s left.<br><span class="green">Before you name a price.</span></h2><p>Use your selling price and entered costs—or your own target markup. This standalone calculator does not create a customer quote or access a saved price book.</p>{button(p,'tools/growth-v2.html#profit','Open job profit check',True)}</div><div class="utility-panel"><p class="eyebrow">YOUR FIGURES. YOUR CHOICE.</p><div class="utility-row"><span class="num">01</span>Check an existing selling price.</div><div class="utility-row"><span class="num">02</span>Calculate from your chosen markup.</div><div class="utility-row"><span class="num">03</span>Save or print the current calculation.</div></div></article><article class="resource"><span class="tag">GUIDED LOCAL BRIEF</span><h2>The QuoteDone Challenge</h2><p>Bring a representative job, separate known measurements from open questions, then review and export the brief. No pilot application is sent.</p><a class="read" href="{url(p,'tools/growth-v2.html#challenge')}">Prepare my job brief ↗</a></article><article class="resource"><span class="tag">DOWNLOADABLE CHECKLIST</span><h2>Five calls. One fair comparison.</h2><p>Give each vendor the same tasks. Record the customer outcome, follow-up left to you and plan required—not an invented score.</p><a class="read" href="{url(p,'resources/five-call-checklist.txt')}" download>Download the checklist ↗</a></article><article class="resource"><span class="tag">COLLECTION-ONLY CONCEPT</span><h2>Your QuoteDone link</h2><p>Explore a proposed branded intake page with service-specific questions and visible unknowns. No live URL, QR destination, quote or lead is created.</p><a class="read" href="{url(p,'tools/growth-v2.html#link')}">Explore the customer preview ↗</a></article><article class="resource"><span class="tag">SOURCE-LINKED READING</span><h2>Make the shortlist practical.</h2><p>Start with Smith.ai vs Ruby or explore Ruby alternatives. Check the product, billing unit and work you need completed.</p><a class="read" href="{url(p,'compare/index.html')}">Browse the comparison guides ↗</a></article></div><p class="editorial-note">The calculator and previews are preserved V2 tools, not new application integrations. No analytics, account creation or automatic sharing is connected here.</p></section>'''
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
function open(path,hash=''){
 if(!Object.hasOwn(pages,path)||!path.endsWith('.html'))return;
 current=path;document.title='Off The Clock AI | '+path;frame.title='Off The Clock AI — '+path;
 frame.srcdoc=pages[path];history.replaceState(null,'','#'+path+(hash?'::'+hash.slice(1):''));
 frame.onload=()=>{
  const doc=frame.contentDocument;
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
   else open(key,target.hash);
  });
 };
}
const [path,fragment]=location.hash.slice(1).split('::');open(pages[path]?path:current,fragment?'#'+fragment:'');
})();"""
    wrapper='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Off The Clock AI — growth review</title><style>html,body{margin:0;width:100%;height:100%;background:#0A0A0A}iframe{display:block;border:0;width:100%;height:100dvh}</style></head><body><iframe id="site" title="Off The Clock AI review" sandbox="allow-scripts allow-same-origin allow-downloads allow-modals allow-popups allow-popups-to-escape-sandbox"></iframe><script id="pages" type="application/json">'+data+'</script><script>'+js+'</script></body></html>'
    (ROOT/'Off_The_Clock_Public_Pages_Review.html').write_text(wrapper,encoding='utf-8')

if __name__=='__main__':main()
