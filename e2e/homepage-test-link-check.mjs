// Opens the temporary test link in a real Chromium, the way a visitor would, and holds two full
// demo calls: one by voice (synthetic spoken questions as the microphone) and one by typed chat.
// Each call runs until it ends on its own, and records how it ended, when, and the demo's own
// diagnostics, so an early disconnect can be traced.
// Usage: node e2e/homepage-test-link-check.mjs <url> <speech.wav> <outDir>
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const [url, wav, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const result = { url, checkedAt: new Date().toISOString(), errors: [] };
const save = () => fs.writeFileSync(path.join(out, 'browser-check.json'), JSON.stringify(result, null, 1));
const TYPED = ['Can you do quotes?', 'I run a small fencing company.', 'What else would you do for my business?',
  'How does setup work?', 'What happens to calls after hours?', 'Can my office manager log in too?',
  'How do I see what was said on a call?', 'What if a caller wants to talk to me directly?',
  'How does billing work if I go over my minutes?', 'Can I cancel any time?', 'Do callers know they are talking to an AI?',
  'What does the website widget ask a customer?', 'How long is the free trial?', 'Is there a setup fee?'];

const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required', `--use-file-for-fake-audio-capture=${path.resolve(wav)}`] });
async function openPage() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['microphone'] });
  const page = await context.newPage();
  page.on('pageerror', e => result.errors.push('page: ' + String(e.message).slice(0, 200)));
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('#otc-live-demo', { timeout: 30000 });
  return page;
}
const lines = page => page.$$eval('#otc-live-demo .otcd-line', ls => ls.map(l => ({ who: l.classList.contains('agent') ? 'agent' : 'visitor', text: l.querySelector('span')?.innerText || '' })));
const ended = page => page.$eval('#otc-live-demo .otcd-end', e => !e.hidden).catch(() => false);
async function finishCall(page, name, startedAt) {
  const record = {
    seconds: Math.round((Date.now() - startedAt) / 100) / 10,
    endedOnItsOwn: await ended(page),
    endMessage: await page.$eval('#otc-live-demo .otcd-end p', e => e.innerText).catch(() => null),
    status: await page.innerText('#otc-live-demo [role=status]').catch(() => null),
    transcript: await lines(page),
  };
  await page.locator('#demo').screenshot({ path: path.join(out, name + '.png') });
  const diag = page.locator('#otc-live-demo .otcd-link', { hasText: 'Copy diagnostics' });
  if (await diag.isVisible().catch(() => false)) {
    await diag.click();
    const text = await page.$eval('#otc-live-demo textarea', e => e.value).catch(() => '');
    try { const parsed = JSON.parse(text); record.diagnosticEvents = parsed.events.length; fs.writeFileSync(path.join(out, name + '-diagnostics.json'), JSON.stringify(parsed, null, 1)); }
    catch { record.diagnosticEvents = null; }
  }
  return record;
}

try {
  const page = await openPage();
  const pricing = await page.locator('#pricing').innerText();
  result.page = {
    title: await page.title(),
    plans: pricing.match(/\b(STARTER|OPERATOR|QUOTEDONE)\b/g),
    signupLinks: await page.$$eval('a', as => as.filter(a => a.href === 'https://app.offtheclockai.com/signup').length),
    demoScript: await page.$eval('script[src*="otc-live-demo.js"]', s => s.src),
  };
  await page.screenshot({ path: path.join(out, 'homepage.png') });
  save();

  // Voice: the call runs until it ends by itself (3-minute cap, a pause, or a disconnect).
  const voiceStart = Date.now();
  await page.click('#otc-live-demo .otcd-mic');
  try { await page.waitForFunction(() => { const e = document.querySelector('#otc-live-demo .otcd-end'); return e && !e.hidden; }, null, { timeout: 210000 }); }
  catch (e) { result.errors.push('voice: still running after 210 seconds'); }
  result.voiceCall = await finishCall(page, 'voice-call', voiceStart);
  save();

  // Typed chat: a new question after each answer until the call ends by itself.
  const chat = await openPage();
  const textStart = Date.now();
  await chat.click('#otc-live-demo .otcd-link:text("use text chat")');
  try {
    await chat.waitForSelector('#otc-live-demo .otcd-line.agent', { timeout: 30000 });
    for (let i = 0; Date.now() - textStart < 200000; i++) {
      const q = TYPED[i % TYPED.length];
      await chat.waitForFunction(() => { const b = document.querySelector('#otc-live-demo button[type=submit]'); const e = document.querySelector('#otc-live-demo .otcd-end'); return (e && !e.hidden) || (b && !b.disabled); }, null, { timeout: 45000 });
      if (await ended(chat)) break;
      await chat.waitForTimeout(4000);
      if (await ended(chat)) break;
      await chat.fill('#otc-live-demo input', q); await chat.press('#otc-live-demo input', 'Enter');
    }
    await chat.waitForFunction(() => { const e = document.querySelector('#otc-live-demo .otcd-end'); return e && !e.hidden; }, null, { timeout: 210000 }).catch(() => result.errors.push('text: still running at the end of the questions'));
  } catch (e) { result.errors.push('text: ' + String(e.message).split('\n')[0].slice(0, 200)); }
  result.textCall = await finishCall(chat, 'text-call', textStart);
} catch (e) {
  result.errors.push('check: ' + String(e.message).split('\n')[0].slice(0, 300));
} finally {
  save();
  await browser.close();
}
