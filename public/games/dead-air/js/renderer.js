import { VERT, FRAG } from './shaders.js';

// Minimal WebGL2 compositor. Sources are {el, aspect, depth?} where el is an <img>/<video>/<canvas>.
export class Renderer {
  constructor(canvas) {
    this.c = canvas;
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 unavailable');
    this.gl = gl;
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    const sh = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.bindAttribLocation(p, 0, 'p');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    gl.useProgram(p);
    this.p = p;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.loc = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const u = gl.getActiveUniform(p, i); this.loc[u.name] = gl.getUniformLocation(p, u.name); }
    ['tA', 'tB', 'dA', 'dB'].forEach((k, i) => gl.uniform1i(this.loc[k], i));
    this.texCache = new Map();
    this.blank = this._tex();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([10, 12, 11, 255]));
    this.layers = [null, null];
    this.resize();
    addEventListener('resize', () => this.resize());
  }
  _tex() {
    const gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  // One GL texture per source element; videos re-upload every frame they are visible.
  texFor(el) {
    let e = this.texCache.get(el);
    if (!e) { e = { t: this._tex(), ready: false }; this.texCache.set(el, e); }
    const gl = this.gl;
    const isVid = el instanceof HTMLVideoElement;
    if (isVid ? el.readyState >= 2 : (!e.ready && (el.complete ?? true) && (el.naturalWidth ?? el.width) > 0)) {
      gl.bindTexture(gl.TEXTURE_2D, e.t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, el);
      e.ready = true;
    }
    return e.ready ? e.t : this.blank;
  }
  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    const w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr);
    if (this.c.width !== w || this.c.height !== h) { this.c.width = w; this.c.height = h; }
    this.gl.viewport(0, 0, w, h);
  }
  // a, b: sources; u: uniform values
  draw(a, b, u) {
    const gl = this.gl, L = this.loc;
    const bind = (unit, el) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, el ? this.texFor(el) : this.blank); };
    bind(0, a?.el); bind(1, b?.el); bind(2, a?.depth); bind(3, b?.depth);
    gl.uniform1f(L.aA, a?.aspect || 16 / 9); gl.uniform1f(L.aB, b?.aspect || 16 / 9);
    gl.uniform1f(L.hasDA, a?.depth ? 1 : 0); gl.uniform1f(L.hasDB, b?.depth ? 1 : 0);
    gl.uniform2f(L.res, this.c.width, this.c.height);
    gl.uniform1f(L.fxA, a?.fx ?? 0.5); gl.uniform1f(L.fxB, b?.fx ?? 0.5);
    for (const k of ['mixAB', 'time', 'rewind', 'speed', 'warm', 'white', 'fade', 'rain', 'rainDir', 'flash', 'zoomA', 'zoomB', 'act2']) {
      if (L[k]) gl.uniform1f(L[k], u[k] ?? 0);
    }
    gl.uniform2f(L.ptr, u.ptr?.[0] || 0, u.ptr?.[1] || 0);
    gl.uniform2f(L.ptrLag, u.ptrLag?.[0] || 0, u.ptrLag?.[1] || 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
