import React, {useEffect, useRef, useState} from 'react';
import {Volume2} from 'lucide-react';
import {api} from './api.js';
import {Button, Field, TextInput, Textarea, Toggle} from './ui.jsx';

export const PREVIEW_UNAVAILABLE = "Voice preview isn't available right now.";
// 10 ms of silence. Starting it inside the click lets the real clip play on the
// same element after the server answers (Safari only allows audio started by a click).
const SILENCE = 'data:audio/wav;base64,UklGRggCAABXQVZFZm10IBAAAAABAAEAwF0AAIC7AAACABAAZGF0YeQB' + 'A'.repeat(648);

// The greeting spoken by the phone's own model and voice, generated on the
// server. There is no browser speech fallback.
export function GreetingPreview({voiceId, greeting}) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const audio = useRef(null), mounted = useRef(true);
  useEffect(() => () => {mounted.current = false;audio.current?.pause();}, []);
  async function preview() {
    if (busy) return;
    setBusy(true);setMessage('');
    const player = audio.current || (audio.current = new Audio());
    player.pause();player.src = SILENCE;player.play()?.catch?.(() => {});
    try {
      const result = await api('/api/onboarding/voice/preview', {method: 'POST', body: {voiceId, greeting}});
      if (typeof result?.audio !== 'string' || result.mimeType !== 'audio/wav') throw Object.assign(Error(PREVIEW_UNAVAILABLE), {status: 503});
      if (!mounted.current) return;
      player.pause();player.src = 'data:audio/wav;base64,' + result.audio;
      try {await player.play();} catch {if (mounted.current) setMessage('Your browser blocked playback. Press Preview again.');}
    } catch (error) {
      if (mounted.current) setMessage(error.status >= 400 && error.status < 500 ? error.message : PREVIEW_UNAVAILABLE);
    } finally {if (mounted.current) setBusy(false);}
  }
  return <div className="greeting-preview">
    <Button icon={Volume2} variant="secondary" onClick={preview} disabled={busy || !String(greeting || '').trim()}>{busy ? 'Preparing preview' : 'Preview'}</Button>
    {message && <span role="status">{message}</span>}
  </div>;
}

// How the receptionist answers: optional agent name, voice, greeting and the
// transcription notice. Used by Settings and onboarding step 9.
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
    <GreetingPreview voiceId={form.voiceId} greeting={form.greeting} />
    <Toggle checked={form.transcriptionNotice} onChange={value => onChange('transcriptionNotice', value)} label="Tell callers the call is transcribed" sublabel="When on, your receptionist says this right after the greeting on every call." />
  </>;
}
