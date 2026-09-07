struct Globals { resolutionTimeDelta: vec4f, mouseStateFrame: vec4f };
@group(0) @binding(0) var<uniform> globals: Globals;
struct VSOut { @builtin(position) position: vec4f, @location(0) uv: vec2f };

@vertex
fn vsMain(@builtin(vertex_index) vertexIndex: u32) -> VSOut {
  var positions = array<vec2f, 3>(vec2f(-1.0,-1.0), vec2f(3.0,-1.0), vec2f(-1.0,3.0));
  let p = positions[vertexIndex];
  var out: VSOut;
  out.position = vec4f(p, 0.0, 1.0);
  out.uv = p * 0.5 + vec2f(0.5);
  return out;
}

fn hash21(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453);
}

fn valueNoise(p: vec2f) -> f32 {
  let i = floor(p);
  var f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  let a = hash21(i);
  let b = hash21(i + vec2f(1.0, 0.0));
  let c = hash21(i + vec2f(0.0, 1.0));
  let d = hash21(i + vec2f(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

@fragment
fn fsMain(in: VSOut) -> @location(0) vec4f {
  let time = globals.resolutionTimeDelta.z;
  let p = in.uv * vec2f(4.0, 180.0) + vec2f(time * 0.08, time * 12.0);
  let n = valueNoise(p);
  let v = smoothstep(0.25, 0.85, n);
  return vec4f(vec3f(v), 1.0);
}
