# Desktop CSP

The packaged webview carries a real Content-Security-Policy instead of the
build-time `null` it inherited from upstream. The configured value lives in
`desktop/src-tauri/tauri.conf.json` under `app.security.csp`:

```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self'; connect-src 'self' ws: wss:
```

`tauri.conf.json` is parsed by `tauri-build` with a schema that rejects unknown
fields, so this file holds the rationale that used to sit in a `"$comment"` key.

## Why each piece

- `default-src 'self'` — every asset the setup window loads is bundled into the
  binary (`frontendDist: ../dist`), so same-origin only.
- `script-src 'self'` — no `wasm-unsafe-eval` and nothing else: Tauri IPC in v2
  uses `postMessage`, not eval or WebAssembly. Tauri's asset pipeline stamps a
  nonce into the HTML and runs `Manager::set_csp` at serve time, which appends
  its own `'sha256-…'` hashes for inline scripts/styles to `script-src` and
  `style-src`
  (`tauri-2.11.5/src/manager/mod.rs`), so those inline resources stay legal
  without widening this entry.
- `style-src 'self' 'unsafe-inline'` — bundled styles plus styles injected at
  runtime (React/dynamic `<style>` elements).
- `img-src 'self' data: blob: https:` — provider marks ship under
  `desktop/src/marks/*.svg` (same-origin), while transcript-rendered images may
  arrive as data/blob URLs or remote `https:` images.
- `font-src 'self'` — no font fetches; explicit so a later `@font-face` cannot
  silently widen anything.
- `connect-src 'self' ws: wss:` — same-origin calls plus gateway WebSocket
  schemes. Today the setup window reaches the stack only through Tauri IPC
  commands, so the ws entries guard the runtime hand-off path; narrow them when
  wave 3 removes the CopilotKit runtime.

## Non-events on purpose

- No `asset:` scheme: `capabilities/default.json` enables no `assetProtocol`
  and no code calls `convertFileSrc`, so bundled fonts/images never go through
  the asset protocol and the scheme is not needed.
- Development builds (`beforeDevCommand`) are unaffected: the development
  webview loads `devUrl` with no CSP attached; the value above is enforced in
  the packaged build where it matters.
