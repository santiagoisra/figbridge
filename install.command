#!/bin/bash
# figbridge installer for macOS. Double-click this file.
set -e
cd "$(dirname "$0")"
SRC="$(pwd)"
DEST="$HOME/.figbridge/app"

echo
echo "  figbridge — installing"
echo "  ----------------------"
echo

# 1. Node
NODE=""
for c in "$(command -v node || true)" /opt/homebrew/bin/node /usr/local/bin/node; do
  [ -n "$c" ] && [ -x "$c" ] && NODE="$c" && break
done
if [ -z "$NODE" ]; then
  echo "  Node.js is missing, and figbridge needs it."
  if command -v brew >/dev/null 2>&1; then
    echo "  Installing it with Homebrew..."
    brew install node
    NODE="$(command -v node)"
  else
    echo "  Install it from https://nodejs.org (the LTS button), then double-click this file again."
    open "https://nodejs.org/en/download"
    read -n 1 -s -r -p "  Press any key to close."
    exit 1
  fi
fi
echo "  node          $("$NODE" --version)"

# 2. Files
rm -rf "$DEST"
mkdir -p "$DEST"
cp -R "$SRC/bin" "$SRC/src" "$SRC/jobs" "$SRC/templates" "$SRC/plugin" "$SRC/package.json" "$DEST/"
chmod +x "$DEST/bin/fb.mjs"
echo "  installed to  $DEST"

# 3. The `fb` command
SHIM=""
for d in /usr/local/bin "$HOME/.local/bin"; do
  mkdir -p "$d" 2>/dev/null || true
  if [ -w "$d" ]; then SHIM="$d/fb"; break; fi
done
[ -z "$SHIM" ] && SHIM="$HOME/.local/bin/fb" && mkdir -p "$HOME/.local/bin"
cat > "$SHIM" <<EOF
#!/bin/bash
exec "$NODE" "$DEST/bin/fb.mjs" "\$@"
EOF
chmod +x "$SHIM"
echo "  command       $SHIM"

case ":$PATH:" in
  *":$(dirname "$SHIM"):"*) ;;
  *)
    for rc in "$HOME/.zshrc" "$HOME/.bash_profile"; do
      [ -f "$rc" ] || touch "$rc"
      grep -q "figbridge PATH" "$rc" || printf '\n# figbridge PATH\nexport PATH="%s:$PATH"\n' "$(dirname "$SHIM")" >> "$rc"
    done
    echo "  added it to your PATH — open a new terminal window to pick it up"
    ;;
esac

# 4. Background bridge, at login
"$SHIM" autostart on >/dev/null 2>&1 || true
"$SHIM" up >/dev/null 2>&1 || true
echo "  bridge        running, and it will start again at login"

# 5. The Figma plugin
echo
echo "  ONE LAST STEP, in Figma Desktop:"
echo "    Plugins  ->  Development  ->  Import plugin from manifest..."
echo "    and pick the manifest.json in the folder that just opened."
echo
open "$DEST/plugin"
echo "  After that, launch it from Plugins -> Development -> Figma Desktop Bridge."
echo "  Then, in a new terminal:  fb status"
echo
read -n 1 -s -r -p "  Press any key to close."
echo
