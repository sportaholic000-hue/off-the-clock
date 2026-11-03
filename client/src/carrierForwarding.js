// Carrier forwarding steps, each taken from the carrier's own help page or,
// where that page publishes no codes, the standard mobile (GSM) codes.
// Checked October 29, 2026. Every step uses the owner's actual receptionist number.

export const CARRIERS = Object.freeze({
  US: Object.freeze([
    {id: 'verizon', name: 'Verizon'},
    {id: 'att', name: 'AT&T'},
    {id: 'tmobile', name: 'T-Mobile'},
    {id: 'other', name: 'Another carrier'}
  ]),
  CA: Object.freeze([
    {id: 'bell', name: 'Bell'},
    {id: 'rogers', name: 'Rogers'},
    {id: 'telus', name: 'TELUS'},
    {id: 'other', name: 'Another carrier'}
  ])
});

// "+15065550101" -> "5065550101" (North American 10 digits), or null.
export function tenDigits(number) {
  const digits = String(number || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  return digits.length === 10 ? digits : null;
}

export function carrierForwarding(carrierId, number) {
  const n = tenDigits(number);
  if (!n) return null;
  switch (carrierId) {
    case 'verizon': return {
      steps: [
        {label: 'Missed calls only (busy or no answer)', dial: '*71' + n},
        {label: 'Every call', dial: '*72' + n},
        {label: 'Turn forwarding off', dial: '*73'}
      ],
      notes: [],
      help: {label: 'Verizon call forwarding help', url: 'https://www.verizon.com/articles/call-forwarding-everything-you-need-to-know/'}
    };
    case 'tmobile': return {
      steps: [
        {label: 'No answer', dial: '**61*1' + n + '#'},
        {label: 'Busy', dial: '**67*1' + n + '#'},
        {label: 'Phone off or no signal', dial: '**62*1' + n + '#'},
        {label: 'Every call', dial: '**21*1' + n + '#'},
        {label: 'Turn all forwarding off', dial: '##004#'}
      ],
      notes: ['To choose how long your phone rings before a missed call forwards, dial **61*1' + n + '**SECONDS# using 5 to 30 seconds.'],
      help: {label: 'T-Mobile short codes', url: 'https://www.t-mobile.com/support/plans-features/self-service-short-codes'}
    };
    case 'att': return {
      steps: [
        {label: 'Missed calls (busy, no answer or phone off)', dial: '*004*' + n + '#'},
        {label: 'Every call', dial: '**21*' + n + '#'},
        {label: 'Turn all forwarding off', dial: '##004#'}
      ],
      notes: ['AT&T says call forwarding overrides your voicemail and can only be changed from the phone itself.',
        'AT&T’s help page lists no dial codes; these are the standard mobile codes. If one is rejected, use your phone’s call forwarding menu or contact AT&T.'],
      help: {label: 'AT&T call forwarding help', url: 'https://www.att.com/support/article/wireless/KM1011513/'}
    };
    case 'rogers': return {
      steps: [
        {label: 'No answer', dial: '*61*' + n + '#'},
        {label: 'Busy', dial: '**67*' + n + '#'},
        {label: 'Phone off or no signal', dial: '*62*' + n + '#'},
        {label: 'Every call', dial: '**21*' + n + '#'},
        {label: 'Turn each one off', dial: '##61#, ##67#, ##62#, ##21#'}
      ],
      notes: ['Rogers says conditional forwarding will not work while voicemail is on. Ask Rogers to turn off voicemail on this line first.'],
      help: {label: 'Rogers forwarding codes', url: 'https://www.rogers.com/customer/support/article/what-are-the-codes-for-call-forwarding-for-my-wireless-device'}
    };
    case 'bell': return {
      steps: [
        {label: 'Set it up', text: 'Open your phone’s Call settings, choose Call forwarding, pick the call type (all calls, or only calls you don’t answer) and enter ' + n + '.'},
        {label: 'Turn it off', text: 'Use the same menu, or choose Deactivate all to restore voicemail.'}
      ],
      notes: ['Bell charges $0.25 a minute for forwarded calls unless call forwarding is added to your plan for a monthly fee. Check your plan before turning it on.'],
      help: {label: 'Bell call forwarding help', url: 'https://support.bell.ca/mobility/rate_plans_features/how_to_use_call_forwarding_on_my_mobile_phone'}
    };
    case 'telus': return {
      steps: [
        {label: 'No answer', dial: '*61*' + n + '#'},
        {label: 'Busy', dial: '*67*' + n + '#'},
        {label: 'Phone off or no signal', dial: '*62*' + n + '#'},
        {label: 'Every call', dial: '*21*' + n + '#'},
        {label: 'Turn all forwarding off', dial: '##004#'}
      ],
      notes: ['These are the standard mobile codes. TELUS’s help article has its own step-by-step instructions.'],
      help: {label: 'TELUS call forwarding help', url: 'https://www.telus.com/en/business/support/article/call-forward-mobile'}
    };
    case 'other': return {
      steps: [{label: 'Ask your carrier', text: 'Ask how to forward calls you don’t answer, decline or miss while busy or unreachable to ' + n + '.'}],
      notes: [],
      help: null
    };
    default: return null;
  }
}
