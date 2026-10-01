/* Off The Clock AI — website live voice demo.
 * Replaces the homepage's scripted demo panel (section#demo) with a real Gemini Live
 * conversation. The page asks our server for a single-use token whose model, voice and
 * instructions are locked server-side, then talks to Gemini directly. No audio is stored.
 * Include once on the homepage:
 *   <script src="https://YOUR-APP-HOST/demo/otc-live-demo.js" data-signup="https://..." defer></script>
 */
(() => {
  'use strict';
  const SCRIPT = document.currentScript;
  const API = ((SCRIPT && SCRIPT.dataset.api) || (SCRIPT && SCRIPT.src ? new URL(SCRIPT.src).origin : location.origin)).replace(/\/$/, '');
  const SIGNUP = (SCRIPT && SCRIPT.dataset.signup) || '';
  const WS_URL = (SCRIPT && SCRIPT.dataset.ws) || 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained'; // data-ws exists only for tests
  const START_TURN = '[SYSTEM] A visitor just started the demo. Greet them now.';
  const CLOSINGS = {
    time: "That's our demo time. Start your free trial to put Off The Clock to work for your business.",
    silence: "Looks like you've stepped away. I'll be here when you're ready to talk about your business.",
  };
  const SILENCE_MS = 10000, CLOSE_GRACE_MS = 15000, STALL_MS = 20000;
  const CLOSING_MARKERS = { time: 'free trial', silence: 'stepped away' };
  const AGENTS = [{ key: 'miles', name: 'Miles', tag: 'VOICE 01 · MALE' }, { key: 'nova', name: 'Nova', tag: 'VOICE 02 · FEMALE' }];

  // 16 kHz mono PCM capture. Integrates source samples over each output interval so
  // 44.1/48 kHz inputs convert without drift. Posts 100 ms frames. Nothing is recorded.
  const WORKLET = `class P extends AudioWorkletProcessor{constructor(){super();this.span=sampleRate;this.rem=this.span;this.sum=0;this.buf=new Int16Array(1600);this.n=0;}
process(i,o){for(const c of o[0]||[])c.fill(0);const x=i[0]&&i[0][0];if(!x)return true;
for(const r of x){let left=16000;const v=Math.max(-1,Math.min(1,Number.isFinite(r)?r:0));
while(left>0){const t=Math.min(left,this.rem);this.sum+=v*t;this.rem-=t;left-=t;
if(this.rem===0){const s=Math.max(-1,Math.min(1,this.sum/this.span));this.buf[this.n++]=Math.round(s*(s<0?32768:32767));this.sum=0;this.rem=this.span;
if(this.n===this.buf.length){const b=new ArrayBuffer(this.buf.length*2),d=new DataView(b);for(let k=0;k<this.buf.length;k++)d.setInt16(k*2,this.buf[k],true);this.port.postMessage(b,[b]);this.n=0;}}}}
return true;}}registerProcessor('otc-capture',P);`;

  const CSS = `
#otc-live-demo{--g:#00E676;--t:#F2F5F2;--m:#8A948A;--p:#111411;--b:#1E241E;--bg:#0A0A0A;font-family:Inter,system-ui,sans-serif;color:var(--t);position:absolute;z-index:5;margin:0;display:none}
#otc-live-demo .otcd-grid{height:100%}
#otc-live-demo *{box-sizing:border-box}
#otc-live-demo .otcd-grid{display:grid;grid-template-columns:320px minmax(0,1fr);gap:40px;align-items:start}
@media (max-width:860px){#otc-live-demo .otcd-grid{grid-template-columns:minmax(0,1fr);gap:16px}}
#otc-live-demo .otcd-col{display:flex;flex-direction:column;gap:12px}
#otc-live-demo .otcd-card{display:flex;justify-content:space-between;align-items:center;gap:12px;width:100%;text-align:left;background:var(--p);border:1px solid var(--b);border-radius:4px;padding:16px 18px;color:var(--t);cursor:pointer;font:inherit}
#otc-live-demo .otcd-card[aria-pressed=true]{border-color:var(--g)}
#otc-live-demo .otcd-card:disabled{cursor:default;opacity:.55}
#otc-live-demo .otcd-card:focus-visible,#otc-live-demo button:focus-visible,#otc-live-demo input:focus-visible{outline:2px solid var(--g);outline-offset:2px}
#otc-live-demo .otcd-name{font-family:'Space Grotesk',sans-serif;font-weight:600;font-size:16px}
#otc-live-demo .otcd-card[aria-pressed=true] .otcd-name{color:var(--g)}
#otc-live-demo .otcd-mono{font-family:'JetBrains Mono',monospace;letter-spacing:.1em;text-transform:uppercase}
#otc-live-demo .otcd-tag{font-size:10.5px;color:var(--m);margin-top:6px;display:block}
#otc-live-demo .otcd-sel{font-size:10px;color:var(--m);white-space:nowrap}
#otc-live-demo .otcd-card[aria-pressed=true] .otcd-sel{color:var(--g)}
#otc-live-demo .otcd-rules{background:var(--p);border:1px solid var(--b);border-radius:4px;padding:16px 18px}
#otc-live-demo .otcd-rules b{display:block;font-size:10px;color:var(--g);font-weight:400;margin-bottom:8px}
#otc-live-demo .otcd-rules p{margin:0;font-size:12.5px;line-height:1.6;color:var(--m)}
#otc-live-demo .otcd-panel{background:var(--p);border:1px solid var(--b);border-radius:4px;padding:28px;height:100%;min-height:380px;display:flex;flex-direction:column;overflow:hidden}
@media (max-width:860px){#otc-live-demo .otcd-grid{grid-template-rows:auto auto auto minmax(0,1fr)}#otc-live-demo .otcd-col{display:contents}#otc-live-demo .otcd-panel{padding:20px;min-height:440px}}
#otc-live-demo .otcd-top{display:flex;justify-content:space-between;align-items:center;gap:12px;font-size:11px;color:var(--m)}
#otc-live-demo .otcd-live{color:var(--g)}
#otc-live-demo .otcd-idle{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center;padding:24px 0}
#otc-live-demo .otcd-mic{width:92px;height:92px;border:1px solid var(--g);border-radius:4px;background:var(--bg);color:var(--g);display:grid;place-items:center;cursor:pointer}
#otc-live-demo .otcd-mic svg{width:30px;height:30px}
#otc-live-demo .otcd-start{font-family:'Space Grotesk',sans-serif;font-weight:600;font-size:16px;background:none;border:0;color:var(--t);cursor:pointer;padding:4px}
#otc-live-demo .otcd-alt{font-size:13px;color:var(--m);margin:0}
#otc-live-demo .otcd-link{background:none;border:0;color:var(--g);font:inherit;cursor:pointer;padding:0}
#otc-live-demo .otcd-note{font-size:13px;line-height:1.5;color:var(--m);margin:12px 0 0;min-height:1em}
#otc-live-demo .otcd-note:empty{display:none}
#otc-live-demo .otcd-convo{flex:1;display:flex;flex-direction:column;gap:14px;margin-top:18px;min-height:0}
#otc-live-demo .otcd-log{flex:1;min-height:60px;overflow-y:auto;display:flex;flex-direction:column;gap:12px;padding-right:4px}
#otc-live-demo .otcd-line{display:grid;grid-template-columns:64px minmax(0,1fr);gap:12px;font-size:14px;line-height:1.55}
#otc-live-demo .otcd-line b{font-family:'JetBrains Mono',monospace;font-weight:400;font-size:10px;letter-spacing:.1em;padding-top:4px;color:var(--m)}
#otc-live-demo .otcd-line.agent b{color:var(--g)}
#otc-live-demo .otcd-activity{font-size:12px;color:var(--m)}
#otc-live-demo .otcd-meter{height:2px;background:var(--b);border-radius:2px;overflow:hidden}
#otc-live-demo .otcd-meter i{display:block;height:100%;width:0;background:var(--g);transition:width .08s linear}
#otc-live-demo .otcd-row{display:flex;gap:10px;align-items:center}
#otc-live-demo .otcd-row input{flex:1;min-width:0;background:var(--bg);border:1px solid var(--b);border-radius:4px;color:var(--t);padding:11px 12px;font:inherit;font-size:14px}
#otc-live-demo .otcd-btn{background:var(--bg);border:1px solid var(--b);border-radius:4px;color:var(--t);padding:10px 14px;font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;white-space:nowrap}
#otc-live-demo .otcd-btn.primary{border-color:var(--g);color:var(--g)}
#otc-live-demo .otcd-btn:disabled{opacity:.5;cursor:default}
#otc-live-demo .otcd-end{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;text-align:center}
#otc-live-demo .otcd-end p{margin:0;color:var(--m);font-size:14px;line-height:1.6;max-width:420px}
#otc-live-demo [hidden]{display:none!important}
[data-otc-replaced]{visibility:hidden!important;min-height:var(--otc-demo-min,0px)!important}`;

  const MIC_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';

  let root, els = {}, agent = 'miles', phase = 'idle', mode = 'voice', gen = 0;
  let ws = null, ctx = null, stream = null, src = null, node = null, plays = [], nextPlay = 0;
  let framesSent = 0, peakMax = 0, awaitingAgent = false, lastServerMsg = 0, closingSentAt = 0, closingText = '';
  let startedAt = 0, sessionMs = 180000, tick = null, lastActivity = 0, agentLine = null, userLine = null, closeTimer = null, greeted = false, closingReason = null;

  function h(tag, attrs, kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) { if (k === 'class') e.className = v; else if (k === 'html') e.innerHTML = v; else if (k === 'text') e.textContent = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v); }
    for (const c of [].concat(kids || [])) if (c) e.append(c);
    return e;
  }
  function build() {
    const cards = AGENTS.map(a => h('button', { type: 'button', class: 'otcd-card', 'aria-pressed': String(a.key === agent), 'data-agent': a.key, onclick: () => choose(a.key) }, [
      h('span', {}, [h('span', { class: 'otcd-name', text: a.name }), h('span', { class: 'otcd-tag otcd-mono', text: a.tag })]),
      h('span', { class: 'otcd-sel otcd-mono', text: a.key === agent ? '● Selected' : 'Select' })]));
    els.cards = cards;
    const rules = h('div', { class: 'otcd-rules' }, [h('b', { class: 'otcd-mono', text: 'Demo rules' }),
      h('p', { text: 'Mic opens only when you press it. Sessions cap at 3:00. Our live demo agent talks only about Off The Clock AI; the agent will only talk about your business after sign up.' })]);
    els.status = h('span', { class: 'otcd-mono', role: 'status', text: 'Standing by' });
    els.timer = h('span', { class: 'otcd-mono', text: '0:00 / 3:00' });
    els.idle = h('div', { class: 'otcd-idle' }, [
      h('button', { type: 'button', class: 'otcd-mic', 'aria-label': 'Start live demo call', html: MIC_SVG, onclick: () => start('voice') }),
      h('button', { type: 'button', class: 'otcd-start', text: 'Start Live Demo Call', onclick: () => start('voice') }),
      h('p', { class: 'otcd-alt' }, ['Or ', h('button', { type: 'button', class: 'otcd-link', text: 'use text chat', onclick: () => start('text') }), ': same agent, typed.'])]);
    els.log = h('div', { class: 'otcd-log', 'aria-live': 'polite' });
    els.activity = h('div', { class: 'otcd-activity' });
    els.meter = h('i'); els.meterBox = h('div', { class: 'otcd-meter' }, els.meter);
    els.input = h('input', { type: 'text', maxlength: '500', placeholder: 'Type a message…', 'aria-label': 'Message', autocomplete: 'off', oninput: () => { lastActivity = Date.now(); } });
    els.send = h('button', { type: 'submit', class: 'otcd-btn primary', text: 'Send' });
    els.form = h('form', { class: 'otcd-row', onsubmit: e => { e.preventDefault(); sendText(); } }, [els.input, els.send]);
    els.endBtn = h('button', { type: 'button', class: 'otcd-btn', text: 'End call', onclick: () => finish('Your session has ended and your microphone is off.') });
    els.convo = h('div', { class: 'otcd-convo', hidden: '' }, [els.log, els.activity, els.meterBox, els.form, h('div', { class: 'otcd-row' }, [els.endBtn])]);
    els.endText = h('p', {});
    const endKids = [els.endText, h('button', { type: 'button', class: 'otcd-btn primary', text: 'Start again', onclick: reset })];
    if (SIGNUP) endKids.push(h('a', { class: 'otcd-link', href: SIGNUP, text: 'Start your free trial' }));
    els.ended = h('div', { class: 'otcd-end', hidden: '' }, endKids);
    els.note = h('p', { class: 'otcd-note', role: 'alert' });
    const panel = h('div', { class: 'otcd-panel' }, [h('div', { class: 'otcd-top' }, [els.status, els.timer]), els.idle, els.convo, els.ended, els.note]);
    return h('div', { id: 'otc-live-demo' }, h('div', { class: 'otcd-grid' }, [h('div', { class: 'otcd-col' }, [...cards, rules]), panel]));
  }
  function choose(key) {
    if (phase !== 'idle' && phase !== 'ended') return;
    agent = key;
    for (const c of els.cards) { const on = c.dataset.agent === key; c.setAttribute('aria-pressed', String(on)); c.querySelector('.otcd-sel').textContent = on ? '● Selected' : 'Select'; }
  }
  function lockCards(locked) { for (const c of els.cards) c.disabled = locked; }
  function setStatus(text, live) { els.status.textContent = text; els.status.classList.toggle('otcd-live', Boolean(live)); }
  function note(text) { els.note.textContent = text || ''; }
  function fmt(ms) { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
  function line(who, text) {
    if (!text) return;
    const near = els.log.scrollHeight - els.log.scrollTop - els.log.clientHeight < 60;
    let cur = who === 'agent' ? agentLine : userLine;
    if (!cur) { const body = h('span'); els.log.append(h('div', { class: 'otcd-line ' + who }, [h('b', { text: who === 'agent' ? AGENTS.find(a => a.key === agent).name.toUpperCase() : 'YOU' }), body])); cur = body; if (who === 'agent') agentLine = body; else userLine = body; }
    cur.textContent += text;
    if (near) els.log.scrollTop = els.log.scrollHeight;
  }
  function stopPlayback() { for (const p of plays) { try { p.stop(); p.disconnect(); } catch {} } plays = []; nextPlay = 0; }
  function play(b64) {
    if (!ctx || mode !== 'voice') return;
    const raw = atob(b64); const n = raw.length >> 1; if (!n) return;
    const buf = ctx.createBuffer(1, n, 24000), ch = buf.getChannelData(0);
    for (let i = 0; i < n; i++) { let v = raw.charCodeAt(2 * i) | (raw.charCodeAt(2 * i + 1) << 8); if (v > 32767) v -= 65536; ch[i] = v / 32768; }
    const s = ctx.createBufferSource(); s.buffer = buf; s.connect(ctx.destination);
    const at = Math.max(ctx.currentTime + 0.02, nextPlay); nextPlay = at + buf.duration;
    plays.push(s); s.onended = () => { plays = plays.filter(x => x !== s); try { s.disconnect(); } catch {} };
    s.start(at);
  }
  // Wall-clock time when queued agent audio finishes (0 when nothing is queued or in text mode).
  function agentBusyUntil() { return ctx && mode === 'voice' && nextPlay > ctx.currentTime ? Date.now() + (nextPlay - ctx.currentTime) * 1000 : 0; }
  function releaseMic() {
    if (node) { node.port.onmessage = null; try { node.disconnect(); } catch {} node = null; }
    try { src && src.disconnect(); } catch {} src = null;
    if (stream) { for (const t of stream.getTracks()) { t.onended = null; t.stop(); } stream = null; }
    els.meter.style.width = '0%';
  }
  function teardown() {
    gen++; clearInterval(tick); tick = null; clearTimeout(closeTimer); closeTimer = null;
    releaseMic(); stopPlayback();
    if (ws) { const w = ws; ws = null; w.onmessage = w.onclose = w.onerror = null; try { w.close(1000, 'demo ended'); } catch {} }
    const c = ctx; ctx = null; if (c && c.state !== 'closed') c.close().catch(() => {});
  }
  function finish(message) {
    if (phase === 'ended' || phase === 'idle') return;
    teardown(); phase = 'ended'; lockCards(false);
    els.idle.hidden = true; els.convo.hidden = true; els.ended.hidden = false;
    els.endText.textContent = message; setStatus('Session ended'); els.activity.textContent = '';
  }
  function reset() { teardown(); phase = 'idle'; note(''); lockCards(false); els.idle.hidden = false; els.convo.hidden = true; els.ended.hidden = true; setStatus('Standing by'); els.timer.textContent = `0:00 / ${fmt(sessionMs)}`; }
  function send(obj) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); }
  function sendTurn(text) { send({ clientContent: { turns: [{ role: 'user', parts: [{ text }] }], turnComplete: true } }); }
  function beginClosing(reason) {
    if (phase !== 'live') return;
    phase = 'closing'; closingReason = reason; releaseMic(); els.form.hidden = true; setStatus('Wrapping up', true); els.activity.textContent = 'Wrapping up…';
    closingSentAt = Date.now(); closingText = ''; agentLine = null;
    sendTurn(`[SYSTEM] The demo is ending. Say exactly: "${CLOSINGS[reason]}" Then stop.`);
    closeTimer = setTimeout(() => finish(endMessage(reason)), CLOSE_GRACE_MS);
  }
  function endMessage(reason) { return reason === 'time' ? 'Demo time is up. Your microphone is off.' : 'The demo ended after a pause. Your microphone is off.'; }
  function sendText() {
    const text = els.input.value.trim(); if (!text || phase !== 'live' || mode !== 'text') return;
    els.input.value = ''; userLine = null; line('user', text); userLine = null; lastActivity = Date.now(); awaitingAgent = true; lastServerMsg = Date.now(); sendTurn(text); els.send.disabled = true; els.activity.textContent = 'Responding…';
  }
  async function readJson(r) { try { return await r.json(); } catch { return null; } }

  async function start(which) {
    if (phase !== 'idle' && phase !== 'ended') return;
    const g = ++gen; mode = which; phase = 'starting'; note(''); lockCards(true); closingReason = null; greeted = false; awaitingAgent = false; closingText = '';
    els.idle.hidden = true; els.ended.hidden = true; els.convo.hidden = false; els.log.replaceChildren(); agentLine = userLine = null;
    els.form.hidden = which !== 'text'; els.meterBox.hidden = which !== 'voice'; els.send.disabled = true;
    setStatus(which === 'voice' ? 'Allow microphone' : 'Connecting'); els.activity.textContent = which === 'voice' ? 'Allow your microphone to begin.' : 'Connecting…';
    try {
      if (which === 'voice') {
        if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('Voice needs a secure connection in a current browser. You can use text chat instead.');
        const AC = window.AudioContext || window.webkitAudioContext; if (!AC) throw new Error('This browser can’t play live audio. You can use text chat instead.');
        ctx = new AC(); await ctx.resume();
        const media = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
        if (g !== gen) { media.getTracks().forEach(t => t.stop()); return; }
        stream = media; for (const t of media.getTracks()) t.onended = () => { if (g === gen) finish('The microphone was disconnected. Your session has ended.'); };
        const url = URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' }));
        try { await ctx.audioWorklet.addModule(url); } finally { URL.revokeObjectURL(url); }
        if (g !== gen) return;
      }
      const r = await fetch(API + '/api/demo/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ agent }), cache: 'no-store' });
      const data = await readJson(r);
      if (!r.ok || !data || !data.token) throw new Error((data && data.message) || 'The demo could not connect. Please try again.');
      if (g !== gen) return;
      sessionMs = data.sessionSeconds * 1000; setStatus('Connecting');
      await connect(g, data);
    } catch (e) {
      if (g !== gen) return;
      const msg = e && e.name === 'NotAllowedError' ? 'Microphone access wasn’t allowed. You can use text chat instead.' : e && e.name === 'NotFoundError' ? 'No microphone was found. You can use text chat instead.' : (e && e.message) || 'The demo could not connect. Please try again.';
      finish(msg); note('');
    }
  }
  function connect(g, data) {
    return new Promise((resolve, reject) => {
      const sock = new WebSocket(`${WS_URL}?access_token=${encodeURIComponent(data.token)}`); ws = sock;
      const fail = () => { if (g === gen) reject(new Error('The demo could not connect. Please try again.')); };
      const handshake = setTimeout(fail, 15000);
      sock.onerror = () => {};
      sock.onclose = () => { clearTimeout(handshake); if (g !== gen) return; if (phase === 'starting') return fail(); finish(phase === 'closing' ? endMessage(closingReason) : 'The connection ended. Your microphone is off.'); };
      sock.onopen = () => sock.send(JSON.stringify({ setup: { model: `models/${data.model}` } }));
      sock.onmessage = async ev => {
        if (g !== gen) return;
        let m; try { m = JSON.parse(typeof ev.data === 'string' ? ev.data : await ev.data.text()); } catch { return; }
        if (m.setupComplete) { clearTimeout(handshake); live(g); resolve(); return; }
        if (m.goAway) return finish('The connection ended. Your microphone is off.');
        const s = m.serverContent; if (!s) return;
        lastServerMsg = Date.now(); lastActivity = Math.max(lastActivity, Date.now());
        if (s.interrupted) { stopPlayback(); agentLine = null; }
        if (s.inputTranscription && s.inputTranscription.text) { agentLine = null; line('user', s.inputTranscription.text); awaitingAgent = true; els.activity.textContent = 'Listening…'; }
        // Gemini sometimes emits placeholders such as "<no speech detected>"; never show those to visitors.
        if (s.outputTranscription && s.outputTranscription.text && !/^\s*<[^>]*>\s*$/.test(s.outputTranscription.text)) { if (phase === 'closing') closingText += s.outputTranscription.text.toLowerCase(); userLine = null; line('agent', s.outputTranscription.text); els.activity.textContent = mode === 'voice' ? 'Speaking…' : 'Responding…'; }
        for (const p of (s.modelTurn && s.modelTurn.parts) || []) if (p.inlineData && p.inlineData.data && !p.thought) play(p.inlineData.data);
        if (s.turnComplete) {
          agentLine = null; userLine = null; greeted = true; awaitingAgent = false; lastActivity = Math.max(Date.now(), agentBusyUntil());
          // While closing, only the turn that actually spoke the closing line ends the session.
          if (phase === 'closing' && !closingText.includes(CLOSING_MARKERS[closingReason])) return;
          if (phase === 'closing') { clearTimeout(closeTimer); closeTimer = setTimeout(() => finish(endMessage(closingReason)), Math.max(0, agentBusyUntil() - Date.now()) + 600); return; }
          els.activity.textContent = mode === 'voice' ? 'Your turn. Just talk.' : 'Your turn.'; els.send.disabled = false; if (mode === 'text') els.input.focus();
        }
      };
    });
  }
  function live(g) {
    phase = 'live'; startedAt = Date.now(); lastActivity = Date.now(); awaitingAgent = true; lastServerMsg = Date.now();
    setStatus(mode === 'voice' ? 'Live call' : 'Live text chat', true);
    sendTurn(START_TURN);
    if (mode === 'voice' && ctx && stream) {
      src = ctx.createMediaStreamSource(stream); node = new AudioWorkletNode(ctx, 'otc-capture'); src.connect(node); node.connect(ctx.destination);
      node.port.onmessage = e => {
        if (g !== gen || phase !== 'live' || !(e.data instanceof ArrayBuffer)) return;
        const bytes = new Uint8Array(e.data); let peak = 0; const dv = new DataView(e.data);
        for (let i = 0; i < bytes.length; i += 2) peak = Math.max(peak, Math.abs(dv.getInt16(i, true)) / 32768);
        els.meter.style.width = Math.min(100, peak * 220) + '%';
        peakMax = Math.max(peakMax, peak); if (peak > 0.08) lastActivity = Math.max(lastActivity, Date.now());
        let bin = ''; for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        send({ realtimeInput: { audio: { data: btoa(bin), mimeType: 'audio/pcm;rate=16000' } } }); framesSent++;
      };
    }
    tick = setInterval(() => {
      if (g !== gen) return;
      const used = Date.now() - startedAt; els.timer.textContent = `${fmt(Math.min(used, sessionMs))} / ${fmt(sessionMs)}`;
      if (phase !== 'live') return;
      if (used >= sessionMs - 6000) return beginClosing('time');
      if (awaitingAgent && Date.now() - lastServerMsg >= STALL_MS) return finish('The demo stopped responding. Your microphone is off.');
      if (greeted && !awaitingAgent && Date.now() - Math.max(lastActivity, agentBusyUntil()) >= SILENCE_MS) beginClosing('silence');
    }, 250);
  }

  // The homepage is rendered by a design-tool runtime that rebuilds its own DOM. To stay
  // independent of it, the widget lives at the end of <body> and is positioned exactly over
  // the original demo controls, which are made invisible but keep their space in the layout.
  function findGrid() {
    const section = document.getElementById('demo'); if (!section) return null;
    const all = section.querySelectorAll('*'); let label = null, rules = null;
    for (const e of all) { if (e.childElementCount) continue; const t = (e.textContent || '').trim(); if (!label && t === 'Start Live Demo Call') label = e; else if (!rules && t.toUpperCase() === 'DEMO RULES') rules = e; if (label && rules) break; }
    if (!label || !rules) return null;
    let grid = label; while (grid && !grid.contains(rules)) grid = grid.parentElement;
    return grid && grid !== section ? grid : null;
  }
  let placeQueued = false;
  function place() {
    placeQueued = false; if (!root) return;
    const grid = findGrid();
    if (!grid) { root.style.display = 'none'; return; }
    if (!grid.hasAttribute('data-otc-replaced')) grid.setAttribute('data-otc-replaced', '');
    let r = grid.getBoundingClientRect();
    if (!r.width) { root.style.display = 'none'; return; }
    // Reserve enough page space for the widget's own layout at this width (it may need more than the original controls).
    Object.assign(root.style, { display: 'block', visibility: 'hidden', width: `${r.width}px`, height: 'auto' });
    const need = Math.ceil(root.getBoundingClientRect().height);
    if (document.documentElement.style.getPropertyValue('--otc-demo-min') !== `${need}px`) { document.documentElement.style.setProperty('--otc-demo-min', `${need}px`); r = grid.getBoundingClientRect(); }
    Object.assign(root.style, { visibility: '', top: `${r.top + window.scrollY}px`, left: `${r.left + window.scrollX}px`, width: `${r.width}px`, height: `${Math.max(r.height, need)}px` });
  }
  function queuePlace() { if (!placeQueued) { placeQueued = true; requestAnimationFrame(place); } }
  function mount() {
    if (!document.body || !findGrid()) return false;
    if (root && root.isConnected) { queuePlace(); return true; }
    if (!document.getElementById('otc-live-demo-style')) document.head.append(h('style', { id: 'otc-live-demo-style', text: CSS }));
    root = root || build(); document.body.append(root); place();
    new MutationObserver(() => { if (!root.isConnected) document.body.append(root); queuePlace(); }).observe(document.documentElement, { childList: true, subtree: true });
    new ResizeObserver(queuePlace).observe(document.body);
    window.addEventListener('resize', queuePlace);
    setInterval(queuePlace, 1000);
    window.addEventListener('pagehide', () => teardown());
    return true;
  }
  if (SCRIPT && SCRIPT.dataset.debug === 'true') window.__otcDemoDebug = { get root() { return root; }, get phase() { return phase; }, get framesSent() { return framesSent; }, get peakMax() { return peakMax; }, els };
  function waitAndMount(tries) { if (mount() || tries <= 0) return; setTimeout(() => waitAndMount(tries - 1), 250); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => waitAndMount(80)); else waitAndMount(80);
})();
