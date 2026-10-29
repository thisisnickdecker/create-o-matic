// Gradients: the gradient maker behind the motion machine, and the same painter as a layer in
// any effect stack. paintGradient draws in whatever space ctx is in, over a W × H frame.
import { hash, TAU } from "./util.js"

const frac = (x) => x - Math.floor(x)

// The gradient maker. Mesh: a soft blob of each ink drifting on its own whole-number orbit, so the
// colour field swirls and comes back round. Linear and radial: bands of the inks, turning or
// travelling a whole number of times per loop. The inks repeat round, so there's never a seam.
export function paintGradient(ctx, p, seed, t, W, H) {
  const inks = p.gradientInks, n = inks.length
  const turn = TAU * p.gradientDrift * t
  if (p.gradient === "mesh") {
    ctx.fillStyle = inks[0]
    ctx.fillRect(0, 0, W, H)
    const R = Math.max(W, H) * (0.35 + 0.55 * p.gradientSoftness)
    inks.forEach((ink, i) => {
      const fx = 1 + Math.floor(hash(seed, i, 31) * 2), fy = 1 + Math.floor(hash(seed, i, 32) * 2)
      const x = W * (0.5 + 0.42 * Math.sin(fx * turn + TAU * hash(seed, i, 33)))
      const y = H * (0.5 + 0.42 * Math.cos(fy * turn + TAU * hash(seed, i, 34)))
      const g = ctx.createRadialGradient(x, y, 0, x, y, R)
      g.addColorStop(0, ink)
      g.addColorStop(1, ink + "00")
      ctx.fillStyle = g
      ctx.fillRect(0, 0, W, H)
    })
    return
  }
  let g
  if (p.gradient === "radial") {
    const R = Math.hypot(W, H) / 2
    g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, R)
  } else {
    const a = (p.gradientAngle * Math.PI) / 180 + turn
    const L = (Math.abs(W * Math.cos(a)) + Math.abs(H * Math.sin(a))) / 2
    g = ctx.createLinearGradient(W / 2 - Math.cos(a) * L, H / 2 - Math.sin(a) * L, W / 2 + Math.cos(a) * L, H / 2 + Math.sin(a) * L)
  }
  // Radial bands travel outwards: every stop shifts by the loop and wraps round, and the colour where
  // they wrap is blended from its neighbours so there's no seam.
  const shift = p.gradient === "radial" ? frac(p.gradientDrift * t) : 0
  const ring = inks.map((c, i) => [frac(i / n + shift), c]).sort((x, y) => x[0] - y[0])
  const [q, cq] = ring[ring.length - 1], [r, cr] = ring[0]
  const edge = mixHex(cq, cr, (1 - q) / (1 - q + r || 1))
  g.addColorStop(0, edge)
  for (const [o, c] of ring) g.addColorStop(o, c)
  g.addColorStop(1, edge)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
}

const mixHex = (x, y, f) => "#" + [1, 3, 5].map((i) => {
  const a = parseInt(x.slice(i, i + 2), 16), b = parseInt(y.slice(i, i + 2), 16)
  return Math.round(a + (b - a) * f).toString(16).padStart(2, "0")
}).join("")

// As a layer: paints a fresh gradient, which the stack then blends over the image.
export default {
  id: "gradient",
  label: "Gradient",
  group: "Paint",
  fresh: true,
  params: [
    { key: "gradient", label: "Gradient", type: "select", default: "off", options: [["off", "None"], ["mesh", "Mesh"], ["linear", "Linear"], ["radial", "Radial"]] },
    { key: "gradientInks", label: "Gradient inks", type: "palette", default: ["#FF2E88", "#7A00FF", "#00B3FF", "#FF7A00"], when: { gradient: { not: "off" } } },
    { key: "gradientDrift", label: "Drift", type: "int", min: 0, max: 6, step: 1, default: 1, when: { gradient: { not: "off" } }, help: "Times the gradient swirls or turns per loop. 0 holds it still." },
    { key: "gradientAngle", label: "Angle", type: "number", min: 0, max: 360, step: 1, default: 30, unit: "°", when: { gradient: "linear" } },
    { key: "gradientSoftness", label: "Softness", type: "number", min: 0, max: 1, step: 0.01, default: 0.6, when: { gradient: "mesh" } },
  ],
  layerDefaults: { gradient: "mesh" },
  active: (p) => p.gradient !== "off",
  apply(ctx, p, { t, seed }) {
    paintGradient(ctx, p, seed, t, ctx.canvas.width, ctx.canvas.height)
  },
}
