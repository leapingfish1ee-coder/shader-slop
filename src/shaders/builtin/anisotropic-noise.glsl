#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 outColor;

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_delta;
uniform vec2 u_mouse;
uniform float u_pointerDown;
uniform float u_frame;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);

  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));

  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
  vec2 p = vec2(
    v_uv.x * 0.28 + 17.0,
    v_uv.y * 520.0 + u_time * 12.0
  );

  float n = valueNoise(p);
  float band = smoothstep(0.45, 0.55, n);
  vec3 color = mix(vec3(0.015, 0.02, 0.03), vec3(0.18, 0.78, 1.0), band);

  outColor = vec4(color, 1.0);
}
