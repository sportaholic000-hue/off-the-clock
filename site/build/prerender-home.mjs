// Saves a drawn copy of the homepage into site/www/index.html, so crawlers and link
// previews that don't run JavaScript read the real page instead of {{ placeholders }}.
//
// Run after any edit to the homepage:  node site/build/prerender-home.mjs
// (needs Playwright with Chromium, the same as the browser tests).
//
// How the page works afterwards:
// - The Claude Design template that the runtime draws from is kept unchanged inside
//   <script type="text/x-dc-template" id="otc-dc-template"> (text readers skip script
//   contents, so they never see the placeholders). A small inline script turns it back into the
//   <x-dc> element the runtime reads, before the runtime starts, so visitors with
//   JavaScript get the same page as before.
// - <div id="otc-prerender"> holds the drawn page and the template's style sheets.
//   Without JavaScript it is what the visitor reads. With JavaScript it shows until
//   the runtime has drawn the page, then it is removed (a visitor whose runtime is slow
//   or fails still sees the page).
// The drawn copy is the page as it first appears: the call card at its first step and
// the live demo "STANDING BY". test/homepagePrerender20261124.browser.spec.mjs fails when it no
// longer matches what the runtime draws.
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const WWW = fileURLToPath(new URL('../www/', import.meta.url));
const INDEX = join(WWW, 'index.html');
const START = '<!-- otc-prerender:start -->', END = '<!-- otc-prerender:end -->';
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png' };

// The page in the form the Claude Design runtime reads: template in <x-dc>, no drawn copy.
export function runtimeForm(html) {
  const a = html.indexOf(START), b = html.indexOf(END);
  if (a < 0) return html;
  const block = html.slice(a, b + END.length);
  const t = block.match(/<script type="text\/x-dc-template" id="otc-dc-template">([\s\S]*?)<\/script>/);
  if (!t) throw new Error('prerender block has no template');
  return html.slice(0, a) + '<x-dc>' + t[1] + '</x-dc>' + html.slice(b + END.length);
}

export function withPrerender(html, drawn) {
  const source = runtimeForm(html);
  const a = source.indexOf('<x-dc>'), b = source.indexOf('</x-dc>');
  if (a < 0 || b < 0 || source.indexOf('<x-dc>', a + 1) >= 0) throw new Error('expected exactly one <x-dc> block');
  const template = source.slice(a + '<x-dc>'.length, b);
  if (/<\/?script\b/i.test(template)) throw new Error('template contains a <script> tag');
  // The runtime moves the template's style sheets out of the drawn markup, so the
  // drawn copy carries its own copy of them.
  const sheets = (template.match(/<link\b[^>]*rel="stylesheet"[^>]*>|<style\b[^>]*>[\s\S]*?<\/style>/g) || []).join('\n');
  const block = START + '\n<div id="otc-prerender">' + sheets + drawn + '</div>\n<script type="text/x-dc-template" id="otc-dc-template">' + template + '</script>\n'
    + '<script>(function(){var t=document.getElementById("otc-dc-template"),p=document.getElementById("otc-prerender"),x=document.createElement("x-dc");x.style.display="none";x.innerHTML=t.textContent;t.replaceWith(x);'
    // The runtime starts once parsing is done, unless React finished loading first: then it
    // waits for DOMContentLoaded, which also waits for the live demo script from the app host.
    // Starting it as soon as parsing is done keeps the page from waiting on that script.
    + 'document.addEventListener("readystatechange",function(){if(document.readyState==="interactive"&&window.__dcBoot&&document.querySelector("x-dc"))window.__dcBoot();});'
    + 'if(!p)return;new MutationObserver(function(m,o){var r=document.getElementById("dc-root");if(r&&r.firstChild){p.remove();o.disconnect();}}).observe(document.body,{childList:true,subtree:true});})();</script>\n' + END;
  return source.slice(0, a) + block + source.slice(b + '</x-dc>'.length);
}

// Draws the runtime form in Chromium with every outside request blocked and the
// live demo script held back, and returns the drawn page's markup.
export async function draw(html, { width = 1280, height = 900 } = {}) {
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path === '/' || path === '/index.html') return res.writeHead(200, { 'content-type': 'text/html' }).end(html);
    let file = resolve(WWW, '.' + path);
    if (!file.startsWith(WWW.replace(/\/$/, ''))) return res.writeHead(403).end();
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) return res.writeHead(404).end();
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' }).end(readFileSync(file));
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const { chromium } = createRequire(import.meta.url)(process.env.PRICEBOOK_BROWSER_MODULE || 'playwright');
  const browser = await chromium.launch({ headless: true, ...(process.env.PRICEBOOK_BROWSER_EXECUTABLE ? { executablePath: process.env.PRICEBOOK_BROWSER_EXECUTABLE } : {}) });
  try {
    const page = await (await browser.newContext({ viewport: { width, height } })).newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', route => {
      const url = route.request().url();
      if (url.startsWith(origin)) return route.continue();
      if (url.includes('/demo/otc-live-demo.js')) return route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }); // loaded, not yet mounted
      return route.abort();
    });
    await page.clock.install();
    await page.goto(origin + '/', { waitUntil: 'commit' });
    await page.waitForSelector('#dc-root #demo', { timeout: 30000 });
    if (errors.length) throw new Error('homepage errors while drawing: ' + errors.join('; '));
    return await page.evaluate(() => document.getElementById('dc-root').innerHTML);
  } finally {
    await browser.close();
    await new Promise(done => server.close(done));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const html = readFileSync(INDEX, 'utf8');
  const drawn = await draw(runtimeForm(html));
  if (drawn.includes('{{')) throw new Error('drawn page still has {{ placeholders }}');
  writeFileSync(INDEX, withPrerender(html, drawn));
  console.log('Saved the drawn homepage into site/www/index.html (' + drawn.length + ' characters).');
}
