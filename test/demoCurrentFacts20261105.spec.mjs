// Owner rulings 2026-11-05: the website demo knows the current product
// (receptionist settings, summaries, languages, emergencies, ending calls,
// the free trial with a card) and uses natural filler words like "um" and "hmm".
// Expected wording written before execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import { demoInstructions } from '../server/src/demo/demoInstructions.js';

const expected = {
  settings: 'a male or a female voice, a name for the receptionist, and their own greeting, which is spoken exactly as they write it.',
  knowledge: 'During setup, Off The Clock can read the owner\'s website and draft that information; the owner reviews and edits it before the receptionist uses it.',
  summaries: 'After every call, the owner gets an email with a short summary of the call, and the dashboard has the summary and the full transcript.',
  languages: 'It replies in the caller\'s language and switches when the caller speaks a full sentence in another language or asks it to.',
  emergency: 'the receptionist first tells them to hang up and call 911 or their local emergency number, then flags the call as urgent for the owner.',
  endCall: 'The receptionist says goodbye and hangs up on its own when the call is done.',
  trial: 'A card is needed to start it, and the paid plan starts when the 14 days end unless the owner cancels before then.',
  minutes: 'The owner gets an email when 60, 30 and 0 included minutes are left.',
  // Owner ruling 2026-11-12: one free trial per business.
  oneTrial: 'The free trial is available once per business.',
  noNamedIntegrations: 'There is no built-in connection to Jobber, QuickBooks or other named software; never claim one.',
  notice: 'That notice is off unless the owner turns it on.',
  fillers: 'like "um", "hmm", "so" or "right"'
};

for (const name of ['Miles', 'Nova']) test(`demo current facts 20261105: ${name}`, () => {
  const text = demoInstructions(name);
  for (const [fact, line] of Object.entries(expected)) assert.equal(text.split(line).length, 2, `${fact} must appear exactly once`);
  assert.match(text, /The trial is free/);
  assert.doesNotMatch(text, /have not paid for Off The Clock before/);
  assert.match(text, /if asked whether you speak another language, say yes/);
});
