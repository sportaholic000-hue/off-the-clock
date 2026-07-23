import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  ALL_OWNER_FIELDS,
  CLASS2_DEFAULTS_BY_SERVICE,
  SERVICE_NAMES,
  getServiceMetadata
} from '../server/priceBookMetadata.js';
import { contractorValidationMessage } from '../server/priceBookService.js';
import {
  decoratePreviewState,
  localPreviewEnabled,
  previewOperatorPatch,
  previewPhonePatch
} from '../server/src/previewMode.js';

const INTERNAL_IDENTIFIER = /\b[a-z][a-z0-9]*(?:[A-Z][A-Za-z0-9]*)+\b|\b[a-z]+(?:_[A-Za-z0-9]+)+\b/;

function assertOwnerCopy(value, context) {
  assert.equal(typeof value, 'string', `${context} must be text`);
  assert.ok(value.trim().length > 0, `${context} must not be blank`);
  assert.equal(INTERNAL_IDENTIFIER.test(value), false, `${context} exposes an internal identifier: ${value}`);
}

test('every owner field has contractor-facing label, explanation, units, and option names', () => {
  const metadata = getServiceMetadata();
  assert.equal(metadata.length, Object.keys(SERVICE_NAMES).length);

  for (const service of metadata) {
    assertOwnerCopy(service.name, `${service.serviceType} service name`);
    assert.deepEqual(service.fields.map(item => item.field), ALL_OWNER_FIELDS[service.serviceType]);

    for (const field of service.fields) {
      assertOwnerCopy(field.label, `${service.serviceType}.${field.field} label`);
      assertOwnerCopy(field.help, `${service.serviceType}.${field.field} help`);
      assert.notEqual(field.label, field.field, `${service.serviceType}.${field.field} used its key as a label`);

      if (field.options) {
        for (const option of field.options) {
          const optionLabel = field.optionLabels?.[option];
          assertOwnerCopy(optionLabel, `${service.serviceType}.${field.field}.${option} option`);
          assert.notEqual(optionLabel, option);
        }
      }

      if (field.type === 'json') {
        assert.ok(field.shapedKeys, `${service.serviceType}.${field.field} must use structured controls`);
      }
      if (field.shapedKeys) {
        assertOwnerCopy(field.shapedKeys.keyLabel, `${service.serviceType}.${field.field} row heading`);
        if (field.shapedKeys.nested) {
          for (const nestedKey of field.shapedKeys.nested) {
            const nestedCopy = field.shapedKeys.nestedCopy?.[nestedKey];
            const nestedLabel = nestedCopy?.label || nestedKey.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
            const nestedUnit = nestedCopy?.unit || field.shapedKeys.nestedUnit;
            assertOwnerCopy(nestedLabel, `${service.serviceType}.${field.field}.${nestedKey} nested label`);
            assertOwnerCopy(nestedUnit, `${service.serviceType}.${field.field}.${nestedKey} nested unit`);
            if (INTERNAL_IDENTIFIER.test(nestedKey)) assert.notEqual(nestedLabel, nestedKey);
          }
        } else {
          assertOwnerCopy(field.shapedKeys.leafUnit, `${service.serviceType}.${field.field} value unit`);
        }
      }
    }

    assert.equal(service.class2Fields.length, Object.keys(CLASS2_DEFAULTS_BY_SERVICE[service.serviceType] || {}).length);
    for (const factor of service.class2Fields) {
      assertOwnerCopy(factor.label, `${service.serviceType}.${factor.field} quantity-setting label`);
      assertOwnerCopy(factor.help, `${service.serviceType}.${factor.field} quantity-setting help`);
      assertOwnerCopy(factor.unit, `${service.serviceType}.${factor.field} quantity-setting unit`);
      assert.notEqual(factor.label, factor.field);
      assert.notEqual(factor.label, 'Quantity adjustment');
    }
  }
});

test('locked roofing labels and explanations identify the priced work', () => {
  const roof = getServiceMetadata().find(service => service.serviceType === 'ROOFING_REPLACEMENT');
  const fields = Object.fromEntries(roof.fields.map(field => [field.field, field]));
  assert.equal(fields.dripEdgePerLF.label, 'Drip edge material price per linear foot');
  assert.equal(fields.ridgeCapPerLF.label, 'Ridge cap material price per linear foot');
  assert.equal(fields.deckingPerSheet.label, 'Decking replacement price per sheet');
  assert.equal(fields.disposalPerSquare.label, 'Disposal price per roofing square');
  for (const field of ['dripEdgePerLF', 'ridgeCapPerLF', 'deckingPerSheet', 'disposalPerSquare']) {
    assert.ok(fields[field].help.length >= 70, `${field} needs a specific explanation`);
  }
});

test('contractor validation messages translate engine paths and unsupported values', () => {
  const pricebook = { services:[{ serviceType:'ROOFING_REPLACEMENT' }] };
  const translated = contractorValidationMessage('services[0].dripEdgePerLF must be a finite non-negative number', pricebook);
  assert.match(translated, /Drip edge material price per linear foot/);
  assert.equal(translated.includes('dripEdgePerLF'), false);

  const tier = contractorValidationMessage('services[0].tiers[1].overrides.disposalPerSquare is invalid', pricebook);
  assert.match(tier, /Tier 2: Disposal price per roofing square/);
  assert.equal(INTERNAL_IDENTIFIER.test(tier), false);

  const unsupported = contractorValidationMessage('vinlyMultiplier is not a supported pricing field for SIDING_REPLACEMENT', pricebook);
  assert.equal(unsupported, 'Siding replacement contains a pricing value that is not supported. Remove it before saving.');
  assert.equal(INTERNAL_IDENTIFIER.test(unsupported), false);
});

test('contractor UI has no raw identifier fallback paths', () => {
  const pricebook = readFileSync('client/src/pricebook.jsx', 'utf8');
  const dashboard = readFileSync('client/src/dashboard.jsx', 'utf8');
  const onboarding = readFileSync('client/src/onboarding.jsx', 'utf8');

  for (const forbidden of [
    /label=\{definition\.field\}/,
    />\{definition\.field\}</,
    /\{item\.field\}<\/option>/,
    />\{service\.serviceType\}</,
    /missingOwnerFields\.join/,
    /Used only when this scope or add-on is selected/
  ]) {
    assert.equal(forbidden.test(`${pricebook}\n${dashboard}\n${onboarding}`), false, `raw fallback remains: ${forbidden}`);
  }
  assert.match(pricebook, /\{item\.label\}<\/option>/);
  assert.match(pricebook, /definition\.help/);

  const auth = readFileSync('server/src/auth.js', 'utf8');
  const onboardingService = readFileSync('server/src/onboardingService.js', 'utf8');
  assert.equal(auth.includes("error: 'email, password, firstName, businessName"), false);
  assert.equal(onboardingService.includes("new Error('firstName, businessName"), false);
  assert.equal(onboardingService.includes("new Error('voiceId, agentName"), false);
  assert.match(auth, /first name, business name/);
  assert.match(onboardingService, /Choose a voice, enter an agent name, and enter a greeting/);
});

test('local telephony preview is explicit, inert, and impossible in production', () => {
  assert.equal(localPreviewEnabled({ NODE_ENV:'development', LOCAL_PREVIEW_MODE:'true' }), true);
  assert.equal(localPreviewEnabled({ NODE_ENV:'development' }), false);
  assert.equal(localPreviewEnabled({ NODE_ENV:'production', LOCAL_PREVIEW_MODE:'true' }), false);

  const baseProfile = { onboardingStep:4, operatorEnabled:1, knowledgeBase:{ about:'Local contractor', hours:'Mon-Fri' } };
  const phonePatch = previewPhonePatch(baseProfile, '(506) 555-0182');
  assert.equal(phonePatch.twilioNumber, null);
  assert.equal(phonePatch.twilioNumberSid, null);
  assert.equal(phonePatch.operatorEnabled, 0);
  assert.equal(phonePatch.phoneProvisioningStatus, 'simulated_preview');

  const simulatedProfile = { ...baseProfile, ...phonePatch };
  const operatorPatch = previewOperatorPatch(simulatedProfile, true);
  assert.equal(operatorPatch.operatorEnabled, 0);
  assert.equal(operatorPatch.carrierSetupStatus, 'simulated_preview_on');

  const state = { profile:{ ...simulatedProfile, ...operatorPatch }, operator:{ enabled:false, eligible:false, missing:[] } };
  const productionState = decoratePreviewState(state, { NODE_ENV:'production', LOCAL_PREVIEW_MODE:'true' });
  assert.equal(productionState.preview, undefined);
  const developmentState = decoratePreviewState(state, { NODE_ENV:'development', LOCAL_PREVIEW_MODE:'true' });
  assert.deepEqual(developmentState.preview, { enabled:true, telephonySimulated:true, operatorSimulated:true });
  assert.equal(developmentState.operator.enabled, false);
  assert.equal(developmentState.operator.simulatedEnabled, true);
});

test('preview endpoints are registered only inside the development guard', () => {
  const server = readFileSync('server/src/server.js', 'utf8');
  const guardedRoutes = server.match(/if \(localPreviewEnabled\(\)\) \{([\s\S]*?)\n\}/)?.[1] || '';
  assert.match(guardedRoutes, /\/api\/dev\/preview\/telephony/);
  assert.match(guardedRoutes, /\/api\/dev\/preview\/operator/);
  assert.equal((server.match(/\/api\/dev\/preview\/telephony/g) || []).length, 1);
  assert.equal((server.match(/\/api\/dev\/preview\/operator/g) || []).length, 1);

  const onboarding = readFileSync('client/src/onboarding.jsx', 'utf8');
  const dashboard = readFileSync('client/src/dashboard.jsx', 'utf8');
  assert.match(onboarding, /Local visual preview only/);
  assert.match(onboarding, /No telephony connection exists/);
  assert.match(dashboard, /SIMULATED FOR VISUAL REVIEW/);
  assert.match(dashboard, /NO CALLS ARE ROUTED/);
});

test('the customer-facing quote preview never renders owner-only line items', () => {
  const pricebook = readFileSync('client/src/pricebook.jsx', 'utf8');
  const previewBlock = pricebook.slice(
    pricebook.indexOf('function Preview('),
    pricebook.indexOf('export default function PriceBook')
  );
  // The preview is labelled "what your customer hears". The engine's canonical
  // customer view (sanitizeForCustomer) strips lineItems and exposes
  // priceDrivers, so the preview must render priceDrivers and never lineItems.
  // Every engine line item (labor, material, removal, markup, tax, ...) is
  // customerVisible:false, so rendering lineItems at all leaks owner data.
  assert.equal(/lineItems/.test(previewBlock.replace(/\/\/.*$/gm, '')), false,
    'the preview must not reference lineItems at all (owner-only data)');
  assert.match(previewBlock, /priceDrivers/);
});

test('owner-only line items are flagged customerVisible false by the engine', async () => {
  const engine = readFileSync('server/quoteEngine.js', 'utf8');
  for (const name of ['Markup', 'Minimum Price Adjustment', 'Peak season adjustment', 'Tax']) {
    const index = engine.indexOf(`name:'${name}'`);
    assert.equal(index >= 0, true, `${name} line item should exist`);
    const declaration = engine.slice(index, index + 220);
    assert.match(declaration, /customerVisible:false/,
      `${name} must be marked customerVisible:false`);
  }
});

test('the quote preview renders customer-safe priceDrivers, not raw line items', () => {
  const pricebook = readFileSync('client/src/pricebook.jsx', 'utf8');
  const preview = pricebook.slice(
    pricebook.indexOf('function Preview('),
    pricebook.indexOf('export default function PriceBook')
  );
  // Must render priceDrivers (the engine's sanitized customer strings).
  assert.match(preview, /active\?\.priceDrivers/);
  assert.match(preview, /quote-driver-list/);
  // Must NOT render raw lineItems in the customer view (owner-only amounts).
  assert.equal(/\.lineItems\b.*\.map/.test(preview.replace(/\/\/.*$/gm, '')), false,
    'preview must not map over lineItems');
  // Must not print per-item dollar amounts from lineItems.
  assert.equal(/item\.amountCents/.test(preview), false,
    'preview must not display raw line-item amounts');
});

test('sanitizeForCustomer strips lineItems and exposes only safe fields', async () => {
  const { sanitizeForCustomer } = await import('../server/quoteEngine.js');
  const result = {
    resultType: 'INSTANT_ESTIMATE_READY',
    lineItems: [{ name: 'Markup', category: 'markup', amountCents: 40000, customerVisible: false }],
    options: [{
      tierName: 'Standard', lowEstimate: 100, highEstimate: 200, midEstimate: 150,
      priceDrivers: ['Labor', 'Materials'], skippedAddons: [], disclaimer: 'x',
      lineItems: [{ name: 'Markup', category: 'markup', amountCents: 40000, customerVisible: false }]
    }]
  };
  const safe = sanitizeForCustomer(result);
  assert.equal(safe.lineItems, undefined, 'top-level lineItems stripped');
  assert.equal(safe.options[0].lineItems, undefined, 'per-option lineItems stripped');
  assert.deepEqual(safe.options[0].priceDrivers, ['Labor', 'Materials']);
  assert.equal(JSON.stringify(safe).includes('Markup'), false, 'no owner-only line names survive');
});

test('skipped add-ons are distinguished explicitly in the preview', () => {
  const pricebook = readFileSync('client/src/pricebook.jsx', 'utf8');
  const preview = pricebook.slice(
    pricebook.indexOf('function Preview('),
    pricebook.indexOf('export default function PriceBook')
  );
  assert.match(preview, /skippedAddons\?\.length/);
  assert.match(preview, /skipped-addon-list/);
  // Skipped add-ons must render as their own rows, not just folded into the disclaimer.
  assert.match(preview, /active\.skippedAddons\.map/);
});

test('--edge is a border token and is never used as a text colour', () => {
  const css = readFileSync('client/src/styles.css', 'utf8');
  // --edge is #3A423A: 1.90:1 against the page background, far below the WCAG
  // AA 4.5:1 floor for small text. It is legitimate for borders only.
  // --muted (#7A847A) is the dimmest permitted text colour: 5.10:1 on the page
  // and 4.68:1 on raised cards.
  const textUses = css.split('\n').filter(line => {
    const stripped = line.replace(/border-color:\s*var\(--edge\)/g, '');
    return /(?<!border-)color:\s*var\(--edge\)/.test(stripped);
  });
  assert.deepEqual(textUses, [],
    `--edge must not be used as a text colour; found: ${textUses.join(' | ')}`);
  assert.match(css, /--muted:\s*#[0-9A-Fa-f]{6}/, '--muted text token must be defined');

  // Contrast is the property that matters, not a specific hex. Every text
  // token must clear WCAG AA (4.5:1) against the page background, measured
  // rather than assumed. Contractors read this on a phone in a truck.
  const relLum = hex => {
    const v = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map(c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  };
  const contrast = (a, b) => {
    const [hi, lo] = [relLum(a), relLum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const page = '#0A0A0A';
  for (const token of ['gray', 'muted', 'white']) {
    const found = css.match(new RegExp(`--${token}:\\s*(#[0-9A-Fa-f]{6})`));
    assert.ok(found, `--${token} must be defined`);
    const ratio = contrast(found[1], page);
    assert.ok(ratio >= 4.5,
      `--${token} (${found[1]}) is ${ratio.toFixed(2)}:1 against the page background; needs 4.5:1 for small text`);
  }

  // No text may render below 11px. Smaller than that is unreadable for many
  // users regardless of contrast.
  const tooSmall = [...css.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)]
    .map(m => Number(m[1])).filter(size => size < 11);
  assert.deepEqual(tooSmall, [],
    `text smaller than 11px found: ${tooSmall.join(', ')}px`);
});

test('a titled field renders exactly one supporting line, not two', () => {
  const pricebook = readFileSync('client/src/pricebook.jsx', 'utf8');
  // A field with a concise title already carries the full authoritative
  // definition as its supporting line. Rendering `help` as well produced two
  // supporting lines saying overlapping things, which read as one merged
  // paragraph. Titled fields show the authoritative definition; untitled
  // fields show help.
  assert.match(pricebook, /hasTitle \? \(/);
  assert.match(pricebook, /owner-field-definition/);
  // The unconditional help span must not remain.
  assert.equal(
    /\{hasTitle && <span className="owner-field-definition">[\s\S]*?<span className="owner-field-help">/.test(pricebook),
    false,
    'help must not render alongside the authoritative definition');
});

test('the price-book sidebar does not share a class with the dashboard rows', () => {
  const css = readFileSync('client/src/styles.css', 'utf8');
  const pricebook = readFileSync('client/src/pricebook.jsx', 'utf8');
  const dashboard = readFileSync('client/src/dashboard.jsx', 'utf8');

  // .service-row was used by BOTH the full-width dashboard rows and the 245px
  // price-book sidebar. The dashboard rule came later in the stylesheet and
  // silently won, applying 14px padding and 14px gaps to a narrow sidebar and
  // squeezing service names until they broke mid-word. The sidebar now uses
  // .service-pick so the two cannot collide.
  assert.match(pricebook, /service-pick/,
    'the price-book sidebar must use .service-pick');
  assert.equal(/className=\{[^}]*'service-row/.test(pricebook), false,
    'the price-book sidebar must not reuse .service-row');
  assert.match(dashboard, /className="service-row"/,
    'the dashboard keeps .service-row');

  // Sidebar names must break between words only. Mid-word breaking in a narrow
  // column produced one letter-fragment per line.
  const pick = css.slice(css.indexOf('.service-pick strong'));
  const block = pick.slice(0, pick.indexOf('}') + 1);
  assert.match(block, /overflow-wrap: normal/);
  assert.match(block, /word-break: normal/);
  assert.equal(/break-word|anywhere/.test(block), false,
    'sidebar service names must not break mid-word');
});

test('button labels are never repainted by container descendant selectors', () => {
  const css = readFileSync('client/src/styles.css', 'utf8');

  // The Button component wraps its label in a <span>. A container rule using a
  // bare descendant selector (e.g. `.integration-row span { color: ... }`)
  // silently repaints that label. On the Google Calendar step this rendered
  // --gray on the green primary button at 1.37:1 -- effectively invisible.
  assert.match(css, /\.button > span \{ color: inherit; \}/,
    'button labels must inherit their colour from the button variant');

  // No container rule may target a bare descendant span with a colour, since
  // any button placed inside it would be repainted.
  const risky = css.split('\n').filter(line =>
    /^\.[a-z-]+ span \{/.test(line) && /color:/.test(line));
  assert.deepEqual(risky, [],
    `container rules repainting descendant spans: ${risky.join(' | ')}`);
});

test('draft validation never clears known statuses or reports failure while typing', () => {
  const pricebook = readFileSync('client/src/pricebook.jsx', 'utf8');
  const effect = pricebook.slice(
    pricebook.indexOf('if (!book || locked) return;'),
    pricebook.indexOf('}, [book, locked]);')
  );

  // The user-visible failure: typing one character cleared every service's
  // status, so chips that were QUOTING LIVE flashed to NEEDS PRICING on every
  // keystroke. The validation effect must not clear statuses.
  assert.equal(/setStatuses\(null\)/.test(effect), false,
    'the validation effect must not clear statuses while typing');

  // A failed validation must not fabricate NEEDS PRICING for every service.
  assert.equal(/status:\s*'NEEDS PRICING'/.test(effect), false,
    'validation failure must not synthesise NEEDS PRICING for every service');

  // Out-of-order guard: a slow earlier response must not overwrite a newer one.
  // BOTH the success and failure paths must discard stale responses. Guarding
  // only one still lets an older response overwrite a newer result.
  const guards = (effect.match(/validationSeq\.current !== seq/g) || []).length;
  assert.ok(guards >= 2,
    `both the success and failure handlers must discard stale responses; found ${guards} guard(s)`);
  assert.match(pricebook, /const validationSeq = useRef\(0\)/);

  // The pre-first-validation state is unknown, not failing.
  assert.match(pricebook, /status:\s*'CHECKING'/);
  const display = pricebook.slice(pricebook.indexOf('function displayStatus'),
                                  pricebook.indexOf('const selectedStatus'));
  assert.equal(/statuses === null/.test(display), false,
    'displayStatus must not treat an in-flight validation as a failing status');
});

test('each onboarding step renders exactly one heading composition', () => {
  const onboarding = readFileSync('client/src/onboarding.jsx', 'utf8');

  // Each step supplies its own PageHeader with "Step N of 9", a meaningful
  // title and a description. The shell previously added a second generic
  // heading, so every step showed the step counter twice and two stacked
  // titles.
  const shell = onboarding.slice(onboarding.indexOf('<div className="step-body">'),
                                 onboarding.indexOf('</main>'));
  assert.equal(/className="step-heading"/.test(shell), false,
    'the onboarding shell must not add a second heading block');
  assert.equal(/Step \{step\} of \{STEPS\.length\}/.test(shell), false,
    'the shell must not render its own step counter');

  // Every step keeps its own counter and a meaningful title.
  const counters = (onboarding.match(/eyebrow="Step \d+ of 9"/g) || []).length;
  assert.ok(counters >= 9, `expected a step counter per step, found ${counters}`);
  // Titles must be meaningful, not just the rail's short names.
  for (const title of ['Your account', 'Build your price book', 'Connect your calendar']) {
    assert.ok(onboarding.includes(title), `step title "${title}" must be preserved`);
  }
});

test('the dashboard blocker section is bounded and grouped by service', () => {
  const dashboard = readFileSync('client/src/dashboard.jsx', 'utf8');

  // The user-visible failure: one checklist row per missing field across every
  // service. A 20-trade account produced 112 rows above the rest of the
  // dashboard. Rows are now grouped by service and capped.
  assert.equal(/flatMap\([\s\S]{0,200}missingOwnerFields/.test(dashboard), false,
    'blockers must not be flattened into one row per missing field');
  assert.match(dashboard, /MAX_SERVICE_GROUPS/);
  assert.match(dashboard, /shownGroups = blockerGroups\.slice\(0, MAX_SERVICE_GROUPS\)/);

  // Hidden remainder must be truthfully counted, not silently dropped.
  assert.match(dashboard, /hiddenServiceCount/);
  assert.match(dashboard, /hiddenFieldCount/);
  assert.match(dashboard, /blocker-more/);

  // Deep-link into the specific service AND its first missing requirement.
  assert.match(dashboard, /pricebook\?service=\$\{encodeURIComponent\(group\.serviceType\)\}&field=\$\{encodeURIComponent\(group\.firstField\)\}/);
});

test('the dashboard has a page-level vertical rhythm, not per-card margins', () => {
  const css = readFileSync('client/src/styles.css', 'utf8');

  // The user-visible failure: every major dashboard region rendered with a 0px
  // gap, fusing the operator control, banners, priority action, counters and
  // bands into one slab. The regions are direct children of .dashboard-page,
  // so the page owns the spacing -- conditional sections can appear or
  // disappear without leaving a double gap or a fused seam.
  const page = css.slice(css.indexOf('.dashboard-page {'));
  const block = page.slice(0, page.indexOf('}') + 1);
  assert.match(block, /display: flex/);
  assert.match(block, /flex-direction: column/);
  assert.match(block, /gap: var\(--rhythm\)/);
  assert.match(css, /--rhythm:\s*\d+px/, 'a rhythm token must be defined');

  // The old one-off notice margin would double the gap now that the page owns
  // spacing; it must not come back.
  assert.equal(/\.dashboard-page > \.notice \{ margin-top/.test(css), false,
    'individual dashboard cards must not carry one-off margins');
});

test('the AI interview never asks for or speaks raw JSON', () => {
  const onboarding = readFileSync('client/src/onboarding.jsx', 'utf8');
  const structured = readFileSync('client/src/interviewStructuredValue.js', 'utf8');

  // The user-visible failure: structured pricing fields rendered a textarea
  // with the placeholder {"key": 0} and the readback spoke that raw text.
  assert.equal(/placeholder='\{"key"/.test(onboarding), false,
    'no JSON placeholder may remain');
  assert.equal(/\{"[a-z_]+":\s*\d/.test(onboarding), false,
    'no serialized JSON example may appear in the interview UI');
  assert.equal(/JSON\.parse\(raw\)/.test(onboarding), false,
    'structured answers must not be parsed from typed text');

  // Structured questions are rendered by the dedicated component.
  assert.match(onboarding, /<StructuredPricingQuestion/);
  // The readback is a human sentence, not the value stringified.
  assert.match(onboarding, /describeStructuredValue\(value, current\.shapedKeys/);

  // The describe helper must never serialize.
  assert.equal(/JSON\.stringify/.test(structured), false,
    'structured descriptions must never serialize the value');
});

test('structured interview answers keep the exact shape validation expects', async () => {
  const { structuredShape, validateStructuredValue, describeStructuredValue } =
    await import('../client/src/interviewStructuredValue.js');

  const nested = { nested:['small','medium','large'], keyLabel:'Repair type', leafUnit:'hours' };
  const selectable = { keys:['hardwood','carpet'], ownerSelectable:true, keyLabel:'Flooring type', leafUnit:'$ per sq ft' };
  const fixed = { keys:['small','medium','large','mixed'], keyLabel:'Plant size', leafUnit:'$ per plant' };
  const open = { keys:null, keyLabel:'Membrane type', leafUnit:'$ per sq ft' };

  assert.equal(structuredShape(nested), 'NESTED');
  assert.equal(structuredShape(selectable), 'OWNER_SELECTABLE');
  assert.equal(structuredShape(fixed), 'FIXED_KEYS');
  assert.equal(structuredShape(open), 'OPEN');

  // Nested: every size of every enabled type is required, and the message must
  // name the missing size so the owner knows what to do.
  // Two independent branches reject an incomplete row (missing-value and
  // positive-amount), so an enabled type can never reach confirmation with a
  // gap. Both must name the offending size in plain language.
  const partial = validateStructuredValue({ shingle:{ small:1 } }, nested, 'x');
  assert.ok(partial, 'a nested row missing a size must be rejected');
  assert.match(partial, /Medium/, `the message must name the missing size: ${partial}`);
  assert.match(partial, /Shingle/, 'the message must name the row');
  assert.equal(/[{}]|":/.test(partial), false, 'the message must not contain JSON');
  // A blank string is the same as missing.
  const blanks = validateStructuredValue({ shingle:{ small:1, medium:'', large:'' } }, nested, 'x');
  assert.ok(blanks, 'blank sizes must be rejected');
  assert.match(blanks, /Medium/);
  assert.equal(validateStructuredValue({ shingle:{ small:1, medium:2, large:3 } }, nested, 'x'), null);

  // Owner-selectable: an offered product must be priced; absent means not offered.
  assert.ok(validateStructuredValue({}, selectable, 'x'), 'no offering enabled must be rejected');
  assert.ok(validateStructuredValue({ hardwood:0 }, selectable, 'x'), 'zero is not a price');
  assert.equal(validateStructuredValue({ hardwood:3.5 }, selectable, 'x'), null,
    'a supported subset is valid');

  // Fixed keys: all of them required.
  assert.ok(validateStructuredValue({ small:1 }, fixed, 'x'), 'a missing fixed key must be rejected');
  assert.equal(validateStructuredValue({ small:1, medium:2, large:3, mixed:4 }, fixed, 'x'), null);

  // Descriptions are human sentences containing no JSON punctuation.
  const spoken = describeStructuredValue({ hardwood:3.5 }, selectable, 'Flooring labor');
  assert.equal(/[{}]|":/.test(spoken), false, `spoken text must not contain JSON: ${spoken}`);
  assert.match(spoken, /Not offered: Carpet/, 'unpicked products are named as not offered');
});

test('the interview states a truthful question count, not a fixed time', () => {
  const onboarding = readFileSync('client/src/onboarding.jsx', 'utf8');
  assert.equal(/about 15 minutes/i.test(onboarding), false,
    'the fixed completion-time claim must be gone');
  assert.match(onboarding, /\{interviewFields\.length\} pricing/,
    'the interview must state its real question count');
  assert.match(onboarding, /\{available\.length\}/,
    'the interview must state how many services are included');
});

test('resuming an interview restores a partially completed structured answer', () => {
  const onboarding = readFileSync('client/src/onboarding.jsx', 'utf8');
  // Resume previously left rawValue blank, discarding partial structured work.
  assert.match(onboarding, /function savedValueFor\(loadedDraft, index\)/);
  assert.match(onboarding, /setRawValue\(savedValueFor\(result\.draft, index\)\)/);
  // Structured fields resume as an object, scalars as a string.
  assert.match(onboarding, /stored && typeof stored === 'object' && !Array\.isArray\(stored\)/);
});

test('the onboarding grid columns can shrink below their content width', () => {
  const css = readFileSync('client/src/styles.css', 'utf8');

  // A bare `1fr` track has min-width:auto, so a wide child expands the column
  // past the viewport and takes the whole page with it. At 375px a structured
  // pricing question rendered 802px wide inside a 1314px grid column.
  // minmax(0,1fr) lets the column shrink, which is what makes the single-column
  // mobile layout actually hold.
  const desktop = css.match(/\.onboarding-page \{ display: grid; grid-template-columns: ([^;]+);/);
  assert.ok(desktop, '.onboarding-page grid rule must exist');
  assert.match(desktop[1], /minmax\(0, ?1fr\)/,
    `the content column must be shrinkable, found: ${desktop[1]}`);

  const mobile = css.match(/@media \(max-width: 900px\)[\s\S]*?\.onboarding-page \{ grid-template-columns: ([^;]+);/);
  assert.ok(mobile, 'the mobile onboarding grid rule must exist');
  assert.match(mobile[1], /minmax\(0, ?1fr\)/,
    `the mobile column must be shrinkable, found: ${mobile[1]}`);

  // The interview panel must not expand its grid cell either.
  assert.match(css, /\.interview-field, \.interview-complete \{[^}]*min-width: 0/);
});
