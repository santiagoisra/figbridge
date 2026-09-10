// config.mjs — project config (figbridge.json) merged over global defaults.
// Nothing about any particular design system is hardcoded in this tool:
// the palette, the type scale and the control heights all come from here.
import fs from 'node:fs';
import path from 'node:path';
import { GLOBAL_CONFIG, findProjectConfig } from './paths.mjs';

export const DEFAULTS = {
  // Figma file this project works on. Only used by `fb open` and `fb start`.
  figmaUrl: '',
  // Named shortcuts for node ids, so nobody has to remember "14:2687".
  nodes: {},
  // Design tokens the linter checks against. Empty array = that check is off.
  // `fb tokens` fills these in by reading the styles and variables of your file.
  palette: [],
  typeScale: [],
  controlHeights: [],
  fonts: [],
  lint: {
    overflow: true,        // children sticking out of the frame
    overlap: true,         // siblings sitting on top of each other
    palette: true,         // colors outside `palette`
    typeScale: true,       // font sizes outside `typeScale`
    controlHeights: true,  // buttons/inputs outside `controlHeights`
    clippedText: true,     // text taller than its fixed-height box
    fonts: true,           // font families outside `fonts`
    currencySpace: false,  // flag "$ 1.000" (a Spanish-language house rule; off by default)
    ignoreNames: '^(Brand|Logo|Iso|Illustration|Ilustracion)'
  },
  // Engine used by `fb agent`. Anything that takes a prompt on argv and prints to stdout.
  agent: {
    engine: 'claude',
    engines: {
      claude: ['claude', '-p', '--model', 'sonnet', '--permission-mode', 'bypassPermissions', '{prompt}'],
      opencode: ['opencode', 'run', '-m', '{model}', '{prompt}'],
      codex: ['codex', '-q', '--full-auto', '{prompt}'],
      cursor: ['cursor-agent', '-p', '{prompt}']
    },
    model: '',
    // Extra house rules appended to the agent briefing. Put your design system rules here.
    briefing: ''
  }
};

function deepMerge(base, over) {
  if (Array.isArray(over)) return over.slice();
  if (over && typeof over === 'object' && !Array.isArray(over)) {
    const out = { ...base };
    for (const k of Object.keys(over)) {
      out[k] = k in base && base[k] && typeof base[k] === 'object' ? deepMerge(base[k], over[k]) : over[k];
    }
    return out;
  }
  return over === undefined ? base : over;
}

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) {
    if (e.code === 'ENOENT') return null;
    throw new Error('could not read ' + p + ': ' + e.message);
  }
}

export function loadConfig(cwd = process.cwd()) {
  const global = readJson(GLOBAL_CONFIG) || {};
  const projectPath = findProjectConfig(cwd);
  const project = projectPath ? readJson(projectPath) || {} : {};
  const merged = deepMerge(deepMerge(DEFAULTS, global), project);
  merged._path = projectPath;
  merged._root = projectPath ? path.dirname(projectPath) : cwd;
  return merged;
}

export function saveProjectConfig(cfg, file) {
  const out = { ...cfg };
  delete out._path;
  delete out._root;
  fs.writeFileSync(file, JSON.stringify(out, null, 2) + '\n');
  return file;
}

// "https://figma.com/design/KEY/Name?node-id=14-2687" -> "14:2687"
// "14-2687" -> "14:2687" · "14:2687" -> unchanged · "home" -> config.nodes.home
export function resolveNodeId(raw, cfg) {
  if (!raw) return raw;
  let s = String(raw).trim();
  const m = s.match(/node-id=([0-9]+[:-][0-9]+)/i);
  if (m) s = m[1];
  if (cfg && cfg.nodes && cfg.nodes[s]) s = String(cfg.nodes[s]);
  if (/^[0-9]+-[0-9]+$/.test(s)) s = s.replace('-', ':');
  return s;
}

export function fileKeyFromUrl(url) {
  const m = String(url || '').match(/figma\.com\/(?:file|design)\/([A-Za-z0-9]+)/);
  return m ? m[1] : '';
}
