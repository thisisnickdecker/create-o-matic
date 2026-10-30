// Spirotype: the engine. A spirograph whose ring is your letters. The word (or an SVG logo) is
// drawn once into a mask, and its edges are traced into closed outlines (marching squares),
// smoothed and measured. A wheel then rolls along every outline, outside it, inside it or both,
// turning as it goes, and pens fixed to the wheel draw. Each outline gets a whole number of wheel
// turns over its laps, so every pattern closes; the motions are periodic in t, so the loop does too.
//
//   render(ctx, patch, t, { scale, marks, version })   marks: Map from prepareMarks; version: bump
//                                                     when fonts arrive, so the track is traced again
//   svg(patch, t, options)    the same lines as an SVG document, one path per pen, for plotters
import { readJson } from "../../packages/core/read-json.js"
import { formatSize } from "../../packages/core/formats.js"
import { resolve } from "../../packages/core/keys.js"
import { fontString } from "../../packages/core/fonts.js"
import { drawMark } from "../../packages/core/marks.js"

export const manifest = await readJson(new URL("./instrument.json", import.meta.url))

const TAU = Math.PI * 2
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const frac = (x) => x - Math.floor(x)
const ease = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x) }

export const size = (patch) => formatSize(patch.params)
export const frameCount = (patch) => Math.max(1, Math.round(patch.params.duration * Number(patch.params.fps)))

const lines = (p) => p.content.split("\n").map((l) => l.trim()).filter(Boolean)
const markOf = (p) => { const l = lines(p); return l.length === 1 && /^@[a-z0-9-]+$/.test(l[0]) ? l[0].slice(1) : null }
// Every weight the loop passes through, when Weight is keyframed, so each frame's track is true.
export function fontRequest(patch) {
  const keyed = patch.keys?.weight?.map((k) => k.v) ?? []
  const weights = keyed.length ? [...new Set([patch.params.weight, ...keyed, Math.min(...keyed), Math.max(...keyed)])] : [patch.params.weight]
  return { source: patch.params.fontSource, family: patch.params.font, kit: patch.params.adobeKit, weights, sample: [...new Set(patch.params.content)].join("") }
}

// ---- the track: outlines of the letters ----
const MASK = 1600 // the mask's long side, in pixels
function surface(w, h) {
  const c = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h })
  return { c, g: c.getContext("2d", { willReadFrequently: true }) }
}

// Draw the word or logo into a mask; return its alpha.
function mask(p, bw, bh, marks) {
  const k = MASK / Math.max(bw, bh), mw = Math.ceil(bw * k) + 8, mh = Math.ceil(bh * k) + 8
  const { g } = surface(mw, mh)
  g.fillStyle = "#000"
  const name = markOf(p), mark = name && marks?.get(name)
  if (mark) drawMark(g, mark, 4, 4, mw - 8, mh - 8, "#000", { fit: "contain" })
  else {
    const rows = name ? [p.content.trim()] : lines(p)
    if (!rows.length) return null
    g.font = fontString(p.weight, 100, p.font)
    g.letterSpacing = `${p.tracking * 100}px`
    const wide = Math.max(...rows.map((r) => g.measureText(r).width)) || 1
    const px = Math.min(((mw - 16) / wide) * 100, (mh - 16) / (rows.length * 1.05))
    g.font = fontString(p.weight, px, p.font)
    g.letterSpacing = `${p.tracking * px}px`
    g.textAlign = "center"
    g.textBaseline = "middle"
    rows.forEach((r, i) => g.fillText(r, mw / 2, mh / 2 + (i - (rows.length - 1) / 2) * px * 1.05))
  }
  const data = g.getImageData(0, 0, mw, mh).data, a = new Uint8Array(mw * mh)
  for (let i = 0; i < a.length; i++) a[i] = data[i * 4 + 3]
  return { a, mw, mh }
}

// Marching squares: the edges where the mask crosses half, as closed loops of points.
// Each cell's case says which of its four edges the boundary crosses; an edge point is shared by
// the two cells either side of it, so linking them by edge makes the loops.
const SEGS = [[], [[3, 2]], [[2, 1]], [[3, 1]], [[0, 1]], null, [[0, 2]], [[0, 3]], [[0, 3]], [[0, 2]], null, [[0, 1]], [[3, 1]], [[2, 1]], [[3, 2]], []]
function contours({ a, mw, mh }) {
  const at = (x, y) => (x < 0 || y < 0 || x >= mw || y >= mh ? 0 : a[y * mw + x])
  const stride = mw + 2, ids = stride * (mh + 2) * 2, adj = new Int32Array(ids * 2).fill(-1), pts = new Float32Array(ids * 2)
  const id = (x, y, v) => (y * stride + x) * 2 + v
  const link = (e1, e2) => { adj[e1 * 2 + (adj[e1 * 2] < 0 ? 0 : 1)] = e2; adj[e2 * 2 + (adj[e2 * 2] < 0 ? 0 : 1)] = e1 }
  const cut = (a0, a1) => (a0 === a1 ? 0.5 : clamp((127.5 - a0) / (a1 - a0), 0, 1))
  for (let y = -1; y < mh; y++) for (let x = -1; x < mw; x++) {
    const tl = at(x, y), tr = at(x + 1, y), br = at(x + 1, y + 1), bl = at(x, y + 1)
    const c = (tl > 127 ? 8 : 0) | (tr > 127 ? 4 : 0) | (br > 127 ? 2 : 0) | (bl > 127 ? 1 : 0)
    if (c === 0 || c === 15) continue
    const X = x + 1, Y = y + 1 // shifted by one, so the border cells have ids
    const edges = [id(X, Y, 0), id(X + 1, Y, 1), id(X, Y + 1, 0), id(X, Y, 1)] // top, right, bottom, left
    const place = [[x + cut(tl, tr), y], [x + 1, y + cut(tr, br)], [x + cut(bl, br), y + 1], [x, y + cut(tl, bl)]]
    for (let k = 0; k < 4; k++) { pts[edges[k] * 2] = place[k][0]; pts[edges[k] * 2 + 1] = place[k][1] }
    let segs = SEGS[c]
    if (!segs) { // saddles: the centre decides which corners join
      const centre = (tl + tr + br + bl) / 4 > 127
      segs = c === 5 ? (centre ? [[0, 3], [2, 1]] : [[0, 1], [3, 2]]) : (centre ? [[0, 1], [3, 2]] : [[0, 3], [2, 1]])
    }
    for (const [e1, e2] of segs) link(edges[e1], edges[e2])
  }
  const seen = new Uint8Array(adj.length / 2), loops = []
  for (let e = 0; e < seen.length; e++) {
    if (seen[e] || adj[e * 2] < 0) continue
    const xs = [], ys = []
    let prev = -1, cur = e
    while (!seen[cur]) {
      seen[cur] = 1
      xs.push(pts[cur * 2]); ys.push(pts[cur * 2 + 1])
      const n = adj[cur * 2] !== prev ? adj[cur * 2] : adj[cur * 2 + 1]
      prev = cur; cur = n
      if (cur < 0) break
    }
    if (xs.length > 12) loops.push({ xs, ys })
  }
  return loops
}

// Even spacing along a closed loop.
function resample(xs, ys, step) {
  const n = xs.length, cum = [0]
  for (let i = 1; i <= n; i++) cum.push(cum[i - 1] + Math.hypot(xs[i % n] - xs[i - 1], ys[i % n] - ys[i - 1]))
  const L = cum[n], m = Math.max(8, Math.round(L / step)), ox = new Float64Array(m), oy = new Float64Array(m)
  let j = 0
  for (let i = 0; i < m; i++) {
    const s = (i / m) * L
    while (cum[j + 1] < s) j++
    const k = (s - cum[j]) / (cum[j + 1] - cum[j] || 1)
    ox[i] = xs[j] + (xs[(j + 1) % n] - xs[j]) * k
    oy[i] = ys[j] + (ys[(j + 1) % n] - ys[j]) * k
  }
  return { xs: ox, ys: oy, L }
}
// A circular box blur, twice: smooths corners while keeping the loop closed.
function soften(v, r) {
  if (r < 1) return v
  const n = v.length
  for (let pass = 0; pass < 2; pass++) {
    const out = new Float64Array(n)
    let sum = 0
    for (let k = -r; k <= r; k++) sum += v[((k % n) + n) % n]
    for (let i = 0; i < n; i++) {
      out[i] = sum / (2 * r + 1)
      sum += v[(i + r + 1) % n] - v[(((i - r) % n) + n) % n]
    }
    v = out
  }
  return v
}

const cache = new Map() // recent tracks by what they depend on
// The track for this patch and frame size, traced once and kept until something it depends on
// changes. In frame pixels: loops with even spacing, tangents and outward normals, and a unit
// (the height of a line of letters) that sizes the wheel.
function track(p, W, H, marks, version) {
  const name = markOf(p)
  const key = JSON.stringify([p.content, p.font, p.fontSource, Math.round(p.weight), Math.round(p.tracking * 1000) / 1000, Math.round(p.soften * 100) / 100, p.margin, W, H, name && marks?.get(name) ? name + marks.get(name).bounds.w : "", version])
  if (cache.has(key)) return cache.get(key)
  const m = Math.min(p.margin, W / 2 - 8, H / 2 - 8), bw = W - 2 * m, bh = H - 2 * m
  const mk = mask(p, bw, bh, marks)
  let shape = null
  if (mk) {
    const raw = contours(mk)
    if (raw.length) {
      // Fit the loops' bounds into the box, centred.
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
      for (const l of raw) for (let i = 0; i < l.xs.length; i++) { x0 = Math.min(x0, l.xs[i]); x1 = Math.max(x1, l.xs[i]); y0 = Math.min(y0, l.ys[i]); y1 = Math.max(y1, l.ys[i]) }
      const k = Math.min(bw / (x1 - x0), bh / (y1 - y0)), ox = W / 2 - ((x0 + x1) / 2) * k, oy = H / 2 - ((y0 + y1) / 2) * k
      const rows = name ? 1 : lines(p).length, unit = ((y1 - y0) * k) / rows
      const step = Math.max(0.6, unit * 0.004)
      const at = (x, y) => { const X = Math.round((x - ox) / k), Y = Math.round((y - oy) / k); return X < 0 || Y < 0 || X >= mk.mw || Y >= mk.mh ? 0 : mk.a[Y * mk.mw + X] }
      const loops = []
      for (const l of raw) {
        let { xs, ys } = resample(l.xs.map((x) => ox + x * k), l.ys.map((y) => oy + y * k), step)
        const r = Math.round((p.soften * unit * 0.05) / step)
        xs = soften(xs, r); ys = soften(ys, r)
        const even = resample(Array.from(xs), Array.from(ys), step)
        if (even.L < unit * 0.04) continue
        xs = even.xs; ys = even.ys
        const n = xs.length
        // Turn each loop so the ink is on its left; the outward normal then points away from ink.
        let votes = 0
        for (let q = 0; q < 9; q++) {
          const i = Math.floor((q / 9) * n), j = (i + 1) % n, dx = xs[j] - xs[i], dy = ys[j] - ys[i], d = Math.hypot(dx, dy) || 1
          const reach = Math.max(2, 2.5 / k)
          votes += at((xs[i] + xs[j]) / 2 - (dy / d) * reach, (ys[i] + ys[j]) / 2 + (dx / d) * reach) > 127 ? 1 : -1
        }
        if (votes < 0) { xs = xs.reverse(); ys = ys.reverse() }
        const tx = new Float64Array(n), ty = new Float64Array(n)
        for (let i = 0; i < n; i++) {
          const dx = xs[(i + 1) % n] - xs[(i - 1 + n) % n], dy = ys[(i + 1) % n] - ys[(i - 1 + n) % n], d = Math.hypot(dx, dy) || 1
          tx[i] = dx / d; ty[i] = dy / d
        }
        loops.push({ xs, ys, tx, ty, n, L: even.L })
      }
      shape = { loops, unit }
    }
  }
  cache.set(key, shape)
  if (cache.size > 60) cache.delete(cache.keys().next().value)
  return shape
}

// ---- the pens ----
// Every pen's line on every loop at t, as flat arrays of points, with the share of each to draw.
export function trace(patch, t, { scale = 1, marks, version = 0 } = {}) {
  const { w: W, h: H } = size(patch)
  t = frac(t)
  const p = resolve(manifest, patch, t)
  const shape = track(p, W, H, marks, version)
  const out = { W, H, p, shape, pens: [] }
  if (!shape) return out
  const sides = p.side === "both" ? [1, -1] : [p.side === "inside" ? -1 : 1]
  const r0 = Math.max(0.5, p.wheel * shape.unit), maxStep = 1.4 / Math.max(0.25, scale)
  // Draw on, then off: the pens draw in the first two thirds, rest, then lift from the start.
  let from = 0, to = 1
  if (p.motion === "draw") { to = ease(t / 0.62); from = ease((t - 0.78) / 0.22) }
  for (let j = 0; j < p.pens; j++) {
    const lift = p.pens > 1 ? j / (p.pens - 1) : 0
    const colour = p.palette[j % p.palette.length]
    let d = p.pen * (1 - p.spread * 0.7 * lift), phase = (TAU * j * p.spread) / p.pens, shift = 0
    if (p.motion === "spin") phase += TAU * p.cycles * t
    if (p.motion === "breathe") d *= 1 + p.amount * Math.sin(TAU * (p.cycles * t + j / p.pens))
    if (p.motion === "crawl") shift = p.cycles * t
    const lines = []
    for (const loop of shape.loops) for (const sd of sides) {
      // Whole turns over the laps, so the line closes: the wheel is resized a little to fit. The
      // turns are a whole number a lap plus Drift, so each lap lands Drift/Laps of a turn on.
      const turns = Math.max(1, p.laps * Math.max(1, Math.round(loop.L / (TAU * r0))) + p.drift)
      const r = (p.laps * loop.L) / (TAU * turns)
      const total = p.laps * loop.L
      const N = Math.min(60000, Math.max(turns * 48, Math.ceil(total / maxStep)))
      const a = Math.floor(from * N), b = Math.ceil(to * N)
      if (b - a < 2) continue
      const pts = new Float32Array((b - a + 1) * 2)
      const { xs, ys, tx, ty, n, L } = loop
      for (let i = a, o = 0; i <= b; i++, o += 2) {
        const s = (i / N) * total, u = ((s / L + shift) % 1) * n
        const k0 = Math.floor(u) % n, k1 = (k0 + 1) % n, f = u - Math.floor(u)
        const x = xs[k0] + (xs[k1] - xs[k0]) * f, y = ys[k0] + (ys[k1] - ys[k0]) * f
        let ux = tx[k0] + (tx[k1] - tx[k0]) * f, uy = ty[k0] + (ty[k1] - ty[k0]) * f
        const ul = Math.hypot(ux, uy) || 1
        ux /= ul; uy /= ul
        // The wheel's centre sits r out along the normal (away from the ink, or into it).
        const cx = x + sd * uy * r, cy = y - sd * ux * r
        const roll = (sd * s) / r
        const ang = Math.atan2(uy, ux) + roll + phase
        const dd = d * r * (p.lobes ? 1 + p.wobble * Math.cos(p.lobes * roll) : 1)
        pts[o] = cx + dd * Math.cos(ang)
        pts[o + 1] = cy + dd * Math.sin(ang)
      }
      lines.push(pts)
    }
    out.pens.push({ colour, lines })
  }
  return out
}

// The letters as a vector path, for Show letters and the SVG.
function letterPath(shape) {
  const path = new Path2D()
  for (const l of shape.loops) {
    path.moveTo(l.xs[0], l.ys[0])
    for (let i = 1; i < l.n; i++) path.lineTo(l.xs[i], l.ys[i])
    path.closePath()
  }
  return path
}

export function render(ctx, patch, t, opts = {}) {
  const scale = opts.scale ?? 1
  const { W, H, p, shape, pens } = trace(patch, t, opts)
  ctx.save()
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  if (p.transparent) ctx.clearRect(0, 0, W, H)
  else { ctx.fillStyle = p.background; ctx.fillRect(0, 0, W, H) }
  if (shape && p.letters > 0) {
    ctx.globalAlpha = p.letters
    ctx.fillStyle = p.letterInk
    ctx.fill(letterPath(shape), "evenodd")
  }
  const width = (p.line * Math.min(W, H)) / 1080
  ctx.lineJoin = "round"
  ctx.lineCap = "round"
  for (const pen of pens) {
    const path = new Path2D()
    for (const pts of pen.lines) {
      path.moveTo(pts[0], pts[1])
      for (let i = 2; i < pts.length; i += 2) path.lineTo(pts[i], pts[i + 1])
    }
    ctx.strokeStyle = pen.colour
    if (p.glow > 0) {
      ctx.globalAlpha = 0.14 * p.glow * p.opacity
      ctx.lineWidth = width * (3 + 9 * p.glow)
      ctx.stroke(path)
    }
    ctx.globalAlpha = p.opacity
    ctx.lineWidth = width
    ctx.stroke(path)
  }
  ctx.restore()
}

// The frame at t as SVG: the paper (unless see-through), the letters if shown, and one path per
// pen, so a plotter draws each ink in one go.
export function svg(patch, t, opts = {}) {
  const { W, H, p, shape, pens } = trace(patch, t, { ...opts, scale: 2 })
  const f = (v) => Math.round(v * 100) / 100
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`]
  if (!p.transparent) out.push(`<rect width="${W}" height="${H}" fill="${p.background}"/>`)
  if (shape && p.letters > 0) {
    const d = shape.loops.map((l) => "M" + Array.from({ length: l.n }, (_, i) => `${f(l.xs[i])} ${f(l.ys[i])}`).join("L") + "Z").join("")
    out.push(`<path d="${d}" fill="${p.letterInk}" fill-opacity="${p.letters}" fill-rule="evenodd"/>`)
  }
  const width = f((p.line * Math.min(W, H)) / 1080)
  for (const pen of pens) {
    const d = pen.lines.map((pts) => {
      let s = `M${f(pts[0])} ${f(pts[1])}`
      for (let i = 2; i < pts.length; i += 2) s += `L${f(pts[i])} ${f(pts[i + 1])}`
      return s
    }).join("")
    out.push(`<path d="${d}" fill="none" stroke="${pen.colour}" stroke-width="${width}" stroke-opacity="${p.opacity}" stroke-linecap="round" stroke-linejoin="round"/>`)
  }
  out.push("</svg>")
  return out.join("\n")
}
