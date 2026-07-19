import { spawn } from 'node:child_process';

const child = spawn('node', ['--test', 'test/quoteEngine.spec.js'], {
  stdio: 'inherit',
  shell: process.platform === 'win32'
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
