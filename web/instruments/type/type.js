// Type tester: the engine. Rows of type set like a specimen sheet: each row its own text, font,
// size (or as wide as its column), weight, tracking, leading, case and ink, stacked or in a grid,
// with a small label and a hairline rule. Motion moves every row on the same beat, each a little
// behind the one before (the stagger); everything is periodic, so the loop closes.
import { readJson } from "../../packages/core/read-json.js"
import { formatSize } from "../../packages/core/formats.js"
import { resolve } from "../../packages/core/keys.js"

export const manifest = await readJson(new URL("./instrument.json", import.meta.url))

const TAU = Math.PI * 2
const frac = (x) => x - Math.floor(x)
const LABEL_FONT = '"neue-haas-grotesk-text", "Helvetica Neue", Helvetica, Arial, sans-serif'

export const size = (patch) => formatSize(patch.params)
export const frameCount = (patch) => Math.max(1, Math.round(patch.params.duration * Number(patch.params.fps)))

// What the font loader needs for each row: the weights motion will reach, and the characters used.
export function fontRequests(patch) {
  const p = patch.params, swing = p.motion === "weight" ? Math.round(p.motionAmount * 400) : 0
  return p.rows.map((r) => ({
    source: r.fontSource, family: r.font, kit: p.adobeKit, italic: r.italic,
    weights: [...new Set([r.weight, Math.max(100, r.weight - swing), Math.min(1000, r.weight + swing)])],
    sample: [...new Set(cased(r.text, r.case))].join(""),
  }))
}

function cased(text, mode) {
  if (mode === "upper") return text.toUpperCase()
  if (mode === "lower") return text.toLowerCase()
  if (mode === "title") return text.toLowerCase().replace(/(^|[\s\-–—(“"'])(\p{L})/gu, (_, a, b) => a + b.toUpperCase())
  return text
}

const fontOf = (r, weight, px) => `${r.italic ? "italic " : ""}${weight} ${px}px "${r.font.replace(/"/g, "")}", sans-serif`

// Words into lines no wider than w. ctx already carries the row's font and tracking.
function wrap(ctx, text, w) {
  const out = []
  for (const para of text.split("\n")) {
    let line = ""
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word
      if (line && ctx.measureText(next).width > w) { out.push(line); line = word }
      else line = next
    }
    out.push(line)
  }
  return out
}

// One row: measured, and drawn if draw is true. Returns its height and how it's set, in output
// pixels. With hide, the label is drawn but the text isn't (it's being edited on the stage).
function row(ctx, r, i, p, t, x, y, w, labelPx, draw, hide = false) {
  const phase = frac(p.beats * t - i * p.stagger), s = Math.sin(TAU * phase), k = p.motion === "none" ? 0 : p.motionAmount
  let weight = r.weight, tracking = r.tracking, grow = 1
  if (p.motion === "weight") weight = Math.min(1000, Math.max(100, Math.round((r.weight + s * k * 400) / 10) * 10))
  if (p.motion === "tracking") tracking += s * k * 0.12
  if (p.motion === "size") grow = 1 + s * k * 0.25
  const text = cased(r.text, r.case)
  const marquee = p.motion === "marquee"

  // Size: as set, or whatever makes the widest line fill the column.
  let px = r.size
  if (r.fit === "width") {
    ctx.font = fontOf(r, weight, 100)
    ctx.letterSpacing = `${tracking * 100}px`
    const widest = Math.max(...text.split("\n").map((l) => ctx.measureText(l).width), 1)
    px = Math.max(4, (100 * w) / widest)
  }
  px *= grow
  ctx.font = fontOf(r, weight, px)
  ctx.letterSpacing = `${tracking * px}px`
  const lines = marquee ? [text.replace(/\s*\n\s*/g, "   ")] : r.fit === "width" ? text.split("\n") : wrap(ctx, text, w)
  const lineH = px * r.leading
  const label = p.labels ? labelPx * 1.9 : 0
  const height = label + lines.length * lineH
  const set = { h: height, px, weight, tracking, label }
  if (!draw) return set

  if (p.labels) {
    ctx.font = `400 ${labelPx}px ${LABEL_FONT}`
    ctx.letterSpacing = "0px"
    ctx.fillStyle = p.labelInk
    ctx.textAlign = p.align
    const lx = p.align === "center" ? x + w / 2 : p.align === "right" ? x + w : x
    ctx.fillText(`${r.font} · ${weight}${r.italic ? " italic" : ""} · ${Math.round(px)}px`, lx, y + labelPx)
    ctx.textAlign = "left"
    ctx.font = fontOf(r, weight, px)
    ctx.letterSpacing = `${tracking * px}px`
  }

  if (hide) return set
  const m = ctx.measureText("Hg")
  const asc = m.fontBoundingBoxAscent || px * 0.8, desc = m.fontBoundingBoxDescent || px * 0.2
  ctx.fillStyle = r.ink
  lines.forEach((line, n) => {
    const base = y + label + n * lineH + (lineH - asc - desc) / 2 + asc
    const lw = ctx.measureText(line).width
    let lx = p.align === "center" ? x + (w - lw) / 2 : p.align === "right" ? x + w - lw : x

    if (marquee) {
      // A ticker: the line repeats with a gap, sliding one whole repeat per beat; rows alternate direction.
      const span = lw + px * 1.5, dir = i % 2 ? -1 : 1
      ctx.save()
      ctx.beginPath(); ctx.rect(x, y + label, w, lineH); ctx.clip()
      const o = phase * span, start = dir > 0 ? x - o : x - span + o
      for (let sx = start - span; sx < x + w; sx += span) ctx.fillText(line, sx, base)
      ctx.restore()
      return
    }
    if (p.motion === "typewriter") {
      // Characters arrive over the first 70% of each beat, rows in turn; a caret leads them.
      const progress = Math.min(1, Math.max(0, frac(p.beats * t) * 1.45 - i * p.stagger))
      const before = lines.slice(0, n).reduce((a, l) => a + l.length, 0), total = lines.reduce((a, l) => a + l.length, 0)
      const cursor = Math.round(progress * total), shown = Math.max(0, Math.min(line.length, cursor - before))
      const part = line.slice(0, shown)
      ctx.fillText(part, lx, base)
      const here = cursor >= before && (cursor < before + line.length || n === lines.length - 1)
      if (here && progress < 1) ctx.fillRect(lx + ctx.measureText(part).width + px * 0.04, base - asc * 0.8, Math.max(1, px * 0.06), asc * 0.95)
      return
    }
    if (p.motion === "wave") {
      // Each letter rides a wave that travels along the line.
      let cx = lx
      ;[...line].forEach((ch, c) => {
        ctx.fillText(ch, cx, base + Math.sin(TAU * (phase + c * 0.045)) * k * px * 0.18)
        cx += ctx.measureText(ch).width
      })
      return
    }
    ctx.fillText(line, lx, base)
  })
  return set
}

// Where every row goes: measured first, so the block can sit at the top, middle or bottom of
// the page. Each row gets its box and how it's set at time t.
function place(ctx, patch, t) {
  const { w: W, h: H } = size(patch)
  const p = resolve(manifest, patch, frac(t))
  const m = Math.min(p.margin, W / 2 - 1, H / 2 - 1)
  const inner = W - 2 * m
  const labelPx = Math.max(11, Math.round(Math.min(W, H) * 0.015))
  const cols = p.layout === "grid" ? Math.max(1, p.columns) : 1
  const cw = (inner - p.gap * (cols - 1)) / cols
  ctx.save()
  ctx.fontKerning = "normal"
  const bands = []
  for (let i = 0; i < p.rows.length; i += cols) {
    const sets = p.rows.slice(i, i + cols).map((r, c) => row(ctx, r, i + c, p, frac(t), 0, 0, cw, labelPx, false))
    bands.push({ start: i, sets, h: Math.max(...sets.map((s) => s.h)) })
  }
  ctx.restore()
  const total = bands.reduce((a, b) => a + b.h, 0) + p.gap * Math.max(0, bands.length - 1)
  let y = p.valign === "center" ? (H - total) / 2 : p.valign === "bottom" ? H - m - total : m
  const boxes = []
  for (const band of bands) {
    band.y = y
    band.sets.forEach((s, c) => boxes.push({ i: band.start + c, x: m + c * (cw + p.gap), y, w: cw, ...s }))
    y += band.h + p.gap
  }
  return { p, W, H, m, inner, cw, labelPx, bands, boxes }
}

// Each row's box on the page, in output pixels, with its size, weight and tracking at time t:
// what the stage needs to put an editor over a row.
export const rowBoxes = (ctx, patch, t) => place(ctx, patch, t).boxes

export function render(ctx, patch, t, { scale = 1, editing = -1 } = {}) {
  t = frac(t)
  const { p, W, H, m, inner, cw, labelPx, bands } = place(ctx, patch, t)
  ctx.save()
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  ctx.fillStyle = p.background
  ctx.fillRect(0, 0, W, H)
  ctx.textBaseline = "alphabetic"
  ctx.textAlign = "left"
  ctx.fontKerning = "normal"
  bands.forEach((band, b) => {
    if (b > 0 && p.rules) {
      ctx.fillStyle = p.labelInk
      ctx.globalAlpha = 0.45
      ctx.fillRect(m, band.y - p.gap / 2, inner, Math.max(1 / scale, 1))
      ctx.globalAlpha = 1
    }
    band.sets.forEach((_, c) => {
      const i = band.start + c
      row(ctx, p.rows[i], i, p, t, m + c * (cw + p.gap), band.y, cw, labelPx, true, i === editing)
    })
  })
  ctx.restore()
}
