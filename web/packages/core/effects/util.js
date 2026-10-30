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
      for (let k = 0; k < 4; k++) {
        const top = s[a + k] + (s[b + k] - s[a + k]) * fx
        const bot = s[c + k] + (s[e + k] - s[c + k]) * fx
        d[o + k] = top + (bot - top) * fy
      }
    }
  }
  ctx.putImageData(dst, 0, 0)
}

const lum = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255

// The ground under an effect that redraws the frame from scratch (ASCII, Dot matrix): "frame" is
// the frame's own background (nothing, on a see-through frame), "own" a colour of the effect's, and
// "clear" nothing at all. Returns the colour to paint, or null.
export const GROUNDS = [["frame", "The background"], ["own", "A colour of its own"], ["clear", "Nothing: see-through"]]
export const groundOf = (back, own, env) => back === "own" ? own : back === "frame" && !env.clear && env.background ? env.background : null

// How far a pixel stands out from empty, 0 to 1, as f(r, g, b, a). On a colour of its own, by
// brightness against it (bright on dark, dark on light), which suits photographs; otherwise by
// distance from the frame's background, so any ink on any ground reads; on a see-through frame,
// by how much is there.
export function standout(back, own, env) {
  if (back === "own") {
    const dark = lum(...hexRgb(own)) < 0.5
    return (r, g, b, a) => (dark ? lum(r, g, b) : 1 - lum(r, g, b)) * (a / 255)
  }
  if (env.clear || !env.background) return (r, g, b, a) => a / 255
  const [R, G, B] = hexRgb(env.background)
  return (r, g, b, a) => Math.min(1, (2.2 * Math.sqrt(0.3 * (r - R) ** 2 + 0.59 * (g - G) ** 2 + 0.11 * (b - B) ** 2)) / 255) * (a / 255)
}
