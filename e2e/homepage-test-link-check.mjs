// Opens the temporary test link in a real Chromium, the way a visitor would, and places one
// live demo call with a synthetic spoken question as the microphone.
// Usage: node e2e/homepage-test-link-check.mjs <url> <speech.wav> <outDir>
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const [url, wav, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const result = { url, checkedAt: new Date().toISOString(), errors: [] };
const save = () => fs.writeFileSync(path.join(out, 'browser-check.json'), JSON.stringify(result, null, 1));
const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required', `--use-file-for-fake-audio-capture=${path.resolve(wav)}`] });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['microphone'] });
  const page = await context.newPage();
  page.on('pageerror', e => result.errors.push('page: ' + String(e.message).slice(0, 200)));
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('#otc-live-demo', { timeout: 30000 });
  const pricing = await page.locator('#pricing').innerText();
  result.page = {
    title: await page.title(),
    plans: pricing.match(/\b(STARTER|OPERATOR|QUOTEDONE)\b/g),
    signupLinks: await page.$$eval('a', as => as.filter(a => a.href === 'https://app.offtheclockai.com/signup').length),
    demoScript: await page.$eval('script[src*="otc-live-demo.js"]', s => s.src),
  };
  save();
  const lines = () => page.$$eval('#otc-live-demo .otcd-line', ls => ls.map(l => ({ who: l.classList.contains('agent') ? 'agent' : 'visitor', text: l.querySelector('span')?.innerText || '' })));
  const started = Date.now();
  await page.click('#otc-live-demo .otcd-mic');
  try {
    await page.waitForSelector('#otc-live-demo .otcd-line.agent', { timeout: 30000 });
    result.secondsToFirstAgentWords = Math.round((Date.now() - started) / 100) / 10;
    await page.waitForFunction(() => {
      const l = [...document.querySelectorAll('#otc-live-demo .otcd-line')];
      const u = l.findIndex(x => !x.classList.contains('agent'));
      return u >= 0 && l.slice(u + 1).some(x => x.classList.contains('agent') && (x.innerText || '').length > 20);
    }, null, { timeout: 60000 });
  } catch (e) { result.errors.push('call: ' + String(e.message).split('\n')[0].slice(0, 200)); }
  // Let the agent finish answering the whole spoken question before reading the transcript.
  await page.waitForTimeout(20000);
  result.call = { status: await page.innerText('#otc-live-demo [role=status]').catch(() => null), transcript: await lines() };
  await page.locator('#demo').screenshot({ path: path.join(out, 'demo-call.png') });
  const end = page.locator('#otc-live-demo .otcd-btn', { hasText: 'End call' });
  if (await end.isVisible()) { await end.click(); await page.waitForTimeout(800); }
  // Text chat with the same agent: typed questions remove speech-recognition noise from the check.
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('#otc-live-demo', { timeout: 30000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(out, 'homepage.png') });
  try {
    const ready = () => page.waitForFunction(() => { const b = document.querySelector('#otc-live-demo button[type=submit]'); return b && !b.disabled; }, null, { timeout: 45000 });
    await page.click('#otc-live-demo .otcd-link:text("use text chat")');
    await page.waitForSelector('#otc-live-demo .otcd-line.agent', { timeout: 30000 }); await ready();
    for (const q of ['Can you do quotes?', 'I run a small fencing company.', 'What else would you do for my business?']) {
      await page.fill('#otc-live-demo input', q); await page.press('#otc-live-demo input', 'Enter'); await page.waitForTimeout(500); await ready();
    }
    result.textChat = await lines();
    await page.locator('#demo').screenshot({ path: path.join(out, 'text-chat.png') });
  } catch (e) { result.errors.push('text: ' + String(e.message).split('\n')[0].slice(0, 200)); result.textChat = await lines().catch(() => null); }
} catch (e) {
  result.errors.push('check: ' + String(e.message).split('\n')[0].slice(0, 300));
} finally {
  save();
  await browser.close();
}
