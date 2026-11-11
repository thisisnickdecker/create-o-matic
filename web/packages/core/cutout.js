// Cutouts: a photo in, the same photo with its background taken out, all in this browser. The
// model is U²-Net's small version (u2netp, Apache 2.0, 4.4 MB), run by onnxruntime-web (MIT); both
// are vendored and only fetched the first time someone asks for a cutout. It finds the main thing
// in the picture (a burger, a drink, a person, a product) and makes everything else see-through.
//   cutout(image, { trim }) -> PNG Blob   image: a Blob, an <img>, a canvas or an ImageBitmap
// It works best on one clear subject; soft edges (hair, steam, glass) come out soft.
const SIDE = 320 // the model's own size
const MEAN = [0.485, 0.456, 0.406], STD = [0.229, 0.224, 0.225]
const MOST = 2048 // the longest side of what comes back

// RGBA pixels at SIDE × SIDE to the model's input: planes of R, G and B, scaled by the brightest
// value, then centred as the model was trained (as rembg does it).
export function toInput(rgba) {
  const n = SIDE * SIDE, out = new Float32Array(3 * n)
  let top = 1
  for (let i = 0; i < n; i++) top = Math.max(top, rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2])
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) out[c * n + i] = (rgba[i * 4 + c] / top - MEAN[c]) / STD[c]
  return out
}

// The model's answer (how likely each pixel is the subject) to an alpha from 0 to 255: stretched to
// its own range, then the doubtful middle tightened so the edge isn't a haze.
export function toAlpha(pred) {
  let lo = Infinity, hi = -Infinity
  for (const v of pred) { if (v < lo) lo = v; if (v > hi) hi = v }
  const span = hi - lo || 1, out = new Uint8ClampedArray(pred.length)
  for (let i = 0; i < pred.length; i++) {
    const x = Math.min(1, Math.max(0, ((pred[i] - lo) / span - 0.12) / 0.76))
    out[i] = Math.round(x * x * (3 - 2 * x) * 255)
  }
  return out
}

// The smallest box round everything that isn't see-through, with a little room: { x, y, w, h }.
export function bounds(rgba, w, h, pad = 0.02) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (rgba[(y * w + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
  if (x1 < 0) return { x: 0, y: 0, w, h }
  const p = Math.round(Math.max(w, h) * pad)
  x0 = Math.max(0, x0 - p); y0 = Math.max(0, y0 - p); x1 = Math.min(w - 1, x1 + p); y1 = Math.min(h - 1, y1 + p)
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }
}

let session = null
async function model() {
  session ??= (async () => {
    const ort = await import("./vendor/onnxruntime-web/ort.wasm.min.mjs")
    ort.env.wasm.wasmPaths = new URL("./vendor/onnxruntime-web/", import.meta.url).href
    // Threads need a cross-origin-isolated page; otherwise one is fine for a picture at a time.
    ort.env.wasm.numThreads = globalThis.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1
    const s = await ort.InferenceSession.create(new URL("./vendor/u2netp/u2netp.onnx", import.meta.url).href, { executionProviders: ["wasm"] })
    return { ort, s }
  })().catch((e) => { session = null; throw e })
  return session
}

const canvas = (w, h) => Object.assign(document.createElement("canvas"), { width: w, height: h })

export async function cutout(image, { trim = true } = {}) {
  const src = image instanceof Blob ? await createImageBitmap(image) : image
  const iw = src.naturalWidth || src.width, ih = src.naturalHeight || src.height
  const k = Math.min(1, MOST / Math.max(iw, ih)), w = Math.round(iw * k), h = Math.round(ih * k)
  // What the model sees: the picture squeezed to its square.
  const small = canvas(SIDE, SIDE), sg = small.getContext("2d", { willReadFrequently: true })
  sg.imageSmoothingQuality = "high"
  sg.drawImage(src, 0, 0, SIDE, SIDE)
  const { ort, s } = await model()
  const input = new ort.Tensor("float32", toInput(sg.getImageData(0, 0, SIDE, SIDE).data), [1, 3, SIDE, SIDE])
  const result = await s.run({ [s.inputNames[0]]: input })
  const alpha = toAlpha(result[s.outputNames[0]].data.subarray(0, SIDE * SIDE))
  // The mask, stretched back over the picture at full size.
  const mask = canvas(SIDE, SIDE), mg = mask.getContext("2d")
  const md = mg.createImageData(SIDE, SIDE)
  for (let i = 0; i < alpha.length; i++) md.data[i * 4 + 3] = alpha[i]
  mg.putImageData(md, 0, 0)
  const out = canvas(w, h), og = out.getContext("2d", { willReadFrequently: true })
  og.imageSmoothingQuality = "high"
  og.drawImage(mask, 0, 0, w, h)
  og.globalCompositeOperation = "source-in"
  og.drawImage(src, 0, 0, w, h)
  let done = out
  if (trim) {
    const b = bounds(og.getImageData(0, 0, w, h).data, w, h)
    done = canvas(b.w, b.h)
    done.getContext("2d").drawImage(out, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h)
  }
  return new Promise((r) => done.toBlob(r, "image/png"))
}
