// Code effects, beside ASCII: Dot matrix (the picture as points, lit or sized by brightness, which
// can scatter and come home), Pixel sort (spans sorted so bright pixels drag into streaks) and
// Mosaic (tiles).
// Each reads the frame and redraws it; anything that moves completes whole cycles per loop.
import { hash, hexRgb, TAU } from "./util.js"

const lum = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255

// The mean colour of each cell, from five points across it: [r, g, b] per cell in one array.
function cellColours(data, W, H, cw, ch, cols, rows) {
  const out = new Float32Array(cols * rows * 3)
  for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
    let R = 0, G = 0, B = 0
    for (const [fx, fy] of [[0.5, 0.5], [0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
      const x = Math.min(W - 1, (k * cw + fx * cw) | 0), y = Math.min(H - 1, (r * ch + fy * ch) | 0), q = (y * W + x) * 4
      R += data[q]; G += data[q + 1]; B += data[q + 2]
    }
    const o = (r * cols + k) * 3
    out[o] = R / 5; out[o + 1] = G / 5; out[o + 2] = B / 5
  }
  return out
}

// Colours rounded to 16 levels a channel, so dots of a colour share one path and one fill.
const key = (r, g, b, a = 1) => `rgba(${(r >> 4) * 17},${(g >> 4) * 17},${(b >> 4) * 17},${Math.round(a * 8) / 8})`

export const dotmatrix = {
  id: "dotmatrix",
  label: "Dot matrix",
  group: "Code",
  params: [
    { key: "dots", label: "Dot matrix", type: "number", min: 0, max: 80, step: 0.5, default: 0, unit: "px", help: "The grid's pitch: one dot per cell. 0 is off." },
    { key: "dotStyle", label: "Dots", type: "select", default: "led", when: { dots: { not: 0 } }, options: [["led", "LED: lit by brightness"], ["size", "Pointillist: sized by brightness"]] },
    { key: "dotShape", label: "Shape", type: "select", default: "round", when: { dots: { not: 0 } }, options: [["round", "Round"], ["square", "Square"]] },
    { key: "dotGain", label: "Dot size", type: "number", min: 0.2, max: 1.4, step: 0.01, default: 0.86, when: { dots: { not: 0 } } },
    { key: "dotInk", label: "Dot colour", type: "select", default: "source", when: { dots: { not: 0 } }, options: [["source", "From the picture"], ["ink", "One ink"]] },
    { key: "dotColour", label: "Ink", type: "color", default: "#FF4D00", when: { dotInk: "ink" } },
    { key: "dotGround", label: "Ground", type: "color", default: "#0B0B0A", when: { dots: { not: 0 } } },
    { key: "dotOff", label: "Unlit", type: "number", min: 0, max: 0.5, step: 0.01, default: 0.1, when: { dotStyle: "led" }, help: "How much the dark dots still show, as on a real display." },
    { key: "dotScatter", label: "Scatter", type: "number", min: 0, max: 1, step: 0.01, default: 0, when: { dots: { not: 0 } }, help: "Every dot drifts off on its own path and comes home, once a loop." },
  ],
  layerDefaults: { dots: 10 },
  active: (p) => p.dots >= 2,
  apply(ctx, p, { t, scale, seed }) {
    const { width: W, height: H } = ctx.canvas
    const cell = Math.max(2, p.dots * scale), cols = Math.ceil(W / cell), rows = Math.ceil(H / cell)
    const c = cellColours(ctx.getImageData(0, 0, W, H).data, W, H, cell, cell, cols, rows)
    const ground = hexRgb(p.dotGround), dark = lum(...ground) < 0.5, ink = hexRgb(p.dotColour)
    const out = 0.5 - 0.5 * Math.cos(TAU * t) // 0 at the loop's ends, 1 halfway: the scatter's swing
    const reach = p.dotScatter * cell * 6 * out
    const paths = new Map(), add = (k) => { let path = paths.get(k); if (!path) paths.set(k, (path = new Path2D())); return path }
    const radius = (cell / 2) * p.dotGain
    for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
      const i = r * cols + k, o = i * 3
      const R = c[o], G = c[o + 1], B = c[o + 2], l = lum(R, G, B), amount = dark ? l : 1 - l
      let x = (k + 0.5) * cell, y = (r + 0.5) * cell
      if (reach) { const a = hash(seed, i, 41) * TAU, d = reach * (0.3 + hash(seed, i, 42)); x += Math.cos(a) * d; y += Math.sin(a) * d }
      const [cr, cg, cb] = p.dotInk === "ink" ? ink : [R, G, B]
      let size = radius, alpha = 1
      if (p.dotStyle === "size") size = radius * Math.sqrt(amount)
      else {
        alpha = amount
        if (p.dotOff > 0) dot(add(key(cr, cg, cb, p.dotOff)), x, y, radius, p.dotShape)
      }
      if (size < 0.4 || alpha < 0.06) continue
      dot(add(key(cr, cg, cb, alpha)), x, y, size, p.dotShape)
    }
    ctx.fillStyle = p.dotGround
    ctx.fillRect(0, 0, W, H)
    for (const [colour, path] of paths) { ctx.fillStyle = colour; ctx.fill(path) }
  },
}

function dot(path, x, y, r, shape) {
  if (shape === "square") path.rect(x - r, y - r, r * 2, r * 2)
  else { path.moveTo(x + r, y); path.arc(x, y, r, 0, TAU) }
}

export const pixelsort = {
  id: "pixelsort",
  label: "Pixel sort",
  group: "Code",
  params: [
    { key: "pixelSort", label: "Pixel sort", type: "number", min: 0, max: 1, step: 0.01, default: 0, help: "How much sorts. Each line is cut into spans; a span with anything brighter than the threshold is sorted by brightness, so bright pixels drag out into streaks. 0 is off." },
    { key: "sortLength", label: "Streak length", type: "number", min: 8, max: 1200, step: 1, default: 260, unit: "px", when: { pixelSort: { not: 0 } } },
    { key: "sortDirection", label: "Along", type: "select", default: "columns", when: { pixelSort: { not: 0 } }, options: [["columns", "Columns (streaks fall)"], ["rows", "Rows (streaks run)"]] },
    { key: "sortOrder", label: "Order", type: "select", default: "rise", when: { pixelSort: { not: 0 } }, options: [["rise", "Light gathers at the end"], ["fall", "Light gathers at the start"]] },
    { key: "sortSweep", label: "Sweep", type: "number", min: 0, max: 1, step: 0.01, default: 0.6, when: { pixelSort: { not: 0 } }, help: "The streaks grow and draw back once a loop." },
  ],
  layerDefaults: { pixelSort: 0.55 },
  active: (p) => p.pixelSort > 0,
  apply(ctx, p, { t, scale, seed }) {
    const { width: W, height: H } = ctx.canvas
    const img = ctx.getImageData(0, 0, W, H), px = new Uint32Array(img.data.buffer)
    const threshold = Math.round((1 - p.pixelSort) * 255)
    const reach = p.sortLength * scale * (1 - p.sortSweep * (0.5 + 0.5 * Math.cos(TAU * t)))
    if (reach < 2) return
    const rows = p.sortDirection === "rows", lines = rows ? H : W, len = rows ? W : H
    const at = rows ? (line, i) => line * W + i : (line, i) => i * W + line
    const buf = new Uint32Array(len), lumOf = (v) => (54 * (v & 255) + 183 * ((v >> 8) & 255) + 19 * ((v >> 16) & 255)) >> 8
    for (let line = 0; line < lines; line++) {
      // Spans of varying length, starting at a different point on every line.
      let i = -Math.floor(hash(seed, line, 51) * reach), k = 0
      while (i < len) {
        const span = Math.max(2, Math.round(reach * (0.4 + 1.2 * hash(seed, line, k++, 52))))
        const a = Math.max(0, i), b = Math.min(len, i + span)
        let n = 0, bright = false
        for (let q = a; q < b; q++) {
          const v = px[at(line, q)], l = lumOf(v)
          if (l >= threshold) bright = true
          buf[n++] = ((l << 24) | (v & 0xffffff)) >>> 0 // brightness in the top byte: a numeric sort sorts by it
        }
        if (bright && n > 1) {
          const run = buf.subarray(0, n).sort()
          if (p.sortOrder === "fall") run.reverse()
          for (let q = 0; q < n; q++) px[at(line, a + q)] = ((run[q] & 0xffffff) | 0xff000000) >>> 0
        }
        i += span
      }
    }
    ctx.putImageData(img, 0, 0)
  },
}

export const mosaic = {
  id: "mosaic",
  label: "Mosaic",
  group: "Code",
  params: [
    { key: "mosaic", label: "Mosaic", type: "number", min: 0, max: 200, step: 1, default: 0, unit: "px", help: "Tile size. 0 is off." },
    { key: "mosaicGrout", label: "Grout", type: "number", min: 0, max: 0.4, step: 0.01, default: 0.06, when: { mosaic: { not: 0 } } },
    { key: "mosaicRound", label: "Rounding", type: "number", min: 0, max: 0.5, step: 0.01, default: 0.12, when: { mosaic: { not: 0 } } },
    { key: "mosaicGroutColour", label: "Grout colour", type: "color", default: "#121211", when: { mosaic: { not: 0 } } },
  ],
  layerDefaults: { mosaic: 24 },
  active: (p) => p.mosaic >= 2,
  apply(ctx, p, { scale }) {
    const { width: W, height: H } = ctx.canvas
    const cell = Math.max(2, p.mosaic * scale), cols = Math.ceil(W / cell), rows = Math.ceil(H / cell)
    const c = cellColours(ctx.getImageData(0, 0, W, H).data, W, H, cell, cell, cols, rows)
    const g = cell * p.mosaicGrout / 2, size = cell - 2 * g, round = size * p.mosaicRound
    ctx.fillStyle = p.mosaicGroutColour
    ctx.fillRect(0, 0, W, H)
    const paths = new Map()
    for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
      const o = (r * cols + k) * 3, colour = key(c[o], c[o + 1], c[o + 2])
      let path = paths.get(colour)
      if (!path) paths.set(colour, (path = new Path2D()))
      const x = k * cell + g, y = r * cell + g
      if (round > 0.5) path.roundRect(x, y, size, size, round)
      else path.rect(x, y, size, size)
    }
    for (const [colour, path] of paths) { ctx.fillStyle = colour; ctx.fill(path) }
  },
}
