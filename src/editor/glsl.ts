import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker';

(self as unknown as { MonacoEnvironment: { getWorker(): Worker } }).MonacoEnvironment = {
  getWorker() {
    return new EditorWorker();
  },
};

const keywords = [
  'attribute','const','uniform','varying','buffer','shared','coherent','volatile','restrict','readonly','writeonly',
  'atomic_uint','layout','centroid','flat','smooth','noperspective','patch','sample','break','continue','do','for',
  'while','switch','case','default','if','else','subroutine','in','out','inout','float','double','int','void','bool',
  'true','false','invariant','precise','discard','return','struct','precision','highp','mediump','lowp',
];

const types = [
  'vec2','vec3','vec4','ivec2','ivec3','ivec4','bvec2','bvec3','bvec4','uvec2','uvec3','uvec4',
  'mat2','mat3','mat4','mat2x2','mat2x3','mat2x4','mat3x2','mat3x3','mat3x4','mat4x2','mat4x3','mat4x4',
  'sampler2D','sampler3D','samplerCube','sampler2DShadow','sampler2DArray','sampler2DArrayShadow',
  'isampler2D','isampler3D','isamplerCube','isampler2DArray','usampler2D','usampler3D','usamplerCube','usampler2DArray',
];

const builtins = [
  'gl_FragCoord','gl_FrontFacing','gl_PointCoord','gl_FragDepth','gl_VertexID','gl_InstanceID','gl_Position',
  'radians','degrees','sin','cos','tan','asin','acos','atan','pow','exp','log','exp2','log2','sqrt','inversesqrt',
  'abs','sign','floor','trunc','round','roundEven','ceil','fract','mod','min','max','clamp','mix','step','smoothstep',
  'isnan','isinf','floatBitsToInt','floatBitsToUint','intBitsToFloat','uintBitsToFloat','length','distance','dot',
  'cross','normalize','faceforward','reflect','refract','matrixCompMult','outerProduct','transpose','determinant',
  'inverse','lessThan','lessThanEqual','greaterThan','greaterThanEqual','equal','notEqual','any','all','not',
  'textureSize','texture','textureProj','textureLod','textureOffset','texelFetch','texelFetchOffset','textureProjOffset',
  'textureLodOffset','textureProjLod','textureProjLodOffset','textureGrad','textureGradOffset','textureProjGrad',
  'textureProjGradOffset','dFdx','dFdy','fwidth',
];

export function registerGLSL(): void {
  if (!monaco.languages.getLanguages().some((language) => language.id === 'glsl')) {
    monaco.languages.register({ id: 'glsl', extensions: ['.glsl', '.frag', '.vert', '.fs', '.vs'] });
  }

  monaco.languages.setMonarchTokensProvider('glsl', {
    keywords,
    typeKeywords: types,
    builtins,
    tokenizer: {
      root: [
        [/^\s*#\s*[a-zA-Z_]\w*.*/, 'keyword.directive'],
        [/[a-zA-Z_]\w*/, {
          cases: {
            '@keywords': 'keyword',
            '@typeKeywords': 'type',
            '@builtins': 'predefined',
            '@default': 'identifier',
          },
        }],
        [/0[xX][0-9a-fA-F]+[uU]?/, 'number.hex'],
        [/\d*\.\d+([eE][\-+]?\d+)?[fF]?/, 'number.float'],
        [/\d+([eE][\-+]?\d+)[fF]?/, 'number.float'],
        [/\d+[uU]?/, 'number'],
        [/\/\*/, 'comment', '@comment'],
        [/\/\/.*$/, 'comment'],
        [/[{}()\[\]<>]/, '@brackets'],
        [/[=><!~?:&|+\-*\/^%]+/, 'operator'],
        [/[;,.]/, 'delimiter'],
        [/\s+/, 'white'],
      ],
      comment: [
        [/[^/*]+/, 'comment'],
        [/\/\*/, 'comment', '@push'],
        [/\*\//, 'comment', '@pop'],
        [/[/*]/, 'comment'],
      ],
    },
  });

  monaco.languages.setLanguageConfiguration('glsl', {
    comments: { lineComment: '//', blockComment: ['/*', '*/'] },
    brackets: [['{', '}'], ['[', ']'], ['(', ')']],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
    ],
    surroundingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
    ],
  });
}

export { monaco };
