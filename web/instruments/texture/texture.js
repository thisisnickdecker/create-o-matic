// Texture lab: the engine. Like every engine, a pure function of the patch and the time:
// render(ctx, patch, t) draws the source (an image or a video already at the right moment, passed
// in by the caller), framed by fit, zoom and pan, then runs the effect stack over it.
// With no source, it draws a test card (a small printed sunset) so every effect has something to bite.
import manifest from "./instrument.json" with { type: "json" }
import { formatSize } from "../../packages/core/formats.js"
import { resolve } from "../../packages/core/keys.js"
import { applyStack } from "../../packages/core/effects/index.js"

export { manifest }

const frac = (x) => x - Math.floor(x)
const even = (n) => Math.max(2, Math.round(n / 2) * 2)

export function size(patch) {
  const p = patch.params
  if (p.format === "source") return { w: even(p.sourceWidth), h: even(p.sourceHeight) }
  return formatSize(p)
}
export const frameCount = (patch) => Math.max(1, Math.round(patch.params.duration * Number(patch.params.fps)))

// Where in a video source frame t falls: it plays from the start of each loop at its own speed.
export const videoTime = (patch, t, videoDuration) => ((frac(t) * patch.params.duration * patch.params.videoSpeed) % videoDuration) || 0

// caption: false leaves the test card's "Drop an image" off, for showing the looks.
export function render(ctx, patch, t, { scale = 1, frame = 0, source = null, assets = null, caption = true } = {}) {
  const { w: W, h: H } = size(patch)
  t = frac(t)
  const p = resolve(manifest, patch, t)
  ctx.save()
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = "source-over"
  ctx.fillStyle = p.background
  ctx.fillRect(0, 0, W, H)
  if (source) drawSource(ctx, source, p, W, H)
  else testCard(ctx, W, H, caption)
  ctx.restore()
  applyStack(ctx, p.layers, { t, frame, scale, seed: patch.seed, background: p.background, assets })
}

// Fit the source to the frame, zoom about the centre, and pan across whatever overflows.
function drawSource(ctx, media, p, W, H) {
  const iw = media.videoWidth || media.naturalWidth || media.width, ih = media.videoHeight || media.naturalHeight || media.height
  if (!iw || !ih) return
  const k = (p.fit === "contain" ? Math.min : Math.max)(W / iw, H / ih) * p.zoom
  const dw = iw * k, dh = ih * k
  const x = (W - dw) / 2 - (p.panX * Math.max(0, dw - W)) / 2
  const y = (H - dh) / 2 - (p.panY * Math.max(0, dh - H)) / 2
  ctx.imageSmoothingQuality = "high"
  ctx.drawImage(media, x, y, dw, dh)
}

// A test card: a sunset over hills, with type. Full tonal range, a little colour, hard and soft edges.
function testCard(ctx, W, H, caption) {
  const sky = ctx.createLinearGradient(0, 0, 0, H)
  sky.addColorStop(0, "#1E2A4A"); sky.addColorStop(0.45, "#E2566B"); sky.addColorStop(0.7, "#F7A24A"); sky.addColorStop(1, "#F4E3C1")
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, W, H)
  const r = Math.min(W, H) * 0.2
  const sun = ctx.createRadialGradient(W * 0.62, H * 0.55, 0, W * 0.62, H * 0.55, r)
  sun.addColorStop(0, "#FFF6D8"); sun.addColorStop(1, "#FFC14D")
  ctx.fillStyle = sun
  ctx.beginPath(); ctx.arc(W * 0.62, H * 0.55, r, 0, Math.PI * 2); ctx.fill()
  const hill = (y0, amp, colour, phase) => {
    ctx.fillStyle = colour
    ctx.beginPath(); ctx.moveTo(0, H)
    for (let i = 0; i <= 60; i++) {
      const x = (i / 60) * W
      ctx.lineTo(x, H * y0 - Math.sin((x / W) * 5 + phase) * amp * H - Math.sin((x / W) * 13 + phase * 2) * amp * 0.3 * H)
    }
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill()
  }
  hill(0.68, 0.05, "#4B2A7B", 1)
  hill(0.78, 0.04, "#2B1D3A", 3)
  hill(0.9, 0.03, "#121211", 5)
  if (!caption) return
  ctx.fillStyle = "#FFFFFF"
  ctx.font = `500 ${Math.round(Math.min(W, H) * 0.075)}px "neue-haas-grotesk-display", "Helvetica Neue", sans-serif`
  ctx.textBaseline = "top"
  ctx.fillText("Drop an image or video", W * 0.06, H * 0.07)
}
