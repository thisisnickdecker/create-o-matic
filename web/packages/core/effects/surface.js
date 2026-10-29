// Surfaces: Paper and Grunge, made from seeded noise rather than scanned files, so they're
// original, endless, and identical every time for the same seed.
import { hash, hexRgb } from "./util.js"

// Smooth value noise at a given cell size (in canvas pixels), bilinear between seeded corners.
function noiseField(W, H, cell, seed, salt) {
  const gw = Math.ceil(W / cell) + 2, gh = Math.ceil(H / cell) + 2, g = new Float32Array(gw * gh)
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) g[j * gw + i] = hash(seed, i, j, salt)
  return (x, y) => {
    const fx = x / cell, fy = y / cell, ix = fx | 0, iy = fy | 0
    const tx = fx - ix, ty = fy - iy, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty)
    const a = g[iy * gw + ix], b = g[iy * gw + ix + 1], c = g[(iy + 1) * gw + ix], d = g[(iy + 1) * gw + ix + 1]
    return a + (b - a) * sx + (c + (d - c) * sx - a - (b - a) * sx) * sy
  }
}

const PAPERS = {
  paper: { tint: "#F6F2EA", fibre: 0.5, specks: 0.2 },
  kraft: { tint: "#C59B6A", fibre: 1, specks: 0.7 },
  newsprint: { tint: "#E4DFD2", fibre: 0.7, specks: 0.5 },
  card: { tint: "#EDE8DC", fibre: 0.35, specks: 0.15 },
  blotter: { tint: "#F1E6EC", fibre: 0.9, specks: 0.35 },
}

export const paper = {
  id: "paper",
  label: "Paper",
  group: "Print",
  params: [
    { key: "paper", label: "Paper", type: "number", min: 0, max: 1, step: 0.01, default: 0, help: "How strongly the image takes on the paper's colour and surface." },
    { key: "paperKind", label: "Stock", type: "select", default: "paper", when: { paper: { not: 0 } },
      options: [["paper", "Uncoated paper"], ["kraft", "Kraft"], ["newsprint", "Newsprint"], ["card", "Card"], ["blotter", "Blotting paper"]] },
  ],
  layerDefaults: { paper: 0.8 },
  active: (p) => p.paper > 0,
  apply(ctx, p, { scale, seed }) {
    const { width: W, height: H } = ctx.canvas
    const stock = PAPERS[p.paperKind] || PAPERS.paper, tint = hexRgb(stock.tint), k = p.paper
    const mottle = noiseField(W, H, 180 * scale, seed, 11), mottle2 = noiseField(W, H, 38 * scale, seed, 12)
    const img = ctx.getImageData(0, 0, W, H), d = img.data
    for (let y = 0; y < H; y++) {
      const oy = (y / scale) | 0
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4, ox = (x / scale) | 0
        // Fibres run mostly one way: noise stretched along x.
        const fibre = (hash(seed, ox >> 3, oy, 13) - 0.5) * 0.09 * stock.fibre + (hash(seed, ox, oy, 14) - 0.5) * 0.05
        const speck = hash(seed, ox, oy, 15)
        let surf = 1 + (mottle(x, y) - 0.5) * 0.1 + (mottle2(x, y) - 0.5) * 0.05 + fibre
        if (speck < 0.0025 * stock.specks) surf -= 0.35
        for (let c = 0; c < 3; c++) {
          const printed = d[i + c] * (tint[c] / 255) * surf
          d[i + c] += (printed - d[i + c]) * k
        }
      }
    }
    ctx.putImageData(img, 0, 0)
  },
}

export const grunge = {
  id: "grunge",
  label: "Grunge",
  group: "Texture",
  params: [
    { key: "grunge", label: "Grunge", type: "number", min: 0, max: 1, step: 0.01, default: 0, help: "Dust, scratches, stains and burnt edges." },
    { key: "grungeDust", label: "Dust", type: "number", min: 0, max: 1, step: 0.01, default: 0.6, when: { grunge: { not: 0 } } },
    { key: "grungeScratches", label: "Scratches", type: "number", min: 0, max: 1, step: 0.01, default: 0.5, when: { grunge: { not: 0 } } },
    { key: "grungeStains", label: "Stains", type: "number", min: 0, max: 1, step: 0.01, default: 0.5, when: { grunge: { not: 0 } } },
    { key: "grungeBoil", label: "Boil", type: "bool", default: false, when: { grunge: { not: 0 } }, help: "New dust and scratches every frame, like a film print. Off: they stay put." },
  ],
  layerDefaults: { grunge: 0.7 },
  active: (p) => p.grunge > 0,
  apply(ctx, p, { scale, seed, frame }) {
    const { width: W, height: H } = ctx.canvas
    const k = p.grunge, f = p.grungeBoil ? frame + 1 : 0
    // Stains and burnt edges: low-frequency blotches, darker towards the corners.
    if (p.grungeStains > 0) {
      const stain = noiseField(W, H, 260 * scale, seed, 21), stain2 = noiseField(W, H, 70 * scale, seed, 22)
      const img = ctx.getImageData(0, 0, W, H), d = img.data, cx = W / 2, cy = H / 2, R = Math.hypot(cx, cy)
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4
        const edge = Math.max(0, Math.hypot(x - cx, y - cy) / R - 0.55) / 0.45
        const blot = Math.max(0, stain(x, y) * 0.7 + stain2(x, y) * 0.3 - 0.52) * 2.2
        const burn = 1 - (blot * 0.35 + edge * edge * 0.55) * p.grungeStains * k
        d[i] *= burn; d[i + 1] *= burn * 0.97; d[i + 2] *= burn * 0.9
      }
      ctx.putImageData(img, 0, 0)
    }
    ctx.save()
    // Dust: specks, light and dark, a few larger flecks.
    const dust = Math.round((W * H) / (900 * scale * scale) * p.grungeDust * k)
    for (let n = 0; n < dust; n++) {
      const x = hash(seed, n, 31, f) * W, y = hash(seed, n, 32, f) * H, r = (0.4 + hash(seed, n, 33, f) ** 6 * 4) * scale
      ctx.fillStyle = hash(seed, n, 34, f) < 0.6 ? `rgba(20, 18, 16, ${0.5 * k})` : `rgba(255, 252, 245, ${0.6 * k})`
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
    }
    // Scratches: long, faint, nearly vertical hairlines.
    const lines = Math.round(18 * p.grungeScratches * k)
    ctx.lineCap = "round"
    for (let n = 0; n < lines; n++) {
      const x = hash(seed, n, 41, f) * W, y = hash(seed, n, 42, f) * H, len = (0.15 + hash(seed, n, 43, f) * 0.6) * H
      const lean = (hash(seed, n, 44, f) - 0.5) * 0.12
      ctx.strokeStyle = hash(seed, n, 45, f) < 0.5 ? `rgba(255, 255, 250, ${0.35 * k})` : `rgba(15, 14, 12, ${0.3 * k})`
      ctx.lineWidth = Math.max(0.5, (0.4 + hash(seed, n, 46, f)) * scale)
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + lean * len, y + len); ctx.stroke()
    }
    ctx.restore()
  },
}

