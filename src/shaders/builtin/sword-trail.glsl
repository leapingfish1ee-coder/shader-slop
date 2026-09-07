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

float segmentDistance(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h);
}

float lineMask(vec2 p, vec2 a, vec2 b, float width) {
  float d = segmentDistance(p, a, b);
  float aa = max(fwidth(d), 0.0008);
  return 1.0 - smoothstep(width, width + aa, d);
}

void main() {
  float aspect = u_resolution.x / max(u_resolution.y, 1.0);
  vec2 p = (v_uv - 0.5) * vec2(aspect, 1.0);

  float angle = radians(35.0);
  vec2 dir = vec2(cos(angle), sin(angle));
  vec2 center = vec2(0.0);
  float halfLength = 0.42;
  vec2 a = center - dir * halfLength;
  vec2 b = center + dir * halfLength;

  float core = lineMask(p, a, b, 0.010);

  float glowDistance = segmentDistance(p, a, b);
  float glow = exp(-glowDistance * 28.0) * 0.9;

  float smear = 0.0;
  const int TAPS = 18;
  for (int i = 0; i < TAPS; ++i) {
    float t = float(i) / float(TAPS - 1);
    vec2 offset = -dir * t * 0.20;
    float weight = (1.0 - t) * (1.0 - t);
    smear += lineMask(p + offset, a, b, 0.012 + t * 0.006) * weight;
  }
  smear /= 6.0;

  vec3 color = vec3(0.38, 0.72, 1.0) * glow;
  color += vec3(0.45, 0.78, 1.0) * smear;
  color += vec3(1.0) * core * 1.6;

  float alpha = clamp(max(core, max(glow * 0.7, smear)), 0.0, 1.0);
  outColor = vec4(color, alpha);
}
