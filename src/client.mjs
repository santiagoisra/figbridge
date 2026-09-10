// client.mjs — talking to the daemon, and keeping it alive.
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { APP_DIR, HOME_DIR, LOG_FILE, PID_FILE, IS_WIN, IS_MAC, ensureDirs } from './paths.mjs';

const PORT = Number(process.env.FIGBRIDGE_PORT || 8787);

function request(pathname, { method = 'GET', body = null, timeout = 8000 } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port: PORT, path: pathname, method, headers: body ? { 'Content-Type': 'text/plain', 'Content-Length': Buffer.byteLength(body) } : {} },
      (res) => {
        let d = '';
        res.setEncoding('utf8');
        res.on('data', (c) => { d += c; });
        res.on('end', () => resolve(d));
      }
    );
    req.setTimeout(timeout, () => { req.destroy(new Error('timeout talking to the bridge')); });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

export async function status() {
  try {
    const raw = await request('/status', { timeout: 4000 });
    return { ok: true, ...JSON.parse(raw) };
  } catch {
    return { ok: false, connected: false };
  }
}

export function daemonRunning() {
  try {
    const pid = Number(fs.readFileSync(PID_FILE, 'utf8').trim());
    if (!pid) return false;
    process.kill(pid, 0);
    return pid;
  } catch {
    return false;
  }
}

export function startDaemon() {
  ensureDirs();
  const out = fs.openSync(LOG_FILE, 'a');
  const child = spawn(process.execPath, [path.join(APP_DIR, 'src', 'bridge.mjs')], {
    detached: true,
    stdio: ['ignore', out, out],
    windowsHide: true
  });
  child.unref();
  fs.writeFileSync(PID_FILE, String(child.pid));
  return child.pid;
}

export function stopDaemon() {
  const pid = daemonRunning();
  if (!pid) return false;
  try { process.kill(pid); } catch { /* already gone */ }
  try { fs.unlinkSync(PID_FILE); } catch { /* ignore */ }
  return pid;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Bring Figma to the front. On macOS we also try to click the plugin's menu item,
// which works when the terminal has Accessibility permission; when it doesn't,
// the plugin usually reconnects on its own as soon as Figma is focused.
function nudgeFigma() {
  try {
    if (IS_MAC) {
      spawnSync('osascript', [
        '-e', 'tell application "Figma" to activate',
        '-e', 'delay 1',
        '-e', 'tell application "System Events" to tell process "Figma" to click menu item 1 of menu 1 of menu item "Development" of menu 1 of menu bar item "Plugins" of menu bar 1'
      ], { timeout: 12000, stdio: 'ignore' });
    } else if (IS_WIN) {
      spawnSync('powershell', ['-NoProfile', '-Command',
        "$p = Get-Process Figma -ErrorAction SilentlyContinue | Select-Object -First 1; if ($p) { (New-Object -ComObject WScript.Shell).AppActivate($p.Id) | Out-Null }"
      ], { timeout: 12000, stdio: 'ignore' });
    }
  } catch { /* best effort */ }
}

// Make sure the daemon is up and the plugin is talking to it.
export async function ensureLive({ quiet = false, tries = 6 } = {}) {
  let s = await status();
  if (s.connected) return s;

  if (!s.ok && !daemonRunning()) {
    if (!quiet) console.error('bridge not running, starting it...');
    startDaemon();
    await sleep(1200);
    s = await status();
  }
  if (s.connected) return s;

  if (!quiet) console.error('plugin not connected, nudging Figma...');
  nudgeFigma();
  for (let i = 0; i < tries; i++) {
    await sleep(2500);
    s = await status();
    if (s.connected) return s;
  }
  return s;
}

export async function exec(code, { timeout = 300000 } = {}) {
  const raw = await request('/exec', { method: 'POST', body: code, timeout });
  let j;
  try { j = JSON.parse(raw); }
  catch { throw new Error('the bridge answered something that is not JSON: ' + raw.slice(0, 300)); }
  if (j.error) throw new Error('bridge: ' + j.error);
  const r = j.result;
  if (!r) return j;
  if (r.success === false || r.error) {
    const err = new Error('figma: ' + (r.error || 'unknown error'));
    err.logs = r.logs || [];
    throw err;
  }
  return { value: r.result === undefined ? r : r.result, logs: r.logs || [] };
}

export function render(out) {
  const lines = [];
  for (const l of out.logs || []) lines.push('log: ' + l);
  const v = out.value;
  lines.push(typeof v === 'string' ? v : JSON.stringify(v, null, 1));
  return lines.join('\n');
}

export { HOME_DIR };
