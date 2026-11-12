// Competitor facts for /compare/ pages. Every competitor statement below comes
// from the source page listed with it, checked November 6, 2026. Re-check each
// source before changing a claim; prices and plans change often.
// Off The Clock statements come from the app's own code (plan access, billing,
// voice runtime) on branch claude/launch.

export const CHECKED = 'November 6, 2026';

// Off The Clock rows reused across pages.
export const US = {
  price: 'On the QuoteDone plan, your AI employee prices measured jobs during the call from your own price book (for example 120 feet of six-foot cedar privacy fence with one walk gate) and reads the caller a range. Jobs it can’t price from what the caller gives it become a lead for you instead of a guess.',
  widget: 'On Operator and QuoteDone, the QuoteDone website widget gives visitors a quote range from your price book and lets them book a time.',
  software: 'Nothing to switch. It answers the number you already have and works next to whatever job software you use. Leads, quote requests and bookings can be sent by webhook, and records download as CSV.',
  billing: 'Talk-time minutes: Starter $69/month for 150, Operator $119 for 300, QuoteDone $279 for 1,200. $0.35 per minute past your plan. Annual plans are 10× the monthly price.',
  trial: '14 days free on your plan’s full features, up to 60 minutes of answered calls. Cancel anytime; service runs to the end of the period you paid for.',
  visibility: 'Every call has a transcript and summary in your dashboard, plus email alerts. Quotes show the range and options the caller heard.',
  number: 'You keep your number. Turn answering on or off from your own phone with your carrier’s call forwarding, for missed calls only or every call.',
  booking: 'On Operator and QuoteDone, it checks your Google Calendar and books the visit during the call, then reads the date, time and address back to the caller.'
};

export const COMPETITORS = [
  {
    slug: 'jobber-receptionist', name: 'Jobber Receptionist', short: 'Jobber', type: 'Field service software add-on',
    blurb: 'Jobber’s AI receptionist, sold inside Jobber.',
    sources: [['Jobber help: Receptionist, powered by Jobber AI', 'https://help.getjobber.com/en/articles/receptionistpowered-by-jobber-ai/'], ['Jobber pricing', 'https://www.getjobber.com/pricing/']],
    intro: 'Jobber Receptionist answers calls and texts for businesses that run on Jobber. Off The Clock is built around one job Jobber’s help article doesn’t describe: putting a real price on the job while the caller is still on the phone.',
    rows: [
      ['Gives the caller a price for the job', 'price', 'Jobber’s help article says the Receptionist answers from your company settings, business profile and website FAQ, creates requests and offers a “Get started on an estimate” menu option. It doesn’t say the Receptionist gives prices or quotes.'],
      ['What you need to run it', 'software', 'A Jobber subscription and a Jobber dedicated phone number. You can forward your existing business number to it.'],
      ['How it’s billed', 'billing', 'Included on Jobber’s Plus plan. On select other plans it’s a $29/month add-on with 30 conversations, then $0.79 per additional conversation.'],
      ['Booking', 'booking', 'Books jobs using your Jobber Online Booking settings, and can cancel or reschedule.'],
      ['Website quotes', 'widget', 'Not covered in the Receptionist help article.']
    ],
    pick: ['You want callers to hear a real price, not just get a request created.', 'You want the same price book quoting on your website.', 'You want phone answering without moving your business onto new software.'],
    alongside: 'Already on Jobber? Keep it. Off The Clock answers and prices the call; send each new lead, quote request and booking to your own tools by webhook, or download them as CSV.'
  },
  {
    slug: 'housecall-pro-csr-ai', name: 'Housecall Pro CSR AI', short: 'Housecall Pro', type: 'Field service software add-on',
    blurb: 'Housecall Pro’s AI customer service rep.',
    sources: [['Housecall Pro: AI Team', 'https://www.housecallpro.com/features/ai-team/']],
    intro: 'CSR AI is Housecall Pro’s customer service rep for businesses on Housecall Pro. Off The Clock prices the job on the call from your own price book, publishes its prices, and works with whatever software you already use.',
    rows: [
      ['Gives the caller a price for the job', 'price', 'The page says CSR AI references your business information and customer data. It doesn’t say whether CSR AI gives callers prices or quotes.'],
      ['Published pricing', 'billing', 'The page says CSR AI is sold separately and 24/7 call answering is a paid feature. It doesn’t list a price.'],
      ['What you need to run it', 'software', 'Housecall Pro. The page describes CSR AI as a Housecall Pro feature enabled in your account settings.'],
      ['Website quotes', 'widget', 'Not described on the AI Team page.']
    ],
    pick: ['You want callers to hear a price for the job, worked out from your own numbers.', 'You want to see the price before you sign up.', 'You don’t want your phone answering tied to one job management platform.'],
    alongside: 'On Housecall Pro? Off The Clock answers alongside it. New leads, quote requests and bookings can go to your other tools by webhook, and everything exports as CSV.'
  },
  {
    slug: 'servicetitan-virtual-agent', name: 'ServiceTitan AI Virtual Agent', short: 'ServiceTitan', type: 'Field service software add-on',
    blurb: 'ServiceTitan’s built-in AI agent for calls.',
    sources: [['ServiceTitan: AI Virtual Agent', 'https://www.servicetitan.com/features/pro/virtual-agent']],
    intro: 'ServiceTitan’s Virtual Agent is built into ServiceTitan and books against ServiceTitan’s own data. Off The Clock is built for owners who want the caller priced on the call, with plans anyone can see and start today.',
    rows: [
      ['Gives the caller a price for the job', 'price', 'The page doesn’t say the Virtual Agent gives prices or quotes. It mentions customizing dispatch fee messaging.'],
      ['What you need to run it', 'software', 'The page says it is natively built into ServiceTitan and lists it as a Pro product that can be part of Contact Center Pro.'],
      ['Published pricing', 'billing', 'No prices are listed on the page.'],
      ['Website quotes', 'widget', 'Not described on the Virtual Agent page.']
    ],
    pick: ['You want price-book quoting on the phone and on your website.', 'You want public pricing and a 14-day trial you can start yourself.', 'You’re not on ServiceTitan, or don’t want your phones tied to it.'],
    alongside: null
  },
  {
    slug: 'workiz-genius-answering', name: 'Workiz Genius Answering', short: 'Workiz', type: 'Field service software add-on',
    blurb: 'Workiz’s AI answering for Workiz accounts.',
    sources: [['Workiz: Genius Answering', 'https://www.workiz.com/features/genius-answering/']],
    intro: 'Genius Answering books jobs inside Workiz. Off The Clock puts a price on the job during the call, from your price book, without asking you to change software.',
    rows: [
      ['Gives the caller a price for the job', 'price', 'The page says it answers questions about your services, pricing and policies from answers you configure. Its example: “if caller asks about pricing, say we offer free on-site estimates.”'],
      ['Live transfer', null, 'The page says live transfers to your team are available during business hours.', 'On Operator and QuoteDone, live transfer to you during the hours you set. Outside those hours it saves a callback request with the caller’s words.'],
      ['What you need to run it', 'software', 'Workiz. It books, reschedules and cancels jobs in your Workiz account.'],
      ['Published pricing', 'billing', 'The feature page doesn’t state what Genius Answering costs or which Workiz plans include it.']
    ],
    pick: ['You want callers to hear a price, not an offer of a free estimate.', 'You want to see exactly what it costs before you start.', 'You want answering that works with any software.'],
    alongside: null
  },
  {
    slug: 'quoteiq', name: 'QuoteIQ AI Virtual Call Team', short: 'QuoteIQ', type: 'Field service software add-on',
    blurb: 'The call agent included with QuoteIQ plans.',
    sources: [['QuoteIQ: AI Virtual Call Team', 'https://myquoteiq.com/features/virtual-call-team/'], ['QuoteIQ Essentials plan', 'https://myquoteiq.com/pricing/essentials/'], ['QuoteIQ Max plan', 'https://myquoteiq.com/quoteiq-max-plan/']],
    intro: 'QuoteIQ includes an AI call agent with its field service plans, and points exact quotes to its separate AI Estimator. Off The Clock does the quoting inside the call itself and books the visit before the caller hangs up.',
    rows: [
      ['Gives the caller a price for the job', 'price', 'The page says the agent answers price questions from pricing text you add to its Knowledge tab, and points to QuoteIQ’s AI Estimator and estimates for exact quotes.'],
      ['Books the visit', 'booking', 'The page describes booking as a step after the call: “Book the visit on the scheduling calendar.”'],
      ['What you need to run it', 'software', 'A QuoteIQ plan. The page says the call agent is included on every plan.'],
      ['How much call time you get', 'billing', 'Calls use IQ Credits at 125 credits per minute. Monthly credits run from 500 on Essentials ($29.99) to 8,000 on Max ($699.99): up to about 4 to 64 call minutes a month if every credit went to calls. Top-up packs start at 2,500 credits for $25.'],
      ['Website quotes', 'widget', 'Not described on the call team page.']
    ],
    pick: ['You want the caller quoted inside the call, from the measurements they give.', 'You want the visit booked before the caller hangs up.', 'You want your website to quote and book too.'],
    alongside: 'Using QuoteIQ for jobs and invoicing? Off The Clock answers and quotes the calls; leads, quote requests and bookings go out by webhook or CSV.'
  },
  {
    slug: 'smith-ai', name: 'Smith.ai', short: 'Smith.ai', type: 'AI and live receptionists',
    blurb: 'AI and live receptionist plans, billed per call.',
    sources: [['Smith.ai: AI Receptionist pricing', 'https://smith.ai/pricing/ai-receptionist'], ['Smith.ai: Hybrid AI + human pricing', 'https://smith.ai/pricing/hybrid-ai-human-receptionists']],
    intro: 'Smith.ai sells AI, hybrid and human receptionist plans billed per call. Off The Clock is built for contractors: it prices the job from your own price book while the caller is on the line.',
    rows: [
      ['Gives the caller a price for the job', 'price', 'Smith.ai’s AI receptionist pricing page doesn’t say it gives callers job prices or quotes.'],
      ['How it’s billed', 'billing', 'Per call. AI receptionist: Free plan with 25 calls; Pro $150/month with 75 calls; Enterprise $500/month with 300 calls. Extra calls are billed per call.'],
      ['Cancelling', 'trial', 'The AI receptionist is month-to-month, with 30 days’ notice to cancel.'],
      ['Website quotes', 'widget', 'Not listed on the AI receptionist pricing page.']
    ],
    pick: ['You run a trade and want callers priced from your own numbers.', 'You’d rather pay for talk time than per call.', 'You want your website to quote and book too.'],
    alongside: null
  },
  {
    slug: 'ruby', name: 'Ruby', short: 'Ruby', type: 'Live answering service',
    blurb: 'Live virtual receptionists, billed by the minute.',
    sources: [['Ruby: plans and pricing', 'https://www.ruby.com/plans-and-pricing/']],
    intro: 'Ruby’s trained receptionists answer your calls live. Off The Clock gives you an AI employee that answers every call, prices the job from your price book and books the visit, at a fraction of the per-minute cost.',
    rows: [
      ['Who answers', null, 'Live, trained receptionists, 24/7. AI features such as transcripts are optional.', 'Your AI employee answers every call at once, day or night. On Operator and QuoteDone, callers who want you can be transferred live during the hours you set.'],
      ['Gives the caller a price for the job', 'price', 'Ruby’s pricing page doesn’t say receptionists give callers job prices.'],
      ['What the plans cost', 'billing', '$250/month for 50 minutes, $395 for 100, $720 for 200, $1,725 for 500.'],
      ['Website quotes', 'widget', 'Ruby offers live chat plans from $143/month for 10 chats. The page doesn’t describe quoting.']
    ],
    pick: ['You want three times Ruby’s entry minutes for under a third of its entry price: 150 minutes for $69 against 50 minutes for $250.', 'You want callers priced from your price book.', 'You want every call transcribed and summarized for you.'],
    alongside: null
  },
  {
    slug: 'answerconnect', name: 'AnswerConnect', short: 'AnswerConnect', type: 'Live answering service',
    blurb: 'Live 24/7 answering, billed by the minute.',
    sources: [['AnswerConnect: plans', 'https://www.answerconnect.com/plans-direct']],
    intro: 'AnswerConnect staffs your phones with live receptionists around the clock. Off The Clock’s AI employee answers every call, prices the job from your own price book and books the visit, for far less per minute.',
    rows: [
      ['Who answers', null, 'Real people, 24/7.', 'Your AI employee, every call, day or night, with live transfer to you during the hours you set (Operator and QuoteDone).'],
      ['Gives the caller a price for the job', 'price', 'Not mentioned on the plans page.'],
      ['What the plans cost', 'billing', 'From $350/month for 200 minutes (plus a $49.99 setup fee), $395 for 300, $575 for 400. Extra minutes $1.85 to $2.50.'],
      ['Free trial', 'trial', 'No free trial is mentioned on the plans page.']
    ],
    pick: ['You want 1,200 minutes with phone quoting for $279 a month.', 'You want to try it free for 14 days with no setup fee.', 'You want callers priced from your own numbers.'],
    alongside: null
  },
  {
    slug: 'patlive', name: 'PATLive', short: 'PATLive', type: 'Live answering service',
    blurb: 'Human answering, billed by the minute.',
    sources: [['PATLive: pricing', 'https://www.patlive.com/pricing/']],
    intro: 'PATLive answers your calls with live people and says it does not use AI to answer calls. Off The Clock’s AI employee answers every call, quotes the job from your price book and books it.',
    rows: [
      ['Who answers', null, 'Live people, 24/7. The page says PATLive does not use AI to answer calls.', 'Your AI employee answers every call. On Operator and QuoteDone it transfers callers to you live during the hours you set.'],
      ['Gives the caller a price for the job', 'price', 'Not stated on the pricing page.'],
      ['What the plans cost', 'billing', 'Pay as you go $49/month plus $2.99 a minute; $99 for 50 minutes; $189 for 100; $349 for 200; $479 for 300.'],
      ['Free trial', 'trial', '14 days free, no contracts.']
    ],
    pick: ['You want 300 minutes with booking, transfer and a website quote widget for $119 a month.', 'You want callers priced from your price book.', 'You want a transcript and summary of every call.'],
    alongside: null
  },
  {
    slug: 'goodcall', name: 'Goodcall', short: 'Goodcall', type: 'AI receptionist',
    blurb: 'AI agents billed by unique callers.',
    sources: [['Goodcall: pricing', 'https://www.goodcall.com/pricing']],
    intro: 'Goodcall builds general-purpose AI phone agents billed by unique customers. Off The Clock is built for the trades: it prices measured jobs from your own price book on the call and on your website.',
    rows: [
      ['Gives the caller a price for the job', 'price', 'The pricing page doesn’t mention giving callers job prices or quotes.'],
      ['How it’s billed', 'billing', 'By unique customers per month: Starter $79 for 100, Growth $129 for 500, Scale $299 for 2,000. Extra customers billed at the plan rate.'],
      ['Website quotes', 'widget', 'Not listed on the pricing page.'],
      ['Your number', 'number', 'Every plan includes a local number, or you can forward an existing one.']
    ],
    pick: ['You want phone quoting from your price book, built in.', 'You want a website widget that quotes and books.', 'You want an answer-only plan from $69.'],
    alongside: null
  },
  {
    slug: 'rosie', name: 'Rosie', short: 'Rosie', type: 'AI receptionist',
    blurb: 'AI answering billed by the minute.',
    sources: [['Rosie', 'https://heyrosie.com/']],
    intro: 'Rosie is an AI answering service for small businesses of every kind. Off The Clock is built for contractors who want the job priced on the first call, from their own numbers.',
    rows: [
      ['Gives the caller a price for the job', 'price', 'Rosie’s site doesn’t say it gives job prices. On its Scale plan it can text pricing links during calls.'],
      ['What the plans cost', 'billing', 'Professional $49/month for 250 minutes, Scale $149 for 1,000, Growth $299 for 2,000.'],
      ['Booking', 'booking', 'Professional sends appointment links by text; Scale and Growth book directly on your calendar.'],
      ['Website quotes', 'widget', 'Rosie includes a website chat widget. Its site doesn’t describe quoting.']
    ],
    pick: ['You want callers to hear the price for their job, not get a link.', 'You want a website widget that quotes from your price book and books.', 'You want booking without texting your customers.'],
    alongside: null
  },
  {
    slug: 'my-ai-front-desk', name: 'My AI Front Desk', short: 'My AI Front Desk', type: 'AI receptionist',
    blurb: 'AI receptionist with credits-based overage.',
    sources: [['My AI Front Desk: pricing', 'https://www.myaifrontdesk.com/pricing']],
    intro: 'My AI Front Desk is a general AI receptionist for many industries. Off The Clock is built for contractors and quotes measured jobs from your price book during the call.',
    rows: [
      ['Gives the caller a price for the job', 'price', 'Not stated on the pricing page.'],
      ['What the plans cost', 'billing', 'Business-in-a-Box $99/month ($79 billed annually) with 200 minutes. Extra minutes are 25 credits ($0.25).'],
      ['Free trial', 'trial', '7-day free trial.'],
      ['Website quotes', 'widget', 'Not listed on the pricing page.']
    ],
    pick: ['You want answering from $69 a month with 150 minutes.', 'You want phone quoting from your own price book.', 'You want a 14-day trial instead of 7 days.'],
    alongside: null
  },
  {
    slug: 'dialzara', name: 'Dialzara', short: 'Dialzara', type: 'AI receptionist',
    blurb: 'AI answering billed by the minute.',
    sources: [['Dialzara: AI answering service', 'https://dialzara.com/solutions/ai-answering-service']],
    intro: 'Dialzara is an AI answering service for small businesses. Off The Clock adds what contractors care about most: a price for the job, worked out from your price book, before the caller hangs up.',
    rows: [
      ['Gives the caller a price for the job', 'price', 'Not mentioned on the page.'],
      ['What the plans cost', 'billing', '$29/month for 60 minutes, $99 for 220, $199 for 500, $349 for 1,000. Extra minutes $0.35 to $0.48.'],
      ['Free trial', 'trial', '7 days, no contract.'],
      ['Website quotes', 'widget', 'Not listed on the page.']
    ],
    pick: ['You want callers quoted from your own prices.', 'You want a website widget that quotes and books.', 'You want 14 days to try it on your own line.'],
    alongside: null
  },
  {
    slug: 'upfirst', name: 'Upfirst', short: 'Upfirst', type: 'AI receptionist',
    blurb: 'AI answering billed per call.',
    sources: [['Upfirst: pricing', 'https://upfirst.ai/pricing']],
    intro: 'Upfirst is an AI answering service billed per call. Off The Clock is built for the trades and quotes measured jobs from your own price book during the call.',
    rows: [
      ['Gives the caller a price for the job', 'price', 'The page says the knowledge base can answer questions about your pricing. It doesn’t say the agent gives job prices or quotes.'],
      ['How it’s billed', 'billing', 'Per call: Starter $24.95/month for 30 calls, Premium $59.95 for 90, Pro $159.95 for 300, Scale $299 for 600.'],
      ['Website quotes', 'widget', 'Not listed on the pricing page.'],
      ['Free trial', 'trial', '14 days or 100 calls, whichever comes first.']
    ],
    pick: ['You want callers priced by the foot or the square from your own numbers.', 'You want minutes instead of a per-call count.', 'You want a website widget that quotes and books.'],
    alongside: null
  },
  {
    slug: 'marlie-ai', name: 'Marlie AI', short: 'Marlie', type: 'AI receptionist',
    blurb: 'AI answering billed by the minute.',
    sources: [['Marlie AI: pricing', 'https://www.marlie.ai/pricing']],
    intro: 'Marlie is an AI answering service with booking on its higher plans. Off The Clock quotes the job itself, from your price book, and books it.',
    rows: [
      ['Gives the caller a price for the job', 'price', 'Not listed on the pricing page. Pro and Premium can list products and services to callers; the page doesn’t say whether that includes prices.'],
      ['What the plans cost', 'billing', 'Basic $49/month for 250 minutes, Standard $99 for 500, Pro $199 for 1,000, Premium $399 for 2,000. Extra minutes $0.25 to $0.35.'],
      ['Booking', 'booking', 'Calendar booking starts on Standard ($99).'],
      ['Website quotes', 'widget', 'Not listed on the pricing page.']
    ],
    pick: ['You want callers to hear a price for their job.', 'You want a website widget that quotes from your price book.', 'You want booking and live transfer on a $119 plan.'],
    alongside: null
  },
  {
    slug: 'sameday', name: 'Sameday AI', short: 'Sameday', type: 'AI receptionist for home services',
    blurb: 'Home services AI answering from $449 a month.',
    sources: [['Sameday: pricing', 'https://sameday.ai/pricing'], ['Sameday: best AI receptionist for home services', 'https://sameday.ai/best-ai-receptionist-for-home-services']],
    intro: 'Sameday sells AI answering to home service companies that book into ServiceTitan and similar platforms. Off The Clock prices the job from your price book on the call, starting at $69 a month.',
    rows: [
      ['Gives the caller a price for the job', 'price', 'Its pricing and comparison pages don’t say whether the AI gives callers prices or quotes.'],
      ['What the plans cost', 'billing', 'Launch from $449/month with 500 minutes; Scale from $789 with 1,000.'],
      ['Hours covered', null, 'The pricing page says Launch covers after-hours and weekend calls; Scale covers 24/7.', 'Every plan answers 24/7, from $69 a month.'],
      ['Website quotes', 'widget', 'Not described on the pricing page.']
    ],
    pick: ['You want 24/7 answering on every plan, from $69.', 'You want 1,200 minutes with phone quoting for $279.', 'You want callers priced from your own price book.'],
    alongside: null
  },
  {
    slug: 'avoca', name: 'Avoca', short: 'Avoca', type: 'AI receptionist for home services',
    blurb: 'Home services AI answering, demo-only pricing.',
    sources: [['Avoca: why AI is finally winning in home services', 'https://www.avoca.ai/blog/why-ai-is-finally-winning-in-home-services']],
    intro: 'Avoca sells AI answering to home service companies, with pricing given through a demo. Off The Clock publishes its prices, lets you start yourself, and prices the job from your price book on the call.',
    rows: [
      ['Gives the caller a price for the job', 'price', 'The page doesn’t say whether the AI gives callers prices or quotes.'],
      ['Published pricing', 'billing', 'Not published. The page’s call to action is to book a demo.'],
      ['Start on your own', 'trial', 'Through a demo.'],
      ['Website quotes', 'widget', 'Not described on the page.']
    ],
    pick: ['You want to see the price and start today, without a sales call.', 'You want callers priced from your own numbers.', 'You run a smaller shop and want plans from $69.'],
    alongside: null
  },
  {
    slug: 'allo', name: 'Allo', short: 'Allo', type: 'AI receptionist',
    blurb: 'AI receptionist seats with estimate booking.',
    sources: [['Allo: AI receptionist for contractors', 'https://www.withallo.com/ai-receptionist/contractors']],
    intro: 'Allo’s receptionist books estimate walk-throughs, and gives no job prices unless you tell it to. Off The Clock is designed to price the job on the call from your own price book, so the caller hears a number before anyone drives out.',
    rows: [
      ['Gives the caller a price for the job', 'price', 'The page says it gives no job prices unless the business owner tells it to. Its example instructions: “Never give a price or a range over the phone.”'],
      ['What it books', 'booking', 'Estimate walk-throughs, into Google Calendar, Outlook, Cal.com or Calendly.'],
      ['How it’s billed', 'billing', 'One seat: $45 a month, or $32 a month billed yearly. No per-minute fees.'],
      ['Free trial', 'trial', '3 days.']
    ],
    pick: ['You want callers to hear a price range before the site visit.', 'You want your website to quote too.', 'You want 14 days to try it on real calls.'],
    alongside: null
  }
];

export const TYPES = ['Field service software add-on', 'AI receptionist for home services', 'AI receptionist', 'AI and live receptionists', 'Live answering service'];
