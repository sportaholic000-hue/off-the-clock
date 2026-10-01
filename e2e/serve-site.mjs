// Serves the Claude Design homepage with the live-demo script tag added, for end-to-end tests.
import http from 'node:http'; import fs from 'node:fs';
const API = process.env.APP_ORIGIN || 'http://127.0.0.1:3999';
const html = fs.readFileSync(new URL('../site/homepage.claude-design.html', import.meta.url), 'utf8')
  .replace('</body>', `<script src="${API}/demo/otc-live-demo.js" data-signup="https://www.offtheclockai.com/signup" data-debug="true" defer></script></body>`);
http.createServer((q, s) => { if (q.url === '/' || q.url.startsWith('/?')) { s.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return s.end(html); } s.writeHead(404); s.end(); })
  .listen(Number(process.env.SITE_PORT || 8899), '127.0.0.1', () => console.log('site up'));
