import { openDB, type DBSchema } from 'idb';
import type { ShaderPreset } from '../shaders/presets';

export interface ShaderProject {
  id: string;
  name: string;
  description: string;
  code: string;
  createdAt: number;
  updatedAt: number;
  origin?: 'builtin' | 'user' | 'import';
}

interface ShaderLabDB extends DBSchema {
  projects: {
    key: string;
    value: ShaderProject;
    indexes: { 'by-updated': number };
  };
}

const dbPromise = openDB<ShaderLabDB>('shader-slop-lab', 1, {
  upgrade(db) {
    const store = db.createObjectStore('projects', { keyPath: 'id' });
    store.createIndex('by-updated', 'updatedAt');
  },
});

function isGLSL300(code: string): boolean {
  return /^\s*#version\s+300\s+es\b/m.test(code);
}

export async function ensurePresets(presets: ShaderPreset[]): Promise<void> {
  const db = await dbPromise;
  const tx = db.transaction('projects', 'readwrite');
  const now = Date.now();

  for (const [index, preset] of presets.entries()) {
    const existing = await tx.store.get(preset.id);
    const shouldSeed = !existing || (existing.origin === 'builtin' && !isGLSL300(existing.code));
    if (!shouldSeed) continue;

    await tx.store.put({
      id: preset.id,
      name: preset.name,
      description: preset.description,
      code: preset.code,
      createdAt: existing?.createdAt ?? now - index,
      updatedAt: now - index,
      origin: 'builtin',
    });
  }

  await tx.done;
}

export async function listProjects(): Promise<ShaderProject[]> {
  const db = await dbPromise;
  const projects = await db.getAllFromIndex('projects', 'by-updated');
  return projects.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getProject(id: string): Promise<ShaderProject | undefined> {
  return (await dbPromise).get('projects', id);
}

export async function putProject(project: ShaderProject): Promise<void> {
  await (await dbPromise).put('projects', project);
}

export async function removeProject(id: string): Promise<void> {
  await (await dbPromise).delete('projects', id);
}

export function createProject(name: string, code: string, origin: ShaderProject['origin'] = 'user'): ShaderProject {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    name,
    description: '',
    code,
    createdAt: now,
    updatedAt: now,
    origin,
  };
}
