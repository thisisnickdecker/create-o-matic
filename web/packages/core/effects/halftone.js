// Halftone: the frame re-drawn as a screen of dots (or lines, or squares) on the paper colour.
// Each dot takes the ink under it and grows with how much ink there is. Drawn as vector shapes,
// so dots stay crisp at any size.
import { hexRgb } from "./util.js"

export default {
  id: "halftone",
  label: "Halftone",
  params: [
    { key: "halftone", label: "Halftone", type: "number", min: 0, max: 80, step: 0.5, default: 0, unit: "px", help: "Screen size. 0 is off." },
    { key: "halftoneAngle", when: { halftone: { not: 0 } }, label: "Screen angle", type: "number", min: 0, max: 90, step: 0.5, default: 45, unit: "°" },
    { key: "halftoneShape", when: { halftone: { not: 0 } }, label: "Dot", type: "select", default: "round", options: [["round", "Round"], ["square", "Square"], ["line", "Line"]] },
    { key: "halftoneGain", when: { halftone: { not: 0 } }, label: "Dot gain", type: "number", min: 0.5, max: 1.6, step: 0.01, default: 1, help: "Above 1, dots spread and touch, like ink on soft paper." },
  ],
  active: (p) => p.halftone >= 1,
  apply(ctx, p, { scale, background }) {
    const { width: W, height: H } = ctx.canvas
    const { data } = ctx.getImageData(0, 0, W, H)
    const [br, bg, bb] = hexRgb(background)
    const cell = p.halftone * scale
    const a = (p.halftoneAngle * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a)
    const reach = Math.hypot(W, H) / 2, cx = W / 2, cy = H / 2
    const n = Math.ceil(reach / cell)
    const paths = new Map()

    for (let j = -n; j <= n; j++) {
      for (let i = -n; i <= n; i++) {
        const u = i * cell, v = j * cell
        const x = cx + u * ca - v * sa, y = cy + u * sa + v * ca
        if (x < -cell || y < -cell || x > W + cell || y > H + cell) continue
        // Five samples under the dot, its centre and four points around it: their mean coverage
        // sizes the dot, and the most inked of them gives its colour, so solids keep the exact ink.
        let m = 0, best = -1, bq = 0
        for (const [ox, oy] of [[0, 0], [-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]]) {
          const sx = Math.min(W - 1, Math.max(0, (x + ox * cell) | 0)), sy = Math.min(H - 1, Math.max(0, (y + oy * cell) | 0))
          const q = (sy * W + sx) * 4
          const dr = data[q] - br, dg = data[q + 1] - bg, db = data[q + 2] - bb
          const c = Math.min(1, Math.sqrt(dr * dr + dg * dg + db * db) / 160)
          m += c
          if (c > best) { best = c; bq = q }
        }
        const cov = m / 5
        if (cov < 0.02) continue
        // A half-inked sample is ink blended with paper: take the paper back out.
        const k = 1 / Math.max(best, 0.35)
        const ink = (i, bgc) => Math.min(255, Math.max(0, Math.round((bgc + (data[bq + i] - bgc) * k) / 4) * 4))
        const key = `rgb(${ink(0, br)},${ink(1, bg)},${ink(2, bb)})`
        let path = paths.get(key)
        if (!path) paths.set(key, (path = new Path2D()))
        const size = Math.min(cell * 0.75, Math.sqrt(cov) * cell * 0.62 * p.halftoneGain)
        if (p.halftoneShape === "round") { path.moveTo(x + size, y); path.arc(x, y, size, 0, Math.PI * 2) }
        else if (p.halftoneShape === "square") {
          const s = size * 0.89
          path.moveTo(x + (-s) * ca - (-s) * sa, y + (-s) * sa + (-s) * ca)
          for (const [px, py] of [[s, -s], [s, s], [-s, s]]) path.lineTo(x + px * ca - py * sa, y + px * sa + py * ca)
          path.closePath()
        } else {
          const h = Math.min(cell / 2, cov * cell * 0.5 * p.halftoneGain), l = cell / 2 + 0.5
          path.moveTo(x - l * ca + h * sa, y - l * sa - h * ca)
          path.lineTo(x + l * ca + h * sa, y + l * sa - h * ca)
          path.lineTo(x + l * ca - h * sa, y + l * sa + h * ca)
          path.lineTo(x - l * ca - h * sa, y - l * sa + h * ca)
          path.closePath()
        }
      }
    }
    ctx.fillStyle = background
    ctx.fillRect(0, 0, W, H)
    for (const [colour, path] of paths) { ctx.fillStyle = colour; ctx.fill(path) }
  },
}
