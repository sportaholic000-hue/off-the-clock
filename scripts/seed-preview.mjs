// Local visual-review seeding ONLY.
// Requires NODE_ENV=development and LOCAL_PREVIEW_MODE=true. Telephony and
// operator calls route through /api/dev/preview/*, registered only inside the
// localPreviewEnabled() guard and always writing operatorEnabled: 0. Nothing
// here can place a real operator live or provision a real number.

const BASE = process.env.PREVIEW_API || 'http://localhost:3000';
const EMAIL = 'preview@offtheclockai.test';
const PASSWORD = 'PreviewReview2026!';

async function call(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  return { status: res.status, json, text };
}

function note(step, result) {
  console.log(`${step}: HTTP ${result.status}`);
  if (result.status >= 400) console.log('   ->', (result.text || '').slice(0, 220));
  return result;
}

await call('/api/auth/register', { method:'POST', body:{ email:EMAIL, password:PASSWORD, firstName:'Preview', businessName:'Ridgeline Fence Co.', plan:'QuoteDone' } });
const login = note('login', await call('/api/auth/login', { method:'POST', body:{ email:EMAIL, password:PASSWORD } }));
const token = login.json?.token;
if (!token) { console.log('NO TOKEN'); process.exit(1); }

// Trades chosen to exercise the offering-subset matrix (siding + flooring)
// alongside a simple non-shaped service (fencing).
note('business-types', await call('/api/onboarding/business-types', {
  method:'POST', token,
  body:{ businessTypes:['FENCING_INSTALL','SIDING_REPLACEMENT','FLOORING_INSTALL'] }
}));

note('jurisdiction', await call('/api/business/jurisdiction', {
  method:'POST', token, body:{ country:'CA', region:'NB' }
}));

// Simulated telephony — preview path only.
note('preview/telephony', await call('/api/dev/preview/telephony', {
  method:'POST', token, body:{ existingNumber:'(506) 214-7788' }
}));

note('knowledge-base', await call('/api/onboarding/knowledge-base', {
  method:'POST', token,
  body:{
    about:'Ridgeline Fence Co. installs cedar, chain link and vinyl fencing across greater Saint John and the Kennebecasis Valley. Family run since 2009.',
    hours:'Monday to Friday 7:00 AM to 5:00 PM. Saturday 8:00 AM to noon. Closed Sunday.',
    serviceArea:'Saint John, Rothesay, Quispamsis, Hampton',
    policies:'Free estimates. Deposit due at scheduling. Balance on completion.'
  }
}));

// Simulated operator ON so the live dashboard composition is reviewable.
note('preview/operator on', await call('/api/dev/preview/operator', {
  method:'POST', token, body:{ enabled:true }
}));

// --- Price book -----------------------------------------------------------
// FENCING_INSTALL: fully priced -> QUOTING LIVE
// SIDING_REPLACEMENT: legitimate supported SUBSET (vinyl + metal only),
//   fully and consistently priced -> QUOTING LIVE
// FLOORING_INSTALL: AI-suggested drafts, unconfirmed -> NEEDS PRICING
const book = {
  defaults: { markupMode:'markup', markupPercent:30, taxMode:'TAX_MATERIALS', taxPercent:10, travelFee:0, disposalFee:75 },
  services: [
    {
      serviceType:'FENCING_INSTALL', service:'Fencing installation',
      laborPerLinearFoot:14, materialPerLinearFoot:22,
      postSpacing:8, postPrice:38, concretePerPost:18,
      postsIncludedInMaterial:false, gatePrice:285,
      minimumJob:450,
      allowAssumptionBasedQuotes:true,
      tiers:[
        { name:'Good', overrides:{ materialPerLinearFoot:18 } },
        { name:'Better', overrides:{ materialPerLinearFoot:22 } },
        { name:'Best', overrides:{ materialPerLinearFoot:29 } }
      ]
    },
    {
      // Offered subset: vinyl and metal only. Fiber cement and wood are
      // absent, which the corrected logic reads as NOT OFFERED, not free.
      serviceType:'SIDING_REPLACEMENT', service:'Siding replacement',
      laborPerSqft:{ vinyl:3.10, metal:3.80 },
      materialPerSqft:{ vinyl:4.25, metal:6.10 },
      removalPerSqft:1.20, trimPerLinearFoot:4.50,
      disposalPerSqft:0.65, minimumJob:900,
      allowAssumptionBasedQuotes:true, tiers:[]
    },
    {
      // AI-suggested drafts, deliberately unconfirmed so the confirmation
      // gate and NEEDS PRICING state are both visible.
      serviceType:'FLOORING_INSTALL', service:'Flooring installation',
      laborPerSqft:{ carpet:2.00, vinyl_plank:2.50 },
      materialPerSqft:{ carpet:3.00, vinyl_plank:3.50 },
      minimumJob:400,
      allowAssumptionBasedQuotes:true,
      source:'AI_SUGGESTED', confirmedFields:{}, tiers:[]
    }
  ]
};
note('pricebook/save', await call('/api/pricebook/save', { method:'POST', token, body: book }));

// --- Report resulting states ---------------------------------------------
const dash = await call('/api/dashboard', { token });
note('dashboard', dash);
console.log('\n=== SEEDED STATE ===');
console.log('previewActivity present:', Boolean(dash.json?.previewActivity));
console.log('operator:', JSON.stringify(dash.json?.operator));
for (const s of dash.json?.pricebookStatuses || []) {
  console.log(` - ${s.service}: ${s.status}` +
    (s.missingOwnerFields?.length ? ` (${s.missingOwnerFields.length} missing)` : '') +
    (s.incompleteOfferings?.length ? ` incompleteOfferings=${s.incompleteOfferings.join(',')}` : ''));
}
