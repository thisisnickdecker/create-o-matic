// Grain: monochrome film grain, one value per output pixel, new every frame unless it's told not to boil.
import { hash } from "./util.js"

export default {
  id: "grain",
  label: "Grain",
  params: [
    { key: "grain", label: "Grain", type: "number", min: 0, max: 1, step: 0.01, default: 0 },
    { key: "grainBoil", label: "Grain boils", type: "bool", default: true, when: { grain: { not: 0 } }, help: "New grain every frame, like film. Off: it's fixed to the paper." },
  ],
  active: (p) => p.grain > 0,
  apply(ctx, p, { scale, seed, frame }) {
    const { width: W, height: H } = ctx.canvas
    const f = p.grainBoil === false ? 0 : frame + 1
    const img = ctx.getImageData(0, 0, W, H)
    const px = img.data
    const g = p.grain * 52
    for (let y = 0; y < H; y++) {
      const oy = (y / scale) | 0
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4
        const n = (hash(seed + 17, (x / scale) | 0, oy, f) - 0.5) * g
        px[i] += n; px[i + 1] += n; px[i + 2] += n
      }
    }
    ctx.putImageData(img, 0, 0)
  },
}
