// Showroom: the engine. Images become tiles in 3D space, laid out as a grid wall, a cloud, a ring,
// a helix, a tunnel, a stack or a rippling wall, and a camera moves through them. Tiles are drawn
// with WebGL (2D canvas can't draw true perspective): each is a rounded rectangle cut in the shader,
// with its image fitted inside it, a soft shadow, depth of field and a fade with distance.
// Everything that moves is periodic in t, or wraps round, so the loop closes.
//
// render(ctx, patch, t, { scale, tiles }) where tiles is a list of { el, w, h }: the images, loaded
// by the app. Without them, plain tiles stand in.
import { readJson } from "../../packages/core/read-json.js"
import { formatSize } from "../../packages/core/formats.js"
import { resolve } from "../../packages/core/keys.js"
import { mulberry32, hash } from "../../packages/core/rng.js"

export const manifest = await readJson(new URL("./instrument.json", import.meta.url))

const TAU = Math.PI * 2
const DEG = Math.PI / 180
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const frac = (x) => x - Math.floor(x)
const ease = (x) => { x = clamp(x, 0, 1); return x * x * x * (x * (x * 6 - 15) + 10) }
const wrap = (v, lo, span) => lo + ((((v - lo) % span) + span) % span)

export const size = (patch) => formatSize(patch.params)
export const frameCount = (patch) => Math.max(1, Math.round(patch.params.duration * Number(patch.params.fps)))

const ASPECTS = { web: 16 / 10, wide: 16 / 9, classic: 4 / 3, square: 1, portrait: 4 / 5, phone: 9 / 19.5 }

// ---- small linear algebra: 3×3 rotations as rows, 4×4 matrices column-major for WebGL ----
const rx = (a) => { const c = Math.cos(a), s = Math.sin(a); return [[1, 0, 0], [0, c, -s], [0, s, c]] }
const ry = (a) => { const c = Math.cos(a), s = Math.sin(a); return [[c, 0, s], [0, 1, 0], [-s, 0, c]] }
const rz = (a) => { const c = Math.cos(a), s = Math.sin(a); return [[c, -s, 0], [s, c, 0], [0, 0, 1]] }
const I3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
const mul3 = (A, B) => A.map((r) => [0, 1, 2].map((j) => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]))
const apply3 = (R, v) => R.map((r) => r[0] * v[0] + r[1] * v[1] + r[2] * v[2])
const cols = (ex, ey, ez) => [[ex[0], ey[0], ez[0]], [ex[1], ey[1], ez[1]], [ex[2], ey[2], ez[2]]]
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const muls = (a, k) => [a[0] * k, a[1] * k, a[2] * k]
const lerp3 = (a, b, k) => add(a, muls(sub(b, a), k))
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm = (a) => muls(a, 1 / (Math.hypot(...a) || 1))

function mul4(a, b) {
  const o = new Float32Array(16)
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]
  return o
}
function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2)
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, (2 * far * near) / (near - far), 0])
}
function lookAt(eye, target, up) {
  const z = norm(sub(eye, target)), x = norm(cross(up, z)), y = cross(z, x)
  return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1])
}
const model = (R, p) => new Float32Array([R[0][0], R[1][0], R[2][0], 0, R[0][1], R[1][1], R[2][1], 0, R[0][2], R[1][2], R[2][2], 0, p[0], p[1], p[2], 1])
const project = (M, v) => [M[0] * v[0] + M[4] * v[1] + M[8] * v[2] + M[12], M[1] * v[0] + M[5] * v[1] + M[9] * v[2] + M[13], M[2] * v[0] + M[6] * v[1] + M[10] * v[2] + M[14]]

// ---- the arrangement ----
// Each tile: where it sits (pos), how it's turned (R), its size (w, h), which image, and phases.
// Units: a tile at Size 1 is one unit wide.
function arrange(p, seed, tiles) {
  const N = p.count, r = mulberry32(seed * 7919 + 13)
  const pick = Array.from({ length: N }, (_, i) => i)
  if (p.order === "shuffled") for (let i = N - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [pick[i], pick[j]] = [pick[j], pick[i]] }
  const refAspect = ASPECTS[p.aspect] ?? 4 / 3
  const cw = p.size * (1 + p.gap), ch = (p.size / refAspect) * (1 + p.gap)
  const list = []
  for (let i = 0; i < N; i++) {
    const img = tiles.length ? tiles[pick[i] % tiles.length] : null
    const own = img ? clamp(img.w / img.h, 0.4, 2.5) : refAspect
    const aspect = p.aspect === "original" ? own : refAspect
    const mix = 1 + (hash(seed, i, 1) - 0.5) * 1.4 * p.sizeMix
    const w = p.size * mix
    list.push({ i, img, aspect, w, h: w / aspect, pos: [0, 0, 0], R: I3, ph: hash(seed, i, 2), ph2: hash(seed, i, 3) })
  }

  const L = p.layout
  let span = { x: cw, y: ch, z: cw } // the size of the whole, for framing and wrapping
  if (L === "grid" || L === "wave") {
    const C = Math.min(p.columns, N), R = Math.ceil(N / C)
    for (const t of list) {
      const c = t.i % C, row = Math.floor(t.i / C)
      t.pos = [(c - (C - 1) / 2) * cw, -(row - (R - 1) / 2) * ch, (hash(seed, t.i, 4) - 0.5) * p.depth * cw * 2]
      t.cell = [c, row]
    }
    span = { x: C * cw, y: R * ch, z: p.depth * cw * 2 }
  } else if (L === "cloud") {
    // Jittered cells across, so tiles spread evenly; depth at random.
    const C = Math.max(1, Math.round(Math.sqrt(N * 1.6))), R = Math.ceil(N / C), D = (0.3 + p.depth * 3) * Math.sqrt(N) * cw * 0.6
    for (const t of list) {
      const c = t.i % C, row = Math.floor(t.i / C)
      t.pos = [(c - (C - 1) / 2 + (hash(seed, t.i, 5) - 0.5) * 0.8) * cw * 1.25, -(row - (R - 1) / 2 + (hash(seed, t.i, 6) - 0.5) * 0.8) * ch * 1.3, (hash(seed, t.i, 7) - 0.5) * D]
    }
    span = { x: C * cw * 1.25, y: R * ch * 1.3, z: D }
  } else if (L === "ring" || L === "helix") {
    const per = L === "ring" ? Math.min(N, 18) : 12, rows = Math.ceil(N / per)
    const radius = Math.max(cw, (per * cw) / TAU) * (1 + p.depth * 0.6)
    for (const t of list) {
      const k = t.i % per, row = Math.floor(t.i / per), a = (TAU * k) / per
      const y = L === "ring" ? -(row - (rows - 1) / 2) * ch : -((t.i - (N - 1) / 2) * ch) / per * 1.15
      t.pos = [radius * Math.sin(a), y, radius * Math.cos(a)]
      t.R = ry(a)
    }
    span = { x: radius * 2 + cw, y: L === "ring" ? rows * ch : (N / per) * ch * 1.15 + ch, z: radius * 2 }
  } else if (L === "tunnel") {
    // Tiles line the walls, lengthways, facing in; the tunnel runs away from the camera.
    const K = 6, slices = Math.ceil(N / K), radius = (K * ch) / TAU * 1.05, step = cw * (0.6 + p.depth)
    for (const t of list) {
      const k = t.i % K, s = Math.floor(t.i / K), a = (TAU * k) / K + (s % 2) * (Math.PI / K) * p.scatter
      const radial = [Math.cos(a), Math.sin(a), 0]
      t.pos = [radius * radial[0], radius * radial[1], -s * step]
      // Turned so no wall's images are upside down.
      const flip = Math.cos(a) > 1e-6 || (Math.abs(Math.cos(a)) <= 1e-6 && Math.sin(a) < 0) ? 1 : -1
      t.R = cols([0, 0, flip], muls([-Math.sin(a), Math.cos(a), 0], flip), muls(radial, -1))
    }
    span = { x: radius * 2, y: radius * 2, z: slices * step, tunnel: radius }
  } else if (L === "stack") {
    const step = cw * (0.08 + p.depth * 0.5)
    for (const t of list) t.pos = [(hash(seed, t.i, 8) - 0.5) * cw * 0.3, (hash(seed, t.i, 9) - 0.5) * ch * 0.3, -t.i * step]
    span = { x: cw * 1.3, y: ch * 1.3, z: N * step }
  }

  // Scatter and tilt: each tile nudged and turned a little, from the seed.
  for (const t of list) {
    const s = p.scatter * (L === "tunnel" ? 0 : 1)
    t.pos = add(t.pos, [(hash(seed, t.i, 10) - 0.5) * cw * s, (hash(seed, t.i, 11) - 0.5) * ch * s, (hash(seed, t.i, 12) - 0.5) * cw * s * 1.5])
    const k = p.tilt * 0.9
    if (k) t.R = mul3(t.R, mul3(ry((hash(seed, t.i, 13) - 0.5) * k * 1.6), mul3(rx((hash(seed, t.i, 14) - 0.5) * k * 1.2), rz((hash(seed, t.i, 15) - 0.5) * k * 0.6))))
  }
  return { list, span, cw, ch }
}

// ---- the camera ----
function camera(p, t, layout, frameAspect) {
  const fov = p.fov * DEG, tan = Math.tan(fov / 2), { span } = layout
  const target = [p.panX * span.x * 0.5, p.panY * span.y * 0.5, 0]
  let dist = (Math.max(span.y / 2, span.x / 2 / frameAspect) / tan) * 1.05 + (p.layout === "ring" || p.layout === "helix" ? span.z / 2 : 0)
  if (span.tunnel) { target[2] = -span.z; dist = span.z + layout.cw }
  dist /= p.zoom
  let yaw = 0, pitch = 0
  if (p.move === "drift") { yaw = 9 * DEG * Math.sin(TAU * p.loops * t); pitch = 4 * DEG * Math.sin(TAU * 2 * p.loops * t) }
  if (p.move === "orbit") yaw = TAU * p.loops * t
  const dir = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)]
  return { eye: add(target, muls(dir, dist)), target, up: [0, 1, 0], dist, fov }
}

// ---- WebGL ----
const VERT = `#version 300 es
in vec2 aPos;
uniform mat4 uMVP, uMV;
uniform vec2 uSize;
uniform float uPad;
out vec2 vLocal;
out float vDepth;
void main() {
  vec2 p = aPos * (uSize + 2.0 * uPad);
  vLocal = p;
  vDepth = -(uMV * vec4(p, 0.0, 1.0)).z;
  gl_Position = uMVP * vec4(p, 0.0, 1.0);
}`
const FRAG = `#version 300 es
precision highp float;
in vec2 vLocal;
in float vDepth;
uniform sampler2D uTex;
uniform bool uUseTex, uShadow;
uniform vec4 uUV, uSolid;
uniform vec2 uSize, uShadowOff;
uniform float uRadius, uAlpha, uLod, uSoft;
out vec4 o;
float box(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
void main() {
  if (uShadow) {
    float d = box(vLocal - uShadowOff, uSize * 0.5, uRadius);
    o = vec4(0.0, 0.0, 0.0, uAlpha * (1.0 - smoothstep(-uSoft, uSoft, d)));
    return;
  }
  float d = box(vLocal, uSize * 0.5, uRadius);
  float aa = fwidth(d) * (0.7 + uLod * 0.8);
  float a = uAlpha * (1.0 - smoothstep(-aa, aa, d));
  vec2 uv = vec2(vLocal.x / uSize.x + 0.5, 0.5 - vLocal.y / uSize.y) * uUV.xy + uUV.zw;
  // A tile seen from behind shows a plain card back, not its image mirrored.
  vec4 c = uUseTex && gl_FrontFacing ? texture(uTex, uv, uLod) : uSolid;
  o = c * a;
}`

let gl = null, glCanvas = null, prog = null, loc = {}, maxTex = 4096
const textures = new Map() // image element -> WebGL texture

function context(w, h) {
  if (!gl) {
    glCanvas = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h })
    gl = glCanvas.getContext("webgl2", { premultipliedAlpha: true, alpha: true, antialias: false, preserveDrawingBuffer: true })
    if (!gl) throw new Error("This browser can't draw WebGL 2, which Showroom needs.")
    const shader = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s }
    prog = gl.createProgram()
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT))
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG))
    gl.linkProgram(prog)
    for (const n of ["uMVP", "uMV", "uSize", "uPad", "uTex", "uUseTex", "uShadow", "uUV", "uSolid", "uShadowOff", "uRadius", "uAlpha", "uLod", "uSoft"]) loc[n] = gl.getUniformLocation(prog, n)
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5]), gl.STATIC_DRAW)
    const a = gl.getAttribLocation(prog, "aPos")
    gl.enableVertexAttribArray(a)
    gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0)
    maxTex = Math.min(8192, gl.getParameter(gl.MAX_TEXTURE_SIZE))
  }
  if (glCanvas.width !== w || glCanvas.height !== h) { glCanvas.width = w; glCanvas.height = h }
  return gl
}

// An image's texture, made once. Very large images are scaled to fit the GPU's limit first.
function texture(el, w, h) {
  let tex = textures.get(el)
  if (tex) return tex
  let src = el
  const k = Math.min(1, maxTex / Math.max(w, h))
  if (k < 1) {
    src = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(Math.round(w * k), Math.round(h * k)) : Object.assign(document.createElement("canvas"), { width: Math.round(w * k), height: Math.round(h * k) })
    const c = src.getContext("2d")
    c.imageSmoothingQuality = "high"
    c.drawImage(el, 0, 0, src.width, src.height)
  }
  tex = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src)
  gl.generateMipmap(gl.TEXTURE_2D)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  const ext = gl.getExtension("EXT_texture_filter_anisotropic")
  if (ext) gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT)))
  textures.set(el, tex)
  return tex
}
// Textures for images no longer shown are let go.
function prune(tiles) {
  const live = new Set(tiles.map((x) => x.el))
  for (const [el, tex] of textures) if (!live.has(el)) { gl.deleteTexture(tex); textures.delete(el) }
}

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)

export function render(ctx, patch, t, { scale = 1, tiles = [] } = {}) {
  const { w: W, h: H } = size(patch)
  t = frac(t)
  const p = resolve(manifest, patch, t)
  const pw = Math.max(1, Math.round(W * scale)), ph = Math.max(1, Math.round(H * scale))
  const g = context(pw, ph)
  prune(tiles)
  const layout = arrange(p, patch.seed, tiles)
  const cam = camera(p, t, layout, W / H)
  const { span, cw, ch } = layout
  const world = mul3(rz(p.rotZ * DEG), mul3(ry(p.rotY * DEG), rx(p.rotX * DEG)))

  // Where each tile is at t, in the world.
  const flying = p.move === "fly", period = Math.max(span.z, cw * 4) + cw * (1 + p.gap)
  const nearZ = span.tunnel ? cw : cam.eye[2] - cw * 0.3
  const placed = layout.list.map((tile) => {
    let pos = tile.pos.slice(), R = tile.R, alpha = 1
    if (p.layout === "wave") pos[2] += cw * (0.25 + p.depth * 0.6) * Math.sin(TAU * (t * p.loops - (tile.cell[0] + tile.cell[1]) / 8))
    if (p.float) { pos[1] += p.float * ch * 0.12 * Math.sin(TAU * (t + tile.ph)); pos[2] += p.float * cw * 0.15 * Math.sin(TAU * (t + tile.ph2)) }
    if (p.spin) R = mul3(R, ry(TAU * (p.spin * t + tile.ph)))
    if (p.move === "pan") pos[0] = wrap(pos[0] - span.x * p.loops * t, -span.x / 2, span.x)
    if (p.move === "scroll") pos[1] = wrap(pos[1] + span.y * p.loops * t, -span.y / 2, span.y)
    if (flying) {
      // Tiles come towards the camera and wrap round to the far end, fading in there and out
      // as they pass.
      pos[2] = nearZ - wrap(nearZ - (pos[2] + period * p.loops * t), 0, period)
      const u = (nearZ - pos[2]) / period
      alpha *= ease(u / 0.1) * ease((1 - u) / 0.2)
    }
    return { ...tile, pos: apply3(world, pos), R: mul3(world, R), alpha }
  })

  // Dive in: from the whole view to one tile after another, filling the frame, and back out.
  let { eye, target, up } = cam
  if (p.move === "dive" && placed.length) {
    const facing = placed.filter((x) => dot(apply3(x.R, [0, 0, 1]), sub(cam.eye, x.pos)) > 0)
    const pool = (facing.length ? facing : placed).slice().sort((a, b) => Math.hypot(a.pos[0] - cam.target[0], a.pos[1] - cam.target[1]) - Math.hypot(b.pos[0] - cam.target[0], b.pos[1] - cam.target[1])).slice(0, Math.max(p.stops, Math.ceil(placed.length / 2)))
    const s = t * p.stops, k = Math.floor(s), u = s - k
    const at = pool[Math.floor(hash(patch.seed, k, 21) * pool.length)]
    const f = u < 0.4 ? ease(u / 0.4) : u < 0.6 ? 1 : ease((1 - u) / 0.4)
    const tan = Math.tan(cam.fov / 2), d = Math.max(at.h / (2 * tan * 0.86), at.w / (2 * tan * (W / H) * 0.86))
    eye = lerp3(cam.eye, add(at.pos, muls(apply3(at.R, [0, 0, 1]), d)), f)
    target = lerp3(cam.target, at.pos, f)
    up = norm(lerp3(cam.up, apply3(at.R, [0, 1, 0]), f))
  }

  const focusDist = Math.hypot(...sub(target, eye))
  const near = Math.max(0.005, Math.min(cw * 0.05, focusDist * 0.02)), far = focusDist * 12 + period * 3
  const view = lookAt(eye, target, up), proj = perspective(cam.fov, W / H, near, far)
  const drawn = placed
    .map((x) => ({ ...x, depth: -project(view, x.pos)[2] }))
    .filter((x) => x.depth > near && x.alpha > 0.002)
    .sort((a, b) => b.depth - a.depth)

  g.viewport(0, 0, pw, ph)
  const bg = rgb(p.background)
  if (p.transparent) g.clearColor(0, 0, 0, 0)
  else g.clearColor(bg[0], bg[1], bg[2], 1)
  g.clear(g.COLOR_BUFFER_BIT)
  g.useProgram(prog)
  g.enable(g.BLEND)
  g.blendFunc(g.ONE, g.ONE_MINUS_SRC_ALPHA)
  g.uniform1i(loc.uTex, 0)
  g.activeTexture(g.TEXTURE0)
  const solid = p.transparent ? [0.55, 0.55, 0.53] : bg.map((c) => (c > 0.5 ? c * 0.86 : c + 0.12))
  g.uniform4f(loc.uSolid, solid[0], solid[1], solid[2], 1)

  for (const x of drawn) {
    const mv = mul4(view, model(x.R, x.pos)), mvp = mul4(proj, mv)
    const off = (x.depth - focusDist) / focusDist
    const lod = clamp(p.focus * 7 * Math.abs(off), 0, 7)
    const alpha = x.alpha * (1 - p.fog * clamp(off / 1.5, 0, 1))
    const radius = p.radius * Math.min(x.w, x.h)
    g.uniformMatrix4fv(loc.uMVP, false, mvp)
    g.uniformMatrix4fv(loc.uMV, false, mv)
    g.uniform2f(loc.uSize, x.w, x.h)
    g.uniform1f(loc.uRadius, radius)
    if (p.shadow > 0) {
      const soft = 0.07 * Math.min(x.w, x.h)
      g.uniform1i(loc.uShadow, 1)
      g.uniform1f(loc.uPad, soft * 2 + x.h * 0.06)
      g.uniform2f(loc.uShadowOff, 0, -x.h * 0.04)
      g.uniform1f(loc.uSoft, soft)
      g.uniform1f(loc.uAlpha, p.shadow * 0.42 * alpha)
      g.drawArrays(g.TRIANGLE_STRIP, 0, 4)
    }
    g.uniform1i(loc.uShadow, 0)
    g.uniform1f(loc.uPad, Math.min(x.w, x.h) * 0.01) // room for the edge's antialiasing
    g.uniform1f(loc.uAlpha, alpha)
    g.uniform1f(loc.uLod, lod)
    if (x.img) {
      g.bindTexture(g.TEXTURE_2D, texture(x.img.el, x.img.w, x.img.h))
      g.uniform1i(loc.uUseTex, 1)
      // Fit the image to cover its tile: the top (or the middle) of a tall one, and, with Scroll
      // pages, down it and back once a loop.
      const ia = x.img.w / x.img.h
      let sx = 1, sy = 1, ox = 0, oy = 0
      if (ia > x.aspect) { sx = x.aspect / ia; ox = (1 - sx) / 2 }
      else {
        sy = ia / x.aspect
        const base = p.crop === "middle" ? (1 - sy) / 2 : 0
        oy = base + (1 - sy - base) * p.pageScroll * (0.5 - 0.5 * Math.cos(TAU * (t + x.ph * 0.25)))
      }
      g.uniform4f(loc.uUV, sx, sy, ox, oy)
    } else g.uniform1i(loc.uUseTex, 0)
    g.drawArrays(g.TRIANGLE_STRIP, 0, 4)
  }
  g.flush()

  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  ctx.drawImage(glCanvas, 0, 0, ctx.canvas.width, ctx.canvas.height)
  ctx.restore()
}
