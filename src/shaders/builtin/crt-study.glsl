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

void main() {
  vec2 frag = v_uv * u_resolution;
  vec2 uv = v_uv;

  vec3 image = vec3(
    0.12 + 0.58 * uv.x,
    0.18 + 0.48 * (0.5 + 0.5 * sin(u_time + uv.y * 5.0)),
    0.28 + 0.52 * uv.y
  );

  float triad = mod(floor(frag.x), 3.0);
  vec3 mask = triad < 1.0
    ? vec3(1.0, 0.45, 0.45)
    : triad < 2.0
      ? vec3(0.45, 1.0, 0.45)
      : vec3(0.45, 0.45, 1.0);

  float scan = mix(0.72, 1.0, smoothstep(0.0, 0.8, fract(frag.y * 0.5)));
  float noise = (hash21(frag + floor(u_time * 24.0)) - 0.5) * 0.035;

  vec2 d = uv - 0.5;
  float vignette = smoothstep(0.78, 0.18, dot(d, d));

  vec3 color = (image * mask * scan + noise) * vignette;
  outColor = vec4(color, 1.0);
}
