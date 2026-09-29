/** Start the API, local email worker, and recurring-entry worker together for development. */
const children = [
  Bun.spawn([process.execPath, '--hot', 'src/server.ts'], {
    cwd: import.meta.dir.replace(/\/src$/, ''),
    stdout: 'inherit',
    stderr: 'inherit'
  }),
  Bun.spawn([process.execPath, '--hot', 'src/email/worker.ts'], {
    cwd: import.meta.dir.replace(/\/src$/, ''),
    stdout: 'inherit',
    stderr: 'inherit'
  }),
  Bun.spawn([process.execPath, '--hot', 'src/tracking/worker.ts'], {
    cwd: import.meta.dir.replace(/\/src$/, ''),
    stdout: 'inherit',
    stderr: 'inherit'
  }),
  Bun.spawn([process.execPath, '--hot', 'src/assistant/worker.ts'], {
    cwd: import.meta.dir.replace(/\/src$/, ''),
    stdout: 'inherit',
    stderr: 'inherit'
  })
];

let stopping = false;
function stopChildren(signal: 'SIGINT' | 'SIGTERM' = 'SIGTERM') {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode === null) child.kill(signal);
  }
}

process.once('SIGINT', () => stopChildren('SIGINT'));
process.once('SIGTERM', () => stopChildren('SIGTERM'));

const exited = await Promise.race(children.map((child) => child.exited));
stopChildren();
await Promise.all(children.map((child) => child.exited));
process.exitCode = exited;
