// Colour lab: the engine. Your inks, laid out as a study: a swatch card with readouts, Albers'
// nested squares, proportion bands, tints and shades, a contrast check, or a blend. Motion acts on
// the inks themselves (their hue or lightness, or their order) or on the shapes (Breathe); all of
// it is periodic, so the loop closes.
import { readJson } from "../../packages/core/read-json.js"
import { formatSize } from "../../packages/core/formats.js"
import { resolve } from "../../packages/core/keys.js"
import { mulberry32 } from "../../packages/core/rng.js"
import { hexToOklch, oklchToHex, mixHue, along, contrast, grade, inkOn, rgbText, oklchText } from "../../packages/core/colour.js"

export const manifest = await readJson(new URL("./instrument.json", import.meta.url))

const TAU = Math.PI * 2
const PHI = (1 + Math.sqrt(5)) / 2
const frac = (x) => x - Math.floor(x)
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const smooth = (x) => x * x * (3 - 2 * x)
const LABEL_FONT = '"neue-haas-grotesk-text", "Helvetica Neue", Helvetica, Arial, sans-serif'
const DARK = "#121211", GREY = "#6B6B65", CARD = "#FFFFFF"

export const size = (patch) => formatSize(patch.params)
export const frameCount = (patch) => Math.max(1, Math.round(patch.params.duration * Number(patch.params.fps)))

// ---- motion ----

// Where ink i is in its own cycle: a sine that runs a little behind the ink before it.
const wave = (p, t, i) => Math.sin(TAU * (p.beats * t - i * p.stagger))

// The inks at time t. Hue swing and Lights up change each ink; Carousel passes them along, all
// the way round once per beat, each move easing in and out (Amount is how much of a step is spent
// moving) and turning round the hue wheel, so no ink goes muddy on the way.
export function inksAt(p, t) {
  const { inks, amount: k } = p, n = inks.length
  if (p.motion === "swing") return inks.map((hex, i) => { const [L, C, h] = hexToOklch(hex); return oklchToHex([L, C, h + wave(p, t, i) * k * 180]) })
  if (p.motion === "lights") return inks.map((hex, i) => { const [L, C, h] = hexToOklch(hex); return oklchToHex([L + (0.5 - 0.5 * Math.cos(TAU * (p.beats * t - i * p.stagger))) * k * 0.4, C, h]) })
  if (p.motion === "carousel" && n > 1) {
    const f = frac(p.beats * t) * n, step = Math.floor(f), move = Math.max(0.05, k)
    const e = smooth(clamp((f - step - (1 - move)) / move, 0, 1))
    return inks.map((_, i) => mixHue(inks[(i + step) % n], inks[(i + step + 1) % n], e))
  }
  return inks
}

// Breathe: a size factor for shape i, around 1.
const swell = (p, t, i) => (p.motion === "breathe" ? 1 + wave(p, t, i) * p.amount * 0.35 : 1)

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

// ---- drawing ----

function path(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  if (r <= 0) { ctx.rect(x, y, w, h); return }
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// A filled rectangle with rounded corners. Given the paper, a colour too close to it to see gets a
// hairline edge.
function rect(ctx, x, y, w, h, r, fill, paper) {
  path(ctx, x, y, w, h, r)
  ctx.fillStyle = fill
  ctx.fill()
  if (paper && contrast(fill, paper) < 1.12) {
    ctx.strokeStyle = inkOn(paper) === DARK ? "rgba(18, 18, 17, 0.14)" : "rgba(255, 255, 255, 0.2)"
    ctx.lineWidth = Math.max(1, Math.min(w, h) * 0.004)
    ctx.stroke()
  }
}

// Text no wider than max: the size comes down until it fits.
function label(ctx, text, x, y, px, max, colour, { weight = 400, align = "left" } = {}) {
  ctx.font = `${weight} ${px}px ${LABEL_FONT}`
  const w = ctx.measureText(text).width
  if (w > max) ctx.font = `${weight} ${(px * max) / w}px ${LABEL_FONT}`
  ctx.fillStyle = colour
  ctx.textAlign = align
  ctx.fillText(text, x, y)
}

// The readout lines for an ink, by the Readouts setting.
const readout = (hex, mode) => (mode === "full" ? [hex, `RGB ${rgbText(hex)}`, `OKLCH ${oklchText(hex)}`] : mode === "hex" ? [hex] : [])

// The biggest grid of n cells of the given aspect (width / height) that fits in w × h.
function bestGrid(n, w, h, gap, aspect) {
  let best = null
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols)
    const cw = (w - gap * (cols - 1)) / cols, ch = (h - gap * (rows - 1)) / rows
    if (cw <= 0 || ch <= 0) continue
    const cellW = Math.min(cw, ch * aspect), cellH = cellW / aspect
    if (!best || cellW > best.w) best = { cols, rows, w: cellW, h: cellH }
  }
  return best
}

// Lays n cells out as bestGrid does, centred, and calls draw(i, x, y, w, h) for each.
function grid(n, box, gap, aspect, draw) {
  const g = bestGrid(n, box.w, box.h, gap, aspect)
  if (!g) return
  const used = { w: g.cols * g.w + (g.cols - 1) * gap, h: g.rows * g.h + (g.rows - 1) * gap }
  for (let i = 0; i < n; i++) {
    const c = i % g.cols, r = Math.floor(i / g.cols)
    // The last row, if short, is centred too.
    const inRow = r === g.rows - 1 ? n - r * g.cols : g.cols
    const rowW = inRow * g.w + (inRow - 1) * gap
    draw(i, box.x + (box.w - rowW) / 2 + c * (g.w + gap), box.y + (box.h - used.h) / 2 + r * (g.h + gap), g.w, g.h)
  }
}

// Splits a length into shares by weight, with a gap between them: [{ at, len }].
function split(total, weights, gap) {
  const sum = weights.reduce((a, b) => a + b, 0), free = total - gap * (weights.length - 1)
  let at = 0
  return weights.map((w) => { const len = (free * w) / sum, s = { at, len }; at += len + gap; return s })
}

// ---- the studies ----

// Swatch card: printer's chips, the ink above and its readouts on white below.
function card(ctx, p, t, inks, box, u) {
  const lines = p.labels === "full" ? 3 : p.labels === "hex" ? 1 : 0
  const aspect = lines ? 0.72 : 1
  grid(inks.length, box, p.gap, aspect, (i, cx, cy, cw, ch) => {
    // Breathe shrinks each chip and lets it back out to its cell, never past it.
    const k = p.motion === "breathe" ? 1 - p.amount * 0.2 * (0.5 + 0.5 * wave(p, t, i)) : 1
    const w = cw * k, h = ch * k, x = cx + (cw - w) / 2, y = cy + (ch - h) / 2
    const tag = lines ? h * (lines === 3 ? 0.3 : 0.17) : 0
    if (lines) {
      ctx.save()
      ctx.shadowColor = "rgba(18, 18, 17, 0.08)"; ctx.shadowBlur = 28 * u; ctx.shadowOffsetY = 8 * u
      rect(ctx, x, y, w, h, p.corner, CARD)
      ctx.restore()
    }
    ctx.save()
    ctx.beginPath(); ctx.rect(x, y, w, h - tag); ctx.clip()
    rect(ctx, x, y, w, h, p.corner, inks[i], lines ? null : p.background)
    ctx.restore()
    if (!lines) return
    const pad = w * 0.07, big = w * 0.085, small = w * 0.05
    const [hex, ...rest] = readout(inks[i], p.labels)
    let ty = y + h - tag + pad + big * 0.8
    label(ctx, hex, x + pad, ty, big, w - 2 * pad, DARK, { weight: 500 })
    for (const line of rest) { ty += small * 1.5; label(ctx, line, x + pad, ty, small, w - 2 * pad, GREY) }
  })
}

// Homage: after Albers. Each panel nests the next inks inside one another, the inner squares
// sitting low, as his do: a quarter of the space falls below each square, three quarters above.
function albers(ctx, p, t, inks, box, u) {
  const n = inks.length, k = Math.min(p.nest, n), base = 0.6 / Math.max(1, k - 1)
  const tag = p.labels === "off" ? 0 : 1
  grid(n, box, p.gap, tag ? 0.88 : 1, (i, x, y, w, h) => {
    const P = w, step = base * swell(p, t, i)
    for (let s = 0; s < k; s++) {
      const side = P * clamp(1 - s * step, 0.06, 1), gapBelow = (P - side) * 0.25
      rect(ctx, x + (P - side) / 2, y + P - gapBelow - side, side, side, s ? p.corner * (side / P) : p.corner, inks[(i + s) % n], s ? null : p.background)
    }
    if (tag) {
      const text = Array.from({ length: k }, (_, s) => inks[(i + s) % n]).join("  ")
      label(ctx, text, x, y + P + (h - P) * 0.55, Math.min(w * 0.045, 20 * u * 1.4), w, inkOn(p.background, DARK, "#F4F4F1"))
    }
  })
}

// Proportion: bands sized by a rule.
function shares(p, n) {
  if (p.rule === "even") return Array(n).fill(1)
  if (p.rule === "golden") return Array.from({ length: n }, (_, i) => PHI ** -i)
  if (p.rule === "chance") { const r = mulberry32(p.seed ?? 1); return Array.from({ length: n }, () => 0.25 + r()) }
  // 60 · 30 · 10: one ink dominates, one supports, the rest share the accent.
  if (n === 1) return [1]
  if (n === 2) return [70, 30]
  return [60, 30, ...Array(n - 2).fill(10 / (n - 2))]
}

function proportion(ctx, p, t, inks, box, u) {
  const n = inks.length, across = p.direction === "across"
  const weights = shares(p, n).map((w, i) => w * swell(p, t, i))
  const total = weights.reduce((a, b) => a + b, 0)
  split(across ? box.w : box.h, weights, p.gap).forEach(({ at, len }, i) => {
    const x = across ? box.x + at : box.x, y = across ? box.y : box.y + at
    const w = across ? len : box.w, h = across ? box.h : len
    rect(ctx, x, y, w, h, p.corner, inks[i], p.background)
    // Readouts at a size that can be read, or not at all: a sliver of a band goes without.
    if (p.labels === "off") return
    const pad = 36 * u, px = 36 * u
    if (w < px * 9 || h < px * 5) return
    const lines = [`${inks[i]}  ${Math.round((weights[i] / total) * 100)}%`, ...readout(inks[i], p.labels).slice(1)]
    const ink = inkOn(inks[i])
    lines.forEach((line, j) => label(ctx, line, x + pad, y + h - pad - (lines.length - 1 - j) * px * 1.45, j ? px * 0.72 : px, w - 2 * pad, ink, { weight: j ? 400 : 500 }))
  })
}

// Tints and shades: a column for each ink, from the lightest tint to the darkest shade at the
// same hue in OKLCH, chroma easing off towards white and black. The ink takes its nearest step.
export function scale(hex, steps) {
  const [L, C, h] = hexToOklch(hex)
  const ls = Array.from({ length: steps }, (_, s) => 0.97 - (0.77 * s) / (steps - 1))
  const own = ls.reduce((best, l, s) => (Math.abs(l - L) < Math.abs(ls[best] - L) ? s : best), 0)
  return { own, colours: ls.map((l, s) => (s === own ? hex : oklchToHex([l, C * Math.max(0.12, 1 - Math.abs(l - L) * 1.3), h]))) }
}
const stepName = (s, steps) => (steps === 9 ? (s + 1) * 100 : Math.round((50 + (s * 900) / (steps - 1)) / 10) * 10)

function ramp(ctx, p, t, inks, box, u) {
  const rowGap = Math.min(p.gap, 6 * u)
  split(box.w, inks.map((_, i) => swell(p, t, i)), p.gap).forEach(({ at, len }, i) => {
    const { own, colours } = scale(inks[i], p.steps)
    split(box.h, colours.map(() => 1), rowGap).forEach((cell, s) => {
      const x = box.x + at, y = box.y + cell.at, c = colours[s], ink = inkOn(c)
      rect(ctx, x, y, len, cell.len, p.corner, c, p.background)
      const pad = Math.min(len, cell.len) * 0.16, px = Math.min(cell.len * 0.26, len * 0.12, 26 * u)
      if (s === own) { ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(x + len - pad - px * 0.3, y + cell.len / 2, px * 0.3, 0, TAU); ctx.fill() }
      if (p.labels === "off" || px < 6 * u) return
      label(ctx, String(stepName(s, p.steps)), x + pad, y + cell.len / 2 + px * 0.36 - (p.labels === "full" ? px * 0.55 : 0), px, len * 0.5, ink, { weight: 500 })
      if (p.labels === "full") label(ctx, c, x + pad, y + cell.len / 2 + px * 0.36 + px * 0.6, px * 0.72, len - 2 * pad, ink)
    })
  })
}

// Contrast check: every ink set on every other, with its WCAG ratio and grade. The diagonal names the inks.
function contrastCheck(ctx, p, t, inks, box, u) {
  const n = inks.length, gap = p.gap / 2
  const cols = split(box.w, inks.map(() => 1), gap), rows = split(box.h, inks.map(() => 1), gap)
  rows.forEach((row, r) => cols.forEach((col, c) => {
    const x = box.x + col.at, y = box.y + row.at, w = col.len, h = row.len, bg = inks[r], fg = inks[c]
    rect(ctx, x, y, w, h, p.corner, bg, p.background)
    const pad = Math.min(w, h) * 0.1, sub = inkOn(bg)
    if (r === c) { label(ctx, bg, x + pad, y + h - pad, Math.min(w, h) * 0.12, w - 2 * pad, sub, { weight: 500 }); return }
    const big = Math.min(w * 0.34, h * 0.42) * swell(p, t, r * n + c)
    label(ctx, "Aa", x + w / 2, y + h * 0.52, big, w - 2 * pad, fg, { weight: 500, align: "center" })
    if (p.labels === "off") return
    const ratio = contrast(bg, fg)
    label(ctx, `${ratio.toFixed(1)}  ${grade(ratio)}`, x + w / 2, y + h - pad, Math.min(w, h) * 0.1, w - 2 * pad, sub, { align: "center" })
  }))
}

// Blend: the inks mixed into one another in OKLab, smooth or cut into flat bands. Breathe makes
// the blend flow, the stops sliding back and forth.
function blend(ctx, p, t, inks, box, u, scale) {
  const across = p.direction === "across", len = across ? box.w : box.h
  const flow = (v) => (p.motion === "breathe" ? clamp(v + Math.sin(TAU * (p.beats * t + v)) * p.amount * 0.12 * Math.sin(Math.PI * v), 0, 1) : v)
  ctx.save()
  path(ctx, box.x, box.y, box.w, box.h, p.corner)
  ctx.clip()
  if (p.bands) {
    split(len, Array(p.bands).fill(1), p.bands > 1 ? Math.min(p.gap, len / p.bands / 3) : 0).forEach(({ at, len: l }, b) => {
      const c = along(inks, flow(p.bands === 1 ? 0.5 : b / (p.bands - 1)))
      if (across) rect(ctx, box.x + at, box.y, l, box.h, 0, c)
      else rect(ctx, box.x, box.y + at, box.w, l, 0, c)
    })
  } else {
    // One strip per output pixel, overlapping by a hair so no seams show.
    const strips = Math.max(2, Math.ceil(len * scale)), w = len / strips
    for (let s = 0; s < strips; s++) {
      ctx.fillStyle = along(inks, flow((s + 0.5) / strips))
      if (across) ctx.fillRect(box.x + s * w, box.y, w + 0.6 / scale, box.h)
      else ctx.fillRect(box.x, box.y + s * w, box.w, w + 0.6 / scale)
    }
  }
  ctx.restore()
  if (p.labels === "off") return
  const px = Math.min(24 * u * 1.3, len / inks.length / 6), pad = px * 1.4
  inks.forEach((hex, i) => {
    const v = inks.length === 1 ? 0.5 : i / (inks.length - 1), at = flow(v) * len
    const ink = inkOn(along(inks, flow(v)))
    if (across) label(ctx, hex, clamp(box.x + at, box.x + pad, box.x + box.w - pad), box.y + box.h - pad, px, len / inks.length, ink, { weight: 500, align: i === 0 ? "left" : i === inks.length - 1 ? "right" : "center" })
    else label(ctx, hex, box.x + pad, clamp(box.y + at + px * 0.35, box.y + pad + px * 0.7, box.y + box.h - pad), px, box.w - 2 * pad, ink, { weight: 500 })
  })
}

const STUDIES = { card, albers, proportion, ramp, contrast: contrastCheck, blend }

export function render(ctx, patch, t, { scale = 1 } = {}) {
  const { w: W, h: H } = size(patch)
  t = frac(t)
  const p = { ...resolve(manifest, patch, t), seed: patch.seed }
  ctx.save()
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  ctx.fillStyle = p.background
  ctx.fillRect(0, 0, W, H)
  ctx.textBaseline = "alphabetic"
  const m = Math.min(p.margin, W / 2 - 1, H / 2 - 1)
  const box = { x: m, y: m, w: W - 2 * m, h: H - 2 * m }
  const u = Math.min(W, H) / 1080 // one pixel on a 1080 frame, for sizes that scale with the format
  ;(STUDIES[p.study] ?? card)(ctx, p, t, inksAt(p, t), box, u, scale)
  ctx.restore()
}
