// Industry pages. Two kinds:
// - measured: the QuoteDone engine prices the job from the caller's details.
//   The "asks" lists come from the engine's customer inputs
//   (server/priceBookMetadata.js SAMPLE_INPUTS).
// - listed: the trade mostly sells set prices. Listed prices are given on every
//   plan (calculateListedPrice is not plan-gated in server/src/voice/voicePlanAccess.js);
//   booking and live transfer are Operator and QuoteDone.

export const INDUSTRIES = [
  {
    slug: 'roofing', name: 'Roofing', kind: 'measured',
    title: 'Roofing calls, answered and quoted while you’re on the roof',
    lead: 'Your AI employee asks the questions your roofing quotes depend on and gives the caller a range from your own price book, with final pricing confirmed on site.',
    hook: ['The call that costs you jobs', 'A homeowner with a leak or a twenty-year-old roof calls three roofers on a Saturday. Two are on a roof. The third gives a number and books the inspection.'],
    asks: [
      ['Roof replacement', 'Roof size, roofing type, pitch, stories, how many layers are coming off, how complex the roof is, and full or partial scope.'],
      ['Roof repair', 'Type of repair, affected area, roofing type, pitch, stories and whether there’s an active leak.'],
      ['Flat roof replacement', 'Roof area, membrane type, existing layers, how hard the roof is to reach, and residential or commercial.'],
      ['Flat roof repair', 'Type of repair, affected area, membrane type, active leak and ponding water.']
    ],
    faq: [
      ['What if the homeowner doesn’t know the roof size?', 'Your AI employee asks in terms a homeowner can answer, and a best guess is fine on the phone: the range is confirmed on site. If the caller can’t give what the calculation needs, the job comes to you as a lead with everything captured.']
    ]
  },
  {
    slug: 'painting', name: 'Painting', kind: 'measured',
    title: 'Painting calls, answered and quoted while you’re on the ladder',
    lead: 'Interior and exterior jobs quoted from your own rates while the caller is still on the phone.',
    hook: ['The call you’re missing', 'Someone wants three rooms done before the in-laws visit. They want a ballpark today, and they’re calling until somebody gives them one.'],
    asks: [
      ['Interior painting', 'Floor area, wall height, surface condition, number of coats, and whether ceilings and trim are included.'],
      ['Exterior painting', 'Exterior area, stories, surface condition and number of coats.']
    ],
    faq: [
      ['Can it give Good, Better and Best options?', 'Yes, on QuoteDone. If you set up tiered options, each option is quoted with its own range.']
    ]
  },
  {
    slug: 'flooring', name: 'Flooring', kind: 'measured',
    title: 'Flooring calls, answered and quoted while you’re on your knees',
    lead: 'Material, footage, tear-out and stairs: a real range before the caller hangs up.',
    hook: ['The call you’re missing', 'A homeowner has picked their floor and is calling installers. The first one who can put a number on the job gets the measure visit.'],
    asks: [
      ['Flooring install', 'Square footage, new flooring type, existing floor, removal, number of rooms, layout pattern and stair steps.'],
      ['Flooring replacement', 'Everything above, plus subfloor issues.']
    ],
    faq: [
      ['Does it price removal and stairs?', 'Yes, from your own price book. Removal, stair steps and layout pattern are asked and priced the same way on every call.']
    ]
  },
  {
    slug: 'fencing', name: 'Fencing', kind: 'measured',
    title: 'Fence calls, answered and quoted while you’re setting posts',
    lead: 'Length, height, gates and tear-out: quoted on the first call, site visit booked.',
    hook: ['The call you’re missing', 'New neighbours, a new dog, a fence that blew down. The caller wants to know what it costs before they invite anyone over to measure.'],
    asks: [
      ['Fence install', 'Linear feet, fence type, height, gates, corners and how sloped the ground is.'],
      ['Fence replacement', 'Everything above, plus removing the old fence.']
    ],
    faq: [
      ['Does the caller have to count posts?', 'No. Posts are worked out from the length. Callers are asked about length, height, gates, corners and slope, in plain words.'],
      ['What heights can it quote?', 'Any height. Your AI employee asks the height straight out instead of offering a menu.']
    ]
  },
  {
    slug: 'concrete', name: 'Concrete', kind: 'measured',
    title: 'Concrete calls, answered and quoted while you’re on a pour',
    lead: 'Driveways and patios priced from your rates, finish and base prep included.',
    hook: ['The call you’re missing', 'A driveway call comes in while you’re finishing a pour. By the time you can pick up a phone, the homeowner has a number from someone else.'],
    asks: [
      ['Concrete driveway', 'Length and width, thickness, finish, removing the old slab, reinforcement, truck access and base prep.'],
      ['Concrete patio or slab', 'Length and width, thickness, finish, reinforcement, access and base prep.']
    ],
    faq: [
      ['Does it price finishes differently?', 'Yes. Broom, exposed aggregate and stamped are each priced from your own rates.']
    ]
  },
  {
    slug: 'landscaping', name: 'Landscaping', kind: 'measured',
    title: 'Landscaping calls, answered and quoted while your crew is out',
    lead: 'Sod, mulch, planting, cleanups and mowing quoted from your rates while the season is busy.',
    hook: ['The call you’re missing', 'Spring calls come in faster than any crew can answer them, and every homeowner wants their yard done first.'],
    asks: [
      ['Yard cleanup', 'Yard size, debris level, slope and haul-away.'],
      ['Mulch', 'Bed area, depth, mulch type, bed condition and edging.'],
      ['Sod', 'Square footage, ground prep, slope and access.'],
      ['Planting', 'Number of plants, plant size, bed condition and mulch.'],
      ['Mowing', 'Yard size, how often, grass condition, bagging and edging.']
    ],
    faq: [
      ['Can it quote recurring mowing?', 'Yes. Mowing is priced by yard size, how often, grass condition, bagging and edging.']
    ]
  },
  {
    slug: 'siding', name: 'Siding', kind: 'measured',
    title: 'Siding calls, answered and quoted while you’re on the wall',
    lead: 'Full replacements quoted by area and material, repairs by the affected area.',
    hook: ['The call you’re missing', 'After a windstorm, homeowners with damaged siding call around. The one who answers with a range is the one who gets the visit.'],
    asks: [
      ['Siding replacement', 'Wall area, siding type, stories, old siding removal and trim.'],
      ['Siding repair', 'Affected area, siding type, damage level and stories.']
    ],
    faq: [
      ['Which siding types does it quote?', 'The types you offer and price: vinyl, fiber cement, wood or metal.']
    ]
  },
  {
    slug: 'hvac', name: 'HVAC', kind: 'listed',
    title: 'HVAC calls, answered and priced while you’re on a job',
    lead: 'Your AI employee answers every call, gives the set prices you list, and on Operator and QuoteDone books the visit.',
    hook: ['The call you’re missing', 'The first real heat wave of the summer. Every air conditioner that was going to fail this year fails this week, and you’re on a roof with a unit apart. The callers are hot, and they’re calling down the list.'],
    listed: ['Seasonal tune-ups, heating and cooling', 'Maintenance plans and memberships', 'Diagnostic and service call fees', 'Filter replacement', 'Duct cleaning', 'Thermostat supply and install', 'Condensate line clearing', 'Safety and efficiency inspections'],
    seasons: [['First real heat', 'Cooling calls arrive all in one week.'], ['First real cold', 'Heating calls do the same thing in reverse.'], ['Shoulder months', 'Tune-up season: set prices, the easiest calls in your book.']],
    objection: ['“I need to see the system before I can say anything.”', 'For a replacement, yes. But your tune-up, your maintenance plan and your diagnostic fee are set prices. Your AI employee gives those on the call, and the replacement calls become booked diagnostic visits instead of voicemails.'],
    faq: [
      ['Can it quote a full system replacement?', 'If you list a set price for it, yes. If you don’t, it captures the caller’s details and what they need so you can follow up.']
    ]
  },
  {
    slug: 'plumbing', name: 'Plumbing', kind: 'listed',
    title: 'Plumbing calls, answered and priced while you’re under a sink',
    lead: 'Your AI employee answers every call, gives the set prices you list, and on Operator and QuoteDone books the job.',
    hook: ['The call you’re missing', 'It’s 9 p.m. A homeowner has water coming up through a basement floor drain, and they’re calling every plumber in the search results until somebody picks up. You’re asleep, or on another call. In the morning you have three voicemails, and all three jobs are gone.'],
    listed: ['Drain and sewer cleaning', 'Toilet repair and replacement', 'Faucet and fixture replacement', 'Water heater replacement, tank and tankless', 'Garbage disposal replacement', 'Sump pump replacement', 'Shut-off and hose bib replacement', 'Camera inspection', 'Diagnostic and service call fees'],
    seasons: [['Every night', 'After-hours callers keep dialing until somebody answers.'], ['First hard freeze', 'The freeze and the days after it are the week your phone rings more than you can answer.']],
    objection: ['“Every plumbing job is different. You can’t quote it over the phone.”', 'Most of it, agreed. But a toilet replacement is a toilet replacement and a water heater swap is a water heater swap. If you charge a set price for it, your AI employee gives that price and, on Operator and QuoteDone, books the job.'],
    faq: [
      ['What if the caller doesn’t know what’s wrong?', 'Most don’t. Your AI employee takes down what they describe in their own words and gives a price only for services you’ve listed. Everything else comes to you as a lead.']
    ]
  },
  {
    slug: 'any-service-business', name: 'Any service business', kind: 'any',
    title: 'An AI employee for any service business',
    lead: 'If your phone rings, it fits. Every call answered, your listed prices given, and every lead captured.',
    hook: ['The call you’re missing', 'You’re with a customer, driving, or closed for the night. The caller wants a price and a time, and they’ll take the first business that gives them one.'],
    listed: ['Fixed prices you list, given as written', 'One listed price multiplied by the quantity the caller wants: “$2 each, so 500 is $1,000”', 'Custom services priced by the unit, with a low and high range and a minimum job', 'Hours, service area, policies and FAQs, answered from what you write'],
    faq: []
  }
];

// FAQ answers shared by every page of a kind. Checked against plan access,
// the voice rules and the price book code.
export const SHARED_FAQ = {
  measured: [
    ['Will it quote low and cost me margin?', 'It quotes only from your confirmed prices. If a price is missing, that service doesn’t quote; the job comes to you as a lead. Ranges are given as confirmed on site.'],
    ['What if the caller’s measurements are off?', 'The range reflects what they told it, which is why it’s a range and confirmed on site. On your website widget, customers have time to measure and type exact numbers.'],
    ['Do I have to price every service before I start?', 'No. Answering works right away, and each service starts quoting once its prices are complete and confirmed.'],
    ['Can callers reach me directly?', 'On Operator and QuoteDone, your AI employee transfers callers to you live during the hours you set. Outside those hours it saves a callback request with the caller’s own words.'],
    ['What does it cost?', 'Phone quoting from your price book is on QuoteDone, $279 a month for 1,200 minutes. The website quote widget is on Operator ($119) and QuoteDone. Answering starts at $69 with Starter.']
  ],
  listed: [
    ['Can it handle after-hours calls?', 'It answers every call you forward to it, any hour. On Operator and QuoteDone it transfers callers to you during the hours you set; outside them it saves a callback request with the caller’s own words. It isn’t an emergency line and doesn’t contact emergency services.'],
    ['Will callers know it’s AI?', 'It answers with your business name and its own name and doesn’t announce that it’s AI. If a caller asks whether it’s a real person, it says it’s a digital employee of your business; if they ask whether that means AI, it says yes. It never denies it.'],
    ['What does it cost?', 'Starter is $69 a month for 150 minutes and gives your listed prices. Operator, $119 for 300 minutes, adds booking and live transfer. QuoteDone, $279 for 1,200 minutes, adds phone quoting from a price book.']
  ],
  any: [
    ['What does it cost?', 'Starter is $69 a month for 150 minutes. Operator, $119 for 300 minutes, adds booking, live transfer and the website quote widget. QuoteDone, $279 for 1,200 minutes, adds phone quoting from your price book.']
  ]
};
