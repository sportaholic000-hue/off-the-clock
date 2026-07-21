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
