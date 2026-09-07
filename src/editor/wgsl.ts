import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker';

(self as unknown as { MonacoEnvironment: { getWorker(): Worker } }).MonacoEnvironment = {
  getWorker() {
    return new EditorWorker();
  },
};

const keywords = [
  'fn','let','var','const','override','struct','return','if','else','switch','case','default','loop','for','while','break','continue','discard','continuing','enable','requires','diagnostic','true','false',
];

const types = [
  'bool','i32','u32','f32','f16','vec2f','vec3f','vec4f','vec2i','vec3i','vec4i','vec2u','vec3u','vec4u','mat2x2f','mat3x3f','mat4x4f','array','atomic','texture_2d','texture_storage_2d','sampler',
];

export function registerWGSL(): void {
  monaco.languages.register({ id: 'wgsl' });
  monaco.languages.setMonarchTokensProvider('wgsl', {
    keywords,
    typeKeywords: types,
    tokenizer: {
      root: [
        [/@[a-zA-Z_][\w]*/, 'annotation'],
        [/[a-zA-Z_]\w*/, { cases: { '@keywords': 'keyword', '@typeKeywords': 'type', '@default': 'identifier' } }],
        [/0x[0-9a-fA-F]+[iu]?/, 'number.hex'],
        [/(\d+\.\d*|\.\d+)([eE][\-+]?\d+)?[fh]?/, 'number.float'],
        [/\d+([eE][\-+]?\d+)?[iufh]?/, 'number'],
        [/\/\*/, 'comment', '@comment'],
        [/\/\/.*$/, 'comment'],
        [/[{}()\[\]]/, '@brackets'],
        [/[<>](?!@symbols)/, '@brackets'],
        [/[=><!~?:&|+\-*\/\^%]+/, 'operator'],
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
  monaco.languages.setLanguageConfiguration('wgsl', {
    comments: { lineComment: '//', blockComment: ['/*', '*/'] },
    brackets: [['{','}'], ['[',']'], ['(',')']],
    autoClosingPairs: [
      { open: '{', close: '}' }, { open: '[', close: ']' }, { open: '(', close: ')' },
    ],
    surroundingPairs: [
      { open: '{', close: '}' }, { open: '[', close: ']' }, { open: '(', close: ')' },
    ],
  });
}

export { monaco };
