// One origin for a human test: serves the homepage (with the live demo script) at / and
// forwards /api/demo/* and /demo/* to the app server. Usage: node e2e/test-link-proxy.mjs <appPort> <listenPort>
import http from 'node:http'; import fs from 'node:fs';
const [appPort, port] = process.argv.slice(2).map(Number);
const html = fs.readFileSync(new URL('../site/homepage.claude-design.html', import.meta.url), 'utf8')
  .replace('</body>', '<script src="/demo/otc-live-demo.js" data-api="" defer></script></body>');
http.createServer((req, res) => {
  if (req.url === '/' || req.url.startsWith('/?')) { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); return res.end(html); }
  if (!req.url.startsWith('/api/demo/') && !req.url.startsWith('/demo/')) { res.writeHead(404); return res.end(); }
  const up = http.request({ host: '127.0.0.1', port: appPort, path: req.url, method: req.method, headers: req.headers }, r => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
  up.on('error', () => { res.writeHead(502); res.end(); }); req.pipe(up);
}).listen(port, '127.0.0.1', () => console.log('proxy up'));
