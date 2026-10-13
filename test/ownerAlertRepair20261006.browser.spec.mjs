import test from 'node:test';
import {controlledScenario} from './helpers/ownerAlertControlledScenario.mjs';

test('owner alert repairs: production dashboard, Calls, retry and staff visibility',{timeout:90000},async t=>{
  await t.test('owner alert retry: paused worker renders PENDING, accepts once and never resends',async t=>controlledScenario(t));
  await t.test('owner alert retry: worker before refresh renders BLOCKED, accepts once and never resends',async t=>controlledScenario(t,{consumeBeforeRefresh:true}));
});
