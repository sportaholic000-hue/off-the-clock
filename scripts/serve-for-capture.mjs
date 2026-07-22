// Boots the API in-process and serves the built client statically so a browser
// can load the real bundle. Stays alive until SIGTERM. Preview-only env is set
// by the parent process.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join } from 'node:path';

await import(join(process.cwd(), 'server', 'src', 'server.js'));
await new Promise(r => setTimeout(r, 1200));

const DIST = join(process.cwd(), 'client', 'dist');
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon' };
const port = Number(process.env.CLIENT_PORT || 4173);
createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(req.url.split('?')[0]);
    if (path === '/') path = '/index.html';
    let file = join(DIST, path);
    if (!existsSync(file) || !extname(file)) file = join(DIST, 'index.html');
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end('nf'); }
}).listen(port, () => console.log(`client on ${port}`));

process.on('SIGTERM', () => process.exit(0));
