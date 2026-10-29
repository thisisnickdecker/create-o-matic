// Melt: the frame slumps downwards in drips. Each column hangs from the top and stretches by a
// seeded, smoothly varying amount; the drips grow and recede with the loop.
import { remap, hash, TAU } from "./util.js"

export default {
  id: "melt",
  label: "Melt",
  params: [
    { key: "melt", label: "Melt", type: "number", min: 0, max: 1, step: 0.01, default: 0, help: "How far things drip, as a share of the frame height." },
    { key: "meltDrips", when: { melt: { not: 0 } }, label: "Drip width", type: "number", min: 8, max: 400, step: 1, default: 60, unit: "px" },
    { key: "meltCycles", when: { melt: { not: 0 } }, label: "Drip cycles", type: "int", min: 0, max: 4, step: 1, default: 1, help: "Times the drips grow and recede per loop. 0 holds them still." },
  ],
  active: (p) => p.melt > 0,
  apply(ctx, p, { t, scale, seed }) {
    const { width: W, height: H } = ctx.canvas
    const width = p.meltDrips * scale
    const n = Math.ceil(W / width) + 2
    // Two octaves of drips: broad slumps and narrow runs, each with its own timing.
    const broad = [], narrow = [], phase = []
    for (let i = 0; i < n; i++) {
      broad.push(hash(seed, 77, i >> 2)); narrow.push(hash(seed, 78, i) ** 2.5); phase.push(hash(seed, 79, i))
    }
    const len = new Float32Array(W)
    for (let x = 0; x < W; x++) {
      const u = x / width, i = u | 0, f = u - i, s = f * f * (3 - 2 * f)
      const at = (k) => {
        const swell = p.meltCycles ? 0.5 - 0.5 * Math.cos(TAU * (p.meltCycles * t + phase[k])) : 1
        return (0.35 * broad[k] + 0.65 * narrow[k]) * swell
      }
      len[x] = (at(i) * (1 - s) + at(i + 1) * s) * p.melt * H
    }
    remap(ctx, (x, y, out) => {
      // Stretch increases down the frame: the top holds, the bottom runs.
      const k = Math.min(1, y / H)
      out[0] = x
      out[1] = y - len[x | 0] * Math.sqrt(k)
    })
  },
}
