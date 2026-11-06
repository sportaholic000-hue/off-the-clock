// FAQ answers. Each one is checked against the app's code on branch
// claude/launch (plan access, billing, voice rules) or the privacy and terms
// pages. Answers are HTML; keep them short and factual.

export const FAQ = [
  ['The calls', [
    ['Will callers know they’re talking to AI?',
      '<p>Your AI employee answers with your business name and its own name, and doesn’t announce that it’s AI. If a caller asks whether it’s a real person, it says it’s a digital employee of your business. If they ask whether that means AI, it says yes. It never denies being AI.</p>'],
    ['What if a caller wants to talk to me?',
      '<p>On Operator and QuoteDone, it transfers the call to you live during the transfer hours you set. Outside those hours, or if the transfer doesn’t connect, it saves a callback request with the caller’s own words so you can call back.</p><p>On Starter, it takes the caller’s details and request for you.</p>'],
    ['Does it work at 2 a.m. and on holidays?',
      '<p>Yes. It answers every call you forward to it, any hour, every day.</p>'],
    ['What languages does it speak?',
      '<p>It replies in the language the caller is speaking, and switches if the caller asks for another language. Once a language is set, a mumbled or unclear reply is never treated as a switch; it asks the caller to repeat instead.</p>'],
    ['Will it recognize people who call back?',
      '<p>Yes. When someone calls from a number that has called before, it asks to confirm who it’s speaking with before it uses anything from earlier calls.</p>'],
    ['Does it text my customers?',
      '<p>No. Off The Clock doesn’t send text messages. Callers hear everything on the call, including booking details read back to them. If a caller asks for a written copy of their quote, it emails one (QuoteDone plan). You get everything in your dashboard and by email.</p>'],
    ['Is it an emergency line?',
      '<p>No. It doesn’t contact emergency services. Callers in an emergency should call their local emergency number.</p>']
  ]],
  ['Quoting', [
    ['How does it quote a job on the phone?',
      '<p>On the QuoteDone plan, it asks the questions your price book needs for that job, one at a time. For a fence that’s the style, height, length, gates and whether an old fence is coming out. It runs the answers through your own prices and reads the caller a range.</p>'],
    ['How accurate are the quotes?',
      '<p>As accurate as your prices and the caller’s measurements. On the phone, callers often give a best guess, so the range is given as confirmed on site. On the website widget, customers have time to measure and type exact numbers.</p>'],
    ['What happens when it can’t price a job?',
      '<p>It doesn’t guess. If your price book doesn’t cover the job or the caller can’t give what it needs, it captures every detail as a lead for you to follow up.</p>'],
    ['Which trades can it quote?',
      '<p>Roofing (replacement and repair, including flat roofs), interior and exterior painting, flooring installs and replacements, fence installs and replacements, concrete driveways and patios, landscaping (cleanup, mulch, sod, planting and mowing) and siding replacement and repair. You can also add your own custom services priced by the unit.</p><p>For any business, it can give the fixed prices you list, and multiply one listed price by the quantity the caller asks for.</p>'],
    ['Where do the prices come from?',
      '<p>Your price book. Set it up by answering an AI interview, by importing the prices listed on your website, or by typing them in. AI-suggested prices are placeholders: you review and confirm each one before that service goes live.</p>'],
    ['Can it give Good, Better and Best options?',
      '<p>Yes. On QuoteDone, services with tiered options are quoted per option, with each option’s own range.</p>'],
    ['Can my website quote jobs too?',
      '<p>Yes, on Operator and QuoteDone. The QuoteDone website widget asks the same questions, shows a range from your price book and lets the customer book a time.</p>']
  ]],
  ['Your number and setup', [
    ['Do I need a new phone number?',
      '<p>No. You keep your number. You get a receptionist number behind the scenes, and you forward your calls to it with your carrier’s forwarding code. Setup shows the exact code for Verizon, AT&amp;T, T-Mobile, Bell, Rogers and TELUS, and standard codes for other carriers.</p>'],
    ['Can I choose which calls it answers?',
      '<p>Yes. Forward missed calls only (busy or no answer) so it picks up when you can’t, or forward every call.</p>'],
    ['How do I turn it off?',
      '<p>Dial your carrier’s turn-off code from your phone. Your line rings normally again.</p>'],
    ['How do I set it up?',
      '<p>Self-serve, no setup fee. Sign up, enter your business details, connect your number, and on Operator and QuoteDone build your price book and connect Google Calendar. See the <a href="/docs/getting-started/">getting started guide</a>.</p>'],
    ['Does it work in Canada and the US?',
      '<p>Yes. Receptionist numbers are available in both, and setup covers the major carriers in each.</p>']
  ]],
  ['Calls, leads and your records', [
    ['Will I know what happened on every call?',
      '<p>Yes. Every call has a transcript and summary in your dashboard, and you get email alerts for new leads and callback requests. Quotes show the range and options the caller heard.</p>'],
    ['Does it record calls?',
      '<p>No audio is stored. Calls are transcribed. You decide whether your AI employee tells callers the call is transcribed; it’s a setting in your account.</p>'],
    ['Does it work with Jobber, QuickBooks or Housecall Pro?',
      '<p>It works alongside them; there’s no direct connection to those apps. New leads, quote requests and bookings can be sent by webhook to any tool that accepts one (Operator and QuoteDone), and your leads, quote requests and bookings download as CSV.</p>'],
    ['Which calendar does it book into?',
      '<p>Google Calendar. Busy times on your connected calendar block availability, and confirmed bookings are added to it.</p>'],
    ['Can my office staff log in?',
      '<p>Operator and QuoteDone include one office-staff login next to the owner’s. Starter has one owner login.</p>'],
    ['What about spam calls?',
      '<p>Mark a number as spam and its future calls are rejected. Calls from numbers you’ve marked aren’t counted against your minutes.</p>']
  ]],
  ['Plans, minutes and billing', [
    ['How much does it cost?',
      '<p>Starter $69/month for 150 minutes, Operator $119 for 300 and QuoteDone $279 for 1,200. Prices are in US dollars. See <a href="/pricing/">pricing</a> for what each plan includes.</p>'],
    ['How do minutes work?',
      '<p>A minute is talk time on your line. Minutes reset every billing month and don’t carry over. The meter is always visible, and you get an email at 60, 30 and 0 minutes left.</p>'],
    ['What if I go over?',
      '<p>$0.35 per minute past your plan. It’s charged to your card each time it reaches $25 and at the end of the billing month, so it never piles up into one big bill.</p>'],
    ['Do dropped calls count?',
      '<p>Calls that drop because the receptionist failed aren’t counted against your minutes.</p>'],
    ['Is there a free trial?',
      '<p>Yes. 14 days on your plan’s full features, with up to 60 minutes of answered calls. A card is needed to start. Your plan starts when the trial ends unless you cancel first. The trial is for businesses that haven’t paid for Off The Clock before.</p>'],
    ['Do you offer annual billing?',
      '<p>Yes. Annual plans cost 10 times the monthly price, so two months are free. They’re charged up front, and your minutes still reset every month.</p>'],
    ['Can I cancel anytime?',
      '<p>Yes, from your billing settings. Service runs to the end of the period you’ve paid for. There are no partial refunds, and any overage in your final month is still charged.</p>'],
    ['What if my card fails?',
      '<p>Your AI employee keeps answering for 3 days while you update your card. After that the account is paused until payment goes through, and you can still sign in and see your records.</p>']
  ]],
  ['Your data', [
    ['Who owns my records?',
      '<p>You do. Your business information, customer records and transcripts belong to your business. No business can see another business’s records.</p>'],
    ['What happens to my data if I leave?',
      '<p>You can export your records for 90 days after service ends. After 90 days your business records are deleted, including backup copies. Billing records are kept.</p>'],
    ['Do you train AI on my calls?',
      '<p>No. See the <a href="/privacy/">privacy policy</a> for the providers involved and how long information is kept.</p>']
  ]]
];
