import React from 'react';
import {Field, TextInput, Textarea, Toggle} from './ui.jsx';

// How the receptionist answers: optional agent name, voice, greeting and the
// transcription notice. Used by the Receptionist page and onboarding step 9.
export function greetingPrefill(businessName, agentName) {
  const business = String(businessName || '').trim(), name = String(agentName || '').trim();
  return name
    ? `Thanks for calling ${business}, this is ${name}. How can I help?`
    : `Thanks for calling ${business}, how can I help?`;
}

// greetingEdited: the owner has a saved greeting or has typed one. Until then
// the greeting follows the agent name.
export function initialAnswering(state) {
  const profile = state?.profile || {}, businessName = state?.account?.businessName;
  const agentName = typeof profile.agentName === 'string' ? profile.agentName : '';
  const saved = typeof profile.greeting === 'string' && profile.greeting.trim() ? profile.greeting : '';
  return {
    voiceId: profile.voiceId === 'male' ? 'male' : 'female',
    agentName,
    greeting: saved || greetingPrefill(businessName, agentName),
    transcriptionNotice: profile.transcriptionNotice === true,
    greetingEdited: Boolean(saved)
  };
}

export function updateAnswering(form, field, value, businessName) {
  if (field === 'greeting') return {...form, greeting: value, greetingEdited: true};
  const next = {...form, [field]: value};
  if (field === 'agentName' && !form.greetingEdited) next.greeting = greetingPrefill(businessName, value);
  return next;
}

export function answeringBody(form) {
  return {voiceId: form.voiceId, agentName: form.agentName.trim(), greeting: form.greeting, transcriptionNotice: form.transcriptionNotice};
}

export function ReceptionistFields({form, onChange}) {
  return <>
    <div className="choice-grid two" role="group" aria-label="Voice">
      <button type="button" aria-pressed={form.voiceId === 'female'} className={form.voiceId === 'female' ? 'choice selected' : 'choice'} onClick={() => onChange('voiceId', 'female')}>Female voice</button>
      <button type="button" aria-pressed={form.voiceId === 'male'} className={form.voiceId === 'male' ? 'choice selected' : 'choice'} onClick={() => onChange('voiceId', 'male')}>Male voice</button>
    </div>
    <Field label="Agent name" help="Optional. Leave blank and your receptionist uses no personal name.">
      <TextInput maxLength={500} value={form.agentName} onChange={event => onChange('agentName', event.target.value)} />
    </Field>
    <Field label="Greeting" help="Spoken exactly as written.">
      <Textarea maxLength={1000} rows="4" value={form.greeting} onChange={event => onChange('greeting', event.target.value)} />
    </Field>
    <Toggle checked={form.transcriptionNotice} onChange={value => onChange('transcriptionNotice', value)} label="Tell callers the call is transcribed" sublabel="When on, your receptionist says this right after the greeting on every call." />
  </>;
}
