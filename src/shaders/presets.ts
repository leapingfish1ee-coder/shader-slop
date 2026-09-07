import starterWGSL from './builtin/starter.wgsl?raw';
import swordTrailWGSL from './builtin/sword-trail.wgsl?raw';
import crtWGSL from './builtin/crt-study.wgsl?raw';
import noiseWGSL from './builtin/anisotropic-noise.wgsl?raw';

export interface ShaderPreset {
  id: string;
  name: string;
  description: string;
  code: string;
}

export { starterWGSL };

export const builtInPresets: ShaderPreset[] = [
  { id: 'webgpu-starter', name: '01 WebGPU Starter', description: 'Fullscreen triangle + global uniforms', code: starterWGSL },
  { id: 'sword-trail', name: '04 挥剑拖影 / WGSL', description: 'SDF line + glow + directional smear', code: swordTrailWGSL },
  { id: 'crt-study', name: 'CRT Mask Study', description: 'RGB triad / scanline / noise study', code: crtWGSL },
  { id: 'anisotropic-noise', name: 'Anisotropic Noise', description: 'High-scale Y noise field', code: noiseWGSL },
];
