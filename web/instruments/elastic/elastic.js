// Elastic: the engine. No DOM, no clock, no Math.random. render(ctx, patch, t) draws the frame at
// time t (0 to 1 around the loop); the playground, the exporters and embed.js all call it.
//
// How a frame is built:
//   1. The grid is a set of strips (columns when vertical, rows when horizontal), each cut into cells.
//   2. Every cell has a phase: time × waves-per-loop, plus its row and column offsets. The wave at
//      that phase, shaped by Ease, is the cell's value v (0 to 1).
//   3. Cells share their strip in proportion to their v, so as one swells its neighbours give way.
//   4. A word is chosen for the cell (by size, sequence, letter or seed) and stretched to fill it.
//      A line like "@logo" is a mark (a logo or graphic, see marks.js) and stretches the same way.
//   5. With Shape fill, the type is drawn on its own layer and cut to a mark's silhouette (or the
//      cells outside or inside it are dropped), then laid on the frame.
//   6. Effects (kaleidoscope, liquid, melt, halftone, photocopy, grain) are laid over the frame.
// Before any of that, keyframes are resolved: the patch's settings as they stand at time t.
// Waves always complete a whole number of cycles per loop, so frame 0 follows the last frame cleanly.
import { readJson } from "../../packages/core/read-json.js"
import { formatSize } from "../../packages/core/formats.js"
import { hash } from "../../packages/core/rng.js"
import { fontString } from "../../packages/core/fonts.js"
import { withEffects, applyEffects } from "../../packages/core/effects/index.js"
import { resolve } from "../../packages/core/keys.js"
import { paintGradient } from "../../packages/core/effects/gradient.js"
import { drawMark, shapeMask, shapeRect, coverage } from "../../packages/core/marks.js"

// The type layer for shape fill, pinned to the CPU like every surface the engine reads back.
const layerCtx = typeof document !== "undefined" ? document.createElement("canvas").getContext("2d", { willReadFrequently: true }) : null

const raw = await readJson(new URL("./instrument.json", import.meta.url))
// The manifest with its effects' parameters merged in: the full list of controls.
export const manifest = withEffects(raw)
export const size = (patch) => formatSize(patch.params)
export const frameCount = (patch) => Math.max(1, Math.round(patch.params.duration * Number(patch.params.fps)))

const TAU = Math.PI * 2
const frac = (x) => x - Math.floor(x)

const isMark = (s) => /^@[a-z0-9-]+$/.test(s)

// Scramble: a word decodes from random characters, a letter at a time, over the first part of each
// beat. Each cell starts at its own moment (Spread); the characters change Flicker times a loop.
const SCRAMBLE = { letters: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", symbols: "#%&*+=?!/<>[]{}@$", binary: "01", blocks: "░▒▓█" }
export function scrambled(word, p, seed, c, t) {
  const phase = frac(p.scrambleBeats * t - hash(seed, c.s, c.k, 61) * p.scrambleSpread)
  const done = Math.floor(Math.min(1, phase / p.scramble) * (word.length + 1))
  if (done >= word.length) return word
  const set = SCRAMBLE[p.scrambleSet] ?? SCRAMBLE.letters, step = Math.floor(t * p.scrambleRate)
  let out = word.slice(0, done)
  for (let i = done; i < word.length; i++) out += word[i] === " " ? " " : set[Math.floor(hash(seed, c.i * 131 + i, step, 62) * set.length)]
  return out
}

export function slots(p) {
  const tx = p.case === "upper" ? (s) => s.toUpperCase() : p.case === "lower" ? (s) => s.toLowerCase() : (s) => s
  const lines = p.content.split("\n").map((l) => l.trim()).filter(Boolean)
  // Letters mode spells words a letter per cell; a mark line stays whole, one cell.
  const out = p.mode === "letters"
    ? lines.flatMap((l) => (isMark(l) ? [l] : [...tx(l).replace(/\s+/g, "")]))
    : lines.map((l) => (isMark(l) ? l : tx(l)))
  return out.length ? out : [" "]
}

// What the font loader needs to know: family, where from, which weights, which characters.
export function fontRequest(patch) {
  const p = patch.params
  const scramble = p.scramble > 0 ? SCRAMBLE[p.scrambleSet] ?? "" : ""
  return { source: p.fontSource, family: p.font, kit: p.adobeKit, weights: [p.weightMin, p.weightMax], sample: [...new Set(slots(p).filter((w) => !isMark(w)).join("") + scramble)].join("") }
}

function wave(p, phase, seed, s, k) {
  let v
  switch (p.wave) {
    case "saw": v = frac(phase); break
    case "steps": v = Math.round((0.5 - 0.5 * Math.cos(TAU * phase)) * 3) / 3; break
    case "noise": {
      // Three whole-number harmonics with seeded phases: irregular, but still loops.
      let sum = 0
      for (let h = 1, a = 1; h <= 3; h++, a *= 0.5) sum += a * Math.sin(TAU * (h * phase + hash(seed, s, k, h)))
      v = 0.5 + 0.5 * (sum / 1.75)
      break
    }
    default: v = 0.5 - 0.5 * Math.cos(TAU * phase)
  }
  return Math.pow(Math.min(1, Math.max(0, v)), p.ease)
}

export function layout(p, seed, t, W, H) {
  if (p.layout === "golden") return golden(p, seed, t, W, H)
  const vertical = p.direction === "vertical"
  const strips = vertical ? p.columns : p.rows
  const per = vertical ? p.rows : p.columns
  const cellOff = vertical ? p.rowOffset : p.columnOffset
  const stripOff = vertical ? p.columnOffset : p.rowOffset
  const m = Math.min(p.margin, W / 2 - 1, H / 2 - 1)
  const along = (vertical ? H : W) - 2 * m - p.gap * (per - 1)
  const across = (vertical ? W : H) - 2 * m - p.gap * (strips - 1)
  const base = p.cycles * t
  const floor = Math.max(0.015, 1 - p.amount)

  // Strip widths: equal, unless Strip breathing lets them swell too.
  const sw = []
  let sTotal = 0
  for (let s = 0; s < strips; s++) {
    const v = p.crossAmount > 0 ? wave(p, base + s * stripOff + 0.25, seed + 101, s, -1) : 1
    sTotal += sw[s] = 1 - p.crossAmount + p.crossAmount * (0.08 + 0.92 * v)
  }

  const cells = []
  let a = m
  for (let s = 0; s < strips; s++) {
    const breadth = (sw[s] / sTotal) * across
    const vs = [], ws = []
    let total = 0
    for (let k = 0; k < per; k++) {
      const v = wave(p, base + k * cellOff + s * stripOff, seed, s, k)
      vs.push(v)
      total += ws[k] = floor + (1 - floor) * v
    }
    let b = m
    for (let k = 0; k < per; k++) {
      const len = (ws[k] / total) * along
      // Reading order runs across the strips, so letters spell along each nominal row.
      const i = vertical ? k * strips + s : s * per + k
      cells.push(vertical
        ? { x: a, y: b, w: breadth, h: len, v: vs[k], s, k, i }
        : { x: b, y: a, w: len, h: breadth, v: vs[k], s, k, i })
      b += len + p.gap
    }
    a += breadth + p.gap
  }
  return cells
}

// The golden section: the frame cut into a spiral of golden rectangles. Each cut takes the long side
// at 1/φ, leaving a smaller golden rectangle to cut again, turning a quarter each time. The cuts
// breathe around φ with the wave, so the spiral swells and settles. Biggest block first.
const PHI_CUT = (Math.sqrt(5) - 1) / 2 // 0.618…: the square's share of the long side
const SIDES = ["left", "top", "right", "bottom"]

function golden(p, seed, t, W, H) {
  const m = Math.min(p.margin, W / 2 - 1, H / 2 - 1)
  let x = m, y = m, w = W - 2 * m, h = H - 2 * m
  const n = p.goldenDepth, turn = p.goldenTurn === "ccw" ? 3 : 1
  let side = SIDES.indexOf(p.goldenStart)
  const cells = []
  for (let k = 0; k < n; k++) {
    const v = wave(p, p.cycles * t + k * p.rowOffset, seed, 0, k)
    const cut = Math.min(0.92, Math.max(0.08, PHI_CUT + (v - 0.5) * p.goldenSwing))
    // Cut across the long side: skip round to the next side that does.
    const wide = w >= h
    while ((side % 2 === 0) !== wide) side = (side + turn) % 4
    const g = Math.min(p.gap, (wide ? w : h) / 4)
    let piece
    if (side === 0) { piece = { x, y, w: w * cut, h }; x += piece.w + g; w -= piece.w + g }
    else if (side === 2) { piece = { x: x + w - w * cut, y, w: w * cut, h }; w -= piece.w + g }
    else if (side === 1) { piece = { x, y, w, h: h * cut }; y += piece.h + g; h -= piece.h + g }
    else { piece = { x, y: y + h - h * cut, w, h: h * cut }; h -= piece.h + g }
    cells.push({ ...piece, v: 1 - k / n, s: 0, k, i: k })
    side = (side + turn) % 4
    if (w < 0.5 || h < 0.5) break
  }
  if (w >= 0.5 && h >= 0.5) cells.push({ x, y, w, h, v: 0, s: 0, k: n, i: n })
  return cells
}

const metricsCache = new Map()
function measure(ctx, font, word, fit) {
  const key = `${font}|${fit}|${word}`
  let m = metricsCache.get(key)
  if (m) return m
  ctx.font = font
  const tm = ctx.measureText(word)
  const left = tm.actualBoundingBoxLeft, right = tm.actualBoundingBoxRight
  let ascent = tm.actualBoundingBoxAscent, descent = tm.actualBoundingBoxDescent
  if (fit === "cap") { ascent = ctx.measureText("H").actualBoundingBoxAscent; descent = 0 }
  m = { left, ascent, w: left + right, h: ascent + descent }
  if (metricsCache.size > 4000) metricsCache.clear()
  metricsCache.set(key, m)
  return m
}
// Call after a font finishes loading: anything measured before then was measured in the fallback.
export const clearMetrics = () => metricsCache.clear()

// Draw the frame at time t. scale maps output pixels to canvas pixels (the preview is smaller
// than the export); frame picks the grain so preview and export boil alike. backdrop is an image,
// or a video already at the right moment, supplied by the caller (the engine never waits); marks is
// the Map from prepareMarks(), also loaded by the caller.
export function render(ctx, patch, t, { scale = 1, frame = 0, effects = true, backdrop = null, marks = null } = {}) {
  const { w: W, h: H } = size(patch)
  t = frac(t) // t = 1 is t = 0 exactly, not a float's width away
  const p = resolve(manifest, patch, t), seed = patch.seed
  const words = slots(p), N = words.length
  const inks = p.palette, P = inks.length
  const blocks = p.colourMode === "blocks"

  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  ctx.globalAlpha = 1
  if (p.transparent) ctx.clearRect(0, 0, W, H)
  else { ctx.fillStyle = p.background; ctx.fillRect(0, 0, W, H) }
  if (p.gradient !== "off") paintGradient(ctx, p, seed, t, W, H)
  if (backdrop && p.backdropOpacity > 0) drawBackdrop(ctx, backdrop, p, W, H)
  const cells = layout(p, seed, t, W, H)

  // Every cell's word or mark. keep(cell) can skip cells (shape fill's whole-cell modes).
  const drawCells = (ctx, keep) => {
    ctx.textAlign = "left"
    ctx.textBaseline = "alphabetic"
    for (const c of cells) {
      if (c.w < 0.25 || c.h < 0.25) continue
      if (keep && !keep(c)) continue
      let slot
      if (p.mode === "size") slot = Math.min(N - 1, Math.floor(c.v * N))
      else if (p.mode === "random") slot = Math.floor(hash(seed, c.s, c.k, 9) * N)
      else slot = c.i % N
      let word = words[slot]

      let ink
      switch (p.colourMode) {
        case "strip": ink = inks[c.s % P]; break
        case "cell": ink = inks[Math.floor(hash(seed + 1, c.s, c.k) * P)]; break
        case "mono": ink = inks[0]; break
        default: ink = inks[slot % P]
      }
      if (blocks) {
        ctx.setTransform(scale, 0, 0, scale, 0, 0)
        ctx.fillStyle = ink
        ctx.fillRect(c.x, c.y, c.w, c.h)
        ink = p.background
      }

      const mark = isMark(word) && marks?.get(word.slice(1))
      if (mark) {
        const px = c.w * p.padding, py = c.h * p.padding
        if (c.w - 2 * px > 0 && c.h - 2 * py > 0) drawMark(ctx, mark, c.x + px, c.y + py, c.w - 2 * px, c.h - 2 * py, ink, { fit: p.markFit, colour: p.markColour, scale })
        continue
      }

      if (p.scramble > 0) word = scrambled(word, p, seed, c, t)
      const weight = Math.round((p.weightMin + (p.weightMax - p.weightMin) * c.v) / 10) * 10
      const font = fontString(weight, 100, p.font)
      const m = measure(ctx, font, word, p.fit)
      if (m.w <= 0 || m.h <= 0) continue
      const px = c.w * p.padding, py = c.h * p.padding
      const cw = c.w - 2 * px, ch = c.h - 2 * py
      if (cw <= 0 || ch <= 0) continue
      let sx = cw / m.w, sy = ch / m.h
      let ox = c.x + px, oy = c.y + py
      // Editorial fit: the word keeps its proportions and sits in the cell by the alignment.
      if (p.fit === "contain") {
        const k = Math.min(sx, sy)
        if (p.align === "center") { ox += (cw - m.w * k) / 2; oy += (ch - m.h * k) / 2 }
        else if (p.align === "end") oy += ch - m.h * k
        sx = sy = k
      }

      const clip = p.fit === "cap"
      if (clip) {
        ctx.save()
        ctx.setTransform(scale, 0, 0, scale, 0, 0)
        ctx.beginPath()
        ctx.rect(c.x, c.y, c.w, c.h)
        ctx.clip()
      }
      ctx.font = font
      ctx.fillStyle = ink
      ctx.setTransform(scale * sx, 0, 0, scale * sy, scale * (ox + m.left * sx), scale * (oy + m.ascent * sy))
      ctx.fillText(word, 0, 0)
      if (clip) ctx.restore()
    }
  }

  const shape = p.shape && marks?.get(p.shape)
  if (!shape) {
    ctx.globalCompositeOperation = p.blend
    drawCells(ctx)
  } else {
    const cw = ctx.canvas.width, ch = ctx.canvas.height
    const cellsMode = p.shapeMode === "cells" || p.shapeMode === "around-cells"
    const outside = p.shapeMode === "around" || p.shapeMode === "around-cells"
    // The silhouette itself, faintly, behind the type.
    if (p.shapeGhost > 0) {
      const r = shapeRect(p, W, H)
      ctx.globalAlpha = p.shapeGhost
      drawMark(ctx, shape, r.x, r.y, r.w, r.h, inks[0], { fit: p.shapeFit, scale })
      ctx.globalAlpha = 1
    }
    const mask = shapeMask(shape, p, W, H, scale, cw, ch, cellsMode)
    const layer = layerCtx
    if (layer.canvas.width !== cw || layer.canvas.height !== ch) { layer.canvas.width = cw; layer.canvas.height = ch }
    layer.setTransform(1, 0, 0, 1, 0, 0)
    layer.globalCompositeOperation = "source-over"
    layer.clearRect(0, 0, cw, ch)
    drawCells(layer, cellsMode ? (c) => (coverage(mask, c, scale) >= 0.5) !== outside : null)
    if (!cellsMode) {
      layer.setTransform(1, 0, 0, 1, 0, 0)
      layer.globalCompositeOperation = outside ? "destination-out" : "destination-in"
      layer.drawImage(mask.canvas, 0, 0)
      layer.globalCompositeOperation = "source-over"
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalCompositeOperation = p.blend
    ctx.drawImage(layer.canvas, 0, 0)
  }

  ctx.globalCompositeOperation = "source-over"
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  if (effects) applyEffects(ctx, p, { t, frame, scale, seed, background: p.background, clear: p.transparent }, raw.effects)
}

function drawBackdrop(ctx, media, p, W, H) {
  const mw = media.videoWidth || media.naturalWidth || media.width, mh = media.videoHeight || media.naturalHeight || media.height
  if (!mw || !mh) return
  const k = (p.backdropFit === "contain" ? Math.min : Math.max)(W / mw, H / mh)
  ctx.globalAlpha = p.backdropOpacity
  ctx.drawImage(media, (W - mw * k) / 2, (H - mh * k) / 2, mw * k, mh * k)
  ctx.globalAlpha = 1
}

// Where in a backdrop video frame t falls: it plays from the start of each loop at its own speed.
export const videoTime = (patch, t, videoDuration) => ((frac(t) * patch.params.duration * patch.params.backdropSpeed) % videoDuration) || 0
