import { monaco } from './editor/glsl';

type UniformKind = 'float' | 'int' | 'uint' | 'bool' | 'matrix';

interface UniformSpec {
  name: string;
  type: string;
  components: number;
  kind: UniformKind;
  matrixSize?: number;
}

const BUILTIN_UNIFORMS = new Set([
  'u_resolution',
  'u_time',
  'u_delta',
  'u_mouse',
  'u_pointerDown',
  'u_frame',
]);

const PREVIEW_SIZE_KEY = 'shader-slop-lab:preview-size';
const ACTIVE_PROJECT_KEY = 'shader-slop-lab:active-project';
const UNIFORM_STORAGE_PREFIX = 'shader-slop-lab:uniforms:';

void bootControls();

async function bootControls(): Promise<void> {
  const lab = await waitForLab();
  if (!lab) return;

  const { workspace, projectName, canvas, previewStage, previewMessage, previewHeader, model } = lab;
  installStyles();

  const uniformPanel = document.createElement('aside');
  uniformPanel.id = 'uniform-panel';
  uniformPanel.className = 'uniform-panel panel';
  uniformPanel.innerHTML = `
    <div class="panel-head uniform-panel-head">
      <div>
        <div class="eyebrow">UNIFORMS</div>
        <h1>Controls</h1>
      </div>
      <span id="uniform-count" class="metric">0</span>
    </div>
    <div id="uniform-controls" class="uniform-controls"></div>
    <div class="uniform-note">Auto-detected numeric uniforms · built-in lab uniforms are excluded</div>
  `;

  const library = workspace.querySelector('.library');
  if (library) library.after(uniformPanel);
  else workspace.prepend(uniformPanel);

  const uniformControls = uniformPanel.querySelector<HTMLDivElement>('#uniform-controls');
  const uniformCount = uniformPanel.querySelector<HTMLSpanElement>('#uniform-count');
  if (!uniformControls || !uniformCount) return;

  const previewFrame = document.createElement('div');
  previewFrame.className = 'preview-frame';
  previewStage.insertBefore(previewFrame, canvas);
  previewFrame.append(canvas, previewMessage);

  const sizeControl = document.createElement('div');
  sizeControl.className = 'preview-size-control';
  sizeControl.innerHTML = `
    <label>W <input id="preview-width" type="number" min="64" max="2048" step="1" inputmode="numeric"></label>
    <span>×</span>
    <label>H <input id="preview-height" type="number" min="64" max="2048" step="1" inputmode="numeric"></label>
  `;
  const compileTime = previewHeader.querySelector('#compile-time');
  previewHeader.insertBefore(sizeControl, compileTime ?? null);

  const widthInput = sizeControl.querySelector<HTMLInputElement>('#preview-width');
  const heightInput = sizeControl.querySelector<HTMLInputElement>('#preview-height');
  if (!widthInput || !heightInput) return;

  const initialSize = readPreviewSize(previewStage);
  widthInput.value = String(initialSize.width);
  heightInput.value = String(initialSize.height);
  applyPreviewSize(previewFrame, initialSize.width, initialSize.height);

  const updatePreviewSize = (): void => {
    const width = clampInteger(Number(widthInput.value), 64, 2048, initialSize.width);
    const height = clampInteger(Number(heightInput.value), 64, 2048, initialSize.height);
    widthInput.value = String(width);
    heightInput.value = String(height);
    applyPreviewSize(previewFrame, width, height);
    localStorage.setItem(PREVIEW_SIZE_KEY, JSON.stringify({ width, height }));
  };

  widthInput.addEventListener('change', updatePreviewSize);
  heightInput.addEventListener('change', updatePreviewSize);
  widthInput.addEventListener('input', updatePreviewSize);
  heightInput.addEventListener('input', updatePreviewSize);

  const gl = canvas.getContext('webgl2');
  let specs: UniformSpec[] = [];
  let values = new Map<string, number[]>();
  let rebuildTimer = 0;
  let lastProgram: WebGLProgram | null = null;

  const getProjectKey = (): string => {
    const active = localStorage.getItem(ACTIVE_PROJECT_KEY);
    return active || `name:${projectName.value.trim() || 'untitled'}`;
  };

  const loadUniformValues = (): Map<string, number[]> => {
    const result = new Map<string, number[]>();
    try {
      const raw = localStorage.getItem(`${UNIFORM_STORAGE_PREFIX}${getProjectKey()}`);
      if (!raw) return result;
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      for (const [name, value] of Object.entries(parsed)) {
        if (Array.isArray(value) && value.every((item) => typeof item === 'number' && Number.isFinite(item))) {
          result.set(name, value as number[]);
        }
      }
    } catch {
      // Ignore malformed local state and regenerate defaults from declarations.
    }
    return result;
  };

  const saveUniformValues = (): void => {
    const state: Record<string, number[]> = {};
    for (const [name, value] of values) state[name] = value;
    localStorage.setItem(`${UNIFORM_STORAGE_PREFIX}${getProjectKey()}`, JSON.stringify(state));
  };

  const applyUniforms = (): void => {
    if (!gl) return;
    const program = gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram | null;
    if (!program) return;

    gl.useProgram(program);
    for (const spec of specs) {
      const location = gl.getUniformLocation(program, spec.name);
      if (!location) continue;
      const current = normalizeValues(values.get(spec.name), spec);
      values.set(spec.name, current);
      setUniform(gl, location, spec, current);
    }
  };

  const renderUniformPanel = (): void => {
    specs = parseUniforms(model.getValue());
    const stored = loadUniformValues();
    values = new Map<string, number[]>();
    uniformCount.textContent = String(specs.length);
    uniformControls.innerHTML = '';

    if (!specs.length) {
      uniformControls.innerHTML = '<div class="uniform-empty">No custom numeric uniforms detected.</div>';
      return;
    }

    for (const spec of specs) {
      const current = normalizeValues(stored.get(spec.name), spec);
      values.set(spec.name, current);

      const row = document.createElement('div');
      row.className = 'uniform-row';
      row.innerHTML = `<div class="uniform-label"><span>${escapeHTML(spec.name)}</span><small>${escapeHTML(spec.type)}</small></div>`;

      const fields = document.createElement('div');
      fields.className = `uniform-fields uniform-fields-${Math.min(spec.components, 4)}`;

      if (spec.kind === 'bool') {
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = current[0] !== 0;
        input.addEventListener('input', () => {
          values.set(spec.name, [input.checked ? 1 : 0]);
          saveUniformValues();
          applyUniforms();
        });
        fields.append(input);
      } else {
        for (let index = 0; index < spec.components; index += 1) {
          const input = document.createElement('input');
          input.type = 'number';
          input.step = spec.kind === 'int' || spec.kind === 'uint' ? '1' : '0.01';
          input.value = formatUniformNumber(current[index]);
          input.setAttribute('aria-label', `${spec.name} ${componentLabel(spec, index)}`);
          input.addEventListener('input', () => {
            const next = [...(values.get(spec.name) ?? current)];
            let numeric = Number(input.value);
            if (!Number.isFinite(numeric)) return;
            if (spec.kind === 'int' || spec.kind === 'uint') numeric = Math.round(numeric);
            if (spec.kind === 'uint') numeric = Math.max(0, numeric);
            next[index] = numeric;
            values.set(spec.name, next);
            saveUniformValues();
            applyUniforms();
          });
          fields.append(input);
        }
      }

      row.append(fields);
      uniformControls.append(row);
    }

    saveUniformValues();
    applyUniforms();
  };

  const scheduleUniformPanel = (): void => {
    window.clearTimeout(rebuildTimer);
    rebuildTimer = window.setTimeout(renderUniformPanel, 0);
  };

  model.onDidChangeContent(scheduleUniformPanel);
  projectName.addEventListener('change', scheduleUniformPanel);
  scheduleUniformPanel();

  const watchProgram = (): void => {
    if (gl) {
      const program = gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram | null;
      if (program && program !== lastProgram) {
        lastProgram = program;
        applyUniforms();
      }
    }
    requestAnimationFrame(watchProgram);
  };
  requestAnimationFrame(watchProgram);
}

async function waitForLab(): Promise<{
  workspace: HTMLElement;
  projectName: HTMLInputElement;
  canvas: HTMLCanvasElement;
  previewStage: HTMLElement;
  previewMessage: HTMLElement;
  previewHeader: HTMLElement;
  model: ReturnType<typeof monaco.editor.getModels>[number];
} | null> {
  for (let attempt = 0; attempt < 600; attempt += 1) {
    const workspace = document.querySelector<HTMLElement>('.workspace');
    const projectName = document.querySelector<HTMLInputElement>('#project-name');
    const canvas = document.querySelector<HTMLCanvasElement>('#preview');
    const previewStage = document.querySelector<HTMLElement>('.preview-stage');
    const previewMessage = document.querySelector<HTMLElement>('#preview-message');
    const previewHeader = document.querySelector<HTMLElement>('.preview-panel .panel-title-row');
    const model = monaco.editor.getModels().find((item) => item.getLanguageId() === 'glsl');

    if (workspace && projectName && canvas && previewStage && previewMessage && previewHeader && model) {
      return { workspace, projectName, canvas, previewStage, previewMessage, previewHeader, model };
    }
    await nextFrame();
  }
  return null;
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function readPreviewSize(stage: HTMLElement): { width: number; height: number } {
  try {
    const stored = JSON.parse(localStorage.getItem(PREVIEW_SIZE_KEY) || 'null') as { width?: number; height?: number } | null;
    if (stored && Number.isFinite(stored.width) && Number.isFinite(stored.height)) {
      return {
        width: clampInteger(Number(stored.width), 64, 2048, 512),
        height: clampInteger(Number(stored.height), 64, 2048, 512),
      };
    }
  } catch {
    // Use the current preview area as the initial explicit viewport size.
  }

  const rect = stage.getBoundingClientRect();
  return {
    width: clampInteger(Math.round(rect.width - 32), 64, 2048, 512),
    height: clampInteger(Math.round(rect.height - 32), 64, 2048, 512),
  };
}

function applyPreviewSize(frame: HTMLElement, width: number, height: number): void {
  frame.style.width = `${width}px`;
  frame.style.height = `${height}px`;
}

function parseUniforms(source: string): UniformSpec[] {
  const clean = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  const pattern = /\buniform\s+(?:(?:lowp|mediump|highp)\s+)?(float|int|uint|bool|vec[234]|ivec[234]|uvec[234]|mat[234])\s+([^;]+);/g;
  const result: UniformSpec[] = [];
  const seen = new Set<string>();

  for (const match of clean.matchAll(pattern)) {
    const type = match[1];
    for (const rawName of match[2].split(',')) {
      const nameMatch = rawName.trim().match(/^([A-Za-z_]\w*)\s*(?:\[.*\])?$/);
      if (!nameMatch) continue;
      const name = nameMatch[1];
      if (BUILTIN_UNIFORMS.has(name) || seen.has(name) || rawName.includes('[')) continue;
      const spec = uniformSpec(name, type);
      if (!spec) continue;
      seen.add(name);
      result.push(spec);
    }
  }

  return result;
}

function uniformSpec(name: string, type: string): UniformSpec | null {
  if (type === 'float') return { name, type, components: 1, kind: 'float' };
  if (type === 'int') return { name, type, components: 1, kind: 'int' };
  if (type === 'uint') return { name, type, components: 1, kind: 'uint' };
  if (type === 'bool') return { name, type, components: 1, kind: 'bool' };
  if (/^vec[234]$/.test(type)) return { name, type, components: Number(type.at(-1)), kind: 'float' };
  if (/^ivec[234]$/.test(type)) return { name, type, components: Number(type.at(-1)), kind: 'int' };
  if (/^uvec[234]$/.test(type)) return { name, type, components: Number(type.at(-1)), kind: 'uint' };
  if (/^mat[234]$/.test(type)) {
    const matrixSize = Number(type.at(-1));
    return { name, type, components: matrixSize * matrixSize, kind: 'matrix', matrixSize };
  }
  return null;
}

function normalizeValues(value: number[] | undefined, spec: UniformSpec): number[] {
  const defaults = defaultValues(spec);
  if (!value) return defaults;
  const result = defaults.map((fallback, index) => {
    const item = value[index];
    if (!Number.isFinite(item)) return fallback;
    if (spec.kind === 'int') return Math.round(item);
    if (spec.kind === 'uint') return Math.max(0, Math.round(item));
    if (spec.kind === 'bool') return item ? 1 : 0;
    return item;
  });
  return result;
}

function defaultValues(spec: UniformSpec): number[] {
  if (spec.kind !== 'matrix' || !spec.matrixSize) return Array(spec.components).fill(0) as number[];
  const values = Array(spec.components).fill(0) as number[];
  for (let index = 0; index < spec.matrixSize; index += 1) {
    values[index * spec.matrixSize + index] = 1;
  }
  return values;
}

function setUniform(gl: WebGL2RenderingContext, location: WebGLUniformLocation, spec: UniformSpec, value: number[]): void {
  if (spec.kind === 'bool') {
    gl.uniform1i(location, value[0] ? 1 : 0);
    return;
  }

  if (spec.kind === 'matrix') {
    const data = new Float32Array(value);
    if (spec.matrixSize === 2) gl.uniformMatrix2fv(location, false, data);
    else if (spec.matrixSize === 3) gl.uniformMatrix3fv(location, false, data);
    else gl.uniformMatrix4fv(location, false, data);
    return;
  }

  if (spec.kind === 'float') {
    const data = new Float32Array(value);
    if (spec.components === 1) gl.uniform1f(location, data[0]);
    else if (spec.components === 2) gl.uniform2fv(location, data);
    else if (spec.components === 3) gl.uniform3fv(location, data);
    else gl.uniform4fv(location, data);
    return;
  }

  if (spec.kind === 'int') {
    const data = new Int32Array(value.map((item) => Math.round(item)));
    if (spec.components === 1) gl.uniform1i(location, data[0]);
    else if (spec.components === 2) gl.uniform2iv(location, data);
    else if (spec.components === 3) gl.uniform3iv(location, data);
    else gl.uniform4iv(location, data);
    return;
  }

  const data = new Uint32Array(value.map((item) => Math.max(0, Math.round(item))));
  if (spec.components === 1) gl.uniform1ui(location, data[0]);
  else if (spec.components === 2) gl.uniform2uiv(location, data);
  else if (spec.components === 3) gl.uniform3uiv(location, data);
  else gl.uniform4uiv(location, data);
}

function componentLabel(spec: UniformSpec, index: number): string {
  if (spec.kind === 'matrix' && spec.matrixSize) {
    return `${Math.floor(index / spec.matrixSize) + 1},${(index % spec.matrixSize) + 1}`;
  }
  return ['x', 'y', 'z', 'w'][index] ?? String(index + 1);
}

function formatUniformNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(6)));
}

function clampInteger(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function escapeHTML(value: string): string {
  return value.replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  })[char] || char);
}

function installStyles(): void {
  const style = document.createElement('style');
  style.textContent = `
    .workspace {
      grid-template-columns: 230px 240px minmax(320px, 1.05fr) minmax(360px, 1fr);
    }
    .uniform-panel {
      display: flex;
      flex-direction: column;
      min-width: 0;
      min-height: 0;
      padding: 12px;
      overflow: hidden;
    }
    .uniform-panel-head { flex: 0 0 auto; }
    .uniform-controls {
      flex: 1;
      min-height: 0;
      overflow: auto;
      padding: 10px 0;
    }
    .uniform-row {
      padding: 8px 0 10px;
      border-bottom: 1px solid #202020;
    }
    .uniform-label {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 6px;
      font-size: 11px;
    }
    .uniform-label span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .uniform-label small { color: #656565; font-size: 9px; }
    .uniform-fields {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(46px, 1fr));
      gap: 5px;
    }
    .uniform-fields input[type="number"] {
      width: 100%;
      min-width: 0;
      height: 26px;
      border: 1px solid #2a2a2a;
      border-radius: 5px;
      background: #151515;
      padding: 0 6px;
      outline: none;
      font-size: 10px;
      font-variant-numeric: tabular-nums;
    }
    .uniform-fields input[type="number"]:focus { border-color: #555; }
    .uniform-fields input[type="checkbox"] { width: 16px; height: 16px; accent-color: #aaa; }
    .uniform-empty, .uniform-note { color: #595959; font-size: 9px; line-height: 1.5; }
    .uniform-empty { padding: 6px 0; }
    .uniform-note { flex: 0 0 auto; padding-top: 9px; border-top: 1px solid #202020; }

    .preview-size-control {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-left: auto;
      color: #707070;
      font-size: 9px;
    }
    .preview-size-control label { display: flex; align-items: center; gap: 3px; }
    .preview-size-control input {
      width: 58px;
      height: 24px;
      border: 1px solid #2b2b2b;
      border-radius: 5px;
      background: #151515;
      padding: 0 5px;
      outline: none;
      color: #aaa;
      font-size: 10px;
      font-variant-numeric: tabular-nums;
    }
    .preview-size-control input:focus { border-color: #555; }
    .preview-stage {
      display: flex;
      align-items: flex-start;
      justify-content: flex-start;
      overflow: auto;
      padding: 16px;
      background-color: #0d0d0d;
      background-image: none;
    }
    .preview-frame {
      position: relative;
      flex: none;
      margin: auto;
      overflow: hidden;
      border: 1px solid #303030;
      background-color: #181818;
      background-image:
        linear-gradient(45deg, #202020 25%, transparent 25%),
        linear-gradient(-45deg, #202020 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, #202020 75%),
        linear-gradient(-45deg, transparent 75%, #202020 75%);
      background-size: 20px 20px;
      background-position: 0 0, 0 10px, 10px -10px, -10px 0;
    }
    .preview-frame #preview { width: 100%; height: 100%; }

    @media (max-width: 1180px) {
      .workspace {
        grid-template-columns: 190px 210px minmax(280px, 1fr) minmax(300px, 1fr);
      }
    }
    @media (max-width: 900px) {
      body { overflow: auto; }
      .workspace {
        grid-template-columns: 1fr !important;
        grid-template-rows: auto auto 62vh 62vh !important;
      }
      .uniform-panel { max-height: 36vh; }
      .preview-size-control { margin-left: 0; }
    }
  `;
  document.head.append(style);
}
