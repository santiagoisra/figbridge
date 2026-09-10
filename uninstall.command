#!/bin/bash
# Removes figbridge from this Mac. Your Figma files are untouched.
set -e
DEST="$HOME/.figbridge"
"$DEST/app/bin/fb.mjs" autostart off >/dev/null 2>&1 || true
launchctl unload "$HOME/Library/LaunchAgents/com.figbridge.daemon.plist" >/dev/null 2>&1 || true
rm -f "$HOME/Library/LaunchAgents/com.figbridge.daemon.plist"
rm -f /usr/local/bin/fb "$HOME/.local/bin/fb"
rm -rf "$DEST"
echo "  figbridge removed. Remove the plugin from Figma in Plugins -> Development if you want it gone too."
read -n 1 -s -r -p "  Press any key to close."
