export interface CompileMessage {
  type: 'error' | 'warning' | 'info';
  message: string;
  lineNum: number;
  linePos: number;
  length: number;
}

export interface CompileResult {
  ok: boolean;
  messages: CompileMessage[];
  durationMs: number;
}

export interface RendererStats {
  fps: number;
  width: number;
  height: number;
  frame: number;
}

const VERTEX_SOURCE = `#version 300 es
precision highp float;

out vec2 v_uv;

void main() {
  vec2 positions[3] = vec2[3](
    vec2(-1.0, -1.0),
    vec2( 3.0, -1.0),
    vec2(-1.0,  3.0)
  );
  vec2 p = positions[gl_VertexID];
  gl_Position = vec4(p, 0.0, 1.0);
  v_uv = p * 0.5 + 0.5;
}
`;

interface Uniforms {
  resolution: WebGLUniformLocation | null;
  time: WebGLUniformLocation | null;
  delta: WebGLUniformLocation | null;
  mouse: WebGLUniformLocation | null;
  pointerDown: WebGLUniformLocation | null;
  frame: WebGLUniformLocation | null;
}

export class WebGL2Renderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGL2RenderingContext;
  private readonly vertexShader: WebGLShader;
  private program: WebGLProgram | null = null;
  private uniforms: Uniforms = {
    resolution: null,
    time: null,
    delta: null,
    mouse: null,
    pointerDown: null,
    frame: null,
  };

  private renderScale = 1;
  private paused = false;
  private raf = 0;
  private frame = 0;
  private startTime = performance.now();
  private lastFrameTime = this.startTime;
  private mouseX = 0;
  private mouseY = 0;
  private mouseDown = 0;
  private fpsFrames = 0;
  private fpsWindowStart = performance.now();
  private fps = 0;

  onStats?: (stats: RendererStats) => void;

  private constructor(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext) {
    this.canvas = canvas;
    this.gl = gl;

    const vertex = gl.createShader(gl.VERTEX_SHADER);
    if (!vertex) throw new Error('Unable to create WebGL2 vertex shader.');
    gl.shaderSource(vertex, VERTEX_SOURCE);
    gl.compileShader(vertex);
    if (!gl.getShaderParameter(vertex, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(vertex) || 'Fixed fullscreen vertex shader failed to compile.';
      gl.deleteShader(vertex);
      throw new Error(log);
    }
    this.vertexShader = vertex;

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);

    this.canvas.addEventListener('pointermove', this.handlePointerMove);
    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
    window.addEventListener('pointerup', this.handlePointerUp);
  }

  static async create(canvas: HTMLCanvasElement): Promise<WebGL2Renderer> {
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: false,
      antialias: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('WebGL2 / GLSL ES 3.00 is not available in this browser.');
    return new WebGL2Renderer(canvas, gl);
  }

  async compile(source: string): Promise<CompileResult> {
    const started = performance.now();
    const gl = this.gl;
    const messages: CompileMessage[] = [];

    const fragment = gl.createShader(gl.FRAGMENT_SHADER);
    if (!fragment) {
      return {
        ok: false,
        messages: [{ type: 'error', message: 'Unable to create fragment shader.', lineNum: 1, linePos: 1, length: 1 }],
        durationMs: performance.now() - started,
      };
    }

    gl.shaderSource(fragment, source);
    gl.compileShader(fragment);

    const fragmentLog = gl.getShaderInfoLog(fragment) || '';
    messages.push(...parseGLSLLog(fragmentLog, gl.getShaderParameter(fragment, gl.COMPILE_STATUS) ? 'warning' : 'error'));

    if (!gl.getShaderParameter(fragment, gl.COMPILE_STATUS)) {
      gl.deleteShader(fragment);
      return { ok: false, messages: ensureMessage(messages, 'Fragment shader compilation failed.'), durationMs: performance.now() - started };
    }

    const program = gl.createProgram();
    if (!program) {
      gl.deleteShader(fragment);
      return {
        ok: false,
        messages: [{ type: 'error', message: 'Unable to create WebGL2 program.', lineNum: 1, linePos: 1, length: 1 }],
        durationMs: performance.now() - started,
      };
    }

    gl.attachShader(program, this.vertexShader);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);

    const linkLog = gl.getProgramInfoLog(program) || '';
    messages.push(...parseGLSLLog(linkLog, gl.getProgramParameter(program, gl.LINK_STATUS) ? 'warning' : 'error'));

    gl.detachShader(program, fragment);
    gl.deleteShader(fragment);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      return { ok: false, messages: ensureMessage(messages, 'Shader program link failed.'), durationMs: performance.now() - started };
    }

    if (this.program) gl.deleteProgram(this.program);
    this.program = program;
    this.uniforms = {
      resolution: gl.getUniformLocation(program, 'u_resolution'),
      time: gl.getUniformLocation(program, 'u_time'),
      delta: gl.getUniformLocation(program, 'u_delta'),
      mouse: gl.getUniformLocation(program, 'u_mouse'),
      pointerDown: gl.getUniformLocation(program, 'u_pointerDown'),
      frame: gl.getUniformLocation(program, 'u_frame'),
    };

    return { ok: true, messages, durationMs: performance.now() - started };
  }

  start(): void {
    if (this.raf) return;
    this.startTime = performance.now();
    this.lastFrameTime = this.startTime;
    this.raf = requestAnimationFrame(this.render);
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  isPaused(): boolean {
    return this.paused;
  }

  setRenderScale(scale: number): void {
    this.renderScale = Math.min(2, Math.max(0.25, scale));
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.canvas.removeEventListener('pointermove', this.handlePointerMove);
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    window.removeEventListener('pointerup', this.handlePointerUp);
    if (this.program) this.gl.deleteProgram(this.program);
    this.gl.deleteShader(this.vertexShader);
  }

  private readonly handlePointerMove = (event: PointerEvent): void => {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    this.mouseX = ((event.clientX - rect.left) / rect.width) * this.canvas.width;
    this.mouseY = (1 - (event.clientY - rect.top) / rect.height) * this.canvas.height;
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    this.mouseDown = 1;
    this.canvas.setPointerCapture?.(event.pointerId);
    this.handlePointerMove(event);
  };

  private readonly handlePointerUp = (): void => {
    this.mouseDown = 0;
  };

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * this.renderScale;
    const width = Math.max(1, Math.min(4096, Math.round(rect.width * dpr)));
    const height = Math.max(1, Math.min(4096, Math.round(rect.height * dpr)));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  private readonly render = (now: number): void => {
    this.raf = requestAnimationFrame(this.render);
    this.resize();

    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);

    if (this.paused || !this.program) {
      this.lastFrameTime = now;
      this.publishStats(now);
      return;
    }

    const time = (now - this.startTime) * 0.001;
    const delta = Math.min((now - this.lastFrameTime) * 0.001, 0.1);
    this.lastFrameTime = now;

    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);

    if (this.uniforms.resolution) gl.uniform2f(this.uniforms.resolution, this.canvas.width, this.canvas.height);
    if (this.uniforms.time) gl.uniform1f(this.uniforms.time, time);
    if (this.uniforms.delta) gl.uniform1f(this.uniforms.delta, delta);
    if (this.uniforms.mouse) gl.uniform2f(this.uniforms.mouse, this.mouseX, this.mouseY);
    if (this.uniforms.pointerDown) gl.uniform1f(this.uniforms.pointerDown, this.mouseDown);
    if (this.uniforms.frame) gl.uniform1f(this.uniforms.frame, this.frame);

    gl.drawArrays(gl.TRIANGLES, 0, 3);

    this.frame += 1;
    this.publishStats(now);
  };

  private publishStats(now: number): void {
    this.fpsFrames += 1;
    if (now - this.fpsWindowStart >= 500) {
      this.fps = this.fpsFrames * 1000 / (now - this.fpsWindowStart);
      this.fpsFrames = 0;
      this.fpsWindowStart = now;
      this.onStats?.({
        fps: this.fps,
        width: this.canvas.width,
        height: this.canvas.height,
        frame: this.frame,
      });
    }
  }
}

function ensureMessage(messages: CompileMessage[], fallback: string): CompileMessage[] {
  if (messages.length) return messages;
  return [{ type: 'error', message: fallback, lineNum: 1, linePos: 1, length: 1 }];
}

function parseGLSLLog(log: string, fallbackType: CompileMessage['type']): CompileMessage[] {
  if (!log.trim()) return [];

  return log
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      let type: CompileMessage['type'] = fallbackType;
      if (/warning/i.test(line)) type = 'warning';
      if (/error/i.test(line)) type = 'error';

      let lineNum = 1;
      let message = line;

      const colon = line.match(/^(?:ERROR|WARNING):\s*\d+:(\d+):\s*(.*)$/i);
      if (colon) {
        lineNum = Number(colon[1]) || 1;
        message = colon[2] || line;
      } else {
        const paren = line.match(/^\d+:(\d+)\(\d+\):\s*(?:error|warning)?\s*:?\s*(.*)$/i);
        if (paren) {
          lineNum = Number(paren[1]) || 1;
          message = paren[2] || line;
        }
      }

      return { type, message, lineNum, linePos: 1, length: 1 };
    });
}
