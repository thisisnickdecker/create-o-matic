// Colour science for the instruments: sRGB, OKLab and OKLCH (Björn Ottosson's perceptual space,
// where equal steps look equal), mixing, gamut mapping and WCAG contrast. Pure functions; colours
// travel as "#RRGGBB" strings, OKLCH as [L 0–1, C 0–0.4, h degrees].

export const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
export const rgbToHex = (r, g, b) => "#" + [r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("").toUpperCase()

const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const toGamma = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)

// Linear sRGB (0–1) <-> OKLab.
function linearToOklab([r, g, b]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}
function oklabToLinear([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

export const hexToOklab = (hex) => linearToOklab(hexToRgb(hex).map((c) => toLinear(c / 255)))
export const oklabToHex = (lab) => rgbToHex(...oklabToLinear(lab).map((c) => toGamma(Math.min(1, Math.max(0, c))) * 255))

export function hexToOklch(hex) {
  const [L, a, b] = hexToOklab(hex)
  const C = Math.hypot(a, b)
  return [L, C, C < 1e-4 ? 0 : ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360]
}

// OKLCH to hex, keeping lightness and hue and giving up chroma until the colour fits in sRGB:
// out-of-gamut colours come out as the most saturated version the screen can show.
export function oklchToHex([L, C, h]) {
  L = Math.min(1, Math.max(0, L))
  const rad = (h * Math.PI) / 180
  const lin = (c) => oklabToLinear([L, c * Math.cos(rad), c * Math.sin(rad)])
  const fits = (c) => lin(c).every((v) => v >= -1e-4 && v <= 1 + 1e-4)
  if (!fits(C)) {
    let lo = 0, hi = C
    for (let i = 0; i < 20; i++) { const mid = (lo + hi) / 2; if (fits(mid)) lo = mid; else hi = mid }
    C = lo
  }
  return rgbToHex(...lin(C).map((c) => toGamma(Math.min(1, Math.max(0, c))) * 255))
}

// Mix in OKLab, so the midpoint of two colours looks halfway between them (no muddy grey dip).
export function mix(a, b, t) {
  const A = hexToOklab(a), B = hexToOklab(b)
  return oklabToHex(A.map((v, i) => v + (B[i] - v) * t))
}

// Mix in OKLCH, going the short way round the hue wheel: a change of colour that stays as vivid
// as its ends (pink to yellow passes through orange, not grey). A grey takes the other's hue.
export function mixHue(a, b, t) {
  const [L1, C1, h1] = hexToOklch(a), [L2, C2, h2] = hexToOklch(b)
  const from = C1 < 0.02 ? h2 : h1, to = C2 < 0.02 ? h1 : h2
  const turn = ((to - from + 540) % 360) - 180
  return oklchToHex([L1 + (L2 - L1) * t, C1 + (C2 - C1) * t, from + turn * t])
}

// A colour anywhere along a run of colours, t from 0 to 1.
export function along(colours, t) {
  if (colours.length === 1) return colours[0]
  const f = Math.min(1, Math.max(0, t)) * (colours.length - 1), i = Math.min(colours.length - 2, Math.floor(f))
  return mix(colours[i], colours[i + 1], f - i)
}

// WCAG 2 relative luminance and contrast ratio (1 to 21).
export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((c) => toLinear(c / 255))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}
// What a pairing passes for text: AAA (7:1), AA (4.5:1), AA for large text only (3:1), or nothing.
export const grade = (ratio) => (ratio >= 7 ? "AAA" : ratio >= 4.5 ? "AA" : ratio >= 3 ? "AA large" : "Fails")

// Near-black or white, whichever reads better on a colour: for labels set on swatches.
export const inkOn = (hex, dark = "#121211", light = "#FFFFFF") => (contrast(hex, dark) >= contrast(hex, light) ? dark : light)

// Readouts, as a designer would type them.
export const rgbText = (hex) => hexToRgb(hex).join(" ")
export function oklchText(hex) {
  const [L, C, h] = hexToOklch(hex)
  return `${(L * 100).toFixed(1)}% ${C.toFixed(3)} ${Math.round(h)}`
}

// ---- palettes ----

// Screen stand-ins for common printing inks, for "Print inks".
const PRINT_INKS = ["#0078BF", "#FF48B0", "#FFE800", "#00A95C", "#FF665E", "#765BA7", "#3D5588", "#F15060", "#FF6C2F", "#00838A", "#1D1D1B", "#AC936E"]

// A palette of n inks in the given harmony. Lightness is spread from dark to light so the inks
// always read against one another, then shuffled so the dominant ink isn't always the darkest.
export function deal(harmony, n, r) {
  const h0 = r() * 360, jitter = (d) => (r() - 0.5) * d
  if (harmony === "print") {
    const pool = PRINT_INKS.slice()
    return Array.from({ length: n }, () => pool.splice(Math.floor(r() * pool.length), 1)[0] ?? PRINT_INKS[0])
  }
  const lights = Array.from({ length: n }, (_, i) => 0.24 + (0.7 * (i + 0.2 + r() * 0.6)) / n)
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [lights[i], lights[j]] = [lights[j], lights[i]] }
  return lights.map((L, i) => {
    let h = h0, C = 0.07 + r() * 0.11
    if (harmony === "analogous") h = h0 + (i - (n - 1) / 2) * 26 + jitter(8)
    else if (harmony === "complementary") h = h0 + (i % 2) * 180 + jitter(16)
    else if (harmony === "split") h = h0 + [0, 150, 210][i % 3] + jitter(10)
    else if (harmony === "triad") h = h0 + [0, 120, 240][i % 3] + jitter(10)
    else if (harmony === "mono") { h = h0 + jitter(6); C = 0.03 + r() * 0.14 }
    else if (harmony === "muted") { h = 30 + r() * 80 + (r() < 0.25 ? 150 : 0); C = 0.015 + r() * 0.06 }
    else h = h0 + i * 137.5 + jitter(10) // golden angle: as far from every other hue as it can get
    return oklchToHex([L, C, (h + 360) % 360])
  })
}

// A plain name for a colour, from its lightness, chroma and hue: "deep blue", "light warm grey".
export function colourName(hex) {
  const [L, C, h] = hexToOklch(hex)
  if (C < 0.03) {
    if (L > 0.95) return L > 0.99 && C < 0.005 ? "white" : "off-white"
    if (L < 0.2) return "black"
    const tone = C > 0.008 ? (h > 40 && h < 120 ? "warm " : h > 200 && h < 300 ? "cool " : "") : ""
    return `${L > 0.75 ? "light " : L < 0.4 ? "dark " : ""}${tone}grey`
  }
  // Hue bands where OKLCH puts them: red sits near 25°, yellow near 100°, blue near 265°.
  const band = [[15, "pink"], [28, "red"], [38, "coral"], [68, "orange"], [90, "amber"], [112, "yellow"], [135, "lime"], [170, "green"],
    [205, "teal"], [245, "sky blue"], [280, "blue"], [315, "violet"], [340, "magenta"], [360, "pink"]].find(([edge]) => h < edge)[1]
  const name = band === "pink" && L < 0.5 ? "crimson" : band
  const shade = L > 0.85 ? (C < 0.12 ? "pale " : "bright ") : L > 0.72 && C < 0.14 ? "light " : L < 0.35 ? "deep " : ""
  return shade + name
}

