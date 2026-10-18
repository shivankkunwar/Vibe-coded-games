// Fullscreen compositor: two layers (crossfade), depth parallax, grade, rain, dust, grain.
export const VERT = `#version 300 es
in vec2 p; out vec2 vUv;
void main(){ vUv = p * .5 + .5; gl_Position = vec4(p, 0., 1.); }`;

export const FRAG = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D tA, tB, dA, dB;
uniform float aA, aB, hasDA, hasDB, mixAB, time, rewind, speed, warm, white, fade, rain, rainDir, flash, zoomA, zoomB;
uniform vec2 res, ptr, ptrLag;
uniform float fxA, fxB, act2;

float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }

vec2 cover(vec2 uv, float ta, float z, float fx){
  float sa = res.x / res.y; vec2 s = sa > ta ? vec2(1., ta / sa) : vec2(sa / ta, 1.);
  return (uv - .5) * s / z + .5 + vec2((fx - .5) * (1. - s.x / z), 0.);
}
vec3 layer(sampler2D t, sampler2D d, float hasD, float ta, float z, float fx){
  vec2 uv = cover(vUv, ta, z, fx);
  float dep = hasD > .5 ? texture(d, uv).r : .5;
  vec2 p = mix(ptr, ptrLag, act2 * smoothstep(.55, .95, dep));   // act two: the glass reflects a half-beat behind
  uv += (dep - .45) * p * vec2(.018, .012);               // parallax
  vec2 dir = (uv - .5);
  float ab = .0015 + rewind * .004 + speed * .002;      // chromatic aberration
  vec3 c;
  c.r = texture(t, uv + dir * ab).r;
  c.g = texture(t, uv).g;
  c.b = texture(t, uv - dir * ab).b;
  return mix(c, vec3(.9, .91, .9), white * (1. - dep * .6)); // fog-white at the bottom of time
}
float rainLayer(vec2 uv, float sc, float sp){
  uv.x += uv.y * .08;
  vec2 g = vec2(uv.x * sc, uv.y * sc * .06 + time * sp * rainDir);
  vec2 id = floor(g); vec2 f = fract(g);
  float r = h(id);
  float streak = smoothstep(.04, 0., abs(f.x - r)) * smoothstep(0., .3, f.y) * smoothstep(1., .5, f.y);
  return streak * step(.72, h(id + 7.));
}
float dust(vec2 uv){
  float s = 0.;
  for (int i = 0; i < 18; i++){
    float fi = float(i);
    vec2 p = vec2(h(vec2(fi, 1.)), h(vec2(fi, 2.)));
    p.y = fract(p.y + time * (.006 + .01 * h(vec2(fi, 3.))) * (rewind > .5 ? -1. : 1.));
    p.x += sin(time * .2 + fi) * .02;
    float d = length((uv - p) * vec2(res.x / res.y, 1.));
    s += smoothstep(.004, 0., d) * (.4 + .6 * h(vec2(fi, 4.)));
  }
  return s;
}
void main(){
  vec3 a = layer(tA, dA, hasDA, aA, zoomA, fxA);
  vec3 b = layer(tB, dB, hasDB, aB, zoomB, fxB);
  vec3 c = mix(a, b, smoothstep(0., 1., mixAB));
  // rain on top (falls up when time runs backwards)
  float r = rainLayer(vUv, 90., 3.2) * .55 + rainLayer(vUv + .37, 160., 4.6) * .35;
  c += r * rain * vec3(.75, .8, .82) * .5;
  c += dust(vUv) * .22 * vec3(1., .93, .8);
  // grade: warm = forward / present, cool = rewind / past
  float l = dot(c, vec3(.299, .587, .114));
  vec3 coolG = mix(vec3(l), c, .62) * vec3(.88, 1.0, 1.1) + vec3(.0, .012, .022);
  vec3 warmG = mix(vec3(l), c, 1.06) * vec3(1.07, 1.0, .88) + vec3(.02, .008, 0.);
  c = mix(coolG, warmG, warm);
  // act two: the same room read from its other side — drained, cold, lifted in the blue
  vec3 act2G = mix(vec3(l), c, .5) * vec3(.82, .92, 1.12) + vec3(.006, .01, .028);
  c = mix(c, act2G, act2);
  c = c / (1. + c * .12);                                 // soft shoulder
  c = pow(max(c, 0.), vec3(1.04));
  vec2 q = vUv - .5;
  c *= 1. - dot(q, q) * (1.1 + rewind * .6);              // vignette
  float g = h(vUv * res + fract(time * 23.) * 100.) - .5;
  c += g * (.07 + rewind * .04) * (1. - l * .5);          // grain
  c = mix(c, vec3(1., .97, .92), flash);
  o = vec4(c * fade, 1.);
}`;
