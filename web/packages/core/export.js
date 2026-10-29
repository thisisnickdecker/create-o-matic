// Exports. Video is rendered offline, frame by frame, at full size: nothing is screen-recorded,
// so a slow machine makes a slower export, never a stuttering one. Every exporter takes a
// draw(ctx, frameIndex) callback and knows nothing about the instrument.
//
//   png   one frame
//   mp4   H.264 via WebCodecs + mp4-muxer   (Chrome, Edge, Safari 17+; not every Linux build)
//   webm  VP9 via WebCodecs + webm-muxer    (Chrome, Edge, Firefox 130+)
//   gif   gifenc, one 256-colour palette for the whole loop; best at reduced size

export async function exportPng({ w, h, draw }) {
  const { canvas, ctx } = surface(w, h)
  await draw(ctx, 0)
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"))
}

const CODECS = {
  mp4: { muxer: "./vendor/mp4-muxer.mjs", track: "avc", try: ["avc1.640033", "avc1.640034", "avc1.4d0033", "avc1.42003e"], type: "video/mp4" },
  webm: { muxer: "./vendor/webm-muxer.mjs", track: "V_VP9", try: ["vp09.00.40.08", "vp09.00.50.08", "vp8"], type: "video/webm" },
}

export async function videoSupport(kind, w = 1920, h = 1080, fps = 30) {
  if (typeof VideoEncoder === "undefined") return null
  const c = CODECS[kind]
  for (const codec of c.try) {
    try {
      const { supported } = await VideoEncoder.isConfigSupported({ codec, width: w, height: h, bitrate: 8e6, framerate: fps })
      if (supported) return codec
    } catch {}
  }
  return null
}

export async function exportVideo({ kind, w, h, fps, frames, draw, bitrate, onProgress, signal }) {
  const spec = CODECS[kind]
  const codec = await videoSupport(kind, w, h, fps)
  if (!codec) throw new Error(`This browser can't encode ${kind.toUpperCase()} at ${w}×${h}.`)
  const { Muxer, ArrayBufferTarget } = await import(spec.muxer)
  const track = kind === "webm" && codec === "vp8" ? "V_VP8" : spec.track
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: track, width: w, height: h, frameRate: fps },
    ...(kind === "mp4" ? { fastStart: "in-memory" } : {}),
  })
  let failure = null
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => { failure = e },
  })
  // Flat colour type compresses well, but a stretching frame changes everywhere at once: be generous.
  bitrate ??= Math.round(Math.min(40e6, w * h * fps * 0.28))
  encoder.configure({ codec, width: w, height: h, bitrate, framerate: fps, latencyMode: "quality",
    ...(kind === "mp4" ? { avc: { format: "avc" } } : {}) })

  const { canvas, ctx } = surface(w, h)
  const us = 1e6 / fps
  for (let i = 0; i < frames; i++) {
    if (signal?.aborted) { encoder.close(); throw new DOMException("Export cancelled", "AbortError") }
    if (failure) throw failure
    await draw(ctx, i)
    const frame = new VideoFrame(canvas, { timestamp: Math.round(i * us), duration: Math.round(us) })
    encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 })
    frame.close()
    // Let the encoder drain so memory stays flat on long or large exports.
    while (encoder.encodeQueueSize > 4) await breathe()
    onProgress?.((i + 1) / frames)
    if (i % 4 === 3) await breathe()
  }
  await encoder.flush()
  if (failure) throw failure
  muxer.finalize()
  return new Blob([muxer.target.buffer], { type: spec.type })
}

// GIF delays are in hundredths of a second, which 1/30 s isn't: each frame takes its share of the
// running total, so 30 fps comes out as 3, 3, 4… and the loop lasts exactly as long as it should.
export const gifDelays = (frames, fps) => Array.from({ length: frames }, (_, i) => Math.round(((i + 1) * 100) / fps) - Math.round((i * 100) / fps))

// GIF: one palette for the whole loop, so a flat colour can't shift shade from frame to frame (a
// palette per frame made backgrounds flicker). It's built from eight frames across the loop, and
// the commonest colours in them (backgrounds, main inks) are kept exactly.
export async function exportGif({ w, h, fps, frames, draw, onProgress, signal }) {
  const { GIFEncoder, quantize } = await import("./vendor/gifenc.esm.js")
  const gif = GIFEncoder()
  const { ctx } = surface(w, h)
  const samples = [...new Set(Array.from({ length: Math.min(8, frames) }, (_, k) => Math.floor((k * frames) / Math.min(8, frames))))]
  const stride = Math.max(1, Math.round((w * h * samples.length) / 400000)) // about 400,000 pixels to learn from
  const pool = [], counts = new Map()
  for (const i of samples) {
    await draw(ctx, i)
    const { data } = ctx.getImageData(0, 0, w, h)
    for (let q = 0; q < data.length; q += 4 * stride) {
      pool.push(data[q], data[q + 1], data[q + 2], 255)
      const key = (data[q] << 16) | (data[q + 1] << 8) | data[q + 2]
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    await breathe()
  }
  const palette = quantize(new Uint8ClampedArray(pool), 256)
  // Snap the nearest palette entry to each of the commonest exact colours.
  const taken = new Set()
  for (const [key] of [...counts].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
    const c = [key >> 16, (key >> 8) & 255, key & 255]
    let best = -1, bestD = Infinity
    palette.forEach((p, k) => { if (taken.has(k)) return; const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2; if (d < bestD) { bestD = d; best = k } })
    if (best >= 0) { palette[best] = c; taken.add(best) }
  }
  // Each exact colour goes to its nearest palette entry, remembered across frames. (gifenc's own
  // mapping buckets colours coarsely and lets the first one in a bucket decide for all of them,
  // which could move a whole background to a neighbouring shade.)
  const nearest = new Map()
  const indexed = (data) => {
    const out = new Uint8Array(data.length / 4)
    for (let q = 0, o = 0; q < data.length; q += 4, o++) {
      const key = (data[q] << 16) | (data[q + 1] << 8) | data[q + 2]
      let k = nearest.get(key)
      if (k === undefined) {
        let best = Infinity
        for (let j = 0; j < palette.length; j++) {
          const p = palette[j], d = (p[0] - data[q]) ** 2 + (p[1] - data[q + 1]) ** 2 + (p[2] - data[q + 2]) ** 2
          if (d < best) { best = d; k = j }
        }
        if (nearest.size > 1 << 21) nearest.clear()
        nearest.set(key, k)
      }
      out[o] = k
    }
    return out
  }
  const delays = gifDelays(frames, fps)
  for (let i = 0; i < frames; i++) {
    if (signal?.aborted) throw new DOMException("Export cancelled", "AbortError")
    await draw(ctx, i)
    const { data } = ctx.getImageData(0, 0, w, h)
    gif.writeFrame(indexed(data), w, h, { palette: i === 0 ? palette : undefined, delay: delays[i] * 10, repeat: 0 })
    onProgress?.((i + 1) / frames)
    await breathe()
  }
  gif.finish()
  return new Blob([gif.bytes()], { type: "image/gif" })
}

// Saving on a phone: the share sheet takes the file itself (Save Video or Save Image to Photos,
// AirDrop, Messages…), at full size. A page may open it only from a tap, and rendering uses that
// tap up, so an export offers it as a second tap once the file is ready.
const asFile = (blob, name) => new File([blob], name, { type: blob.type })
export function canShare(blob, name) {
  try { return Boolean(navigator.canShare?.({ files: [asFile(blob, name)] })) } catch { return false }
}
export const share = (blob, name) => navigator.share({ files: [asFile(blob, name)] })
// A phone or tablet, where the share sheet is the way to save; on a computer, files download.
export const touchFirst = () => matchMedia("(pointer: coarse)").matches

// Copying a frame to the clipboard as a full-size PNG, to paste into Figma, Slack or a message.
// Browsers take only PNG this way. The clipboard waits for the PNG to finish rendering, so the copy
// still counts as part of the click.
export const canCopyImage = () => typeof ClipboardItem !== "undefined" && Boolean(navigator.clipboard?.write)
export const copyPng = (pngPromise) => navigator.clipboard.write([new ClipboardItem({ "image/png": pngPromise })])

export function download(blob, name) {
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: name })
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 4000)
}

// Give the page a moment between frames. A MessageChannel rather than setTimeout: browsers slow
// timers to one a second in background tabs, which would stall an export left to run.
function breathe() {
  return new Promise((resolve) => {
    const ch = new MessageChannel()
    ch.port1.onmessage = () => resolve()
    ch.port2.postMessage(0)
  })
}

function surface(w, h) {
  const canvas = document.createElement("canvas")
  canvas.width = w; canvas.height = h
  return { canvas, ctx: canvas.getContext("2d", { willReadFrequently: true }) }
}
