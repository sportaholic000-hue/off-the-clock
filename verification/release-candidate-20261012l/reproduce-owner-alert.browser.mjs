// Diagnostic reproduction: exercise the previously unobserved browser ordering.
// The old test's PENDING assertion is deliberately evaluated as false; this is
// evidence of a harness assumption, not a tolerated application/test failure.
import test from 'node:test';
import {controlledScenario} from '../../test/helpers/ownerAlertControlledScenario.mjs';
test('candidate l controlled browser reproduction: worker consumes retry before refresh',{timeout:90000},async t=>controlledScenario(t,{consumeBeforeRefresh:true}));
