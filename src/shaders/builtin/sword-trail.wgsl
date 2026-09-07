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
  var positions = array<vec2f, 3>(vec2f(-1.0,-1.0), vec2f(3.0,-1.0), vec2f(-1.0,3.0));
  let p = positions[vertexIndex];
  var out: VSOut;
  out.position = vec4f(p, 0.0, 1.0);
  out.uv = p * 0.5 + vec2f(0.5);
  return out;
}

fn sdSegment(p: vec2f, a: vec2f, b: vec2f) -> f32 {
  let pa = p - a;
  let ba = b - a;
  let h = clamp(dot(pa, ba) / max(dot(ba, ba), 0.000001), 0.0, 1.0);
  return length(pa - ba * h);
}

@fragment
fn fsMain(in: VSOut) -> @location(0) vec4f {
  let resolution = globals.resolutionTimeDelta.xy;
  let time = globals.resolutionTimeDelta.z;
  let aspect = resolution.x / max(resolution.y, 1.0);
  let p = (in.uv - vec2f(0.5)) * vec2f(aspect, 1.0);
  let angle = radians(35.0 + sin(time * 0.8) * 3.0);
  let dir = normalize(vec2f(cos(angle), sin(angle)));
  let center = vec2f(0.0, 0.0);
  let halfLength = 0.36;
  let a = center - dir * halfLength;
  let b = center + dir * halfLength;
  let d = sdSegment(p, a, b);

  let core = 1.0 - smoothstep(0.006, 0.011, d);
  let glow = exp(-d * 55.0) * 0.9;

  var smear = 0.0;
  for (var i: i32 = 1; i <= 10; i = i + 1) {
    let t = f32(i) / 10.0;
    let sampleP = p - dir * t * 0.12;
    let sd = sdSegment(sampleP, a, b);
    smear += exp(-sd * 70.0) * (1.0 - t) * 0.07;
  }

  let energy = core + glow + smear;
  let alpha = clamp(energy, 0.0, 1.0);
  let color = vec3f(0.72, 0.9, 1.0) * glow + vec3f(1.0) * core + vec3f(0.2, 0.55, 1.0) * smear;
  return vec4f(color * alpha, alpha);
}
