// Category pages. Competitor facts come only from the sourced entries in
// competitors.mjs (each linked on its comparison page). Off The Clock facts are
// the same verified facts used on the pricing, FAQ and docs pages.

export const GUIDES = [
  {
    slug: 'ai-receptionist-with-quoting',
    title: 'AI receptionist with quoting: a price on the call, not a callback',
    seo: 'AI Receptionist With Quoting for Contractors | Off The Clock AI',
    description: 'What it takes for an AI receptionist to give callers a real price: listed prices, measured jobs, and what happens when it can’t price.',
    lead: 'Most AI receptionists answer, take a message and book. Callers want one more thing: what the job will cost. Here’s how quoting works in Off The Clock.',
    sections: [
      ['Two kinds of quoting', `<p><strong>Listed prices.</strong> Services you sell at a set price: a service call fee, a tune-up, a lockout. Your AI employee gives the price as you wrote it, on every plan, and can multiply one listed price by the quantity the caller asks for.</p>
<p><strong>Measured jobs.</strong> Work priced by size: a roof, a fence, a floor, a driveway. On QuoteDone, your AI employee asks the details your price book needs, one at a time, runs them through your own prices and gives the caller a range, confirmed on site. It covers roofing, painting, flooring, fencing, concrete, landscaping and siding.</p>`],
      ['When it can’t price a job', `<p>It doesn’t guess. If a price isn’t entered and confirmed, or the caller can’t give a detail the calculation needs, the job comes to you as a lead with the caller’s details, everything they said, and the transcript.</p>`],
      ['Questions to ask any AI receptionist', `<ul class="dots"><li>Does it give callers a price, or only book an estimate?</li><li>Where does the price come from: your own numbers, or a range it makes up?</li><li>Can it price jobs by size, or only flat prices?</li><li>What happens when it doesn’t have the price?</li><li>Can your website give the same price?</li></ul>
<p>See how other services answer these on the <a href="/compare/">comparison pages</a>, each linked to the competitor’s own site.</p>`],
      ['Same prices on your website', `<p>The <a href="/website-quote-widget-for-contractors/">QuoteDone website widget</a>, on Operator and QuoteDone, asks the same questions and gives visitors a range from the same price book, then lets them pick a time.</p>`]
    ]
  },
  {
    slug: 'website-quote-widget-for-contractors',
    title: 'Website quote widget for contractors',
    seo: 'Website Quote Widget for Contractors | Off The Clock AI',
    description: 'Give website visitors a quote range from your own price book and let them book a time. Included on Off The Clock Operator and QuoteDone.',
    lead: 'Visitors who land on your site at night want a number before they call. The QuoteDone widget gives them one, from your own prices, and lets them book.',
    sections: [
      ['What visitors get', `<ul class="ticks"><li>The same questions your AI employee asks on the phone, for the service they pick</li><li>A quote range from your own price book</li><li>A time to book: with Google Calendar connected, open times from your calendar; otherwise the visitor gives a preferred time for you to confirm</li></ul>
<p>Each request lands in your dashboard as a lead, with the answers the visitor gave.</p>`],
      ['Which plans include it', `<p>Operator ($119 a month) and QuoteDone ($279 a month). Both include a 14-day free trial.</p>`],
      ['Installing it', `<ol class="steps"><li>Save your website’s exact address as an allowed website origin. The widget only runs on addresses you allow.</li><li>Copy the widget code and paste it into your site.</li><li>Publish, then use the installation check and try a full estimate.</li></ol>
<p>No access to your website builder? Share the customer quote link from the app instead. Full steps in the <a href="/docs/website-widget/">widget guide</a>.</p>`],
      ['Phone and website, one price book', `<p>On QuoteDone, callers and website visitors are quoted from the same prices, so nobody gets two different numbers. See <a href="/ai-receptionist-with-quoting/">how quoting works</a>.</p>`]
    ]
  },
  {
    slug: 'ai-receptionist-vs-answering-service',
    title: 'AI receptionist vs answering service',
    seo: 'AI Receptionist vs Answering Service for Contractors | Off The Clock AI',
    description: 'Live answering services and AI receptionists compared for contractors: who answers, what it costs per minute, and what each can do on the call.',
    lead: 'Both answer the calls you can’t. The differences are who picks up, what it costs, and what happens on the call.',
    sections: [
      ['Who answers', `<p><strong>Answering service:</strong> trained people working from your script. <strong>Off The Clock:</strong> your AI employee, answering every call you forward to it, day or night, using only what you’ve told it.</p>`],
      ['What it costs', `<p>Live answering services bill by the minute. From their own pricing pages: Ruby starts at $250 a month for 50 minutes, AnswerConnect at $350 for 200 minutes plus a setup fee, and PATLive at $99 for 50 minutes.</p>
<p>Off The Clock: Starter $69 for 150 minutes, Operator $119 for 300, QuoteDone $279 for 1,200. $0.35 per extra minute. No setup fee.</p>
<p class="source">Answering service prices from <a href="https://www.ruby.com/plans-and-pricing/" rel="nofollow noopener" target="_blank">Ruby</a>, <a href="https://www.answerconnect.com/plans-direct" rel="nofollow noopener" target="_blank">AnswerConnect</a> and <a href="https://www.patlive.com/pricing/" rel="nofollow noopener" target="_blank">PATLive</a>, checked November 6, 2026.</p>`],
      ['What happens on the call', `<p>Answering services take messages and many book appointments. Off The Clock gives your listed prices on every plan, books visits and transfers callers to you on Operator and QuoteDone, and on QuoteDone prices measured jobs from your price book.</p>`],
      ['What you see afterward', `<p>Every call is transcribed and summarized in your dashboard, with email alerts for new leads and callback requests.</p>`],
      ['Switching', `<p>Answering services usually work by forwarding, so switching means changing where your forwarding points. See the <a href="/docs/switching/from-an-answering-service/">switching guide</a> and the comparisons with <a href="/compare/ruby/">Ruby</a>, <a href="/compare/answerconnect/">AnswerConnect</a> and <a href="/compare/patlive/">PATLive</a>.</p>`]
    ]
  },
  {
    slug: 'ai-answering-service-for-contractors',
    title: 'AI answering service for contractors',
    seo: 'AI Answering Service for Contractors | Off The Clock AI',
    description: 'An AI employee that answers every call on the number you already have, gives your prices, books the visit and quotes measured jobs.',
    lead: 'You can’t answer from a roof, a trench or a crawl space. Your AI employee can, on the number you already have.',
    sections: [
      ['What it does on every call', `<ul class="ticks"><li>Answers with your business name, any hour</li><li>Answers questions from your knowledge base: hours, service area, policies</li><li>Gives the prices you list</li><li>Captures every lead, with a transcript and summary in your dashboard</li></ul>`],
      ['On Operator and QuoteDone', `<ul class="ticks"><li>Books visits onto your Google Calendar during the call</li><li>Transfers callers to you live during the hours you set</li><li>Website quote widget for visitors</li></ul>`],
      ['On QuoteDone', `<p>Quotes measured jobs from your price book on the call: roofing, painting, flooring, fencing, concrete, landscaping and siding. See <a href="/ai-receptionist-with-quoting/">how quoting works</a>.</p>`],
      ['Keep your number', `<p>Forward missed calls only, or every call, with your carrier’s code, and turn it off the same way. See <a href="/docs/connect-your-number/">connect your number</a>.</p>`],
      ['By trade', `<p>See how it works for <a href="/industries/">your trade</a>, or <a href="/pricing/">compare the plans</a>.</p>`]
    ]
  }
];
