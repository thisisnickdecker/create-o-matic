// Liquid: the frame seen through moving water. A smooth displacement field, warped twice, that
// flows a whole number of times around the loop.
import { remap, hash, TAU } from "./util.js"

export default {
  id: "liquid",
  label: "Liquid",
  params: [
    { key: "liquid", label: "Liquid", type: "number", min: 0, max: 1, step: 0.01, default: 0, help: "How far the surface pushes things around." },
    { key: "liquidScale", when: { liquid: { not: 0 } }, label: "Liquid scale", type: "number", min: 40, max: 1200, step: 5, default: 360, unit: "px", help: "Size of the ripples." },
    { key: "liquidFlow", when: { liquid: { not: 0 } }, label: "Liquid flow", type: "int", min: 0, max: 6, step: 1, default: 1, help: "Times the water cycles per loop." },
  ],
  active: (p) => p.liquid > 0,
  apply(ctx, p, { t, scale, seed }) {
    const A = p.liquid * 90 * scale
    const f = 1 / (p.liquidScale * scale)
    const c = TAU * p.liquidFlow * t
    const ph = [0, 1, 2, 3, 4, 5].map((i) => TAU * hash(seed, 41, i))
    const field = (x, y, k) =>
      Math.sin(TAU * (y * f) + c + ph[k]) * 0.6 + Math.sin(TAU * (x * f * 0.7 - y * f * 0.45) - c + ph[k + 2]) * 0.4
    remap(ctx, (x, y, out) => {
      // Domain warp: displace, then displace again from where the first step landed.
      const x1 = x + A * 0.6 * field(x, y, 0), y1 = y + A * 0.6 * field(y, x, 1)
      out[0] = x + A * field(x1, y1, 2)
      out[1] = y + A * field(y1, x1, 3)
    })
  },
}
