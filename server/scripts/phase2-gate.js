import { spawn } from 'node:child_process';

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio:'inherit', shell:process.platform === 'win32' });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (signal) return reject(new Error(`${command} terminated by ${signal}`));
      if (code !== 0) return reject(new Error(`${command} exited with code ${code}`));
      resolve();
    });
  });
}

try {
  await run('node', ['--test', 'test/quoteEngine.spec.js', 'test/tenantAddon.spec.js', 'test/phase2.spec.js']);
  await run('npm', ['--prefix', 'client', 'run', 'build']);
  console.log('Phase 2 gate command completed. External end-to-end product audit is still required.');
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
