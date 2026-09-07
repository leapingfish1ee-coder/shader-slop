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

void main() {
  vec2 uv = v_uv;
  float aspect = u_resolution.x / max(u_resolution.y, 1.0);
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

  float wave = 0.5 + 0.5 * sin(length(p) * 18.0 - u_time * 2.0);
  vec3 deep = vec3(0.02, 0.03, 0.05);
  vec3 cyan = vec3(0.10, 0.65, 1.00);
  vec3 color = mix(deep, cyan, wave);

  outColor = vec4(color, 1.0);
}
