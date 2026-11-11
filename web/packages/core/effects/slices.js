// Slices: the frame cut into a grid, each slice its own close-up. A slice can show its own piece of
// the picture, magnified and nudged, or the whole picture again, like a sheet of photo-booth
// prints. Slices are scaled about their own middles (big in the centre, small at the edges), pushed
// outwards, tilted and tapered, over the frame's ground. Some show only the line through their
// middle, stretched into a bar. It plays itself: the picture comes apart and back together, and a
// zoom wave sweeps through the slices.
//
// After Studio Vu-Huu's slicing tool (2026): slice scale with falloff, outward spread, taper, the
// stretched centre strip they call the Tomato effect, and the zoom wave that travels from the centre
// to the edge. Their code isn't public; this is written from what the tool shows on screen.
import { hash, TAU, standout } from "./util.js"

const copy = typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : null

const smooth = (x) => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x)
const frac = (x) => x - Math.floor(x)

// Edges of n slices along a length: equal at 0 swell; with swell, the middle ones are wider, by up
// to 1 + swell times the outer ones. Whole pixels, first edge 0, last edge the length.
export function sliceEdges(n, length, swell) {
  const w = []
  for (let i = 0; i < n; i++) {
    const u = n > 1 ? (2 * (i + 0.5)) / n - 1 : 0
    w.push(1 + swell * (1 - Math.abs(u)) ** 2)
  }
  const total = w.reduce((a, b) => a + b, 0)
  const edges = [0]
  let run = 0
  for (const x of w) { run += x; edges.push(Math.round((run / total) * length)) }
  return edges
}

// How far the effect has gone at time t: the Slices amount, or, while playing, that amount coming
// and going smoothly a whole number of times per loop, from the untouched frame at the start.
export const sliceAmount = (p, t) => p.slices * (p.slicePlay ? 0.5 - 0.5 * Math.cos(TAU * p.slicePlay * t) : 1)

// Where the zoom wave is, 0 to 1, at a slice whose place along the wave is `along` (0 to 1). The
// band enters before 0 and leaves after 1, so it's gone at both ends of the loop and the loop closes.
export function waveAt(p, t, along) {
  const width = Math.max(0.02, p.sliceWaveWidth)
  let phase = p.sliceWaves ? frac(p.sliceWaves * t) : 0.5
  if (p.sliceWaveBack && p.sliceWaves) phase = smooth(1 - Math.abs(2 * phase - 1))
  const at = -width + phase * (1 + 2 * width)
  return smooth(1 - Math.abs(along - at) / width)
}

// Every slice: its cell in the grid (x, y, w, h), where it's drawn (cx, cy: its middle; dw, dh;
// angle; taper), where it reads from (sx, sy, sw, sh, clamped inside the frame) and whether it's a
// stretched bar. Drawn in this order, so the biggest slices lie on top. Pure: no canvas needed.
// area is the part of the frame the grid covers (the whole frame unless given); slices read from
// inside it.
export function sliceLayout(W, H, p, { t = 0, seed = 0 } = {}, area = null) {
  const ox = area ? area.x : 0, oy = area ? area.y : 0
  if (area) { W = area.w; H = area.h }
  const k = sliceAmount(p, t)
  const cols = p.sliceCols, rows = p.sliceRows
  const swellX = p.sliceSwellAxis === "across" || p.sliceSwellAxis === "both" ? p.sliceSwell * k : 0
  const swellY = p.sliceSwellAxis === "down" || p.sliceSwellAxis === "both" ? p.sliceSwell * k : 0
  const xs = sliceEdges(cols, W, swellX), ys = sliceEdges(rows, H, swellY)
  const cw = W / cols, ch = H / rows
  // The middle the slices grow from and spread away from, and the farthest corner from it.
  const CX = p.sliceCentreX * W, CY = p.sliceCentreY * H
  const reach = Math.max(Math.hypot(CX, CY), Math.hypot(W - CX, CY), Math.hypot(CX, H - CY), Math.hypot(W - CX, H - CY))
  const out = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = xs[c], y = ys[r], w = xs[c + 1] - xs[c], h = ys[r + 1] - ys[r]
      const mx = x + w / 2, my = y + h / 2
      const d = Math.min(1, Math.hypot(mx - CX, my - CY) / reach)
      // Slice scale: centre scale in the middle falling to outer scale at the edge, along the curve.
      const fall = (1 - d) ** p.sliceFalloff
      const scale = 1 + (p.sliceOuterScale + (p.sliceCentreScale - p.sliceOuterScale) * fall - 1) * k
      const cx = CX + (mx - CX) * (1 + p.sliceSpread * k)
      const cy = CY + (my - CY) * (1 + p.sliceSpread * k)
      // Tilt grows outwards; taper narrows the outer edge, sideways or up and down, whichever the
      // slice is further from the middle in.
      const angle = (p.sliceTwist * Math.PI / 180) * k * d
      const across = Math.abs(mx - CX) / W >= Math.abs(my - CY) / H
      const taper = { across, far: across ? Math.sign(mx - CX) : Math.sign(my - CY), by: Math.min(0.95, p.sliceTaper * k * d) }
      // What it shows: its own piece (magnified, nudged) or, with Repeat, the whole picture, with
      // the zoom wave magnifying either.
      const u = (c + 0.5) / cols, v = (r + 0.5) / rows
      const along = p.sliceWaveFrom === "across" ? u : p.sliceWaveFrom === "down" ? v : p.sliceWaveFrom === "edge" ? 1 - d : d
      const z = Math.max(0.25, 1 + (p.sliceZoom * (1 + p.sliceWave * waveAt(p, t, along)) - 1) * k)
      const jx = (hash(seed, 401, c, r) * 2 - 1) * p.sliceScatter * k * cw
      const jy = (hash(seed, 402, c, r) * 2 - 1) * p.sliceScatter * k * ch
      const own = { x: (c + 0.5) * cw + jx, y: (r + 0.5) * ch + jy, w: cw, h: ch }
      const a = w / h, whole = W / a <= H ? { w: W, h: W / a } : { w: H * a, h: H }
      const rep = p.sliceRepeat * k
      const sw0 = own.w * (whole.w / own.w) ** rep, sh0 = own.h * (whole.h / own.h) ** rep
      const sw = Math.min(W, sw0 / z), sh = Math.min(H, sh0 / z)
      const px = own.x + (W / 2 - own.x) * rep, py = own.y + (H / 2 - own.y) * rep
      const sx = Math.min(W - sw, Math.max(0, px - sw / 2))
      const sy = Math.min(H - sh, Math.max(0, py - sh / 2))
      const bar = hash(seed, 403, c, r) < p.sliceBars * k
      out.push({ x: x + ox, y: y + oy, w, h, cx: cx + ox, cy: cy + oy, dw: w * scale, dh: h * scale, scale, angle, taper, sx: sx + ox, sy: sy + oy, sw, sh, bar })
    }
  }
  return out.sort((m, n) => m.scale - n.scale)
}

// One slice, drawn about its middle. Untapered, a single copy; tapered, in strips, each a little
// shorter towards the outer edge.
function drawSlice(ctx, src, s, gap, p) {
  const w = s.dw - 2 * gap, h = s.dh - 2 * gap
  if (w <= 0.5 || h <= 0.5) return
  let { sx, sy, sw, sh } = s
  // A bar reads only the line through the middle of its piece.
  if (s.bar && p.sliceBarDir === "across") { sx = Math.floor(sx + sw / 2); sw = 1 }
  else if (s.bar) { sy = Math.floor(sy + sh / 2); sh = 1 }
  ctx.save()
  ctx.translate(s.cx, s.cy)
  if (s.angle) ctx.rotate(s.angle)
  if (s.taper.by < 0.005) ctx.drawImage(src, sx, sy, sw, sh, -w / 2, -h / 2, w, h)
  else {
    const n = 24, { across, far, by } = s.taper
    for (let i = 0; i < n; i++) {
      // How far along this strip is towards the outer edge, 0 to 1.
      const f = (i + 0.5) / n, out = far >= 0 ? f : 1 - f, k = 1 - by * out
      if (across) {
        const sh2 = h * k
        ctx.drawImage(src, sx + (i * sw) / n, sy, sw / n, sh, -w / 2 + (i * w) / n, -sh2 / 2, w / n + 0.6, sh2)
      } else {
        const sw2 = w * k
        ctx.drawImage(src, sx, sy + (i * sh) / n, sw, sh / n, -sw2 / 2, -h / 2 + (i * h) / n, sw2, h / n + 0.6)
      }
    }
  }
  ctx.restore()
}

// The box around everything that stands out from the ground, in whole pixels, or null if nothing
// does. Read on a coarse grid of every few pixels; it only needs to be close.
function pictureBounds(ctx, env) {
  const { width: W, height: H } = ctx.canvas
  const d = ctx.getImageData(0, 0, W, H).data
  const on = standout("frame", "#000000", env)
  const step = Math.max(1, Math.round(Math.min(W, H) / 400))
  let x0 = W, y0 = H, x1 = -1, y1 = -1
  for (let y = 0; y < H; y += step) {
    for (let x = 0; x < W; x += step) {
      const i = (y * W + x) * 4
      if (on(d[i], d[i + 1], d[i + 2], d[i + 3]) < 0.12) continue
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  }
  if (x1 < 0) return null
  x0 = Math.max(0, x0 - step); y0 = Math.max(0, y0 - step)
  return { x: x0, y: y0, w: Math.min(W, x1 + step + 1) - x0, h: Math.min(H, y1 + step + 1) - y0 }
}

const showing = { slices: { not: 0 } }

export default {
  id: "slices",
  label: "Slices",
  group: "Distort",
  params: [
    { key: "slices", label: "Slices", type: "number", min: 0, max: 1, step: 0.01, default: 0, help: "From the untouched frame (0) to the full effect (1)." },
    { key: "slicePlay", when: showing, label: "Play", type: "int", min: 0, max: 4, step: 1, default: 1, animate: false, help: "Times per loop the picture comes apart and back together. 0 holds it at the Slices amount." },
    { key: "sliceArea", when: showing, label: "Cut", type: "select", default: "frame",
      options: [["frame", "The whole frame"], ["picture", "Just the picture"]], help: "Just the picture: the grid covers only what stands out from the ground, so a photo placed on a colour is cut and the colour stays around it." },
    { key: "sliceCols", when: showing, label: "Columns", type: "int", min: 1, max: 48, step: 1, default: 5, animate: false },
    { key: "sliceRows", when: showing, label: "Rows", type: "int", min: 1, max: 48, step: 1, default: 6, animate: false },
    { key: "sliceRepeat", when: showing, label: "Repeat", type: "number", min: 0, max: 1, step: 0.01, default: 0, help: "0: each slice shows its own piece. 1: each shows the whole picture, like a sheet of photo-booth prints." },
    { key: "sliceZoom", when: showing, label: "Magnify", type: "number", min: 0.5, max: 6, step: 0.05, default: 1.5, help: "How close each slice looks. Below 1 it shows more than its share." },
    { key: "sliceScatter", when: showing, label: "Scatter", type: "number", min: 0, max: 2, step: 0.01, default: 0, help: "How far each slice's piece is nudged from where it belongs, in slices." },
    { key: "sliceCentreScale", when: showing, label: "Centre slice scale", type: "number", min: 0.1, max: 3, step: 0.01, default: 1.4, help: "Size of the middle slices, about their own middles." },
    { key: "sliceOuterScale", when: showing, label: "Outer slice scale", type: "number", min: 0.1, max: 3, step: 0.01, default: 0.65, help: "Size of the slices at the edge." },
    { key: "sliceFalloff", when: showing, label: "Falloff curve", type: "number", min: 0.2, max: 4, step: 0.05, default: 1.6, help: "How quickly the size falls from the centre to the edge." },
    { key: "sliceSpread", when: showing, label: "Outward spread", type: "number", min: 0, max: 1, step: 0.01, default: 0.1, help: "Pushes slices away from the centre." },
    { key: "sliceTwist", when: showing, label: "Tilt", type: "number", min: -45, max: 45, step: 0.5, default: 0, unit: "°", help: "Turns the slices, more at the edge." },
    { key: "sliceTaper", when: showing, label: "Taper", type: "number", min: 0, max: 1, step: 0.01, default: 0.3, help: "Narrows each slice's outer edge, more at the edge of the frame, like seeing the grid in perspective." },
    { key: "sliceCentreX", when: showing, label: "Centre across", type: "number", min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: "sliceCentreY", when: showing, label: "Centre down", type: "number", min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: "sliceSwell", when: showing, label: "Swell", type: "number", min: 0, max: 6, step: 0.05, default: 0, help: "Widens the middle columns and rows of the grid itself." },
    { key: "sliceSwellAxis", when: showing, label: "Swell along", type: "select", default: "both",
      options: [["both", "Both ways"], ["across", "Across"], ["down", "Down"], ["off", "Off: equal slices"]] },
    { key: "sliceBars", when: showing, label: "Bars", type: "number", min: 0, max: 1, step: 0.01, default: 0, help: "Share of slices that show only the line through their middle, stretched into a bar." },
    { key: "sliceBarDir", when: showing, label: "Bars run", type: "select", default: "across",
      options: [["across", "Across"], ["down", "Down"]] },
    { key: "sliceWave", when: showing, label: "Zoom wave", type: "number", min: 0, max: 6, step: 0.05, default: 2, help: "Extra magnification where the wave passes: 2 is three times as close." },
    { key: "sliceWaveWidth", when: showing, label: "Wave width", type: "number", min: 0.05, max: 1, step: 0.01, default: 0.3 },
    { key: "sliceWaves", when: showing, label: "Wave cycles", type: "int", min: 0, max: 6, step: 1, default: 1, animate: false, help: "Times the wave passes per loop. 0 holds it halfway." },
    { key: "sliceWaveFrom", when: showing, label: "Wave runs", type: "select", default: "centre",
      options: [["centre", "Centre to edge"], ["edge", "Edge to centre"], ["across", "Left to right"], ["down", "Top to bottom"]] },
    { key: "sliceWaveBack", when: showing, label: "Wave back and forth", type: "bool", default: false },
    { key: "sliceGap", when: showing, label: "Gap", type: "number", min: 0, max: 40, step: 0.5, default: 3, unit: "px", help: "Space between slices, in the frame's background." },
  ],
  layerDefaults: { slices: 1 },
  active: (p) => p.slices > 0,
  apply(ctx, p, env) {
    const { width: W, height: H } = ctx.canvas
    const src = copy.canvas
    if (src.width !== W || src.height !== H) { src.width = W; src.height = H }
    copy.clearRect(0, 0, W, H)
    copy.drawImage(ctx.canvas, 0, 0)
    const area = p.sliceArea === "picture" ? pictureBounds(ctx, env) : null
    if (env.clear || !env.background) ctx.clearRect(0, 0, W, H)
    else { ctx.fillStyle = env.background; ctx.fillRect(0, 0, W, H) }
    const gap = (p.sliceGap * env.scale * sliceAmount(p, env.t)) / 2
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = "high"
    for (const s of sliceLayout(W, H, p, env, area)) drawSlice(ctx, src, s, gap, p)
  },
}
