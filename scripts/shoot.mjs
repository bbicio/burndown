#!/usr/bin/env node
// Render pages of the running app with headless Chrome and save PNGs, one per width.
// Zero dependencies: uses Node's global fetch + WebSocket (Node >= 22) over the
// Chrome DevTools Protocol. See docs/superpowers/PROCESS.md §6.3.
//
//   node scripts/shoot.mjs --url /costgrid.html?cgId=UUID --out shots/costgrid \
//     --widths 1440,1024,768 --email me@x.com --password secret
//
// Credentials may also come from SHOOT_EMAIL / SHOOT_PASSWORD. Without them only
// public pages (login, activate, reset-password) will render.

import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else { out[key] = next; i++; }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
if (!args.url || args.help) {
  console.error('usage: node scripts/shoot.mjs --url <path-or-url> --out <dir> [--widths 1440,1024,768]');
  console.error('                              [--base http://localhost] [--height 900] [--full]');
  console.error('                              [--email X --password Y] [--settle 1500]');
  process.exit(args.help ? 0 : 2);
}

const base = (args.base || 'http://localhost').replace(/\/+$/, '');
const url = /^https?:\/\//.test(args.url) ? args.url : base + (args.url.startsWith('/') ? '' : '/') + args.url;
const outDir = resolve(args.out || 'shots');
const widths = String(args.widths || '1440,1024,768').split(',').map(s => parseInt(s.trim(), 10)).filter(Boolean);
const height = parseInt(args.height || '900', 10);
const settle = parseInt(args.settle || '1500', 10);
const fullPage = Boolean(args.full);
const email = args.email || process.env.SHOOT_EMAIL;
const password = args.password || process.env.SHOOT_PASSWORD;

const chrome = CHROME_CANDIDATES.find(p => existsSync(p));
if (!chrome) { console.error('No Chrome/Edge binary found. Checked:\n  ' + CHROME_CANDIDATES.join('\n  ')); process.exit(1); }

// Chrome's own minimum window width is 500px; anything narrower is emulated via
// setDeviceMetricsOverride below, which is why the override is always applied.
if (widths.some(w => w < 320)) { console.error('Widths below 320px are not meaningful.'); process.exit(2); }

async function login() {
  if (!email || !password) return null;
  const res = await fetch(base + '/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
    redirect: 'manual',
  });
  const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')].filter(Boolean);
  const hit = raw.map(c => /(?:^|;\s*)pdash_token=([^;]+)/.exec(c)).find(Boolean);
  if (!res.ok || !hit) throw new Error(`login failed (HTTP ${res.status}) — no pdash_token cookie returned`);
  return hit[1];
}

let nextId = 1;
function rpc(ws, pending, method, params, sessionId) {
  const id = nextId++;
  return new Promise((ok, fail) => {
    pending.set(id, { ok, fail, method });
    ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
  });
}

async function waitForDevTools(port, deadlineMs = 20000) {
  const until = Date.now() + deadlineMs;
  while (Date.now() < until) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) return (await r.json()).webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error('Chrome DevTools endpoint did not come up within 20s');
}

const profile = join(tmpdir(), `shoot-profile-${process.pid}`);
const port = 9000 + (process.pid % 1000);
let proc;

try {
  const token = await login();
  if (token) console.log('Logged in; pdash_token acquired.');
  else console.log('No credentials given — only public pages will render correctly.');

  mkdirSync(outDir, { recursive: true });

  proc = spawn(chrome, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    'about:blank',
  ], { stdio: 'ignore' });
  proc.on('error', e => { throw e; });

  const browserWsUrl = await waitForDevTools(port);
  const pending = new Map();
  const events = [];
  const ws = new WebSocket(browserWsUrl);
  ws.addEventListener('message', ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { ok, fail, method } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? fail(new Error(`${method}: ${msg.error.message}`)) : ok(msg.result);
    } else if (msg.method) {
      events.push(msg.method);
    }
  });
  await new Promise((ok, fail) => {
    ws.addEventListener('open', ok, { once: true });
    ws.addEventListener('error', () => fail(new Error('DevTools WebSocket failed')), { once: true });
  });

  const { targetId } = await rpc(ws, pending, 'Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await rpc(ws, pending, 'Target.attachToTarget', { targetId, flatten: true });
  await rpc(ws, pending, 'Page.enable', {}, sessionId);
  await rpc(ws, pending, 'Network.enable', {}, sessionId);

  if (token) {
    const { hostname } = new URL(base);
    await rpc(ws, pending, 'Network.setCookie', {
      name: 'pdash_token', value: token, domain: hostname, path: '/', httpOnly: true,
    }, sessionId);
  }

  const written = [];
  for (const width of widths) {
    await rpc(ws, pending, 'Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor: 1, mobile: width < 768,
    }, sessionId);

    events.length = 0;
    await rpc(ws, pending, 'Page.navigate', { url }, sessionId);
    const until = Date.now() + 15000;
    while (!events.includes('Page.loadEventFired') && Date.now() < until) {
      await new Promise(r => setTimeout(r, 100));
    }
    // Vue mounts after DOMContentLoaded and v-cloak only lifts then, so always settle.
    await new Promise(r => setTimeout(r, settle));

    const shot = await rpc(ws, pending, 'Page.captureScreenshot', {
      format: 'png', captureBeyondViewport: fullPage,
    }, sessionId);
    const file = join(outDir, `${width}w.png`);
    writeFileSync(file, Buffer.from(shot.data, 'base64'));
    written.push(file);
    console.log(`  ${width}px -> ${file}`);
  }

  ws.close();
  console.log(`\n${written.length} screenshot(s) in ${outDir}`);
  console.log('Read them back with the Read tool to actually compare against the design boards.');
} catch (err) {
  console.error('shoot.mjs failed: ' + err.message);
  process.exitCode = 1;
} finally {
  if (proc) proc.kill();
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* best effort */ }
}
