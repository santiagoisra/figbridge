// autostart.mjs — run the bridge at login, on each OS, without asking for admin.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { APP_DIR, HOME, HOME_DIR, LOG_FILE, IS_WIN, IS_MAC } from './paths.mjs';

const LABEL = 'com.figbridge.daemon';
const BRIDGE = path.join(APP_DIR, 'src', 'bridge.mjs');

function macPlistPath() { return path.join(HOME, 'Library', 'LaunchAgents', LABEL + '.plist'); }
function winVbsPath() {
  return path.join(process.env.APPDATA || path.join(HOME, 'AppData', 'Roaming'),
    'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'figbridge.vbs');
}
function linuxDesktopPath() { return path.join(HOME, '.config', 'autostart', 'figbridge.desktop'); }

export function autostartPath() {
  if (IS_MAC) return macPlistPath();
  if (IS_WIN) return winVbsPath();
  return linuxDesktopPath();
}

export function autostartStatus() {
  try { return fs.existsSync(autostartPath()); } catch { return false; }
}

export function installAutostart() {
  const target = autostartPath();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.mkdirSync(HOME_DIR, { recursive: true });

  if (IS_MAC) {
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${process.execPath}</string>
    <string>${BRIDGE}</string>
  </array>
  <key>WorkingDirectory</key><string>${APP_DIR}</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${LOG_FILE}</string>
  <key>StandardErrorPath</key><string>${LOG_FILE}</string>
</dict>
</plist>
`;
    fs.writeFileSync(target, plist);
    spawnSync('launchctl', ['unload', target], { stdio: 'ignore' });
    spawnSync('launchctl', ['load', target], { stdio: 'ignore' });
    return target;
  }

  if (IS_WIN) {
    const vbs = `' figbridge — starts the local Figma bridge at login, with no console window.
Set sh = CreateObject("WScript.Shell")
sh.Run """${process.execPath}"" ""${BRIDGE}""", 0, False
`;
    fs.writeFileSync(target, vbs);
    spawnSync('wscript', [target], { windowsHide: true, stdio: 'ignore' });
    return target;
  }

  const desktop = `[Desktop Entry]
Type=Application
Name=figbridge
Exec=${process.execPath} ${BRIDGE}
X-GNOME-Autostart-enabled=true
`;
  fs.writeFileSync(target, desktop);
  return target;
}

export function removeAutostart() {
  const target = autostartPath();
  if (!fs.existsSync(target)) return false;
  if (IS_MAC) spawnSync('launchctl', ['unload', target], { stdio: 'ignore' });
  fs.unlinkSync(target);
  return true;
}

export { os };
