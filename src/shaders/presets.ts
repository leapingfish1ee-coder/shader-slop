import starterGLSL from './builtin/starter.glsl?raw';
import swordTrailGLSL from './builtin/sword-trail.glsl?raw';
import crtGLSL from './builtin/crt-study.glsl?raw';
import noiseGLSL from './builtin/anisotropic-noise.glsl?raw';

// Kept for the archived WebGPU/WGSL implementation and dead main.ts compatibility.
import starterWGSL from './builtin/starter.wgsl?raw';

export interface ShaderPreset {
  id: string;
  name: string;
  description: string;
  code: string;
}

export { starterGLSL, starterWGSL };

export const builtInPresets: ShaderPreset[] = [
  {
    id: 'webgpu-starter',
    name: '01 GLSL ES 3.00 Starter',
    description: 'WebGL2 fullscreen fragment shader + standard lab uniforms',
    code: starterGLSL,
  },
  {
    id: 'sword-trail',
    name: '04 挥剑拖影 / GLSL',
    description: 'GLSL ES 3.00 SDF line + glow + directional smear',
    code: swordTrailGLSL,
  },
  {
    id: 'crt-study',
    name: 'CRT Mask Study / GLSL',
    description: 'GLSL ES 3.00 RGB triad / scanline / noise study',
    code: crtGLSL,
  },
  {
    id: 'anisotropic-noise',
    name: 'Anisotropic Noise / GLSL',
    description: 'GLSL ES 3.00 high-scale Y noise field',
    code: noiseGLSL,
  },
];
