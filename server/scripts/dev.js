import { spawn } from 'node:child_process';

const shell = process.platform === 'win32';
const preview = process.argv.includes('--preview');
const env = preview
  ? { ...process.env, NODE_ENV:'development', LOCAL_PREVIEW_MODE:'true' }
  : process.env;
if (preview) {
  console.log('[local preview] Simulated telephony controls are available for visual review only. No phone or carrier actions are performed by the preview controls.');
}
const children = [
  spawn('npm', ['--prefix','server','run','dev'], { stdio:'inherit', shell, env }),
  spawn('npm', ['--prefix','client','run','dev'], { stdio:'inherit', shell, env })
];

let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  process.exit(code);
}

for (const child of children) {
  child.on('error', error => {
    console.error(error.message);
    stop(1);
  });
  child.on('exit', code => {
    if (!stopping && code !== 0) stop(code || 1);
  });
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
