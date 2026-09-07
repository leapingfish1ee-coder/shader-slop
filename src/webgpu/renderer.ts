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

export class WebGPURenderer {
  readonly device: GPUDevice;
  readonly adapter: GPUAdapter;
  readonly format: GPUTextureFormat;

  private readonly canvas: HTMLCanvasElement;
  private readonly context: GPUCanvasContext;
  private readonly uniformBuffer: GPUBuffer;
  private readonly bindGroupLayout: GPUBindGroupLayout;
  private readonly pipelineLayout: GPUPipelineLayout;
  private pipeline: GPURenderPipeline | null = null;
  private bindGroup: GPUBindGroup | null = null;
  private renderScale = 1;
  private paused = false;
  private raf = 0;
  private frame = 0;
  private startTime = performance.now();
  private lastFrameTime = this.startTime;
  private compileSerial = 0;
  private mouse = new Float32Array([0, 0]);
  private mouseDown = 0;
  private fpsFrames = 0;
  private fpsWindowStart = performance.now();
  private fps = 0;

  onStats?: (stats: RendererStats) => void;
  onDeviceLost?: (message: string) => void;

  private constructor(canvas: HTMLCanvasElement, adapter: GPUAdapter, device: GPUDevice) {
    this.canvas = canvas;
    this.adapter = adapter;
    this.device = device;
    this.context = canvas.getContext('webgpu') as GPUCanvasContext;
    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.context.configure({
      device,
      format: this.format,
      alphaMode: 'premultiplied',
    });

    this.uniformBuffer = device.createBuffer({
      label: 'Shader Lab Globals',
      size: 32,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.bindGroupLayout = device.createBindGroupLayout({
      label: 'Shader Lab Global Bind Group Layout',
      entries: [{
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' },
      }],
    });
    this.pipelineLayout = device.createPipelineLayout({
      label: 'Shader Lab Pipeline Layout',
      bindGroupLayouts: [this.bindGroupLayout],
    });

    this.bindGroup = device.createBindGroup({
      label: 'Shader Lab Global Bind Group',
      layout: this.bindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }],
    });

    this.canvas.addEventListener('pointermove', this.handlePointerMove);
    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
    window.addEventListener('pointerup', this.handlePointerUp);
    void device.lost.then((info) => {
      cancelAnimationFrame(this.raf);
      this.onDeviceLost?.(info.message || `WebGPU device lost: ${info.reason}`);
    });
  }

  static async create(canvas: HTMLCanvasElement): Promise<WebGPURenderer> {
    if (!navigator.gpu) throw new Error('WebGPU is not available in this browser.');
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) throw new Error('No compatible WebGPU adapter was found.');
    const device = await adapter.requestDevice();
    return new WebGPURenderer(canvas, adapter, device);
  }

  async compile(source: string): Promise<CompileResult> {
    const serial = ++this.compileSerial;
    const started = performance.now();
    const module = this.device.createShaderModule({ label: 'Live WGSL', code: source });
    const info = await module.getCompilationInfo();
    const messages: CompileMessage[] = info.messages.map((message) => ({
      type: message.type,
      message: message.message,
      lineNum: message.lineNum || 1,
      linePos: message.linePos || 1,
      length: Math.max(message.length || 1, 1),
    }));

    if (messages.some((message) => message.type === 'error')) {
      return { ok: false, messages, durationMs: performance.now() - started };
    }

    try {
      const pipeline = await this.device.createRenderPipelineAsync({
        label: 'Live Shader Pipeline',
        layout: this.pipelineLayout,
        vertex: { module, entryPoint: 'vsMain' },
        fragment: {
          module,
          entryPoint: 'fsMain',
          targets: [{ format: this.format }],
        },
        primitive: { topology: 'triangle-list' },
      });

      if (serial === this.compileSerial) this.pipeline = pipeline;
      return { ok: true, messages, durationMs: performance.now() - started };
    } catch (error) {
      messages.push({
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
        lineNum: 1,
        linePos: 1,
        length: 1,
      });
      return { ok: false, messages, durationMs: performance.now() - started };
    }
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
    this.uniformBuffer.destroy();
  }

  private readonly handlePointerMove = (event: PointerEvent): void => {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    this.mouse[0] = ((event.clientX - rect.left) / rect.width) * this.canvas.width;
    this.mouse[1] = (1 - (event.clientY - rect.top) / rect.height) * this.canvas.height;
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
    if (this.paused || !this.pipeline || !this.bindGroup) {
      this.lastFrameTime = now;
      return;
    }

    const time = (now - this.startTime) * 0.001;
    const delta = Math.min((now - this.lastFrameTime) * 0.001, 0.1);
    this.lastFrameTime = now;
    const globals = new Float32Array([
      this.canvas.width,
      this.canvas.height,
      time,
      delta,
      this.mouse[0],
      this.mouse[1],
      this.mouseDown,
      this.frame,
    ]);
    this.device.queue.writeBuffer(this.uniformBuffer, 0, globals);

    const encoder = this.device.createCommandEncoder({ label: 'Shader Lab Frame' });
    const pass = encoder.beginRenderPass({
      label: 'Shader Lab Render Pass',
      colorAttachments: [{
        view: this.context.getCurrentTexture().createView(),
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
        loadOp: 'clear',
        storeOp: 'store',
      }],
    });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.draw(3);
    pass.end();
    this.device.queue.submit([encoder.finish()]);

    this.frame += 1;
    this.fpsFrames += 1;
    if (now - this.fpsWindowStart >= 500) {
      this.fps = this.fpsFrames * 1000 / (now - this.fpsWindowStart);
      this.fpsFrames = 0;
      this.fpsWindowStart = now;
      this.onStats?.({ fps: this.fps, width: this.canvas.width, height: this.canvas.height, frame: this.frame });
    }
  };
}
