#!/usr/bin/env node
// fb — figbridge command line. One tool to drive Figma Desktop from a terminal
// or from an AI agent. Everything heavy happens locally; only a few lines come back.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { APP_DIR, WORK_DIR, HOME_DIR, LOG_FILE, PLUGIN_DIR, IS_WIN, IS_MAC, ensureDirs } from '../src/paths.mjs';
import { loadConfig, saveProjectConfig, resolveNodeId, DEFAULTS } from '../src/config.mjs';
import * as bridge from '../src/client.mjs';
import { installAutostart, removeAutostart, autostartStatus } from '../src/autostart.mjs';

const VERSION = '1.0.0';
const argv = process.argv.slice(2);
const cmd = (argv.shift() || 'help').toLowerCase();

function die(msg, code = 1) { console.error(msg); process.exit(code); }
function job(name) { return fs.readFileSync(path.join(APP_DIR, 'jobs', name), 'utf8'); }
function keyFor(root) { return crypto.createHash('sha1').update(root).digest('hex').slice(0, 10); }

async function live(opts) {
  const s = await bridge.ensureLive(opts);
  if (!s.connected) {
    die(
      'The bridge is not connected to Figma.\n' +
      '  1. Open Figma Desktop.\n' +
      '  2. Menu Plugins -> Development -> Figma Desktop Bridge.\n' +
      '  3. Run `fb status` again.\n' +
      'If the plugin is not in that menu, run `fb plugin` and import its manifest.json once.'
    );
  }
  return s;
}

async function runJob(code, opts) {
  try {
    return await bridge.exec(code, opts);
  } catch (e) {
    if (e.logs && e.logs.length) e.logs.forEach((l) => console.error('  log: ' + l));
    die(e.message);
  }
}

function idsFrom(list, cfg) {
  const ids = list.filter((a) => !a.startsWith('--')).map((a) => resolveNodeId(a, cfg));
  if (!ids.length) die('give me at least one node id, a Figma url, or a name from `nodes` in figbridge.json');
  return ids;
}

// ---------------------------------------------------------------- commands

async function cmdStatus() {
  const s = await bridge.status();
  const pid = bridge.daemonRunning();
  if (!s.ok && !pid) return console.log('bridge: stopped   (run `fb up`)');
  console.log('bridge:  running on http ' + (s.httpPort || 8787) + ' / ws ' + (s.wsPort || '?') + '  pid ' + (s.pid || pid || '?'));
  console.log('plugin:  ' + (s.connected ? 'connected' : 'NOT connected — open Figma and launch Figma Desktop Bridge'));
  console.log('autostart: ' + (autostartStatus() ? 'on' : 'off'));
  if (!s.connected) process.exitCode = 1;
}

async function cmdUp() {
  if (bridge.daemonRunning()) console.log('bridge already running');
  else console.log('bridge started, pid ' + bridge.startDaemon());
  const s = await bridge.ensureLive({ tries: 2 });
  console.log('plugin: ' + (s.connected ? 'connected' : 'not connected yet — launch the plugin in Figma'));
}

function cmdDown() {
  const pid = bridge.stopDaemon();
  console.log(pid ? 'bridge stopped (pid ' + pid + ')' : 'bridge was not running');
}

async function cmdStart(cfg) {
  console.log('1. Figma');
  const running = IS_WIN
    ? spawnSync('tasklist', ['/FI', 'IMAGENAME eq Figma.exe'], { encoding: 'utf8' }).stdout?.includes('Figma.exe')
    : spawnSync('pgrep', ['-f', 'Figma.app/Contents/MacOS/Figma$'], { encoding: 'utf8' }).status === 0;
  if (!running) {
    console.log('   not open, opening it...');
    if (IS_MAC) spawnSync('open', cfg.figmaUrl ? ['-a', 'Figma', cfg.figmaUrl] : ['-a', 'Figma']);
    else if (IS_WIN) spawnSync('cmd', ['/c', 'start', '', cfg.figmaUrl || 'figma://'], { windowsHide: true });
    await new Promise((r) => setTimeout(r, 20000));
  } else {
    console.log('   open');
  }
  console.log('2. Bridge');
  const s = await bridge.ensureLive({ quiet: true });
  console.log(s.connected ? '   connected' : '   NOT connected — launch the plugin: Plugins -> Development -> Figma Desktop Bridge');
  console.log('3. Project');
  console.log('   ' + (cfg._path || 'no figbridge.json here (run `fb init`) — using defaults'));
  if (!s.connected) process.exitCode = 1;
  else console.log('\nReady. Point your agent at it.');
}

async function cmdSnap(cfg, args, { silent = false } = {}) {
  await live({ quiet: silent });
  const ids = idsFrom(args, cfg);
  const out = await runJob(job('snap.js').replaceAll('__IDS__', JSON.stringify(ids)));
  const lines = Array.isArray(out.value) ? out.value : [String(out.value)];
  ensureDirs();
  const file = path.join(WORK_DIR, 'snap-' + keyFor(cfg._root) + '.txt');
  if (fs.existsSync(file)) fs.copyFileSync(file, file.replace('.txt', '.prev.txt'));
  fs.writeFileSync(file, lines.join('\n') + '\n');
  if (!silent) lines.forEach((l) => console.log(l));
  return { lines, file };
}

async function cmdDiff(cfg, args) {
  const file = path.join(WORK_DIR, 'snap-' + keyFor(cfg._root) + '.txt');
  const prevFile = file.replace('.txt', '.prev.txt');
  const before = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  await cmdSnap(cfg, args, { silent: true });
  const after = fs.readFileSync(file, 'utf8');
  if (before === null) return console.log('no previous snapshot — this one is now the baseline');
  fs.writeFileSync(prevFile, before);
  if (before === after) return console.log('NO RISKY CHANGES — reactions, buttons and nodes are identical');
  console.log('INVENTORY CHANGED:');
  const a = before.trim().split('\n'), b = after.trim().split('\n');
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i++) {
    if (a[i] !== b[i]) {
      if (a[i]) console.log('  - ' + a[i]);
      if (b[i]) console.log('  + ' + b[i]);
    }
  }
  process.exitCode = 1;
}

async function cmdLint(cfg, args) {
  await live({});
  const ids = idsFrom(args, cfg);
  const slim = {
    palette: cfg.palette, typeScale: cfg.typeScale, controlHeights: cfg.controlHeights,
    fonts: cfg.fonts, lint: cfg.lint
  };
  const code = job('lint.js').replaceAll('__IDS__', JSON.stringify(ids)).replaceAll('__CFG__', JSON.stringify(slim));
  const out = await runJob(code);
  const lines = Array.isArray(out.value) ? out.value : [String(out.value)];
  lines.forEach((l) => console.log(l));
  if (lines.some((l) => l.startsWith('ERROR'))) process.exitCode = 1;
}

async function cmdShot(cfg, args) {
  await live({});
  const id = resolveNodeId(args[0], cfg);
  const scale = Number(args[1] || 1) || 1;
  const outFlag = args.indexOf('--out');
  ensureDirs();
  const dest = outFlag > -1 ? args[outFlag + 1] : path.join(WORK_DIR, 'shots', id.replace(/:/g, '-') + '.png');
  const code =
    'var n = await figma.getNodeByIdAsync(' + JSON.stringify(id) + ');\n' +
    'if (!n) throw new Error("node does not exist");\n' +
    'var b = await n.exportAsync({format:"PNG", constraint:{type:"SCALE", value:' + scale + '}});\n' +
    'return figma.base64Encode(b);';
  const out = await runJob(code);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, Buffer.from(out.value, 'base64'));
  console.log(dest);
}

async function cmdTree(cfg, args) {
  await live({});
  const id = resolveNodeId(args[0], cfg);
  const depth = Number(args[1] || 3) || 3;
  const out = await runJob(job('dump.js').replaceAll('__NODEID__', id).replaceAll('__DEPTH__', String(depth)));
  const root = out.value && out.value.tree;
  if (!root) return console.log(JSON.stringify(out.value));
  (function line(n, d) {
    const p = '  '.repeat(d);
    let s = p + n.id + ' [' + n.ty.slice(0, 5) + '] ' + n.nm + ' @' + n.box.join(',');
    if (n.ty === 'TEXT') s += ' | ' + n.fs + '/' + n.fw + ' ' + n.col + ' lh:' + n.lh + ' ar:' + n.ar + ' :: ' + JSON.stringify(n.tx);
    else if (n.bg) s += ' bg:' + n.bg;
    if (n.st) s += ' st:' + n.st;
    if (n.r) s += ' r:' + n.r;
    if (n.al) s += ' AL{' + n.al + '}';
    if (n.sz) s += ' sz:' + n.sz;
    if (n.main) s += ' <' + n.main + '>';
    if (n.rx) s += ' RX:' + n.rx;
    if (n.hidden) s += ' HIDDEN';
    console.log(s);
    (n.c || []).forEach((c) => line(c, d + 1));
  })(root, 0);
}

async function cmdExec(cfg, args) {
  await live({});
  const src = args[0];
  let code;
  if (!src || src === '-') code = fs.readFileSync(0, 'utf8');
  else if (fs.existsSync(src)) code = fs.readFileSync(src, 'utf8');
  else code = src; // inline snippet
  const out = await runJob(code);
  console.log(bridge.render(out));
}

// Static audit of a script before it touches the file. Cheap, and it has caught real damage.
function cmdScan(args) {
  const file = args[0];
  if (!file || !fs.existsSync(file)) die('usage: fb scan <file.js>');
  const src = fs.readFileSync(file, 'utf8');
  const lines = src.split('\n');
  let bad = 0;
  console.log('audit of ' + path.basename(file) + ' — ' + lines.length + ' lines');

  const banned = /detachInstance|loadAllPagesAsync|setPluginData|createImageAsync|figma\.currentPage\s*=|\.reactions\s*=|setReactionsAsync/;
  const hits = lines.map((l, i) => [i + 1, l]).filter(([, l]) => banned.test(l));
  if (hits.length) {
    console.log('  REJECTED — forbidden API:');
    hits.slice(0, 4).forEach(([n, l]) => console.log('    ' + n + ': ' + l.trim().slice(0, 90)));
    bad = 1;
  }
  if (/[^c]getNodeById\(/.test(src)) { console.log('  REJECTED — synchronous getNodeById, use getNodeByIdAsync'); bad = 1; }

  const removes = lines.filter((l) => l.includes('.remove()')).length;
  if (removes) {
    const guarded = lines.some((l, i) =>
      l.includes('.remove()') && lines.slice(Math.max(0, i - 4), i).some((p) => /name ===|name ==|filter|startsWith/.test(p))
    );
    if (guarded) console.log('  ok — ' + removes + ' remove() guarded by name');
    else { console.log('  REJECTED — ' + removes + ' remove() with no name filter'); bad = 1; }
  }
  if (!bad) console.log('  CLEAN');
  else process.exitCode = 1;
}

function cmdInit(cfg, args) {
  const target = path.join(process.cwd(), 'figbridge.json');
  if (fs.existsSync(target) && !args.includes('--force')) die('figbridge.json already exists here (use --force to overwrite)');
  const urlFlag = args.indexOf('--url');
  const seed = JSON.parse(JSON.stringify(DEFAULTS));
  if (urlFlag > -1) seed.figmaUrl = args[urlFlag + 1] || '';
  saveProjectConfig(seed, target);
  const agentFile = path.join(process.cwd(), 'AGENT.md');
  if (!fs.existsSync(agentFile)) {
    fs.copyFileSync(path.join(APP_DIR, 'templates', 'AGENT.md'), agentFile);
    console.log('wrote AGENT.md   — the briefing every agent gets before your task');
  }
  console.log('wrote figbridge.json');
  console.log('next: `fb tokens --write` with your file open in Figma, to fill in the palette and type scale');
}

async function cmdTokens(cfg, args) {
  await live({});
  const out = await runJob(job('tokens.js'));
  const v = out.value;
  console.log('page scanned: ' + v.page + '  (' + v.scanned + ' nodes)');
  console.log('palette:        ' + v.palette.length + ' colors');
  console.log('type scale:     ' + v.typeScale.join(', '));
  console.log('fonts:          ' + v.fonts.join(', '));
  console.log('control heights:' + v.controlHeights.join(', '));
  if (!args.includes('--write')) return console.log('\n(add --write to save these into figbridge.json)');
  const target = cfg._path || path.join(process.cwd(), 'figbridge.json');
  const current = fs.existsSync(target) ? JSON.parse(fs.readFileSync(target, 'utf8')) : JSON.parse(JSON.stringify(DEFAULTS));
  current.palette = v.palette;
  current.typeScale = v.typeScale;
  current.fonts = v.fonts;
  current.controlHeights = v.controlHeights;
  saveProjectConfig(current, target);
  console.log('\nsaved into ' + target);
}

// Hand a task file to a local coding agent, with the figbridge briefing prepended.
function cmdAgent(cfg, args) {
  const spec = args.shift();
  if (!spec || !fs.existsSync(spec)) die('usage: fb agent <task.md> [--engine claude|opencode|codex] [--model X]');
  const engineFlag = args.indexOf('--engine');
  const modelFlag = args.indexOf('--model');
  const engine = engineFlag > -1 ? args[engineFlag + 1] : cfg.agent.engine;
  const model = modelFlag > -1 ? args[modelFlag + 1] : cfg.agent.model;
  const tpl = cfg.agent.engines[engine];
  if (!tpl) die('unknown engine: ' + engine + ' (known: ' + Object.keys(cfg.agent.engines).join(', ') + ')');

  const briefingFile = path.join(cfg._root, 'AGENT.md');
  const briefing = fs.existsSync(briefingFile)
    ? fs.readFileSync(briefingFile, 'utf8')
    : fs.readFileSync(path.join(APP_DIR, 'templates', 'AGENT.md'), 'utf8');
  const prompt = [briefing, cfg.agent.briefing || '', '\n--- TASK ---\n', fs.readFileSync(spec, 'utf8')].join('\n');

  ensureDirs();
  const promptFile = path.join(WORK_DIR, 'prompt.md');
  fs.writeFileSync(promptFile, prompt);

  const argsOut = tpl.slice(1).map((a) => a.replace('{prompt}', prompt).replace('{model}', model || ''))
    .filter((a) => a !== '');
  const res = spawnSync(tpl[0], argsOut, { cwd: cfg._root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const outFile = path.join(WORK_DIR, 'agent.txt');
  const errFile = path.join(WORK_DIR, 'agent.err');
  fs.writeFileSync(outFile, res.stdout || '');
  fs.writeFileSync(errFile, res.stderr || '');
  if (!res.stdout || res.stdout.length < 10) {
    die('the engine returned nothing: ' + (res.error ? res.error.message : (res.stderr || '').split('\n').slice(-3).join(' ')));
  }
  console.log(res.stdout);
}

function cmdPlugin() {
  console.log('Plugin folder:\n  ' + PLUGIN_DIR);
  console.log('\nImport it once, in Figma Desktop:');
  console.log('  Menu Plugins -> Development -> Import plugin from manifest...');
  console.log('  pick:  ' + path.join(PLUGIN_DIR, 'manifest.json'));
  console.log('\nAfter that it lives in Plugins -> Development -> Figma Desktop Bridge.');
  try {
    if (IS_MAC) spawnSync('open', [PLUGIN_DIR]);
    else if (IS_WIN) spawnSync('explorer', [PLUGIN_DIR]);
  } catch { /* not fatal */ }
}

async function cmdDoctor(cfg) {
  const ok = (b) => (b ? 'ok  ' : 'FAIL');
  console.log('figbridge ' + VERSION);
  console.log(ok(true) + ' node        ' + process.version + '  (' + process.platform + '/' + process.arch + ')');
  console.log(ok(fs.existsSync(path.join(PLUGIN_DIR, 'manifest.json'))) + ' plugin      ' + PLUGIN_DIR);
  const s = await bridge.status();
  const pid = bridge.daemonRunning();
  console.log(ok(!!pid || s.ok) + ' daemon      ' + (pid ? 'pid ' + pid : (s.ok ? 'running (started outside fb)' : 'not running — `fb up`')));
  console.log(ok(!!s.connected) + ' plugin link ' + (s.connected ? 'connected' + (s.wsPort ? ' on ws ' + s.wsPort : '') : 'not connected — launch it in Figma'));
  console.log(ok(!!cfg._path) + ' project     ' + (cfg._path || 'no figbridge.json — `fb init`'));
  console.log('     autostart   ' + (autostartStatus() ? 'on' : 'off  (`fb autostart on`)'));
  console.log('     log         ' + LOG_FILE);
  for (const e of Object.keys(cfg.agent.engines)) {
    const bin = cfg.agent.engines[e][0];
    const found = spawnSync(IS_WIN ? 'where' : 'which', [bin], { encoding: 'utf8' }).status === 0;
    console.log('     engine ' + e.padEnd(9) + (found ? 'found' : 'not installed'));
  }
}

function help() {
  console.log(`figbridge ${VERSION} — drive Figma Desktop from your terminal or your agent

  fb start                 open Figma, bring the bridge up, check the project
  fb status                is the bridge up and is the plugin talking to it
  fb up | down             start / stop the background bridge
  fb autostart on|off      run the bridge at login (LaunchAgent / Startup folder)
  fb plugin                where the Figma plugin is, and how to import it once
  fb doctor                check every moving part

  fb init [--url URL]      create figbridge.json (+ AGENT.md) in this folder
  fb tokens [--write]      read palette, type scale and fonts from the open file

  fb exec job.js           run Plugin API code (file, inline string, or - for stdin)
  fb snap <ids...>         inventory: reactions, visible buttons, node count
  fb diff <ids...>         compare against the last snapshot — the safety net
  fb lint <ids...>         programmatic QA against your tokens
  fb tree <id> [depth]     dump a node tree with layout properties
  fb shot <id> [scale]     export a PNG
  fb scan job.js           static audit of a script before running it
  fb agent task.md         hand the task to a local coding agent, get a short report
  fb mcp                   run as an MCP server (opencode, Claude Code, Cursor)

  Node ids accept a Figma url, 14-2687, 14:2687, or a name from "nodes" in figbridge.json.
  Docs: https://github.com/santiagoisra/figbridge`);
}

// ---------------------------------------------------------------- dispatch

const cfg = loadConfig();
ensureDirs();

switch (cmd) {
  case 'mcp': await import('../src/mcp.mjs'); break;
  case 'start': case 'arranque': await cmdStart(cfg); break;
  case 'status': case 'live': case 'vivo': await cmdStatus(); break;
  case 'up': await cmdUp(); break;
  case 'down': case 'stop': cmdDown(); break;
  case 'restart': cmdDown(); await cmdUp(); break;
  case 'autostart':
    if (argv[0] === 'off') console.log(removeAutostart() ? 'autostart off' : 'autostart was not set');
    else console.log('autostart on — ' + installAutostart());
    break;
  case 'plugin': cmdPlugin(); break;
  case 'doctor': await cmdDoctor(cfg); break;
  case 'init': cmdInit(cfg, argv); break;
  case 'tokens': await cmdTokens(cfg, argv); break;
  case 'exec': case 'do': case 'run': await cmdExec(cfg, argv); break;
  case 'snap': await cmdSnap(cfg, argv); break;
  case 'diff': await cmdDiff(cfg, argv); break;
  case 'lint': await cmdLint(cfg, argv); break;
  case 'tree': case 'dump': await cmdTree(cfg, argv); break;
  case 'shot': case 'export': await cmdShot(cfg, argv); break;
  case 'scan': cmdScan(argv); break;
  case 'agent': cmdAgent(cfg, argv); break;
  case 'log': console.log(fs.existsSync(LOG_FILE) ? fs.readFileSync(LOG_FILE, 'utf8').split('\n').slice(-40).join('\n') : 'no log yet'); break;
  case 'version': case '--version': case '-v': console.log(VERSION); break;
  default: help();
}
