// mcp.mjs — figbridge as an MCP server over stdio. No dependencies.
// Every agent that speaks MCP (Claude Code, opencode, Cursor, Zed...) gets the same
// tools, and they all talk to the one local bridge, so several agents can work in
// parallel on the same Figma file.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { APP_DIR, WORK_DIR, ensureDirs } from './paths.mjs';
import { loadConfig, resolveNodeId } from './config.mjs';
import * as bridge from './client.mjs';

const VERSION = '1.0.0';
const cfg = loadConfig(process.env.FIGBRIDGE_PROJECT || process.cwd());
ensureDirs();

const jobSrc = (n) => fs.readFileSync(path.join(APP_DIR, 'jobs', n), 'utf8');
const key = crypto.createHash('sha1').update(cfg._root).digest('hex').slice(0, 10);
const snapFile = path.join(WORK_DIR, 'snap-' + key + '.txt');

const ids = (list) => (list || []).map((i) => resolveNodeId(i, cfg));

const BANNED = /detachInstance|loadAllPagesAsync|setPluginData|createImageAsync|figma\.currentPage\s*=|\.reactions\s*=|setReactionsAsync/;

async function ensure() {
  const s = await bridge.ensureLive({ quiet: true, tries: 3 });
  if (!s.connected) {
    throw new Error(
      'The bridge is not connected to Figma. Open Figma Desktop and run the plugin: ' +
      'Plugins > Development > Figma Desktop Bridge. Then try again.'
    );
  }
  return s;
}

async function snapshot(list) {
  await ensure();
  const out = await bridge.exec(jobSrc('snap.js').replaceAll('__IDS__', JSON.stringify(list)));
  return (Array.isArray(out.value) ? out.value : [String(out.value)]).join('\n');
}

const TOOLS = {
  figma_status: {
    description: 'Is the local bridge running and is the Figma plugin connected. Call this first if anything else fails.',
    schema: { type: 'object', properties: {} },
    async run() {
      const s = await bridge.status();
      return JSON.stringify(s, null, 1);
    }
  },
  figma_exec: {
    description: 'Run Figma Plugin API code inside the open Figma Desktop file and return its value. ' +
      'The code is an async body: use await figma.getNodeByIdAsync(id) and end with a return. ' +
      'Write idempotent scripts, name what you create with a traceable prefix, and never touch nodes you did not create.',
    schema: {
      type: 'object',
      properties: { code: { type: 'string', description: 'Plugin API code to execute' } },
      required: ['code']
    },
    async run({ code }) {
      await ensure();
      if (BANNED.test(code)) throw new Error('refused: the script uses a forbidden API (detachInstance, reactions assignment, currentPage assignment, loadAllPagesAsync, setPluginData or createImageAsync)');
      const out = await bridge.exec(code);
      return bridge.render(out);
    }
  },
  figma_snapshot: {
    description: 'Safety inventory of frames before changing them: prototype reactions, visible buttons and node count. Take one before editing, then use figma_diff after.',
    schema: {
      type: 'object',
      properties: { ids: { type: 'array', items: { type: 'string' }, description: 'Node ids, Figma urls, or names from figbridge.json' } },
      required: ['ids']
    },
    async run({ ids: raw }) {
      const list = ids(raw);
      const text = await snapshot(list);
      fs.writeFileSync(snapFile, text + '\n');
      return text;
    }
  },
  figma_diff: {
    description: 'Compare the current state of the frames against the last figma_snapshot. This is the safety net: reactions, buttons and node counts must come back identical unless you meant to change them.',
    schema: {
      type: 'object',
      properties: { ids: { type: 'array', items: { type: 'string' } } },
      required: ['ids']
    },
    async run({ ids: raw }) {
      const before = fs.existsSync(snapFile) ? fs.readFileSync(snapFile, 'utf8').trim() : null;
      const after = (await snapshot(ids(raw))).trim();
      if (before === null) { fs.writeFileSync(snapFile, after + '\n'); return 'no previous snapshot — this one is the baseline'; }
      if (before === after) return 'NO RISKY CHANGES — reactions, buttons and nodes are identical';
      const a = before.split('\n'), b = after.split('\n');
      const lines = ['INVENTORY CHANGED:'];
      for (let i = 0; i < Math.max(a.length, b.length); i++) {
        if (a[i] !== b[i]) { if (a[i]) lines.push('  - ' + a[i]); if (b[i]) lines.push('  + ' + b[i]); }
      }
      return lines.join('\n');
    }
  },
  figma_lint: {
    description: 'Programmatic QA of frames against this project design tokens: overflow, overlapping siblings, colors outside the palette, sizes outside the type scale, non-standard control heights and text clipped by a fixed height.',
    schema: {
      type: 'object',
      properties: { ids: { type: 'array', items: { type: 'string' } } },
      required: ['ids']
    },
    async run({ ids: raw }) {
      await ensure();
      const slim = { palette: cfg.palette, typeScale: cfg.typeScale, controlHeights: cfg.controlHeights, fonts: cfg.fonts, lint: cfg.lint };
      const code = jobSrc('lint.js').replaceAll('__IDS__', JSON.stringify(ids(raw))).replaceAll('__CFG__', JSON.stringify(slim));
      const out = await bridge.exec(code);
      return (Array.isArray(out.value) ? out.value : [String(out.value)]).join('\n');
    }
  },
  figma_tree: {
    description: 'Dump a node tree with the properties that matter for layout work: position, size, fills, text content, font, auto-layout, sizing and reaction count. Read this before writing any script that edits a screen.',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        depth: { type: 'number', description: 'How many levels deep, default 3' }
      },
      required: ['id']
    },
    async run({ id, depth }) {
      await ensure();
      const out = await bridge.exec(
        jobSrc('dump.js').replaceAll('__NODEID__', resolveNodeId(id, cfg)).replaceAll('__DEPTH__', String(depth || 3))
      );
      const root = out.value && out.value.tree;
      if (!root) return JSON.stringify(out.value);
      const lines = [];
      (function line(n, d) {
        let s = '  '.repeat(d) + n.id + ' [' + n.ty.slice(0, 5) + '] ' + n.nm + ' @' + n.box.join(',');
        if (n.ty === 'TEXT') s += ' | ' + n.fs + '/' + n.fw + ' ' + n.col + ' lh:' + n.lh + ' ar:' + n.ar + ' :: ' + JSON.stringify(n.tx);
        else if (n.bg) s += ' bg:' + n.bg;
        if (n.st) s += ' st:' + n.st;
        if (n.r) s += ' r:' + n.r;
        if (n.al) s += ' AL{' + n.al + '}';
        if (n.sz) s += ' sz:' + n.sz;
        if (n.main) s += ' <' + n.main + '>';
        if (n.rx) s += ' RX:' + n.rx;
        if (n.hidden) s += ' HIDDEN';
        lines.push(s);
        (n.c || []).forEach((c) => line(c, d + 1));
      })(root, 0);
      return lines.join('\n');
    }
  },
  figma_export_png: {
    description: 'Export a node as PNG to a local file and return the path. Use it only when you actually need to look at the result; the tree and the linter are cheaper.',
    schema: {
      type: 'object',
      properties: { id: { type: 'string' }, scale: { type: 'number' }, out: { type: 'string' } },
      required: ['id']
    },
    async run({ id, scale, out }) {
      await ensure();
      const nid = resolveNodeId(id, cfg);
      const dest = out || path.join(WORK_DIR, 'shots', nid.replace(/:/g, '-') + '.png');
      const res = await bridge.exec(
        'var n = await figma.getNodeByIdAsync(' + JSON.stringify(nid) + ');\n' +
        'if (!n) throw new Error("node does not exist");\n' +
        'var b = await n.exportAsync({format:"PNG", constraint:{type:"SCALE", value:' + (scale || 1) + '}});\n' +
        'return figma.base64Encode(b);'
      );
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, Buffer.from(res.value, 'base64'));
      return dest;
    }
  },
  figma_tokens: {
    description: 'Read the design tokens of the open file: local color styles and variables, text styles, fonts and the control heights actually in use. Use it to learn a design system you have not seen before.',
    schema: { type: 'object', properties: {} },
    async run() {
      await ensure();
      const out = await bridge.exec(jobSrc('tokens.js'));
      return JSON.stringify(out.value, null, 1);
    }
  }
};

// ------------------------------------------------------------------ plumbing

function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n'); }
function reply(id, result) { send({ jsonrpc: '2.0', id, result }); }
function fail(id, message, code = -32000) { send({ jsonrpc: '2.0', id, error: { code, message } }); }

async function handle(msg) {
  const { id, method, params } = msg;
  if (method === 'initialize') {
    return reply(id, {
      protocolVersion: params?.protocolVersion || '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'figbridge', version: VERSION }
    });
  }
  if (method === 'notifications/initialized' || method === 'initialized') return;
  if (method === 'ping') return reply(id, {});
  if (method === 'tools/list') {
    return reply(id, {
      tools: Object.entries(TOOLS).map(([name, t]) => ({
        name, description: t.description, inputSchema: t.schema
      }))
    });
  }
  if (method === 'tools/call') {
    const tool = TOOLS[params?.name];
    if (!tool) return fail(id, 'unknown tool: ' + params?.name);
    try {
      const text = await tool.run(params.arguments || {});
      return reply(id, { content: [{ type: 'text', text: String(text) }] });
    } catch (e) {
      return reply(id, { content: [{ type: 'text', text: 'ERROR: ' + e.message }], isError: true });
    }
  }
  if (id !== undefined) fail(id, 'method not supported: ' + method, -32601);
}

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    handle(msg).catch((e) => { if (msg.id !== undefined) fail(msg.id, e.message); });
  }
});
// stdin closing is not a reason to drop work in flight: let the event loop drain.
process.stdin.on('end', () => { setTimeout(() => process.exit(0), 500).unref(); });
