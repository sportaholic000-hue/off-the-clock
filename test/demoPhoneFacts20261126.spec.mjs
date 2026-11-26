import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {demoInstructions} from '../server/src/demo/demoInstructions.js';
import {HOLD_CALL_MAX_SECONDS} from '../server/src/voice/toolSchemas.js';

// The website demo states only facts, so what it says the phone receptionist does
// has to be what the phone receptionist does.
// HANDWRITTEN EXPECTATIONS, before execution:
// - the measurement sentence the demo quotes is the one the phone speaks with a price
//   (voiceQuotePresentation.js spokenVoiceQuote), not the sentence from the written copy,
//   which the phone stopped reading out on 2026-11-12;
// - the demo knows callers can be asked to hold: a check-in after each minute of
//   silence and a goodbye after five minutes, the numbers the call bridge uses
//   (holdCheckMs 60,000 and HOLD_CALL_MAX_SECONDS 300).
const SPOKEN="That's based on the measurements you gave me, and it gets confirmed on site before any work starts.";
const WRITTEN='This price is based on the measurements you gave us. The business will confirm them on site.';
const presentation=readFileSync(new URL('../server/src/voice/voiceQuotePresentation.js',import.meta.url),'utf8');
const bridge=readFileSync(new URL('../server/src/voice/geminiMediaBridge.js',import.meta.url),'utf8');

for(const name of ['Miles','Nova'])test('demo ('+name+'): the measurement sentence is the one spoken on the phone',()=>{
  const text=demoInstructions(name);
  assert.ok(presentation.includes(JSON.stringify(SPOKEN)),'the phone speaks this sentence');
  assert.ok(text.includes('the receptionist tells the caller so with the price, for example: "'+SPOKEN+'"'));
  // "for example": with two or three options the phone words it for all of them.
  assert.ok(presentation.includes(JSON.stringify("That's all based on the measurements you gave me, and it all gets confirmed on site before any work starts.")));
  assert.equal(text.includes(WRITTEN),false,'the written-copy sentence is not presented as spoken');
});

test('demo: knows the receptionist can hold, with the call bridge\'s own timings',()=>{
  const text=demoInstructions('Miles');
  assert.equal(HOLD_CALL_MAX_SECONDS,300);assert.match(bridge,/holdCheckMs:60_000/);
  assert.equal(text.split('- If a caller needs a moment, for example to go measure something or find a detail, the receptionist tells them to take their time and waits quietly on the line. It checks in after each minute of silence. After five minutes of silence it asks once more whether they are still there, then says goodbye and ends the call.\n').length,2);
});

// The docs page "How your AI employee behaves" states the same hold and silence
// timings. HANDWRITTEN EXPECTATIONS, before execution: the page source has one entry
// for holding (check-in each minute, goodbye after five minutes) and one for ending the
// call (asks after 10 seconds of silence, goodbye after another 10), and the call bridge
// uses silenceMs 10,000, holdCheckMs 60,000 and a 300-second hold limit.
test('docs: holding and call-ending behaviour match the call bridge', async () => {
  const { AGENT_RULES } = await import('../site/build/content.mjs');
  const rule = title => AGENT_RULES.find(entry => entry[0] === title)?.[1];
  assert.equal(rule('Holding while a caller checks something'), 'If a caller needs a moment, for example to measure, it tells them to take their time and waits on the line. It checks in after each minute of silence. After five minutes of silence it asks once more, then says goodbye and ends the call.');
  assert.equal(rule('Ending the call'), 'It says goodbye and hangs up when the caller is finished. If the line goes quiet for 10 seconds, it asks whether the caller is still there; after another 10 seconds of silence it says goodbye and ends the call.');
  assert.match(bridge, /silenceMs:10_000/); assert.match(bridge, /holdCheckMs:60_000/); assert.equal(HOLD_CALL_MAX_SECONDS, 300);
  const page = readFileSync(new URL('../site/www/docs/your-ai-employee/index.html', import.meta.url), 'utf8');
  assert.ok(page.includes('Holding while a caller checks something') && page.includes('after another 10 seconds of silence'), 'the built page carries both entries');
});
