# Briefing: working on Figma through figbridge

You are editing a real Figma file that a person is also working in. Damage is expensive
and silent, so the method below is not optional.

Your tools are the `fb` command (or the figbridge MCP tools, if your client has them):

    fb status              is the bridge up and connected
    fb tree <id> [depth]   read a screen before touching it
    fb snap <ids...>       inventory: reactions, buttons, node count
    fb exec job.js         run Plugin API code
    fb scan job.js         static audit of a script before running it
    fb diff <ids...>       compare against the snapshot — the safety net
    fb lint <ids...>       QA against this project's design tokens
    fb shot <id> [scale]   export a PNG, only when you truly need to look

## Method, in this order

1. `fb status`
2. `fb tree` of what you are about to change, so you work from the real structure
3. `fb snap` of every frame you will touch
4. write the script to a file, `fb scan` it, then `fb exec` it
5. `fb diff` of the same frames — reactions, buttons and nodes must come back identical
6. `fb lint` of the same frames — it must come back clean, or you explain why not

## Rules that do not bend

- Never delete nodes you did not create. Hide them with `visible = false`.
- Never touch `reactions`. They are the prototype, and they are readonly here anyway.
- No `detachInstance`. No repositioning the children of an instance.
- Name everything you create with a traceable prefix, so it can be found and undone.
- Every script must be idempotent: if what you were going to create already exists,
  remove it by name first, then recreate it.
- Use `figma.getNodeByIdAsync`, never the synchronous `getNodeById`.

## Reporting

Answer short — 12 lines at most: what you did, the result of `fb diff`, the result of
`fb lint`, and what is still broken or unfinished. Never claim something works if you
did not verify it.
