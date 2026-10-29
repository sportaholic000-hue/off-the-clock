// Temporary test link: serves site/www (the launch homepage) at one address and forwards the
// live demo's script and API to the app server on the same address.
// Usage: node e2e/homepage-test-link-proxy.mjs <appPort> <listenPort>
import http from 'node:http';
import fs from 'node:fs';

const [appPort, port] = process.argv.slice(2).map(Number);
const www = new URL('../site/www/', import.meta.url);
const DEMO_TAG = '<script src="https://app.offtheclockai.com/demo/otc-live-demo.js"';
const source = fs.readFileSync(new URL('index.html', www), 'utf8');
if (source.split(DEMO_TAG).length !== 2) throw new Error('Expected exactly one live demo script tag in site/www/index.html');
// Same page, but the demo script and its API come from this address instead of the future app host.
// Test link only: debug mode shows Copy diagnostics, so a call that ends early can be traced.
const html = source.replace(DEMO_TAG, '<script src="/demo/otc-live-demo.js" data-debug="true"');
const files = {
  '/support.js': ['support.js', 'text/javascript; charset=utf-8'],
  '/favicon.svg': ['favicon.svg', 'image/svg+xml'],
  '/og-image.png': ['og-image.png', 'image/png'],
};

http.createServer((req, res) => {
  const pathname = req.url.split('?')[0];
  if (pathname === '/' || pathname === '/index.html') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    return res.end(html);
  }
  if (Object.hasOwn(files, pathname)) {
    const [name, type] = files[pathname];
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
    return res.end(fs.readFileSync(new URL(name, www)));
  }
  if (!pathname.startsWith('/api/demo/') && !pathname.startsWith('/demo/')) { res.writeHead(404); return res.end(); }
  const upstream = http.request({ host: '127.0.0.1', port: appPort, path: req.url, method: req.method, headers: req.headers }, r => {
    res.writeHead(r.statusCode, r.headers); r.pipe(res);
  });
  upstream.on('error', () => { res.writeHead(502); res.end(); });
  req.pipe(upstream);
}).listen(port, '127.0.0.1', () => console.log('proxy up'));
