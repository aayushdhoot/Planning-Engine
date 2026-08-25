// `npm run dev` — both halves of the product, one command.
//
// The planning engine authors a programme; the DnB-OS tracking engine watches
// it. They talk through the sync store the tracking server exposes, and vite
// proxies /dnbos to it (see vite.config.ts), so starting only vite gives an app
// whose Schedule, Manpower, Procurement, Design and To-do tabs have nothing
// behind them. Both start here.
//
// Either can still be run alone:  npm run dev:web   /   npm run dev:tracking
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import net from 'node:net';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const TRACKING = join(ROOT, 'tracking', 'tools', 'serve-engine.js');
const PORT = Number(process.env.DNBOS_PORT || 8901);

const paint = (tag, colour) => (line) => {
  for (const l of String(line).split(/\r?\n/)) if (l.trim()) process.stdout.write(`\x1b[${colour}m${tag}\x1b[0m ${l}\n`);
};

/** Something already listening? Then leave it alone rather than fight it for the port. */
function portBusy(port) {
  return new Promise((res) => {
    const s = net.createConnection({ port, host: '127.0.0.1' });
    s.on('connect', () => { s.destroy(); res(true); });
    s.on('error', () => res(false));
    setTimeout(() => { s.destroy(); res(false); }, 800);
  });
}

const children = [];
/**
 * `shell` is per-process and NOT a blanket win32 default.
 *
 * npx is a .cmd on Windows and cannot be executed without one. node is a real
 * executable and must not have one: with shell:true the interpreter path
 * "C:\Program Files\nodejs\node.exe" is concatenated unquoted and the shell
 * splits it at the space, so the tracking server died on
 * "'C:\Program' is not recognized" while vite came up fine — which reads as
 * the engine being broken rather than the launcher quoting badly.
 */
function start(name, cmd, args, opts, colour, shell = false) {
  const p = spawn(cmd, args, { ...opts, shell });
  p.stdout.on('data', paint(name, colour));
  p.stderr.on('data', paint(name, colour));
  p.on('exit', (code) => {
    if (code) paint(name, colour)(`exited with code ${code}`);
  });
  children.push(p);
  return p;
}

// one Ctrl+C stops both; without this the tracking server is orphaned and the
// next `npm run dev` finds its port taken by a process nobody can see
const stopAll = () => { for (const c of children) { try { c.kill(); } catch {} } process.exit(0); };
process.on('SIGINT', stopAll);
process.on('SIGTERM', stopAll);

const busy = await portBusy(PORT);
if (busy) {
  paint('tracking', '36')(`something is already serving :${PORT} — using it`);
} else if (!existsSync(TRACKING)) {
  paint('tracking', '33')(`not found at tracking/tools/serve-engine.js — the planning engine will run,`);
  paint('tracking', '33')(`but Schedule, Manpower, Procurement, Design and To-do will say nothing is pushed.`);
} else {
  // Git for Windows ships the `unzip` that tools/ingest.js needs to read xlsx
  // and docx. Without it a re-read fails with ENOENT and blames the document.
  const env = { ...process.env };
  const gitUnzip = 'C:\\Program Files\\Git\\usr\\bin';
  if (process.platform === 'win32' && existsSync(join(gitUnzip, 'unzip.exe')) && !env.PATH.includes(gitUnzip)) {
    env.PATH = `${gitUnzip};${env.PATH}`;
  }
  start('tracking', process.execPath, [TRACKING, String(PORT)], { cwd: join(ROOT, 'tracking'), env }, '36');
}

start('vite', 'npx', ['vite'], { cwd: ROOT, env: process.env }, '35', true);
