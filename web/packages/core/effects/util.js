// Shared by the effects: colour parsing and resampling a frame through a coordinate map.
export { hash } from "../rng.js"

export const TAU = Math.PI * 2
export const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))

// Redraws the frame by asking, for every destination pixel, where in the source to read from.
// map(x, y, out) writes the source position into out[0], out[1]. Bilinear, edges clamped.
export function remap(ctx, map) {
  const { width: W, height: H } = ctx.canvas
  const src = ctx.getImageData(0, 0, W, H)
  const s = src.data
  const dst = ctx.createImageData(W, H)
  const d = dst.data
  const at = [0, 0]
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      map(x + 0.5, y + 0.5, at)
      let sx = at[0] - 0.5, sy = at[1] - 0.5
      if (sx < 0) sx = 0; else if (sx > W - 1) sx = W - 1
      if (sy < 0) sy = 0; else if (sy > H - 1) sy = H - 1
      const x0 = sx | 0, y0 = sy | 0, x1 = x0 + 1 < W ? x0 + 1 : x0, y1 = y0 + 1 < H ? y0 + 1 : y0
      const fx = sx - x0, fy = sy - y0
      const a = (y0 * W + x0) * 4, b = (y0 * W + x1) * 4, c = (y1 * W + x0) * 4, e = (y1 * W + x1) * 4
      const o = (y * W + x) * 4
      for (let k = 0; k < 3; k++) {
        const top = s[a + k] + (s[b + k] - s[a + k]) * fx
        const bot = s[c + k] + (s[e + k] - s[c + k]) * fx
        d[o + k] = top + (bot - top) * fy
      }
      d[o + 3] = 255
    }
  }
  ctx.putImageData(dst, 0, 0)
}
