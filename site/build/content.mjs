// Content for docs and switching pages (industry pages live in industries.mjs).
// Setup steps follow the onboarding steps in client/src/onboarding.jsx.

// User docs. Steps describe the app as built; avoid menu paths the app doesn't show.
export const DOCS = [
  {
    slug: 'getting-started', title: 'Getting started', summary: 'Sign up and go live, step by step.',
    body: `<p>Setup is self-serve with no setup fee. The app walks you through nine steps in order, and you can come back to any of them.</p>
<ol class="steps">
<li><strong>Account.</strong> Your email, password, first name, business name, time zone and plan.</li>
<li><strong>Business type.</strong> Pick the work you do: roofing, painting, flooring, fencing, concrete, landscaping, siding, or something else.</li>
<li><strong>Jurisdiction.</strong> Your country and state or province, and on Operator and QuoteDone how you handle sales tax on customer invoices.</li>
<li><strong>Phone number.</strong> The number your customers call today. You keep it; you get a receptionist number to forward to.</li>
<li><strong>Knowledge base.</strong> About and service area, hours, services, policies, FAQs and any prices you list. Your AI employee answers only from what you write here.</li>
<li><strong>Go live.</strong> Forward your calls to your receptionist number with your carrier’s call forwarding. See <a href="/docs/connect-your-number/">connect your number</a>.</li>
<li><strong>Price book</strong> (Operator and QuoteDone). Set your prices for each service. See <a href="/docs/price-book/">price book</a>.</li>
<li><strong>Calendar</strong> (optional, Operator and QuoteDone). Connect Google Calendar so it can book visits.</li>
<li><strong>Voice and greeting.</strong> Choose a voice, name your AI employee and set its greeting.</li>
</ol>
<div class="note"><p>Your 14-day free trial includes up to 60 minutes of answered calls on your plan’s full features.</p></div>`
  },
  {
    slug: 'connect-your-number', title: 'Connect your number', summary: 'Keep your number and forward calls with your carrier’s call forwarding.',
    body: `<p>You keep the number on your trucks and cards. Off The Clock gives you a receptionist number behind the scenes, and you forward calls to it from your own phone. Setup shows the codes or steps for your carrier with your receptionist number already filled in.</p>
<h2>Choose which calls it answers</h2>
<ul class="dots"><li><strong>Missed calls only.</strong> Your phone rings first; if you’re busy or don’t pick up, your AI employee answers.</li><li><strong>Every call.</strong> Your AI employee answers all calls.</li></ul>
<h2>Carriers covered in setup</h2>
<p>United States: Verizon, AT&amp;T and T-Mobile. Canada: Bell, Rogers and TELUS. For Bell, setup shows the steps in your phone’s call forwarding menu. For other carriers, it tells you what to ask your carrier. If a code is rejected, use your phone’s call forwarding menu or contact your carrier.</p>
<h2>Turning it on and off</h2>
<p>Use the code or menu steps setup shows you to turn answering on, and to turn it off. Your line rings normally again as soon as forwarding is off.</p>
<div class="note"><p>AT&amp;T says call forwarding overrides your voicemail and can only be changed from the phone itself.</p></div>`
  },
  {
    slug: 'price-book', title: 'Your price book', summary: 'How prices are set, confirmed and used for quotes.',
    body: `<p>Your price book holds the prices your AI employee and website widget quote from. It’s included on Operator and QuoteDone. Phone quoting from it is on QuoteDone; the website widget quotes from it on both.</p>
<h2>Three ways to fill it in</h2>
<ul class="dots"><li><strong>AI interview.</strong> Answer questions about how you price each service.</li><li><strong>Import from your website.</strong> Give your website address and it reads the prices listed there.</li><li><strong>Type them in.</strong> Enter or edit any value directly.</li></ul>
<h2>Nothing goes live unconfirmed</h2>
<p>AI-suggested prices are placeholders. You review and confirm each value, and a service only starts quoting once its prices are complete and confirmed.</p>
<h2>How a quote is built</h2>
<p>Your AI employee asks the caller for the details that service needs, runs them through your prices and gives a range. If your price book doesn’t cover something the caller needs, or the caller can’t give a detail it needs, it captures everything as a lead for you instead of guessing.</p>
<h2>Tiered options</h2>
<p>Services can have options, like Good, Better and Best. Each option is quoted with its own range.</p>`
  },
  {
    slug: 'website-widget', title: 'Website quote widget', summary: 'Put instant quotes and booking on your site.',
    body: `<p>The QuoteDone website widget is included on Operator and QuoteDone. Visitors answer a few questions, see a quote range from your price book, and can book a time.</p>
<h2>Install it</h2>
<ol class="steps">
<li>Save your website’s exact address in <strong>Allowed website origins</strong>.</li>
<li>Copy the widget code and paste it into your site.</li>
<li>Publish your page, then use <strong>Check installation</strong> and try a complete estimate.</li>
</ol>
<p>No website builder access? The app also gives you a customer quote link you can share anywhere.</p>`
  },
  {
    slug: 'booking-and-transfers', title: 'Booking and live transfer', summary: 'Calendar booking and sending callers to you.',
    body: `<p>Booking and live transfer are included on Operator and QuoteDone.</p>
<h2>Booking</h2>
<p>Connect Google Calendar. Busy times on your connected calendar block availability, and confirmed bookings are added to it. On the call, your AI employee repeats the booked date, time and address back to the caller.</p>
<h2>Live transfer</h2>
<p>Set a transfer number and the hours you take transfers, day by day. When a caller asks for you during those hours, your AI employee confirms and connects the call. Outside those hours, or if the transfer doesn’t connect, it saves a callback request with the caller’s own words.</p>`
  },
  {
    slug: 'calls-and-alerts', title: 'Calls, transcripts and alerts', summary: 'What you see after every call.',
    body: `<p>Every call has a transcript and summary in your dashboard. You get email alerts for new leads and callback requests, and quotes show the range and options the caller heard.</p>
<h2>Transcription notice</h2>
<p>You decide whether your AI employee tells callers the call is transcribed. It’s a setting in your account, off or on. Some places require callers to be told; you’re responsible for the laws that apply to your business.</p>
<h2>Spam</h2>
<p>Mark a number as spam and its future calls are rejected. Those calls aren’t counted against your minutes.</p>
<h2>Returning callers</h2>
<p>When someone calls back from a number that’s called before, your AI employee confirms who it’s speaking with before using anything from earlier calls.</p>`
  },
  {
    slug: 'minutes-and-billing', title: 'Minutes and billing', summary: 'Included minutes, overage, trial and cancelling.',
    body: `<dl class="facts">
<div><dt>Included minutes</dt><dd>Starter 150, Operator 300, QuoteDone 1,200 each billing month. Talk time on your line. Unused minutes don’t carry over.</dd></div>
<div><dt>Warnings</dt><dd>The meter is always in your dashboard. You get an email at 60, 30 and 0 minutes left.</dd></div>
<div><dt>Overage</dt><dd>$0.35 per minute past your plan.</dd></div>
<div><dt>Not counted</dt><dd>Calls that drop because the receptionist failed, and calls from numbers you’ve marked as spam.</dd></div>
<div><dt>Free trial</dt><dd>14 days, card required, up to 60 minutes of answered calls. Trial minutes are never billed as overage.</dd></div>
<div><dt>Annual plans</dt><dd>10× the monthly price, charged up front. Minutes still reset monthly.</dd></div>
<div><dt>Cancelling</dt><dd>Anytime. Service runs to the end of the paid period. Export your records for 90 days after service ends.</dd></div>
</dl>`
  },
  {
    slug: 'exports-and-webhooks', title: 'Exports and webhooks', summary: 'Get your leads, quotes and bookings into other tools.',
    body: `<h2>CSV exports</h2>
<p>Download your leads, quote requests and bookings as CSV files at any time, and for 90 days after your service ends.</p>
<h2>Webhooks</h2>
<p>On Operator and QuoteDone, add a webhook address and choose which events to send: new leads, quote requests and booked appointments. Each delivery is tracked, and failed deliveries can be retried.</p>
<div class="note"><p>Off The Clock has no direct connection to Jobber, QuickBooks, Housecall Pro or ServiceTitan. Webhooks work with any tool that accepts them.</p></div>`
  }
];

// "Agent docs": how the AI employee behaves on calls. Rules from the voice runtime.
export const AGENT_RULES = [
  ['It only says what it knows', 'Answers come from your knowledge base, your listed prices and your price book. If an answer isn’t there, it collects the question and the caller’s details for you. It never makes anything up.'],
  ['One question at a time', 'It asks one question per turn, in plain words, never field names or codes.'],
  ['Prices from your numbers only', 'Phone quotes (QuoteDone) come from your confirmed price book. Listed prices are given as written; the only arithmetic on a listed price is multiplying it by the quantity the caller asks for.'],
  ['No guessing', 'When it can’t price a job from what the caller gives it, it captures every detail as a lead instead of guessing.'],
  ['Honest about being AI', 'It answers with its own name and doesn’t volunteer that it’s AI. Asked if it’s a person, it says it’s a digital employee of your business; asked if that means AI, it says yes. It never denies it.'],
  ['The caller’s language', 'It replies in the language the caller speaks and switches if asked. A mumbled reply never switches the language; it asks the caller to repeat.'],
  ['Bookings read back', 'After a booking is confirmed, it repeats the date, time and address. It doesn’t promise texts or reminders.'],
  ['Quote copies by email', 'Only when the caller asks (QuoteDone). It reads the email address back, including spelling, before sending.'],
  ['Your plan, respected', 'On plans without booking or transfer, it doesn’t offer them; it takes the request for you instead.'],
  ['Returning callers', 'It confirms who it’s speaking with before using anything from earlier calls. With a hidden number, it doesn’t look up history.']
];

export const SWITCHING = [
  {
    slug: 'from-voicemail', title: 'Switching from voicemail', summary: 'Stop sending callers to a beep.',
    body: `<p>Voicemail takes a message. Your AI employee answers, answers questions, and on the right plan books the visit and prices the job.</p>
<ol class="steps">
<li>Start your trial and fill in your knowledge base: hours, service area, services, policies and FAQs.</li>
<li>Forward <strong>missed calls only</strong> with your carrier’s call forwarding. Your phone still rings first; your AI employee picks up instead of voicemail.</li>
<li>Read the transcripts and summaries for your first week, and add anything callers asked that your knowledge base didn’t cover.</li>
</ol>`
  },
  {
    slug: 'from-an-answering-service', title: 'Switching from an answering service', summary: 'Move your forwarding from a call center to your AI employee.',
    body: `<p>Answering services usually work the same way: your calls are forwarded to them. Switching is changing where that forwarding points.</p>
<ol class="steps">
<li>Copy what your answering service uses into your knowledge base: greeting, hours, service area, FAQs and policies.</li>
<li>Set up your price book and calendar (Operator and QuoteDone) so calls can be priced and booked, not just logged.</li>
<li>Turn off your current forwarding, then use your carrier’s call forwarding to forward to your receptionist number.</li>
<li>Check your contract with the old service for notice periods before you cancel it.</li>
</ol>`
  },
  {
    slug: 'from-another-ai-receptionist', title: 'Switching from another AI receptionist', summary: 'Move over without losing your setup.',
    body: `<ol class="steps">
<li>Export your call history and leads from your current provider if it offers an export.</li>
<li>Copy your business details, FAQs and prices into your knowledge base. If your prices are on your website, import them into your price book.</li>
<li>If your number is forwarded to the old provider, turn that forwarding off and forward to your receptionist number instead.</li>
<li>Test with a call from another phone, then cancel the old service.</li>
</ol>`
  },
  {
    slug: 'from-job-software-answering', title: 'Using it with Jobber, Housecall Pro or ServiceTitan', summary: 'Keep your job software; change who answers.',
    body: `<p>You don’t have to leave your job software. Off The Clock answers and prices the call; your job software keeps running the job.</p>
<ol class="steps">
<li>If your number forwards to an answering feature in your job software, turn that forwarding off.</li>
<li>Forward to your Off The Clock receptionist number with your carrier’s call forwarding.</li>
<li>On Operator and QuoteDone, add a webhook to send new leads, quote requests and bookings to your other tools, or download them as CSV.</li>
</ol>
<div class="note"><p>There’s no direct connection to Jobber, Housecall Pro or ServiceTitan. Webhooks work with any tool that accepts them.</p></div>`
  }
];
