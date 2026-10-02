import fs from 'node:fs';
// Verification-only preload: real Gemini by default, controlled provider failures
// only when the isolated test explicitly selects one. No application test switch.
const original = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  if (!String(url).startsWith('https://generativelanguage.googleapis.com/')) return original(url, init);
  const mode = JSON.parse(fs.readFileSync(process.env.AI_FIXTURE_CONTROL, 'utf8'));
  const started = Date.now();
  const record = { path:new URL(url).pathname, input:init.body ? JSON.parse(init.body) : null, mode:mode.mode };
  const clean = value => JSON.stringify(value).split(process.env.GEMINI_API_KEY).join('[KEY OMITTED]');
  try {
    let response;
    if (mode.mode === 'down') response = new Response(JSON.stringify({error:{message:'synthetic provider outage'}}), {status:503});
    else if (mode.mode === 'slow') response = await new Promise((resolve, reject) => {
      const stop = () => reject(new DOMException('Timed out', 'AbortError'));
      if (init.signal?.aborted) stop(); else init.signal?.addEventListener('abort', stop, {once:true});
    });
    else if (mode.mode === 'output') response = new Response(JSON.stringify({candidates:[{content:{parts:[{text:mode.text}]},finishReason:'STOP'}]}), {status:200});
    else response = await original(url, init);
    record.status = response.status;
    record.output = await response.clone().json();
    return response;
  } catch { record.failure = 'provider request failed or timed out'; throw new Error(record.failure); }
  finally { record.elapsedMs = Date.now()-started; fs.appendFileSync(process.env.AI_FIXTURE_WIRE, clean(record)+'\n'); }
};
