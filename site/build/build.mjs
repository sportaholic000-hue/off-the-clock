// Builds the static public pages into site/www. Run: node site/build/build.mjs
// The homepage (site/www/index.html), privacy and terms are maintained by hand
// and are not touched here.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { page, hero, cta, esc, ORIGIN, SIGNUP, SUPPORT } from './layout.mjs';
import { COMPETITORS, TYPES, US, CHECKED } from './competitors.mjs';
import { FAQ } from './faq.mjs';
import { DOCS, AGENT_RULES, SWITCHING } from './content.mjs';
import { INDUSTRIES, SHARED_FAQ } from './industries.mjs';

const WWW = join(dirname(fileURLToPath(import.meta.url)), '..', 'www');
const written = [];
function emit(path, html) {
  const file = join(WWW, path, 'index.html');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
  written.push(path);
}

// ---------- plans (same facts as server/src/billingUsagePolicy.js and planAccess.js) ----------
const PLANS = [
  { name: 'Starter', monthly: 69, annual: 690, minutes: '150', blurb: 'Your AI employee answers every call on the number you already have.',
    features: ['Answers 24/7 on your number', 'Answers from your business info and listed prices', 'Takes requests and captures every lead', 'Transcript and summary of every call', 'Owner email alerts', 'Blocks numbers you mark as spam', 'One number, one owner login'],
    excluded: 'No calendar booking, live transfer, price book, website widget or phone price-book quoting.' },
  { name: 'Operator', monthly: 119, annual: 1190, minutes: '300', blurb: 'Everything in Starter, plus booking, live transfer and the QuoteDone website widget.',
    features: ['Everything in Starter', 'Books visits onto Google Calendar during the call', 'Live transfer to you during the hours you set', 'Price book with AI setup and website price import', 'QuoteDone website widget: quotes and booking', 'Webhooks for leads, quote requests and bookings', 'Owner plus one office-staff login'],
    excluded: 'Phone price-book quoting is not included.' },
  { name: 'QuoteDone', monthly: 279, annual: 2790, minutes: '1,200', flagship: true, blurb: 'Everything in Operator, plus real quotes from your price book on the phone.',
    features: ['Everything in Operator', 'Phone quoting from your price book', 'Tiered options, like Good, Better, Best', 'Quote copies by email when callers ask'],
    excluded: '' }
];

function planCards() {
  return `<div class="grid three">${PLANS.map(p => `<div class="card plan${p.flagship ? ' flagship' : ''}">
<span class="name">${p.name.toUpperCase()}${p.flagship ? ' ★ FLAGSHIP' : ''}</span>
<p class="price">$${p.monthly}<span> USD/mo</span></p>
<p class="mins">${p.minutes} MIN / MONTH · OR $${p.annual.toLocaleString('en-US')}/YEAR</p>
<p>${esc(p.blurb)}</p>
<ul class="ticks">${p.features.map(f => `<li>${esc(f)}</li>`).join('')}</ul>
${p.excluded ? `<p class="small muted">${esc(p.excluded)}</p>` : ''}
<a class="btn${p.flagship ? '' : ' ghost'}" href="${SIGNUP}">Start free trial</a>
</div>`).join('')}</div>`;
}

const softwareSchema = {
  '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: 'Off The Clock AI',
  applicationCategory: 'BusinessApplication', operatingSystem: 'Web',
  description: 'An AI employee for service businesses that answers calls, quotes jobs from the owner’s price book and books visits.',
  url: ORIGIN + '/',
  offers: PLANS.map(p => ({ '@type': 'Offer', name: p.name, price: String(p.monthly), priceCurrency: 'USD', url: ORIGIN + '/pricing/' }))
};

// ---------- comparisons ----------
function sourceNote(c) {
  return `<p class="source">${esc(c.name)} details are from ${c.sources.map(([label, url]) => `<a href="${url}" rel="nofollow noopener" target="_blank">${esc(label)}</a>`).join(' and ')}, checked ${CHECKED}. Prices and plans change; check their site for current terms.</p>`;
}

function comparePage(c) {
  const rows = c.rows.map(([q, usKey, them, usText]) => `<div class="vs-row"><h3>${esc(q)}</h3>
<div class="side us"><span class="who">Off The Clock</span><p>${esc(usText ?? US[usKey])}</p></div>
<div class="side"><span class="who">${esc(c.short)}</span><p>${esc(them)}</p></div></div>`).join('');
  const others = COMPETITORS.filter(o => o.slug !== c.slug && o.type === c.type).slice(0, 3);
  const body = hero({ eyebrow: 'Compare · ' + c.type, title: `Off The Clock vs ${c.name}`, lead: esc(c.intro), trail: [['/compare/', 'Compare'], ['/compare/' + c.slug + '/', c.name]] })
    + `<section class="block"><div class="wrap narrow"><h2>Side by side</h2><div class="vs">${rows}</div>${sourceNote(c)}</div></section>`
    + `<section class="block alt"><div class="wrap narrow"><h2>Choose Off The Clock if</h2><ul class="ticks">${c.pick.map(p => `<li>${esc(p)}</li>`).join('')}</ul>
${c.alongside ? `<div class="note"><p>${esc(c.alongside)}</p></div>` : ''}
<p class="small">Switching? See the <a href="/docs/switching/">switching guides</a>.</p></div></section>`
    + `<section class="block"><div class="wrap narrow"><h2>What every Off The Clock plan includes</h2><ul class="ticks">
<li>${esc(US.number)}</li><li>${esc(US.visibility)}</li><li>${esc(US.trial)}</li></ul>
<p><a href="/pricing/">See full pricing</a></p></div></section>`
    + (others.length ? `<section class="block alt"><div class="wrap"><h2>More comparisons</h2><div class="grid three">${others.map(o => `<a class="card" href="/compare/${o.slug}/"><span class="tag">${esc(o.type)}</span><h3>vs ${esc(o.name)}</h3><p>${esc(o.blurb)}</p></a>`).join('')}</div></div></section>` : '')
    + cta();
  emit('/compare/' + c.slug + '/', page({
    path: '/compare/' + c.slug + '/',
    title: `Off The Clock vs ${c.name}: AI phone answering compared`,
    description: `Off The Clock vs ${c.name}: phone quoting from your price book, booking, pricing and trial, compared side by side with sources.`,
    trail: [['/compare/', 'Compare'], ['/compare/' + c.slug + '/', c.name]], body
  }));
}

function compareHub() {
  const groups = TYPES.map(type => {
    const list = COMPETITORS.filter(c => c.type === type);
    if (!list.length) return '';
    return `<h2 style="margin-top:36px">${esc(type)}s</h2><div class="grid three">${list.map(c => `<a class="card" href="/compare/${c.slug}/"><h3>vs ${esc(c.name)}</h3><p>${esc(c.blurb)}</p></a>`).join('')}</div>`;
  }).join('');
  const body = hero({ eyebrow: 'Compare', title: 'How Off The Clock compares', lead: 'Side-by-side comparisons with AI receptionists, live answering services and the answering features inside field service software. Every competitor detail links to its source.', trail: [['/compare/', 'Compare']] })
    + `<section class="block"><div class="wrap"><div class="card" style="border-color:#00E676"><span class="tag">The difference</span><h3>A price on the job, during the call</h3><p>${esc(US.price)}</p><p>${esc(US.widget)}</p></div>${groups}
<p class="small muted" style="margin-top:28px">Looking at the bigger picture? Read <a href="/alternatives/">alternatives to answering services and voicemail</a>.</p></div></section>` + cta();
  emit('/compare/', page({ path: '/compare/', title: 'Compare Off The Clock with AI receptionists and answering services', description: 'Off The Clock compared with Jobber, Housecall Pro, ServiceTitan, Smith.ai, Ruby, Goodcall, Rosie and more: phone quoting, booking, pricing and trials.', trail: [['/compare/', 'Compare']], body }));
}

// ---------- FAQ ----------
function faqPage() {
  const groups = FAQ.map(([group, items]) => `<h2>${esc(group)}</h2>${items.map(([q, a]) => `<details><summary>${esc(q)}</summary><div class="answer">${a}</div></details>`).join('')}`).join('');
  const schema = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: FAQ.flatMap(([, items]) => items.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() } }))) };
  const body = hero({ eyebrow: 'FAQ', title: 'Questions contractors ask', lead: 'Straight answers about calls, quoting, your number, your records and billing. Can’t find yours? Email <a href="mailto:' + SUPPORT + '">' + SUPPORT + '</a>.', trail: [['/faq/', 'FAQ']] })
    + `<section class="block"><div class="wrap narrow faq">${groups}</div></section>` + cta();
  emit('/faq/', page({ path: '/faq/', title: 'FAQ: Off The Clock AI employee for contractors', description: 'How Off The Clock answers calls, quotes jobs from your price book, keeps your number, handles minutes and billing, and protects your records.', trail: [['/faq/', 'FAQ']], schema: [schema], body }));
}

// ---------- pricing ----------
function pricingPage() {
  const facts = [
    ['Minutes', 'Talk time on your line. Starter 150, Operator 300, QuoteDone 1,200 each billing month. Unused minutes don’t carry over.'],
    ['Usage warnings', 'The meter is always in your dashboard. Email at 60, 30 and 0 minutes left.'],
    ['Overage', '$0.35 per minute past your plan.'],
    ['Not counted', 'Calls that drop because the receptionist failed, and calls from numbers you’ve marked as spam.'],
    ['Annual billing', '10× the monthly price, so two months are free. Charged up front; minutes reset every month.'],
    ['Free trial', '14 days on your plan’s full features, up to 60 minutes of answered calls. Card required. For businesses that haven’t paid for Off The Clock before.'],
    ['Setup', 'Self-serve. No setup fee.'],
    ['Your number', 'Keep it. Forward calls with your carrier’s code; turn answering on or off from your phone.'],
    ['Cancelling', 'Anytime from billing settings. Service runs to the end of the paid period.'],
    ['Your records', 'Download leads, quote requests and bookings as CSV anytime, and for 90 days after service ends.'],
    ['Currency and taxes', 'Prices are in US dollars and don’t include taxes. Where tax applies, it’s added.']
  ];
  const fit = [
    ['Starter', 'You want every call answered and every lead captured, with answers from your business info and the prices you list.'],
    ['Operator', 'You want visits booked onto your calendar, callers transferred to you when you’re available, and a website that quotes and books.'],
    ['QuoteDone', 'You quote measured jobs (roofing, painting, flooring, fencing, concrete, landscaping or siding) and want callers to hear a real range on the first call.']
  ];
  const body = hero({ eyebrow: 'Pricing', title: 'Simple plans. No setup fee. Cancel anytime.', lead: 'Every plan includes a 14-day free trial. Prices in US dollars.', trail: [['/pricing/', 'Pricing']], actions: false })
    + `<section class="block"><div class="wrap">${planCards()}</div></section>`
    + `<section class="block alt"><div class="wrap narrow"><h2>Which plan fits</h2><div class="grid">${fit.map(([n, t]) => `<div class="card"><h3>${n}</h3><p>${esc(t)}</p></div>`).join('')}</div></div></section>`
    + `<section class="block"><div class="wrap narrow"><h2>The details</h2><dl class="facts">${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
<p style="margin-top:22px">More in the <a href="/docs/minutes-and-billing/">minutes and billing guide</a> and the <a href="/faq/">FAQ</a>. Wondering what missed calls cost you? Try the <a href="/missed-call-calculator/">missed call calculator</a>.</p></div></section>` + cta('Try it on your own line', '14 days free on your plan’s full features.');
  emit('/pricing/', page({ path: '/pricing/', title: 'Pricing: Off The Clock AI employee from $69/month', description: 'Starter $69 for 150 minutes, Operator $119 for 300, QuoteDone $279 for 1,200. $0.35 per extra minute. 14-day free trial, no setup fee.', trail: [['/pricing/', 'Pricing']], schema: [softwareSchema], body }));
}

// ---------- who it's for (owner's own text) ----------
function whoPage() {
  const fit = [
    ['The owner still handles most price questions', 'Customers call because they want to know two things: what the job will cost and when it can be done. Off The Clock puts the repeatable part of that knowledge into your AI employee.'],
    ['The business has both fixed and variable services', 'A lawn-mowing visit, diagnostic fee or maintenance service may have a straightforward price. A fence, driveway, roof, floor or painting project needs more information. Off The Clock handles both workflows without forcing every service into the same script.'],
    ['The company wants to keep its current tools', 'Off The Clock connects to Google Calendar and sends data through webhooks and CSV. The business does not have to abandon Jobber, Housecall Pro, QuickBooks or another system of record.'],
    ['Website visitors should receive a price too', 'The QuoteDone website widget, on Operator and QuoteDone, gives visitors a price using the same approved pricing as the phone.']
  ];
  const trades = INDUSTRIES.filter(i => i.kind === 'measured');
  const body = hero({ eyebrow: 'Who it’s for', title: 'For service businesses where answering the call is only half the job', lead: 'Off The Clock is built for owners who are still the receptionist, pricing department and scheduler.', trail: [['/who-its-for/', 'Who it’s for']] })
    + `<section class="block"><div class="wrap narrow"><h2>Best fit</h2><div class="grid">${fit.map(([t, d]) => `<div class="card"><h3>${esc(t)}</h3><p>${esc(d)}</p></div>`).join('')}</div></div></section>`
    + `<section class="block alt"><div class="wrap narrow"><h2>Strongest industries</h2><div class="grid three">${trades.map(i => `<a class="card" href="/industries/${i.slug}/"><h3>${esc(i.name)}</h3></a>`).join('')}</div>
<p style="margin-top:22px">Starter and Operator work for any service business that needs calls answered and leads captured; Operator adds booking and transfers. QuoteDone is activated service by service where the pricing can be defined safely.</p></div></section>`
    + `<section class="block"><div class="wrap narrow"><h2>The deciding test</h2><p>List the ten calls that consume the most owner time.</p><p>If most can be answered, priced, booked or correctly flagged from defined business rules, Off The Clock is a strong fit.</p>
<p><a href="/missed-call-calculator/">Run the missed call calculator</a> · <a href="/pricing/">See pricing</a></p></div></section>` + cta();
  emit('/who-its-for/', page({ path: '/who-its-for/', title: 'Who Off The Clock AI is best for', description: 'See which service businesses benefit most from an AI employee that answers, prices and books customers.', trail: [['/who-its-for/', 'Who it’s for']], body }));
}

// ---------- missed call calculator (same ranges, defaults and math as the homepage) ----------
function calculatorPage() {
  const slider = (id, label, min, max, step, value) => `<div class="calc-row"><label for="${id}">${label}</label><output id="${id}-out"></output>
<input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}"></div>`;
  const faq = [
    ['What counts as a missed call?', 'Any call that rang out, went to voicemail, or got picked up too late to be useful. If nobody spoke to the person, count it.'],
    ['Why 4.33 weeks in a month?', '52 weeks divided by 12 months is 4.33. Using 4 weeks would undercount you by about 8%.'],
    ['Does the page use any industry statistics?', 'No. The only numbers here are the three you set and our own published pricing.'],
    ['What does Off The Clock AI cost?', 'Starter is $69 a month for 150 minutes, Operator $119 for 300, and QuoteDone $279 for 1,200. Extra minutes are $0.35. No setup fee, no contract.']
  ];
  const schema = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) };
  const body = hero({ eyebrow: 'Missed call calculator', title: 'What are missed calls costing you?', lead: 'Three numbers you already know: how many calls you miss in a week, what an average job is worth, and how often you win the ones you do answer. Set them to your own figures and read the result.', trail: [['/missed-call-calculator/', 'Missed call calculator']], actions: false })
    + `<section class="block"><div class="wrap"><div class="calc">
<div class="calc-inputs card">${slider('missed', 'Missed calls per week', 1, 60, 1, 12)}${slider('job', 'Average job value', 100, 20000, 100, 1800)}${slider('close', 'Close rate on answered calls', 5, 90, 5, 30)}</div>
<div class="calc-results card"><dl>
<div><dt>Jobs lost / month</dt><dd id="r-jobs"></dd></div>
<div><dt>Revenue lost / month</dt><dd id="r-mo" class="big"></dd></div>
<div><dt>Revenue lost / year</dt><dd id="r-yr"></dd></div>
<div><dt>Vs QuoteDone plan ($279/mo)</dt><dd id="r-x"></dd></div></dl></div></div></div></section>
<script>
(function(){
  var $=function(id){return document.getElementById(id)};
  var num=function(n){return Math.round(n).toLocaleString('en-US')};
  function run(){
    var m=+$('missed').value, j=+$('job').value, c=+$('close').value;
    $('missed-out').textContent=m; $('job-out').textContent='$'+num(j); $('close-out').textContent=c+'%';
    var jobsMo=m*4.33*(c/100), lostMo=jobsMo*j;
    $('r-jobs').textContent='≈ '+jobsMo.toFixed(1); $('r-mo').textContent='$'+num(lostMo);
    $('r-yr').textContent='$'+num(lostMo*12); $('r-x').textContent=num(lostMo/279)+'× plan cost';
  }
  ['missed','job','close'].forEach(function(id){$(id).addEventListener('input',run)}); run();
})();
</script>`
    + `<section class="block alt"><div class="wrap narrow doc"><h2>How this works</h2><p>Four steps of arithmetic. Check it against your own figures.</p>
<ol class="steps"><li><strong>Weeks to months.</strong> Your missed calls per week times 4.33. A year is 52 weeks, and 52 divided by 12 is 4.33.</li>
<li><strong>Calls to jobs.</strong> Multiply by your close rate. Not every missed call would have become a job, so only the share you close when you do answer is counted.</li>
<li><strong>Jobs to dollars.</strong> Multiply the lost jobs by your average job value. Yearly is that figure times 12.</li>
<li><strong>Against the plan price.</strong> The last line divides your monthly figure by $279, the QuoteDone plan price. That is the only place our pricing enters the math.</li></ol>
<p>The jobs figure is rounded for display, which is why it carries a ≈ sign; the dollar figures use the unrounded number. Revenue is not profit, some callers ring twice, and a few were never going to buy, so read the result as a top-line figure, not a bank statement.</p>
<p>The starting values are only a place to begin. Move all three to your own figures and the result is your arithmetic, not ours.</p></div></section>`
    + `<section class="block"><div class="wrap narrow"><h2>What to do with the number</h2><p>Compare the monthly figure with the plan prices: Starter $69, Operator $119, QuoteDone $279. Then check what each plan includes and whether it fits your trade.</p>
<p><a class="btn" href="/pricing/">See pricing</a> <a class="btn ghost" href="/who-its-for/">Check the fit</a></p></div></section>`
    + `<section class="block alt"><div class="wrap narrow faq"><h2>Questions</h2>${faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><div class="answer"><p>${esc(a)}</p></div></details>`).join('')}</div></section>` + cta();
  emit('/missed-call-calculator/', page({ path: '/missed-call-calculator/', title: 'Missed Call Calculator for Contractors | Off The Clock AI', description: 'Work out what unanswered calls are costing your business, using your own numbers. No invented statistics.', trail: [['/missed-call-calculator/', 'Missed call calculator']], schema: [schema], body }));
}

// ---------- alternatives ----------
function alternativesPage() {
  const options = [
    ['Voicemail', 'Takes a message, if the caller leaves one. Nobody answers their questions or books the visit until you call back.', 'Answers the call, answers questions, and on Operator and QuoteDone books the visit.', '/docs/switching/from-voicemail/'],
    ['Live answering service', 'People answer from a script and pass along messages or book appointments. Billed by the minute: Ruby starts at $250 for 50 minutes, AnswerConnect at $350 for 200, PATLive at $99 for 50.', '150 minutes for $69, 300 with booking and transfer for $119, and 1,200 with phone quoting for $279.', '/docs/switching/from-an-answering-service/'],
    ['A general AI receptionist', 'Answers, takes messages and often books. Of the AI receptionists we compared, most don’t say they price the job.', 'Built for contractors: prices measured jobs from your price book on the call and on your website.', '/docs/switching/from-another-ai-receptionist/'],
    ['The answering add-on in your job software', 'Tied to that platform: Jobber Receptionist needs Jobber; CSR AI needs Housecall Pro; the Virtual Agent is built into ServiceTitan.', 'Works next to any software. Send leads, quote requests and bookings out by webhook or CSV.', '/docs/switching/from-job-software-answering/']
  ];
  const body = hero({ eyebrow: 'Alternatives', title: 'Alternatives to voicemail, answering services and AI receptionists', lead: 'Every way contractors handle the calls they can’t take, and what Off The Clock does differently.', trail: [['/alternatives/', 'Alternatives']] })
    + `<section class="block"><div class="wrap narrow"><div class="vs">${options.map(([t, them, us, href]) => `<div class="vs-row"><h3>${esc(t)}</h3>
<div class="side"><span class="who">Today</span><p>${esc(them)}</p></div><div class="side us"><span class="who">Off The Clock</span><p>${esc(us)} <a href="${href}">Switching guide</a></p></div></div>`).join('')}</div>
<p class="source">Answering service prices from <a href="https://www.ruby.com/plans-and-pricing/" rel="nofollow noopener" target="_blank">Ruby</a>, <a href="https://www.answerconnect.com/plans-direct" rel="nofollow noopener" target="_blank">AnswerConnect</a> and <a href="https://www.patlive.com/pricing/" rel="nofollow noopener" target="_blank">PATLive</a>, checked ${CHECKED}.</p></div></section>`
    + `<section class="block alt"><div class="wrap"><h2>Compare by name</h2><div class="grid three">${COMPETITORS.map(c => `<a class="card" href="/compare/${c.slug}/"><span class="tag">${esc(c.type)}</span><h3>${esc(c.name)} alternative</h3><p>${esc(c.blurb)}</p></a>`).join('')}</div></div></section>` + cta();
  emit('/alternatives/', page({ path: '/alternatives/', title: 'Answering service and AI receptionist alternatives for contractors', description: 'Alternatives to voicemail, live answering services, AI receptionists and job-software answering add-ons, compared for contractors.', trail: [['/alternatives/', 'Alternatives']], body }));
}

// ---------- industries ----------
function industryPage(ind) {
  const trail = [['/industries/', 'Industries'], ['/industries/' + ind.slug + '/', ind.name]];
  const measured = ind.kind === 'measured';
  const faq = [...ind.faq, ...SHARED_FAQ[ind.kind]];
  const schema = faq.length ? [{ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) }] : [];
  let body = hero({ eyebrow: 'Industries · ' + ind.name, title: ind.title, lead: esc(ind.lead), trail })
    + `<section class="block"><div class="wrap narrow"><p class="eyebrow">${esc(ind.hook[0])}</p><p class="lead">${esc(ind.hook[1])}</p></div></section>`;
  if (measured) {
    body += `<section class="block alt"><div class="wrap narrow"><h2>What your AI employee asks</h2><p>The details your own pricing depends on, asked one at a time in plain words a homeowner can answer.</p>
<div class="grid">${ind.asks.map(([n, d]) => `<div class="card"><h3>${esc(n)}</h3><p>${esc(d)}</p></div>`).join('')}</div></div></section>
<section class="block"><div class="wrap narrow"><h2>What a quote needs</h2><div class="vs">
<div class="vs-row"><h3>Your confirmed prices and the caller’s details</h3><p>With both, the caller gets a range from your price book, confirmed on site, and on Operator and QuoteDone the visit gets booked.</p></div>
<div class="vs-row"><h3>Either one missing</h3><p>If a price isn’t entered and confirmed yet, or the caller can’t give a detail the calculation needs, your AI employee captures the job in full instead: their details, everything they told it, and the transcript, in your dashboard. Nothing gets filled with a guess.</p></div></div>
<p style="margin-top:18px">Phone quoting is on QuoteDone. The <a href="/docs/website-widget/">QuoteDone website widget</a> runs the same price book on Operator and QuoteDone, so a visitor at midnight gets the same range a caller gets.</p></div></section>`;
  } else {
    body += `<section class="block alt"><div class="wrap narrow"><h2>${ind.kind === 'any' ? 'What it handles' : 'What gets priced and booked'}</h2>
${ind.kind === 'listed' ? '<p>Anything you charge a set price for. Put the service and its price in your knowledge base and your AI employee gives that price on the call, on every plan. On Operator and QuoteDone it books the job too.</p>' : ''}
<ul class="ticks">${ind.listed.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
${ind.kind === 'listed' ? '<p class="small muted">Your list is your own. These are services that are often set-price in this trade.</p>' : ''}
<div class="note"><p>If a service isn’t listed yet, or the caller can’t say what the job involves, your AI employee captures everything instead: their details, what they said, and the transcript, in your dashboard. Nothing gets filled with a guess.</p></div></div></section>`;
    if (ind.seasons) body += `<section class="block"><div class="wrap"><h2>When the phone rings hardest</h2><div class="grid three">${ind.seasons.map(([t, d]) => `<div class="card"><h3>${esc(t)}</h3><p>${esc(d)}</p></div>`).join('')}</div></div></section>`;
    if (ind.objection) body += `<section class="block alt"><div class="wrap narrow"><h2>${esc(ind.objection[0])}</h2><p>${esc(ind.objection[1])}</p></div></section>`;
  }
  if (faq.length) body += `<section class="block"><div class="wrap narrow faq"><h2>Questions</h2>${faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><div class="answer"><p>${esc(a)}</p></div></details>`).join('')}</div></section>`;
  body += cta();
  emit('/industries/' + ind.slug + '/', page({ path: '/industries/' + ind.slug + '/', title: `${ind.name === 'Any service business' ? 'AI employee for any service business' : 'AI employee for ' + ind.name.toLowerCase().replace('hvac', 'HVAC') + ' companies'} | Off The Clock AI`, description: ind.lead, trail, schema, body }));
}

function industryPages() {
  INDUSTRIES.forEach(industryPage);
  const group = (kind, title, intro) => `<h2 style="margin-top:36px">${title}</h2><p>${intro}</p><div class="grid three">${INDUSTRIES.filter(i => i.kind === kind || (kind === 'listed' && i.kind === 'any')).map(i => `<a class="card" href="/industries/${i.slug}/"><h3>${esc(i.name)}</h3><p>${esc(i.lead)}</p></a>`).join('')}</div>`;
  const body = hero({ eyebrow: 'Industries', title: 'Built for the trades. Ready for any line that rings.', lead: 'Measured-job quoting for seven trades, set-price answering for every service business.', trail: [['/industries/', 'Industries']] })
    + `<section class="block"><div class="wrap">${group('measured', 'Trades priced by size', 'Your AI employee asks the measurements your price book needs and gives a range on the call (QuoteDone).')}
${group('listed', 'Trades with set prices', 'Your AI employee gives the prices you list, on every plan, and books the job on Operator and QuoteDone.')}</div></section>` + cta();
  emit('/industries/', page({ path: '/industries/', title: 'Industries: AI employee for roofing, HVAC, plumbing, fencing and more', description: 'Quoting for roofing, painting, flooring, fencing, concrete, landscaping and siding; set-price answering for HVAC, plumbing and any service business.', trail: [['/industries/', 'Industries']], body }));
}

// ---------- docs ----------
function docPage(base, d, crumbsTrail) {
  const path = base + d.slug + '/';
  const trail = [...crumbsTrail, [path, d.title]];
  const body = hero({ eyebrow: crumbsTrail.at(-1)[1], title: d.title, lead: esc(d.summary), trail, actions: false })
    + `<section class="block"><div class="wrap narrow doc">${d.body}</div></section>` + cta('Questions?', 'Email ' + SUPPORT + ', or start your free trial and see it for yourself.');
  emit(path, page({ path, title: d.title + ' | Off The Clock AI docs', description: d.summary, trail, body }));
}

function docsPages() {
  const docsTrail = [['/docs/', 'Docs']];
  for (const d of DOCS) docPage('/docs/', d, docsTrail);
  const switchTrail = [['/docs/', 'Docs'], ['/docs/switching/', 'Switching guides']];
  for (const s of SWITCHING) docPage('/docs/switching/', s, switchTrail);

  const agentBody = hero({ eyebrow: 'Docs', title: 'How your AI employee behaves', lead: 'The rules it follows on every call. You control what it knows; these control how it uses it.', trail: [...docsTrail, ['/docs/your-ai-employee/', 'How your AI employee behaves']], actions: false })
    + `<section class="block"><div class="wrap narrow"><div class="grid">${AGENT_RULES.map(([t, d]) => `<div class="card"><h3>${esc(t)}</h3><p>${esc(d)}</p></div>`).join('')}</div></div></section>` + cta();
  emit('/docs/your-ai-employee/', page({ path: '/docs/your-ai-employee/', title: 'How your AI employee behaves on calls | Off The Clock AI docs', description: 'The rules Off The Clock’s AI employee follows on every call: facts only, no guessing on prices, honest about being AI.', trail: [...docsTrail, ['/docs/your-ai-employee/', 'How your AI employee behaves']], body: agentBody }));

  const switchBody = hero({ eyebrow: 'Docs', title: 'Switching guides', lead: 'Move to Off The Clock from whatever answers your phone today.', trail: switchTrail, actions: false })
    + `<section class="block"><div class="wrap"><div class="grid two">${SWITCHING.map(s => `<a class="card" href="/docs/switching/${s.slug}/"><h3>${esc(s.title)}</h3><p>${esc(s.summary)}</p></a>`).join('')}</div></div></section>` + cta();
  emit('/docs/switching/', page({ path: '/docs/switching/', title: 'Switching guides | Off The Clock AI docs', description: 'Switch to Off The Clock from voicemail, an answering service, another AI receptionist or your job software’s answering feature.', trail: switchTrail, body: switchBody }));

  const hubBody = hero({ eyebrow: 'Docs', title: 'Off The Clock docs', lead: 'Set up, connect your number, build your price book and get the most from your AI employee.', trail: docsTrail, actions: false })
    + `<section class="block"><div class="wrap"><div class="grid three">${DOCS.map(d => `<a class="card" href="/docs/${d.slug}/"><h3>${esc(d.title)}</h3><p>${esc(d.summary)}</p></a>`).join('')}
<a class="card" href="/docs/your-ai-employee/"><h3>How your AI employee behaves</h3><p>The rules it follows on every call.</p></a>
<a class="card" href="/docs/switching/"><h3>Switching guides</h3><p>From voicemail, answering services and other AI receptionists.</p></a></div></div></section>` + cta('Questions?', 'Email ' + SUPPORT + '.');
  emit('/docs/', page({ path: '/docs/', title: 'Docs | Off The Clock AI', description: 'Guides for setting up Off The Clock: getting started, connecting your number, your price book, the website widget, booking, billing and exports.', trail: docsTrail, body: hubBody }));
}

// ---------- crawl files ----------
function crawlFiles() {
  const paths = ['/', ...written, '/privacy/', '/terms/'];
  writeFileSync(join(WWW, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...new Set(paths)].map(p => `  <url><loc>${ORIGIN}${p}</loc></url>`).join('\n')}\n</urlset>\n`);
  writeFileSync(join(WWW, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${ORIGIN}/sitemap.xml\n`);
  const plans = PLANS.map(p => `- ${p.name}: $${p.monthly}/month or $${p.annual}/year, ${p.minutes} minutes/month. ${p.blurb}`).join('\n');
  writeFileSync(join(WWW, 'llms.txt'), `# Off The Clock AI

> An AI employee for contractors and service businesses. It answers every call forwarded to it, answers from the owner's business information and listed prices, books visits onto Google Calendar, and on the QuoteDone plan quotes measured jobs (roofing, painting, flooring, fencing, concrete, landscaping, siding) from the owner's own price book during the call. The QuoteDone website widget quotes and books on the owner's website. Owners keep their existing phone number and turn answering on or off with their carrier's call forwarding. Serves Canada and the United States.

## Plans (USD)
${plans}
- Overage: $0.35 per minute. 14-day free trial, up to 60 minutes of answered calls, card required. No setup fee. Cancel anytime.

## Pages
- [Pricing](${ORIGIN}/pricing/)
- [FAQ](${ORIGIN}/faq/)
- [Who it's for](${ORIGIN}/who-its-for/)
- [Industries](${ORIGIN}/industries/)
- [Missed call calculator](${ORIGIN}/missed-call-calculator/)
- [Comparisons](${ORIGIN}/compare/)
- [Alternatives](${ORIGIN}/alternatives/)
- [Docs](${ORIGIN}/docs/)
- [How the AI employee behaves](${ORIGIN}/docs/your-ai-employee/)
- [Privacy](${ORIGIN}/privacy/)
- [Terms](${ORIGIN}/terms/)

## Contact
${SUPPORT}
`);
}

COMPETITORS.forEach(comparePage);
compareHub();
faqPage();
pricingPage();
whoPage();
alternativesPage();
industryPages();
calculatorPage();
docsPages();
crawlFiles();
console.log(`Built ${written.length} pages into site/www`);
