// Exports. Video is rendered offline, frame by frame, at full size: nothing is screen-recorded,
// so a slow machine makes a slower export, never a stuttering one. Every exporter takes a
// draw(ctx, frameIndex) callback and knows nothing about the instrument.
//
//   png   one frame
//   mp4   H.264 via WebCodecs + mp4-muxer   (Chrome, Edge, Safari 17+; not every Linux build)
//   webm  VP9 via WebCodecs + webm-muxer    (Chrome, Edge, Firefox 130+)
//   gif   gifenc, 256 colours per frame; best at reduced size

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

export async function exportGif({ w, h, fps, frames, draw, onProgress, signal }) {
  const { GIFEncoder, quantize, applyPalette } = await import("./vendor/gifenc.esm.js")
  const gif = GIFEncoder()
  const { ctx } = surface(w, h)
  const delay = Math.round(1000 / fps)
  for (let i = 0; i < frames; i++) {
    if (signal?.aborted) throw new DOMException("Export cancelled", "AbortError")
    await draw(ctx, i)
    const { data } = ctx.getImageData(0, 0, w, h)
    const palette = quantize(data, 256)
    gif.writeFrame(applyPalette(data, palette), w, h, { palette, delay, repeat: 0 })
    onProgress?.((i + 1) / frames)
    await breathe()
  }
  gif.finish()
  return new Blob([gif.bytes()], { type: "image/gif" })
}

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
