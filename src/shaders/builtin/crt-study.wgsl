struct Globals {
  resolutionTimeDelta: vec4f,
  mouseStateFrame: vec4f,
};
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
  let h = dot(p, vec2f(127.1, 311.7));
  return fract(sin(h) * 43758.5453123);
}

@fragment
fn fsMain(in: VSOut) -> @location(0) vec4f {
  let res = globals.resolutionTimeDelta.xy;
  let time = globals.resolutionTimeDelta.z;
  let frag = in.uv * res;
  let cell = floor(frag / vec2f(3.0, 3.0));
  let local = fract(frag / vec2f(3.0, 3.0));
  let channel = i32(cell.x) % 3;
  var triad = vec3f(0.2);
  if (channel == 0) { triad.r = 1.0; }
  if (channel == 1) { triad.g = 1.0; }
  if (channel == 2) { triad.b = 1.0; }
  let aperture = smoothstep(0.48, 0.22, abs(local.x - 0.5)) * smoothstep(0.5, 0.18, abs(local.y - 0.5));
  let scan = 0.82 + 0.18 * sin((frag.y + time * 8.0) * 3.14159265);
  let noise = (hash21(floor(frag) + vec2f(time)) - 0.5) * 0.035;
  let base = vec3f(in.uv.x, 0.35 + 0.45 * in.uv.y, 1.0 - in.uv.x * 0.5);
  return vec4f(base * mix(vec3f(1.0), triad * aperture, vec3f(0.6)) * scan + vec3f(noise), 1.0);
}
