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
  console.log('[phase2-gate] engine, tenant, and Phase 2 regressions');
  await run('node', ['--test', 'test/quoteEngine.spec.js', 'test/tenantAddon.spec.js', 'test/phase2.spec.js', 'test/phase2Terminology.spec.js']);
  console.log('[phase2-gate] production client build');
  await run('npm', ['--prefix', 'client', 'run', 'build']);
  console.log('[phase2-gate] command complete; external end-to-end product audit is still required');
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
