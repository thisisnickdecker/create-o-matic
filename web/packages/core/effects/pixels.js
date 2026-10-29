// Colour effects that work pixel by pixel: Adjust, Invert, Posterize, Gradient map, Acid and
// Holographic. Each reads the frame, changes every pixel, and puts it back.
import { hash, hexRgb, TAU } from "./util.js"

function eachPixel(ctx, fn) {
  const { width: W, height: H } = ctx.canvas
  const img = ctx.getImageData(0, 0, W, H)
  const d = img.data
  for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i += 4) fn(d, i, x, y)
  ctx.putImageData(img, 0, 0)
}

const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b

// HSV <-> RGB on 0–255 channels, hue 0–1.
function toHsv(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn
  let h = 0
  if (d) h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h / 6, mx ? d / mx : 0, mx / 255]
}
function fromHsv(h, s, v, out) {
  const f = (n) => { const k = (n + h * 6) % 6; return 255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) }
  out[0] = f(5); out[1] = f(3); out[2] = f(1)
}

// A 256-step lookup from luminance to colour, through evenly spaced stops.
function ramp(colours) {
  const stops = colours.map(hexRgb), n = stops.length - 1, lut = new Uint8ClampedArray(256 * 3)
  for (let i = 0; i < 256; i++) {
    const f = (i / 255) * n, k = Math.min(n - 1, Math.floor(f)), t = f - k
    for (let c = 0; c < 3; c++) lut[i * 3 + c] = stops[k][c] + (stops[k + 1][c] - stops[k][c]) * t
  }
  return lut
}

export const adjust = {
  id: "adjust",
  label: "Adjust",
  group: "Colour",
  params: [
    { key: "adjExposure", label: "Brightness", type: "number", min: -1, max: 1, step: 0.01, default: 0 },
    { key: "adjContrast", label: "Contrast", type: "number", min: -1, max: 1, step: 0.01, default: 0 },
    { key: "adjSaturation", label: "Saturation", type: "number", min: -1, max: 1, step: 0.01, default: 0 },
    { key: "adjHue", label: "Hue", type: "number", min: -180, max: 180, step: 1, default: 0, unit: "°" },
    { key: "adjWarmth", label: "Warmth", type: "number", min: -1, max: 1, step: 0.01, default: 0 },
  ],
  layerDefaults: { adjContrast: 0.15, adjSaturation: 0.1 },
  active: (p) => Boolean(p.adjExposure || p.adjContrast || p.adjSaturation || p.adjHue || p.adjWarmth),
  apply(ctx, p) {
    const c = 1 + p.adjContrast * (p.adjContrast > 0 ? 2 : 1), b = p.adjExposure * 96, s = 1 + p.adjSaturation
    const hue = p.adjHue / 360, warm = p.adjWarmth * 24, hsv = [0, 0, 0]
    eachPixel(ctx, (d, i) => {
      let r = (d[i] - 128) * c + 128 + b + warm, g = (d[i + 1] - 128) * c + 128 + b, bl = (d[i + 2] - 128) * c + 128 + b - warm
      const L = lum(r, g, bl)
      r = L + (r - L) * s; g = L + (g - L) * s; bl = L + (bl - L) * s
      if (hue) {
        const [h, sat, v] = toHsv(Math.max(0, Math.min(255, r)), Math.max(0, Math.min(255, g)), Math.max(0, Math.min(255, bl)))
        fromHsv((h + hue + 1) % 1, sat, v, hsv)
        ;[r, g, bl] = hsv
      }
      d[i] = r; d[i + 1] = g; d[i + 2] = bl
    })
  },
}

export const invert = {
  id: "invert",
  label: "Invert",
  group: "Colour",
  params: [{ key: "invert", label: "Invert", type: "number", min: 0, max: 1, step: 0.01, default: 0 }],
  layerDefaults: { invert: 1 },
  active: (p) => p.invert > 0,
  apply(ctx, p) {
    const k = p.invert
    eachPixel(ctx, (d, i) => { for (let c = 0; c < 3; c++) d[i + c] += (255 - 2 * d[i + c]) * k })
  },
}

export const posterize = {
  id: "posterize",
  label: "Posterize",
  group: "Colour",
  params: [{ key: "posterize", label: "Levels", type: "int", min: 0, max: 16, step: 1, default: 0, help: "Tones per channel. 0 is off; 2 is the bluntest." }],
  layerDefaults: { posterize: 4 },
  active: (p) => p.posterize >= 2,
  apply(ctx, p) {
    const n = p.posterize - 1
    eachPixel(ctx, (d, i) => { for (let c = 0; c < 3; c++) d[i + c] = Math.round((d[i + c] / 255) * n) / n * 255 })
  },
}

export const gradmap = {
  id: "gradmap",
  label: "Gradient map",
  group: "Colour",
  params: [
    { key: "gradmap", label: "Gradient map", type: "number", min: 0, max: 1, step: 0.01, default: 0, help: "Recolours by brightness: shadows take the first ink, highlights the last. Two inks make a duotone." },
    { key: "gradmapInks", label: "Map inks", type: "palette", default: ["#121211", "#FF2E88", "#FFE800"], when: { gradmap: { not: 0 } } },
  ],
  layerDefaults: { gradmap: 1 },
  active: (p) => p.gradmap > 0,
  apply(ctx, p) {
    const lut = ramp(p.gradmapInks), k = p.gradmap
    eachPixel(ctx, (d, i) => {
      const L = Math.max(0, Math.min(255, Math.round(lum(d[i], d[i + 1], d[i + 2])))) * 3
      for (let c = 0; c < 3; c++) d[i + c] += (lut[L + c] - d[i + c]) * k
    })
  },
}

export const acid = {
  id: "acid",
  label: "Acid",
  group: "Colour",
  params: [
    { key: "acid", label: "Acid", type: "number", min: 0, max: 1, step: 0.01, default: 0, help: "Hue swings with brightness, saturation runs hot." },
    { key: "acidCycles", label: "Acid trip", type: "int", min: 0, max: 6, step: 1, default: 1, when: { acid: { not: 0 } }, help: "Times the colours cycle the wheel per loop." },
  ],
  layerDefaults: { acid: 0.8 },
  active: (p) => p.acid > 0,
  apply(ctx, p, { t }) {
    const k = p.acid, shift = p.acidCycles * t, hsv = [0, 0, 0]
    eachPixel(ctx, (d, i) => {
      const [h, s, v] = toHsv(d[i], d[i + 1], d[i + 2])
      fromHsv((h + v * 1.4 * k + shift) % 1, Math.min(1, s + 0.6 * k), Math.min(1, v * (1 + 0.25 * k)), hsv)
      d[i] += (hsv[0] - d[i]) * k; d[i + 1] += (hsv[1] - d[i + 1]) * k; d[i + 2] += (hsv[2] - d[i + 2]) * k
    })
  },
}

export const holographic = {
  id: "holographic",
  label: "Holographic",
  group: "Colour",
  params: [
    { key: "holo", label: "Holographic", type: "number", min: 0, max: 1, step: 0.01, default: 0, help: "An iridescent foil sheen that shifts with brightness and position." },
    { key: "holoScale", label: "Foil scale", type: "number", min: 40, max: 2000, step: 10, default: 420, unit: "px", when: { holo: { not: 0 } } },
    { key: "holoShimmer", label: "Shimmer", type: "int", min: 0, max: 6, step: 1, default: 1, when: { holo: { not: 0 } }, help: "Times the foil's colours sweep across per loop." },
  ],
  layerDefaults: { holo: 0.7 },
  active: (p) => p.holo > 0,
  apply(ctx, p, { t, scale, seed }) {
    const k = p.holo, f = 1 / (p.holoScale * scale), sweep = p.holoShimmer * t, rgb = [0, 0, 0]
    eachPixel(ctx, (d, i, x, y) => {
      const L = lum(d[i], d[i + 1], d[i + 2]) / 255
      const wave = 0.5 + 0.5 * Math.sin(TAU * (x * f * 0.7 + y * f * 0.4) + hash(seed, 7) * TAU)
      fromHsv((L * 0.9 + (x + y) * f * 0.35 + wave * 0.25 + sweep) % 1, 0.5, 1, rgb)
      // Foil: the rainbow screened over the image, strongest in the mid-tones.
      const m = k * (0.55 + 0.45 * Math.sin(Math.PI * L))
      for (let c = 0; c < 3; c++) d[i + c] += (255 - (255 - d[i + c]) * (255 - rgb[c]) / 255 - d[i + c]) * m
    })
  },
}
