# Shader Slop Lab

A personal, browser-native WebGPU shader laboratory for writing WGSL, compiling it live, rendering at interactive frame rates, and keeping experiments in a local project library.

## Architecture

- **Vite + TypeScript** — fast local dev/build pipeline and typed browser code.
- **WebGPU + WGSL** — native browser shader compilation and GPU rendering.
- **Monaco Editor** — code editing, WGSL syntax highlighting, keyboard shortcuts, and compiler markers.
- **IndexedDB via `idb`** — persistent shader project storage in the browser.
- **GitHub Pages** — static deployment from the production `dist` build.
- **Legacy workspace** — the original WebGL 01–04 experiments remain available at `legacy.html`.

## Live compiler behavior

Every editor change is debounced and compiled with `GPUShaderModule.getCompilationInfo()`. Errors and warnings are shown in the diagnostics panel and mapped into Monaco markers. A failed compile does **not** replace the last valid render pipeline, so the preview remains stable while code is being repaired.

The renderer uses `createRenderPipelineAsync`, a fixed global bind-group layout, a fullscreen triangle, one uniform-buffer write per frame, and a configurable render scale.

## WGSL contract

A project should provide these entry points:

```wgsl
@vertex fn vsMain(@builtin(vertex_index) vertexIndex: u32) -> VSOut
@fragment fn fsMain(in: VSOut) -> @location(0) vec4f
```

The lab reserves `@group(0) @binding(0)` for two packed `vec4f` globals:

```wgsl
struct Globals {
  resolutionTimeDelta: vec4f, // xy = render resolution, z = time seconds, w = frame delta
  mouseStateFrame: vec4f,     // xy = mouse in render pixels, z = pointer down, w = frame index
};
@group(0) @binding(0) var<uniform> globals: Globals;
```

## Project library

Projects autosave to IndexedDB. Use **Export** to create a portable `.shader.json` backup and **Import** to restore JSON or raw `.wgsl` files. The first run seeds a few WebGPU examples, including a WGSL sword-trail study with glow and directional smear.

## Local development

```bash
npm install
npm run dev
```

Type-check and build:

```bash
npm run typecheck
npm run build
```

## Shortcuts

- `Ctrl/Cmd + Enter` — compile immediately
- `Ctrl/Cmd + S` — save immediately

## Browser requirements

WebGPU requires a current WebGPU-capable browser and a secure context (HTTPS or localhost). GitHub Pages satisfies the secure-context requirement. If WebGPU is unavailable, the editor/library remain visible and the legacy WebGL workspace can still be opened.
