import React, {useEffect, useRef, useState} from 'react';
import {Volume2} from 'lucide-react';
import {api} from './api.js';
import {Button, Field, TextInput, Textarea, Toggle} from './ui.jsx';
import {defaultAgentName} from '../../server/src/voice/agentNames.js';

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

// How the receptionist answers: agent name (required), voice, greeting and the
// transcription notice. Used by Settings and onboarding step 9.
export function greetingPrefill(businessName, agentName) {
  const business = String(businessName || '').trim(), name = String(agentName || '').trim();
  return `Thanks for calling ${business}, this is ${name}. How can I help?`;
}

// greetingEdited: the owner has a saved greeting or has typed one. Until then
// the greeting follows the agent name.
export function initialAnswering(state) {
  const profile = state?.profile || {}, businessName = state?.account?.businessName;
  const voiceId = profile.voiceId === 'male' ? 'male' : 'female';
  // A blank saved name shows the default name for the voice.
  const agentName = typeof profile.agentName === 'string' && profile.agentName.trim() ? profile.agentName : defaultAgentName(voiceId);
  const saved = typeof profile.greeting === 'string' && profile.greeting.trim() ? profile.greeting : '';
  return {
    voiceId,
    agentName,
    greeting: saved || greetingPrefill(businessName, agentName),
    transcriptionNotice: profile.transcriptionNotice === true,
    greetingEdited: Boolean(saved)
  };
}

export function updateAnswering(form, field, value, businessName) {
  if (field === 'greeting') return {...form, greeting: value, greetingEdited: true};
  const next = {...form, [field]: value};
  // Switching voice: a name that is still the old voice's default becomes the
  // new voice's default. A name the owner typed stays.
  if (field === 'voiceId' && value !== form.voiceId && String(form.agentName || '').trim() === defaultAgentName(form.voiceId)) next.agentName = defaultAgentName(value);
  // The greeting follows the name until the owner edits it; a blank name leaves it as it is.
  if ((field === 'agentName' || field === 'voiceId') && !form.greetingEdited && String(next.agentName || '').trim()) next.greeting = greetingPrefill(businessName, next.agentName);
  return next;
}

// Save and Finish setup need a name and a greeting.
export function answeringComplete(form) {
  return Boolean(String(form?.agentName || '').trim() && String(form?.greeting || '').trim());
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
    <Field label="Agent name">
      <TextInput required maxLength={500} value={form.agentName} onChange={event => onChange('agentName', event.target.value)} />
    </Field>
    <Field label="Greeting" help="Spoken exactly as written.">
      <Textarea maxLength={1000} rows="4" value={form.greeting} onChange={event => onChange('greeting', event.target.value)} />
    </Field>
    <GreetingPreview voiceId={form.voiceId} greeting={form.greeting} />
    <Toggle checked={form.transcriptionNotice} onChange={value => onChange('transcriptionNotice', value)} label="Tell callers the call is transcribed" sublabel="When on, your receptionist says this right after the greeting on every call." />
  </>;
}
