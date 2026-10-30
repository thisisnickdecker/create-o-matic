// Stop motion: the engine. Your frames, played in order (or there and back) at their own rate,
// each held for one, two or three beats, laid on a paper: a colour, a texture or your own scan,
// with a blend mode so white paper in a photo drops away. Boil shakes each drawing a little, as
// hand-registered work does; it's seeded by the drawing, so a loop always shakes the same way.
//
//   render(ctx, patch, t, { scale, frames, texture })   frames: [{ el, w, h }]; texture: { el, w, h }
//   order(patch, n)       the drawings in playing order, one entry a beat
//   loopSeconds(patch, n) how long the loop lasts
import { readJson } from "../../packages/core/read-json.js"
import { formatSize } from "../../packages/core/formats.js"
import { resolve } from "../../packages/core/keys.js"
import { hash } from "../../packages/core/rng.js"

export const manifest = await readJson(new URL("./instrument.json", import.meta.url))

const TAU = Math.PI * 2
const frac = (x) => x - Math.floor(x)

export const size = (patch) => formatSize(patch.params)
export const frameCount = (patch) => Math.max(1, Math.round(patch.params.duration * Number(patch.params.fps)))

// The drawings in playing order: forward, or forward then back without repeating the ends.
export function order(patch, n) {
  const seq = Array.from({ length: Math.max(1, n) }, (_, i) => i)
  if (patch.params.play === "pingpong" && n > 2) for (let i = n - 2; i > 0; i--) seq.push(i)
  return seq
}
export const loopSeconds = (patch, n) => (order(patch, n).length * Number(patch.params.hold)) / Number(patch.params.rate)

// How many drawings a loop of a given length takes, at a rate and hold, either way of playing.
export function plan(seconds, rate, hold, play) {
  const beats = Math.max(1, Math.round((seconds * rate) / hold))
  const drawings = play === "pingpong" ? Math.max(2, Math.ceil(beats / 2) + 1) : beats
  return { beats, drawings, actual: (beats * hold) / rate }
}

// ---- paper ----
let grainCache = null
function grainTile() {
  if (grainCache) return grainCache
  const n = 256, c = Object.assign(document.createElement("canvas"), { width: n, height: n }), x = c.getContext("2d")
  const img = x.createImageData(n, n)
  for (let i = 0; i < n * n; i++) { const v = Math.round(hash(i, 11) * 255); img.data.set([v, v, v, 255], i * 4) }
  x.putImageData(img, 0, 0)
  return (grainCache = c)
}
function paper(g, p, W, H, u, texture) {
  if (p.texture === "none" || p.textureAmount <= 0) return
  g.save()
  if (p.texture === "image") {
    if (!texture) { g.restore(); return }
    const k = Math.max(W / texture.w, H / texture.h)
    g.globalCompositeOperation = p.textureBlend === "normal" ? "source-over" : p.textureBlend
    g.globalAlpha = p.textureAmount
    g.drawImage(texture.el, (W - texture.w * k) / 2, (H - texture.h * k) / 2, texture.w * k, texture.h * k)
  } else if (p.texture === "riso") {
    const step = 8 * u
    g.globalAlpha = 0.16 * p.textureAmount
    g.fillStyle = "#000"
    for (let y = 0; y < H + step; y += step) for (let x = (y / step) % 2 ? step / 2 : 0; x < W + step; x += step) { g.beginPath(); g.arc(x, y, step * 0.2, 0, TAU); g.fill() }
  } else {
    const pat = g.createPattern(grainTile(), "repeat"), k = p.texture === "paper" ? 3 * u : 1.2 * u
    pat.setTransform(new DOMMatrix().scale(k, k))
    g.globalCompositeOperation = "soft-light"
    g.globalAlpha = (p.texture === "paper" ? 0.6 : 0.4) * p.textureAmount
    g.fillStyle = pat
    g.fillRect(0, 0, W, H)
  }
  g.restore()
}

// A frame printed in one ink: its darks become the ink, its whites stay white.
let inkCanvas = null
function inked(f, ink) {
  inkCanvas ??= document.createElement("canvas")
  const c = inkCanvas
  c.width = f.w; c.height = f.h
  const x = c.getContext("2d")
  x.filter = "grayscale(1)"
  x.drawImage(f.el, 0, 0)
  x.filter = "none"
  x.globalCompositeOperation = "lighten"
  x.fillStyle = ink
  x.fillRect(0, 0, f.w, f.h)
  x.globalCompositeOperation = "destination-in"
  x.drawImage(f.el, 0, 0)
  return c
}

export function render(ctx, patch, t, { scale = 1, frames = [], texture = null } = {}) {
  const { w: W, h: H } = size(patch)
  t = frac(t)
  const p = resolve(manifest, patch, t)
  const u = Math.min(W, H) / 1080
  ctx.save()
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  if (p.transparent) ctx.clearRect(0, 0, W, H)
  else { ctx.fillStyle = p.background; ctx.fillRect(0, 0, W, H) }
  if (p.texture === "image") paper(ctx, p, W, H, u, texture)
  if (frames.length) {
    const seq = order(patch, frames.length), k = seq[Math.min(seq.length - 1, Math.floor(t * seq.length))]
    const f = frames[k]
    const fit = p.fit === "cover" ? Math.max(W / f.w, H / f.h) : Math.min(W / f.w, H / f.h)
    const s = fit * p.scale, dw = f.w * s, dh = f.h * s
    // Boil: each drawing its own small shift and turn.
    const jx = (hash(patch.seed, k, 1) - 0.5) * 2 * p.boil * 14 * u, jy = (hash(patch.seed, k, 2) - 0.5) * 2 * p.boil * 14 * u
    const jr = (hash(patch.seed, k, 3) - 0.5) * 2 * p.boil * 0.02
    ctx.translate(W / 2 + jx, H / 2 + jy)
    ctx.rotate(jr)
    ctx.globalCompositeOperation = p.blend === "normal" ? "source-over" : p.blend
    ctx.drawImage(p.tint ? inked(f, p.ink) : f.el, -dw / 2, -dh / 2, dw, dh)
    ctx.setTransform(scale, 0, 0, scale, 0, 0)
    ctx.globalCompositeOperation = "source-over"
  }
  if (p.texture !== "image") paper(ctx, p, W, H, u, texture)
  ctx.restore()
}
