// Builds the static public pages into site/www. Run: node site/build/build.mjs
// The homepage (site/www/index.html), privacy and terms are maintained by hand
// and are not touched here.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { page, hero, cta, esc, ORIGIN, SIGNUP, SUPPORT } from './layout.mjs';
import { COMPETITORS, TYPES, US, CHECKED } from './competitors.mjs';
import { FAQ } from './faq.mjs';
import { INDUSTRIES, DOCS, AGENT_RULES, SWITCHING } from './content.mjs';

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
<p style="margin-top:22px">More in the <a href="/docs/minutes-and-billing/">minutes and billing guide</a> and the <a href="/faq/">FAQ</a>.</p></div></section>` + cta('Try it on your own line', '14 days free on your plan’s full features.');
  emit('/pricing/', page({ path: '/pricing/', title: 'Pricing: Off The Clock AI employee from $69/month', description: 'Starter $69 for 150 minutes, Operator $119 for 300, QuoteDone $279 for 1,200. $0.35 per extra minute. 14-day free trial, no setup fee.', trail: [['/pricing/', 'Pricing']], schema: [softwareSchema], body }));
}

// ---------- who it's for ----------
function whoPage() {
  const items = [
    ['Contractors who quote by the foot or the square', 'Roofers, painters, flooring installers, fence builders, concrete, landscaping and siding contractors. On QuoteDone, callers hear a range from your own price book before they hang up.', '/industries/'],
    ['Owners who are on the job all day', 'You can’t answer from a roof or a trench. Forward missed calls only, and your AI employee picks up when you can’t.', '/docs/connect-your-number/'],
    ['Businesses losing website visitors at night', 'The QuoteDone widget (Operator and QuoteDone) gives visitors a quote range and lets them book, while you sleep.', '/docs/website-widget/'],
    ['Shops with set prices', 'Any business with listed prices: your AI employee gives them as written and can multiply one by the quantity the caller asks for.', '/industries/any-service-business/'],
    ['Teams with an office person', 'Operator and QuoteDone include an office-staff login next to the owner’s.', '/pricing/'],
    ['Any business whose phone rings', 'Starter answers every call, answers from your business info, and captures every lead for $69 a month.', '/pricing/']
  ];
  const body = hero({ eyebrow: 'Who it’s for', title: 'Built for the trades. Ready for any line that rings.', lead: 'Off The Clock fits best where a missed call is a missed job, and a price on the first call wins it.', trail: [['/who-its-for/', 'Who it’s for']] })
    + `<section class="block"><div class="wrap"><div class="grid two">${items.map(([t, d, href]) => `<a class="card" href="${href}"><h3>${esc(t)}</h3><p>${esc(d)}</p></a>`).join('')}</div></div></section>` + cta();
  emit('/who-its-for/', page({ path: '/who-its-for/', title: 'Who Off The Clock is for: contractors and service businesses', description: 'Built for contractors who quote by the foot or square, owners on the job all day, and any service business that can’t afford a missed call.', trail: [['/who-its-for/', 'Who it’s for']], body }));
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
function industryPages() {
  for (const ind of INDUSTRIES) {
    const trail = [['/industries/', 'Industries'], ['/industries/' + ind.slug + '/', ind.name]];
    const quoting = ind.slug === 'any-service-business';
    const body = hero({ eyebrow: 'Industries · ' + ind.name, title: ind.title, lead: esc(ind.lead), trail })
      + `<section class="block"><div class="wrap narrow"><h2>${quoting ? 'What it handles' : 'What it prices from your price book'}</h2>
${quoting ? '' : '<p>On QuoteDone, your AI employee works with these details for each job, using your own prices. Callers who can’t give one get their details captured as a lead instead of a guess.</p>'}
<div class="grid">${ind.services.map(([n, d]) => `<div class="card"><h3>${esc(n)}</h3><p>${esc(d)}</p></div>`).join('')}</div></div></section>`
      + `<section class="block alt"><div class="wrap narrow"><h2>Why ${esc(ind.name.toLowerCase())} ${quoting ? 'owners' : 'contractors'} use it</h2><ul class="ticks">${ind.why.map(w => `<li>${esc(w)}</li>`).join('')}</ul>
<p class="small" style="margin-top:18px">${quoting ? 'Plans from $69 a month. ' : 'Phone quoting is on QuoteDone ($279/month, 1,200 minutes). The website widget quotes on Operator and QuoteDone. '}<a href="/pricing/">See pricing</a>.</p></div></section>` + cta();
    emit('/industries/' + ind.slug + '/', page({ path: '/industries/' + ind.slug + '/', title: ind.title + ' | Off The Clock AI', description: ind.lead, trail, body }));
  }
  const body = hero({ eyebrow: 'Industries', title: 'Built for the trades. Ready for any line that rings.', lead: 'Phone and website quoting for seven trades, and answering for every service business.', trail: [['/industries/', 'Industries']] })
    + `<section class="block"><div class="wrap"><div class="grid three">${INDUSTRIES.map(i => `<a class="card" href="/industries/${i.slug}/"><h3>${esc(i.name)}</h3><p>${esc(i.lead)}</p></a>`).join('')}</div></div></section>` + cta();
  emit('/industries/', page({ path: '/industries/', title: 'Industries: AI employee for roofing, painting, flooring, fencing and more', description: 'Phone and website quoting for roofing, painting, flooring, fencing, concrete, landscaping and siding, and answering for any service business.', trail: [['/industries/', 'Industries']], body }));
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
docsPages();
crawlFiles();
console.log(`Built ${written.length} pages into site/www`);
