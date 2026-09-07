import './styles.css';
import { registerWGSL, monaco } from './editor/wgsl';
import { builtInPresets, starterWGSL } from './shaders/presets';
import {
  createProject,
  ensurePresets,
  getProject,
  listProjects,
  putProject,
  removeProject,
  type ShaderProject,
} from './storage/projects';
import { WebGPURenderer, type CompileMessage } from './webgpu/renderer';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('App root is missing.');

app.innerHTML = `
  <div class="lab-shell">
    <header class="topbar">
      <div class="brand">
        <strong>Shader Slop Lab</strong>
        <span class="badge" id="gpu-badge">WebGPU</span>
      </div>
      <div class="toolbar toolbar-grow">
        <input id="project-name" class="project-name" aria-label="Project name" />
        <button id="save-project" type="button">Save</button>
        <button id="compile-project" type="button" class="primary">Compile</button>
      </div>
      <div class="toolbar">
        <span id="compile-status" class="status neutral">initializing</span>
        <span id="fps" class="metric">-- fps</span>
        <label class="scale-control">Scale
          <select id="render-scale">
            <option value="0.5">0.5×</option>
            <option value="0.75">0.75×</option>
            <option value="1" selected>1×</option>
            <option value="1.5">1.5×</option>
            <option value="2">2×</option>
          </select>
        </label>
        <button id="pause-render" type="button">Pause</button>
        <a class="button-link" href="./legacy.html">Legacy 01–04</a>
      </div>
    </header>

    <main class="workspace">
      <aside class="library panel">
        <div class="panel-head">
          <div>
            <div class="eyebrow">LIBRARY</div>
            <h1>Shaders</h1>
          </div>
          <button id="new-project" type="button" title="New shader">＋</button>
        </div>
        <div id="project-list" class="project-list"></div>
        <div class="library-actions">
          <button id="duplicate-project" type="button">Duplicate</button>
          <button id="delete-project" type="button">Delete</button>
          <button id="export-project" type="button">Export</button>
          <label class="file-button">Import<input id="import-project" type="file" accept=".json,.wgsl,application/json,text/plain" hidden /></label>
        </div>
        <div id="library-note" class="library-note">IndexedDB autosave · JSON/WGSL import/export</div>
      </aside>

      <section class="editor-panel panel">
        <div class="panel-title-row">
          <div>
            <div class="eyebrow">WGSL SOURCE</div>
            <span id="save-state">saved</span>
          </div>
          <div class="shortcut-hint">⌘/Ctrl+Enter compile · ⌘/Ctrl+S save</div>
        </div>
        <div id="editor" class="editor"></div>
      </section>

      <section class="preview-panel panel">
        <div class="panel-title-row">
          <div>
            <div class="eyebrow">LIVE OUTPUT</div>
            <span id="resolution">-- × --</span>
          </div>
          <span id="compile-time" class="metric">-- ms</span>
        </div>
        <div class="preview-stage">
          <canvas id="preview"></canvas>
          <div id="preview-message" class="preview-message" hidden></div>
        </div>
        <div class="diagnostics-head">
          <span>Diagnostics</span>
          <span id="diagnostic-count">0</span>
        </div>
        <div id="diagnostics" class="diagnostics"><div class="diagnostic-empty">No diagnostics.</div></div>
      </section>
    </main>
  </div>
`;

const $ = <T extends HTMLElement>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
};

const projectName = $<HTMLInputElement>('#project-name');
const saveButton = $<HTMLButtonElement>('#save-project');
const compileButton = $<HTMLButtonElement>('#compile-project');
const pauseButton = $<HTMLButtonElement>('#pause-render');
const scaleSelect = $<HTMLSelectElement>('#render-scale');
const projectList = $<HTMLDivElement>('#project-list');
const newButton = $<HTMLButtonElement>('#new-project');
const duplicateButton = $<HTMLButtonElement>('#duplicate-project');
const deleteButton = $<HTMLButtonElement>('#delete-project');
const exportButton = $<HTMLButtonElement>('#export-project');
const importInput = $<HTMLInputElement>('#import-project');
const libraryNote = $<HTMLDivElement>('#library-note');
const saveState = $<HTMLSpanElement>('#save-state');
const status = $<HTMLSpanElement>('#compile-status');
const compileTime = $<HTMLSpanElement>('#compile-time');
const fps = $<HTMLSpanElement>('#fps');
const resolution = $<HTMLSpanElement>('#resolution');
const diagnostics = $<HTMLDivElement>('#diagnostics');
const diagnosticCount = $<HTMLSpanElement>('#diagnostic-count');
const previewMessage = $<HTMLDivElement>('#preview-message');
const gpuBadge = $<HTMLSpanElement>('#gpu-badge');
const canvas = $<HTMLCanvasElement>('#preview');

registerWGSL();

function presetProject(index = 0): ShaderProject {
  const preset = builtInPresets[index] ?? builtInPresets[0];
  const now = Date.now();
  return {
    id: preset.id,
    name: preset.name,
    description: preset.description,
    code: preset.code,
    createdAt: now - index,
    updatedAt: now - index,
    origin: 'builtin',
  };
}

let projects: ShaderProject[] = builtInPresets.map((_, index) => presetProject(index));
let currentProject: ShaderProject = projects[0] ?? createProject('01 WebGPU Starter', starterWGSL);
let dirty = false;
let suppressEditorEvents = false;
let saveTimer = 0;
let compileTimer = 0;
let compileRequest = 0;
let renderer: WebGPURenderer | null = null;
let storageReady = false;
let memoryOnly = false;

const model = monaco.editor.createModel(currentProject.code, 'wgsl');
const editor = monaco.editor.create($('#editor'), {
  model,
  theme: 'vs-dark',
  automaticLayout: true,
  minimap: { enabled: false },
  fontSize: 13,
  lineHeight: 20,
  fontLigatures: true,
  tabSize: 2,
  insertSpaces: true,
  renderWhitespace: 'selection',
  smoothScrolling: true,
  cursorSmoothCaretAnimation: 'on',
  padding: { top: 12, bottom: 12 },
  scrollBeyondLastLine: false,
});

projectName.value = currentProject.name;
renderProjectList();

// Bind every interaction before IndexedDB, adapter/device acquisition, or WGSL compilation.
// The shell remains usable even when any asynchronous subsystem is slow or unavailable.
editor.onDidChangeModelContent(() => {
  if (suppressEditorEvents) return;
  currentProject.code = editor.getValue();
  currentProject.updatedAt = Date.now();
  markDirty();
  scheduleSave();
  scheduleCompile();
});

projectName.addEventListener('input', () => {
  currentProject.name = projectName.value.trim() || 'Untitled Shader';
  currentProject.updatedAt = Date.now();
  markDirty();
  scheduleSave();
});

saveButton.addEventListener('click', () => void saveCurrent(true));
compileButton.addEventListener('click', () => void compileCurrent());
newButton.addEventListener('click', () => void createNewProject());
duplicateButton.addEventListener('click', () => void duplicateCurrentProject());
deleteButton.addEventListener('click', () => void deleteCurrentProject());
exportButton.addEventListener('click', exportCurrentProject);
importInput.addEventListener('change', () => void importProject());

pauseButton.addEventListener('click', () => {
  if (!renderer) return;
  renderer.setPaused(!renderer.isPaused());
  pauseButton.textContent = renderer.isPaused() ? 'Resume' : 'Pause';
});

scaleSelect.addEventListener('change', () => renderer?.setRenderScale(Number(scaleSelect.value)));

window.addEventListener('keydown', (event) => {
  const meta = event.metaKey || event.ctrlKey;
  if (meta && event.key.toLowerCase() === 's') {
    event.preventDefault();
    void saveCurrent(true);
  }
  if (meta && event.key === 'Enter') {
    event.preventDefault();
    void compileCurrent();
  }
});

window.addEventListener('beforeunload', () => {
  if (dirty) void saveCurrent(false);
});

// Start slow/optional subsystems only after the UI is interactive.
void initializeStorage();
void initializeRenderer();

async function initializeStorage(): Promise<void> {
  try {
    await withTimeout(ensurePresets(builtInPresets), 3000, 'IndexedDB initialization timed out.');
    const stored = await withTimeout(listProjects(), 3000, 'IndexedDB project listing timed out.');
    storageReady = true;
    memoryOnly = false;
    if (!stored.length) return;

    const activeId = localStorage.getItem('shader-slop-lab:active-project');
    const active = activeId ? stored.find((project) => project.id === activeId) : undefined;
    const next = active ?? stored[0];
    projects = stored;
    currentProject = next;
    projectName.value = next.name;
    suppressEditorEvents = true;
    model.setValue(next.code);
    suppressEditorEvents = false;
    dirty = false;
    saveState.textContent = 'saved';
    saveState.classList.remove('dirty');
    localStorage.setItem('shader-slop-lab:active-project', next.id);
    renderProjectList();
    if (renderer) await compileCurrent();
  } catch (error) {
    memoryOnly = true;
    storageReady = true;
    libraryNote.textContent = 'Temporary in-memory library · IndexedDB unavailable';
    console.warn('Shader Lab storage fallback:', error);
  }
}

async function initializeRenderer(): Promise<void> {
  try {
    renderer = await withTimeout(WebGPURenderer.create(canvas), 8000, 'WebGPU device initialization timed out.');
    renderer.onStats = (stats) => {
      fps.textContent = `${stats.fps.toFixed(0)} fps`;
      resolution.textContent = `${stats.width} × ${stats.height}`;
    };
    renderer.onDeviceLost = (message) => {
      setStatus('error', 'device lost');
      showPreviewMessage(`${message}\nReload the page to request a new WebGPU device.`);
    };
    renderer.setRenderScale(Number(scaleSelect.value));
    renderer.start();
    gpuBadge.textContent = 'WebGPU ready';
    gpuBadge.classList.add('ready');
    setStatus('neutral', 'compiling');
    await compileCurrent();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    renderer = null;
    setStatus('error', 'WebGPU unavailable');
    gpuBadge.textContent = 'WebGPU unavailable';
    gpuBadge.classList.add('error');
    compileButton.disabled = true;
    pauseButton.disabled = true;
    scaleSelect.disabled = true;
    showPreviewMessage(`${message}\n\nUse a current WebGPU-capable browser in a secure context. The editor and project library remain usable.`);
  }
}

function withTimeout<T>(promise: Promise<T>, milliseconds: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), milliseconds);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function setStatus(kind: 'neutral' | 'ok' | 'warning' | 'error', text: string): void {
  status.className = `status ${kind}`;
  status.textContent = text;
}

function showPreviewMessage(message: string): void {
  previewMessage.hidden = false;
  previewMessage.textContent = message;
}

function hidePreviewMessage(): void {
  previewMessage.hidden = true;
  previewMessage.textContent = '';
}

function markDirty(): void {
  dirty = true;
  saveState.textContent = 'unsaved';
  saveState.classList.add('dirty');
}

function scheduleSave(): void {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => void saveCurrent(false), 650);
}

function scheduleCompile(): void {
  if (!renderer) return;
  window.clearTimeout(compileTimer);
  compileTimer = window.setTimeout(() => void compileCurrent(), 220);
}

function replaceMemoryProject(project: ShaderProject): void {
  const index = projects.findIndex((item) => item.id === project.id);
  if (index >= 0) projects[index] = { ...project };
  else projects.unshift({ ...project });
  projects.sort((a, b) => b.updatedAt - a.updatedAt);
}

async function persistProject(project: ShaderProject): Promise<void> {
  if (!storageReady || memoryOnly) {
    replaceMemoryProject(project);
    return;
  }
  try {
    await putProject(project);
  } catch (error) {
    memoryOnly = true;
    libraryNote.textContent = 'Temporary in-memory library · IndexedDB unavailable';
    replaceMemoryProject(project);
    console.warn('Shader Lab switched to memory storage:', error);
  }
}

async function refreshProjects(): Promise<void> {
  if (!storageReady || memoryOnly) {
    projects.sort((a, b) => b.updatedAt - a.updatedAt);
    return;
  }
  try {
    projects = await listProjects();
  } catch (error) {
    memoryOnly = true;
    libraryNote.textContent = 'Temporary in-memory library · IndexedDB unavailable';
    console.warn('Shader Lab switched to memory storage:', error);
  }
}

async function fetchProject(id: string): Promise<ShaderProject | undefined> {
  if (!storageReady || memoryOnly) return projects.find((project) => project.id === id);
  try {
    return await getProject(id);
  } catch (error) {
    memoryOnly = true;
    libraryNote.textContent = 'Temporary in-memory library · IndexedDB unavailable';
    console.warn('Shader Lab switched to memory storage:', error);
    return projects.find((project) => project.id === id);
  }
}

async function eraseProject(id: string): Promise<void> {
  projects = projects.filter((project) => project.id !== id);
  if (!storageReady || memoryOnly) return;
  try {
    await removeProject(id);
  } catch (error) {
    memoryOnly = true;
    libraryNote.textContent = 'Temporary in-memory library · IndexedDB unavailable';
    console.warn('Shader Lab switched to memory storage:', error);
  }
}

async function saveCurrent(showFeedback: boolean): Promise<void> {
  window.clearTimeout(saveTimer);
  currentProject.code = editor.getValue();
  currentProject.name = projectName.value.trim() || 'Untitled Shader';
  currentProject.updatedAt = Date.now();
  await persistProject(currentProject);
  dirty = false;
  saveState.textContent = showFeedback ? 'saved now' : 'saved';
  saveState.classList.remove('dirty');
  await refreshProjects();
  renderProjectList();
}

async function compileCurrent(): Promise<void> {
  if (!renderer) {
    setStatus('neutral', 'GPU initializing');
    return;
  }
  window.clearTimeout(compileTimer);
  const request = ++compileRequest;
  setStatus('neutral', 'compiling');
  try {
    const result = await withTimeout(renderer.compile(editor.getValue()), 10000, 'WGSL compilation timed out.');
    if (request !== compileRequest) return;
    compileTime.textContent = `${result.durationMs.toFixed(1)} ms`;
    applyDiagnostics(result.messages);
    if (result.ok) {
      const warnings = result.messages.filter((message) => message.type === 'warning').length;
      setStatus(warnings ? 'warning' : 'ok', warnings ? `compiled · ${warnings} warning` : 'compiled');
      hidePreviewMessage();
    } else {
      setStatus('error', 'compile error');
    }
  } catch (error) {
    if (request !== compileRequest) return;
    const message = error instanceof Error ? error.message : String(error);
    setStatus('error', 'compile failed');
    applyDiagnostics([{ type: 'error', message, lineNum: 1, linePos: 1, length: 1 }]);
  }
}

function applyDiagnostics(messages: CompileMessage[]): void {
  const markers: monaco.editor.IMarkerData[] = messages.map((message) => {
    const line = Math.min(Math.max(message.lineNum, 1), model.getLineCount());
    const maxColumn = model.getLineMaxColumn(line);
    const startColumn = Math.min(Math.max(message.linePos, 1), maxColumn);
    const endColumn = Math.min(maxColumn, Math.max(startColumn + message.length, startColumn + 1));
    return {
      severity: message.type === 'error'
        ? monaco.MarkerSeverity.Error
        : message.type === 'warning'
          ? monaco.MarkerSeverity.Warning
          : monaco.MarkerSeverity.Info,
      message: message.message,
      startLineNumber: line,
      startColumn,
      endLineNumber: line,
      endColumn,
    };
  });
  monaco.editor.setModelMarkers(model, 'webgpu-wgsl', markers);
  diagnosticCount.textContent = String(messages.length);
  diagnostics.innerHTML = messages.length
    ? messages.map((message) => `<button class="diagnostic ${message.type}" data-line="${message.lineNum}" data-column="${message.linePos}"><span>${escapeHTML(message.type.toUpperCase())}</span><b>${message.lineNum}:${message.linePos}</b><em>${escapeHTML(message.message)}</em></button>`).join('')
    : '<div class="diagnostic-empty">No diagnostics.</div>';
  diagnostics.querySelectorAll<HTMLButtonElement>('.diagnostic').forEach((item) => {
    item.addEventListener('click', () => {
      const lineNumber = Number(item.dataset.line) || 1;
      const column = Number(item.dataset.column) || 1;
      editor.revealPositionInCenter({ lineNumber, column });
      editor.setPosition({ lineNumber, column });
      editor.focus();
    });
  });
}

function renderProjectList(): void {
  projectList.innerHTML = projects.map((project) => {
    const active = project.id === currentProject.id ? ' active' : '';
    const origin = project.origin === 'builtin' ? '<span class="project-tag">seed</span>' : '';
    return `<button type="button" class="project-item${active}" data-id="${escapeHTML(project.id)}"><span class="project-title">${escapeHTML(project.name)}</span>${origin}<small>${formatTime(project.updatedAt)}</small></button>`;
  }).join('');
  projectList.querySelectorAll<HTMLButtonElement>('.project-item').forEach((item) => {
    item.addEventListener('click', () => void switchProject(item.dataset.id || ''));
  });
}

async function switchProject(id: string): Promise<void> {
  if (!id || id === currentProject.id) return;
  if (dirty) await saveCurrent(false);
  const next = await fetchProject(id);
  if (!next) return;
  currentProject = next;
  projectName.value = next.name;
  suppressEditorEvents = true;
  model.setValue(next.code);
  suppressEditorEvents = false;
  dirty = false;
  saveState.textContent = 'saved';
  saveState.classList.remove('dirty');
  localStorage.setItem('shader-slop-lab:active-project', next.id);
  await refreshProjects();
  renderProjectList();
  await compileCurrent();
}

async function createNewProject(): Promise<void> {
  if (dirty) await saveCurrent(false);
  const next = createProject('Untitled Shader', starterWGSL);
  await persistProject(next);
  await refreshProjects();
  currentProject = next;
  projectName.value = next.name;
  suppressEditorEvents = true;
  model.setValue(next.code);
  suppressEditorEvents = false;
  localStorage.setItem('shader-slop-lab:active-project', next.id);
  renderProjectList();
  await compileCurrent();
  projectName.select();
}

async function duplicateCurrentProject(): Promise<void> {
  if (dirty) await saveCurrent(false);
  const copy = createProject(`${currentProject.name} Copy`, editor.getValue());
  copy.description = currentProject.description;
  await persistProject(copy);
  await refreshProjects();
  currentProject = copy;
  projectName.value = copy.name;
  suppressEditorEvents = true;
  model.setValue(copy.code);
  suppressEditorEvents = false;
  localStorage.setItem('shader-slop-lab:active-project', copy.id);
  renderProjectList();
  await compileCurrent();
}

async function deleteCurrentProject(): Promise<void> {
  if (!confirm(`Delete “${currentProject.name}” from this browser?`)) return;
  await eraseProject(currentProject.id);
  await refreshProjects();
  if (!projects.length) {
    const replacement = createProject('Untitled Shader', starterWGSL);
    await persistProject(replacement);
    await refreshProjects();
  }
  currentProject = projects[0];
  localStorage.setItem('shader-slop-lab:active-project', currentProject.id);
  projectName.value = currentProject.name;
  suppressEditorEvents = true;
  model.setValue(currentProject.code);
  suppressEditorEvents = false;
  dirty = false;
  renderProjectList();
  await compileCurrent();
}

function exportCurrentProject(): void {
  const payload = {
    format: 'shader-slop-lab/project',
    version: 1,
    exportedAt: new Date().toISOString(),
    project: {
      name: currentProject.name,
      description: currentProject.description,
      code: editor.getValue(),
    },
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${safeFilename(currentProject.name)}.shader.json`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function importProject(): Promise<void> {
  const file = importInput.files?.[0];
  importInput.value = '';
  if (!file) return;
  const text = await file.text();
  let name = file.name.replace(/\.(shader\.json|json|wgsl)$/i, '') || 'Imported Shader';
  let code = text;
  let description = '';
  if (file.name.toLowerCase().endsWith('.json')) {
    try {
      const parsed = JSON.parse(text) as { project?: { name?: string; description?: string; code?: string }; name?: string; code?: string; description?: string };
      const source = parsed.project ?? parsed;
      if (typeof source.code !== 'string') throw new Error('No WGSL code found in JSON.');
      code = source.code;
      name = source.name || name;
      description = typeof source.description === 'string' ? source.description : '';
    } catch (error) {
      alert(error instanceof Error ? error.message : String(error));
      return;
    }
  }
  if (dirty) await saveCurrent(false);
  const imported = createProject(name, code, 'import');
  imported.description = description;
  await persistProject(imported);
  await refreshProjects();
  currentProject = imported;
  projectName.value = imported.name;
  suppressEditorEvents = true;
  model.setValue(imported.code);
  suppressEditorEvents = false;
  localStorage.setItem('shader-slop-lab:active-project', imported.id);
  renderProjectList();
  await compileCurrent();
}

function escapeHTML(value: string): string {
  return value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char] || char);
}

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(timestamp);
}

function safeFilename(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'shader';
}
