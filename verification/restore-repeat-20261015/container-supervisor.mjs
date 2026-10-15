import {spawn} from 'node:child_process';

const command = [
  'node',
  '--experimental-test-module-mocks',
  '--import',
  './test/pricebookTestEnv.mjs',
  '--test',
  '--test-reporter=tap',
  'test/backupRestoreRehearsal.spec.mjs'
];
const startedUTC = new Date().toISOString();
let launchFailed = false;
const child = spawn(command[0], command.slice(1), {
  cwd: '/application',
  env: process.env,
  stdio: ['ignore', 'inherit', 'inherit']
});

child.once('error', error => {
  launchFailed = true;
  process.stderr.write('__RESTORE_REPEAT_EXECUTION__' + JSON.stringify({
    command,
    startedUTC,
    finishedUTC: new Date().toISOString(),
    exitCode: null,
    signal: null,
    launchError: String(error?.stack || error)
  }) + '\n');
  process.exitCode = 125;
});

child.once('close', (code, signal) => {
  if (launchFailed) return;
  process.stderr.write('__RESTORE_REPEAT_EXECUTION__' + JSON.stringify({
    command,
    startedUTC,
    finishedUTC: new Date().toISOString(),
    exitCode: code,
    signal
  }) + '\n');
  if (signal) {
    const number = {SIGHUP: 1, SIGINT: 2, SIGQUIT: 3, SIGKILL: 9, SIGTERM: 15}[signal] || 1;
    process.exitCode = 128 + number;
  } else {
    process.exitCode = code ?? 125;
  }
});
