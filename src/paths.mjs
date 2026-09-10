// paths.mjs — where things live, on every OS.
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const HOME = os.homedir();
export const IS_WIN = process.platform === 'win32';
export const IS_MAC = process.platform === 'darwin';

export const APP_DIR = path.resolve(fileURLToPath(import.meta.url), '..', '..');
export const HOME_DIR = process.env.FIGBRIDGE_HOME || path.join(HOME, '.figbridge');
export const WORK_DIR = path.join(HOME_DIR, 'work');
export const LOG_FILE = path.join(HOME_DIR, 'bridge.log');
export const PID_FILE = path.join(HOME_DIR, 'bridge.pid');
export const GLOBAL_CONFIG = path.join(HOME_DIR, 'config.json');
export const PLUGIN_DIR = path.join(APP_DIR, 'plugin');

export function ensureDirs() {
  for (const d of [HOME_DIR, WORK_DIR, path.join(WORK_DIR, 'shots'), path.join(WORK_DIR, 'jobs')]) {
    fs.mkdirSync(d, { recursive: true });
  }
}

// Walk up from cwd looking for a project config.
export function findProjectConfig(from = process.cwd()) {
  let dir = path.resolve(from);
  for (;;) {
    const p = path.join(dir, 'figbridge.json');
    if (fs.existsSync(p)) return p;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
