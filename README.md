# figbridge

Let any AI agent read from **and write to** your Figma Desktop file — and check its own work
before it tells you it is done.

No API key. No plan upgrade. No cloud service in the middle. A small local daemon talks to a
Figma development plugin over a WebSocket on your own machine, and exposes a plain HTTP API,
a CLI, and an MCP server on top of it.

Works on **macOS** and **Windows**. Install is a double-click, plus one import inside Figma.

```
fb tree 14:2687 2            # read the screen
fb snap 14:2687              # inventory before touching anything
fb exec job.js               # run Plugin API code
fb diff 14:2687              # did anything break that you did not mean to break
fb lint 14:2687              # QA against your own design tokens
```

---

## Credit where it belongs

**The Figma side of this is not my work.** figbridge bundles
**[Figma Desktop Bridge](https://github.com/southleft/figma-console-mcp/tree/main/figma-desktop-bridge)**,
the development plugin from **[figma-console-mcp](https://github.com/southleft/figma-console-mcp)**
by **[Southleft](https://southleft.com)** — MIT licensed, copied here unmodified (`plugin/`) so
that installing stays a double-click. That plugin is the piece that actually reaches inside
Figma. Without it there is no bridge, and this project would not exist.

What figbridge adds on top: its own server for that plugin's WebSocket protocol, the `fb` CLI,
the snapshot/diff safety net, the token-driven linter, the MCP server and the installers.

If you want the plugin's cloud relay, its browser-console tooling or its own MCP server — it
does considerably more than what figbridge uses — go to the upstream project. Give it the star.

---

## Why it exists

Agents are good at writing Figma Plugin API code and bad at knowing whether it worked.
Screenshots are expensive to look at and easy to misread. So figbridge gives the agent two
things instead: a **structural diff** (prototype reactions, visible buttons, node counts —
a button can vanish without any reaction changing, so counting reactions alone is not enough)
and a **linter** that checks the result against the design tokens of your own file.

The loop it makes possible: snapshot → execute → diff → lint. Cheap, mechanical, and it
catches the failures that a screenshot does not.

---

## Install

### macOS

1. Download the release ZIP and unzip it.
2. Double-click **`install.command`**.
   *(macOS blocks apps from unidentified developers: if it refuses, right-click the file →
   Open → Open. It is a plain shell script — read it first if you like.)*
3. Figma Desktop opens a folder for you. In Figma: **Plugins → Development → Import plugin
   from manifest…** and pick the `manifest.json` in that folder. You only ever do this once.

### Windows

1. Download the release ZIP and unzip it.
2. Double-click **`install.bat`**.
   *(SmartScreen may warn: More info → Run anyway.)*
3. Same last step: **Plugins → Development → Import plugin from manifest…**

The installer puts the tool in `~/.figbridge` (`%LOCALAPPDATA%\figbridge` on Windows), adds
the `fb` command to your PATH, and starts the bridge at login. It installs Node.js for you if
you do not have it.

### Every day after that

Open Figma, then **Plugins → Development → Figma Desktop Bridge**. That is the only manual
step — Figma does not let a plugin launch itself. `fb start` will open Figma and check
everything for you.

```
fb status     # bridge up? plugin connected?
fb doctor     # check every moving part when something is off
```

---

## Set up a project

In the folder where you work (a repo, or just a folder for that design file):

```
fb init --url "https://www.figma.com/design/XXXX/My-File"
fb tokens --write        # with the file open in Figma
```

`fb init` writes `figbridge.json` and an `AGENT.md` briefing. `fb tokens --write` reads the
palette, type scale, fonts and control heights **out of your own file** and saves them, so
the linter checks against your design system and not against somebody else's.

`figbridge.json`:

```jsonc
{
  "figmaUrl": "https://www.figma.com/design/XXXX/My-File",
  "nodes": { "home": "14:2687", "checkout": "22:104" },  // fb lint home checkout
  "palette": ["#0f172a", "#ffffff", "..."],
  "typeScale": [12, 14, 16, 20, 24, 32],
  "controlHeights": [32, 40, 48],
  "fonts": ["Inter"],
  "lint": {
    "overflow": true, "overlap": true, "palette": true, "typeScale": true,
    "controlHeights": true, "clippedText": true, "fonts": true,
    "currencySpace": false,
    "ignoreNames": "^(Brand|Logo|Iso|Illustration)"
  }
}
```

Node ids can be written as `14:2687`, `14-2687`, a full Figma URL, or a name from `nodes`.

---

## Use it from an agent

figbridge ships an MCP server, so any MCP client gets the same tools:
`figma_status`, `figma_exec`, `figma_snapshot`, `figma_diff`, `figma_lint`, `figma_tree`,
`figma_export_png`, `figma_tokens`.

**Claude Code** — `.mcp.json` in your project:

```json
{
  "mcpServers": {
    "figbridge": { "command": "fb", "args": ["mcp"] }
  }
}
```

**opencode** — `opencode.json`:

```json
{
  "mcp": {
    "figbridge": { "type": "local", "command": ["fb", "mcp"], "enabled": true }
  }
}
```

**Cursor / Zed / anything else**: same shape — command `fb`, args `["mcp"]`.

Several agents can run at once. Each one starts its own `fb mcp` process, and they all talk
to the single local bridge, so you can fan work out across a file without running a server
per agent. The bridge serializes what actually reaches Figma.

`fb agent task.md` is the other way round: it hands a task file to a local coding agent
(`claude`, `opencode`, `codex`, `cursor-agent` — configurable) with the `AGENT.md` briefing
prepended, and prints its report. Useful when you want the expensive model to orchestrate
and a cheap one to execute.

---

## Commands

```
fb start                 open Figma, bring the bridge up, check the project
fb status                is the bridge up and is the plugin talking to it
fb up | down | restart   control the background bridge
fb autostart on|off      run the bridge at login
fb plugin                where the Figma plugin is, and how to import it
fb doctor                check every moving part

fb init [--url URL]      create figbridge.json (+ AGENT.md)
fb tokens [--write]      read palette, type scale and fonts from the open file

fb exec job.js           run Plugin API code (file, inline string, or - for stdin)
fb snap <ids...>         inventory: reactions, visible buttons, node count
fb diff <ids...>         compare against the last snapshot
fb lint <ids...>         QA against your tokens
fb tree <id> [depth]     dump a node tree with layout properties
fb shot <id> [scale]     export a PNG
fb scan job.js           static audit of a script before running it
fb agent task.md         hand the task to a local coding agent
fb mcp                   run as an MCP server
fb log                   last lines of the bridge log
```

### The linter

`fb lint` reports, per frame: children overflowing the frame, siblings overlapping each
other, colors outside the palette, font sizes outside the type scale, fonts outside the
system, buttons and inputs at non-standard heights, and text clipped by a fixed height.
`ERROR` exits non-zero, `WARN` does not — so it drops straight into a script or a CI step.

### The auditor

`fb scan` refuses a script before it runs if it calls `detachInstance`, assigns to
`reactions` or `currentPage`, uses the synchronous `getNodeById`, or calls `.remove()`
without filtering by name first. Those are the calls that quietly destroy a prototype.
The MCP `figma_exec` tool applies the same check.

---

## How it works

```
  your agent  ──stdio──▶  fb mcp  ──http 8787──▶  bridge daemon  ──ws 9223──▶  Figma plugin
  your shell  ────────────▶  fb                                                 (Plugin API)
```

Everything binds to `127.0.0.1`. Nothing leaves your machine, and there is no account,
token or telemetry anywhere in this tool.

**Security, plainly:** figbridge runs arbitrary Plugin API code in your open Figma file, and
anything that can reach `127.0.0.1:8787` can drive it. That is the whole point of the tool,
and it is also the risk — treat it like an open editor, and take a snapshot before letting an
agent loose on work you care about. `fb diff` exists precisely because agents get it wrong.

---

## Requirements

- Figma **Desktop** (the browser version cannot run development plugins)
- Node.js 18+ (the installer handles it)
- macOS or Windows

## License and credits

MIT — see [LICENSE](LICENSE).

The bundled Figma plugin in [`plugin/`](plugin/) is **Figma Desktop Bridge** from
[figma-console-mcp](https://github.com/southleft/figma-console-mcp) by
[Southleft](https://southleft.com), MIT licensed, redistributed here unmodified so the install
can be a single double-click. Its license ships with it in [`plugin/LICENSE`](plugin/LICENSE),
and the details are in [NOTICE.md](NOTICE.md). All the credit for the plugin side is theirs.
