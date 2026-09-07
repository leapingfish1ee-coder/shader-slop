# Shader Slop Lab

A browser-native personal shader laboratory focused on **GLSL ES 3.00 + WebGL2** for live coding, compilation diagnostics, interactive rendering, and local experiment storage.

## Primary architecture

- **Vite + TypeScript** — local development and production builds.
- **GLSL ES 3.00 + WebGL2** — the primary shader language and live rendering backend.
- **Monaco Editor** — GLSL syntax highlighting, editing, compiler markers, and shortcuts.
- **IndexedDB via `idb`** — persistent browser-side shader project storage.
- **GitHub Pages** — production deployment.
- **Legacy / archived sources** — the original WebGL experiments remain at `legacy.html`; the earlier WebGPU/WGSL implementation remains in the repository as secondary reference code.

## GLSL ES 3.00 contract

The main editor contains the **fragment shader**. Every primary project begins with:

```glsl
#version 300 es
precision highp float;
```

The lab supplies a fixed fullscreen-triangle vertex shader with:

```glsl
out vec2 v_uv;
```

The fragment shader can use:

```glsl
in vec2 v_uv;
out vec4 outColor;

uniform vec2 u_resolution;   // render pixels
uniform float u_time;        // seconds since renderer start
uniform float u_delta;       // seconds since previous frame
uniform vec2 u_mouse;        // pointer in render pixels, origin bottom-left
uniform float u_pointerDown; // 0.0 or 1.0
uniform float u_frame;       // rendered frame index
```

Compile and link errors from WebGL2 are mapped into the diagnostics panel and Monaco markers. A failed compile keeps the last valid linked program running.

## Project library

Projects autosave to IndexedDB. Built-in GLSL presets are seeded into existing libraries, including migration of the old built-in WGSL presets to their GLSL ES 3.00 replacements. User-created archived sources are not deleted.

Use **Export** for portable `.shader.json` backups and **Import** for `.shader.json`, `.glsl`, `.frag`, or `.fs` files.

## Local development

```bash
npm install
npm run dev
```

Type-check and production build:

```bash
npm run typecheck
npm run build
```

## Shortcuts

- `Ctrl/Cmd + Enter` — compile immediately
- `Ctrl/Cmd + S` — save immediately

## Browser requirements

The primary lab requires WebGL2, which is the browser API exposing GLSL ES 3.00. The older `legacy.html` workspace remains available separately.
