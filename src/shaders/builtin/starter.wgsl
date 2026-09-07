struct Globals {
  resolutionTimeDelta: vec4f,
  mouseStateFrame: vec4f,
};

@group(0) @binding(0) var<uniform> globals: Globals;

struct VSOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

@vertex
fn vsMain(@builtin(vertex_index) vertexIndex: u32) -> VSOut {
  var positions = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f( 3.0, -1.0),
    vec2f(-1.0,  3.0)
  );
  let p = positions[vertexIndex];
  var out: VSOut;
  out.position = vec4f(p, 0.0, 1.0);
  out.uv = p * 0.5 + vec2f(0.5);
  return out;
}

@fragment
fn fsMain(in: VSOut) -> @location(0) vec4f {
  let resolution = globals.resolutionTimeDelta.xy;
  let time = globals.resolutionTimeDelta.z;
  let uv = in.uv;
  let aspect = resolution.x / max(resolution.y, 1.0);
  let p = (uv - vec2f(0.5)) * vec2f(aspect, 1.0);
  let wave = 0.5 + 0.5 * sin(length(p) * 18.0 - time * 2.0);
  let color = mix(vec3f(0.02, 0.03, 0.05), vec3f(0.1, 0.65, 1.0), vec3f(wave));
  return vec4f(color, 1.0);
}
