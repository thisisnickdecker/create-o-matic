// Photocopy: generation loss. Copies of copies go soft, then toner thresholds the softened image
// unevenly: density drifts across the page, the drum leaves streaks, the paper picks up speckle and
// the solids drop out. Noise is addressed in output pixels so preview and export match.
import { hash, hexRgb } from "./util.js"

// The scratch canvas is pinned to the CPU. Left to itself Chrome starts it on the GPU and moves it
// after the first read-back, and the two resample differently: the first frame would not match.
const tmp = typeof document !== "undefined" ? document.createElement("canvas") : null
const tctx = tmp?.getContext("2d", { willReadFrequently: true })

const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v)
const smooth = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t) }

export default {
  id: "photocopy",
  label: "Photocopy",
  params: [
    { key: "copier", label: "Photocopy", type: "number", min: 0, max: 1, step: 0.01, default: 0, help: "Generation loss: soft edges, toner thresholding, speckle and drop-out." },
    { key: "boil", label: "Boil", type: "bool", default: true, help: "Texture changes every frame, like film. Off: it's fixed to the paper." },
  ],
  active: (p) => p.copier > 0,
  apply(ctx, p, { scale, seed, frame, background }) {
    const copier = p.copier
    const { width: W, height: H } = ctx.canvas
    const f = p.boil ? frame + 1 : 0

    const k = 1 / (1 + copier * 3.5 / Math.max(scale, 0.25))
    const sw = Math.max(1, Math.round(W * k)), sh = Math.max(1, Math.round(H * k))
    tmp.width = sw; tmp.height = sh
    tctx.imageSmoothingQuality = "high"
    tctx.drawImage(ctx.canvas, 0, 0, sw, sh)
    ctx.imageSmoothingQuality = "high"
    ctx.drawImage(tmp, 0, 0, W, H)

    const img = ctx.getImageData(0, 0, W, H)
    const px = img.data
    const [br, bg, bb] = hexRgb(background)

    // Low-frequency toner density, ~140 output px across, bilinear between seeded corners.
    const cell = 140 * scale
    const gw = Math.ceil(W / cell) + 2, gh = Math.ceil(H / cell) + 2
    const dens = new Float32Array(gw * gh)
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) dens[j * gw + i] = hash(seed, i, j, f * 7 + 3)
    // Vertical streaking from the drum: one value per column of output pixels.
    const bands = new Float32Array(W)
    for (let x = 0; x < W; x++) bands[x] = hash(seed, ((x / scale) | 0) >> 3, 0, f) - 0.5

    const edge = 0.5 - copier * 0.46 // toner edge softness: wide at 0, nearly binary at 1
    for (let y = 0; y < H; y++) {
      const oy = (y / scale) | 0
      const fy = y / cell, jy = fy | 0, ty = fy - jy
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4
        const ox = (x / scale) | 0
        const dr = px[i] - br, dg = px[i + 1] - bg, db = px[i + 2] - bb
        const m = Math.min(1, Math.sqrt(dr * dr + dg * dg + db * db) / 160)
        const fx = x / cell, ix = fx | 0, tx = fx - ix
        const a = dens[jy * gw + ix], c = dens[jy * gw + ix + 1], d = dens[(jy + 1) * gw + ix], e = dens[(jy + 1) * gw + ix + 1]
        const top = a + (c - a) * tx
        const low = top + (d + (e - d) * tx - top) * ty
        const n = hash(seed, ox, oy, f)
        const thr = 0.5 + (n - 0.5) * copier * 0.55 + (low - 0.5) * copier * 0.45 + bands[x] * copier * 0.12
        let cov = smooth(thr - edge, thr + edge, m)
        const s = hash(seed ^ 0x5bd1, ox, oy, f)
        if (s < copier * copier * 0.006) cov = 1
        else if (m > 0.6 && s > 1 - copier * 0.03) cov = 0
        // Recover the ink colour from the softened pixel, darken it a touch, lay it back down.
        const inv = 1 / Math.max(m, 0.12), dark = 1 - copier * 0.12
        const ir = clamp((br + dr * inv) * dark), ig = clamp((bg + dg * inv) * dark), ib = clamp((bb + db * inv) * dark)
        const pr = br * (1 - copier * 0.05), pg = bg * (1 - copier * 0.05), pb = bb * (1 - copier * 0.07)
        px[i] = pr + (ir - pr) * cov; px[i + 1] = pg + (ig - pg) * cov; px[i + 2] = pb + (ib - pb) * cov
      }
    }
    ctx.putImageData(img, 0, 0)
  },
}
