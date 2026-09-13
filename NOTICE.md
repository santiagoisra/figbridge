# Third-party notices

## Figma Desktop Bridge (`plugin/`)

The Figma development plugin bundled in `plugin/` is **Figma Desktop Bridge**, taken
unmodified from [figma-console-mcp](https://github.com/southleft/figma-console-mcp), a project
by **[Southleft](https://southleft.com)**.

    MIT License
    Copyright (c) 2025 Figma Console MCP Contributors

It is redistributed here, under the terms of that license, so that installing figbridge is
a single double-click instead of a git clone. Its full license text ships alongside it in
`plugin/LICENSE`. The plugin's own README is kept as `plugin/README.md`.

figbridge implements its own server for the plugin's WebSocket protocol (`src/bridge.mjs`)
and does not use any other code from that project. If you want the plugin's cloud relay,
its browser console tooling or its own MCP server, go to the upstream project — it does
more than what figbridge needs.

Nothing else in this repository is third-party code, and figbridge has no runtime
dependencies.
