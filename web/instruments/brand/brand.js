// Brand bench: the engine. A brand on one board: the logo on paper, the logo reversed out of
// each ink, the palette with its codes, and the faces set in their roles. Or one of those alone:
// "the logo alone" is how a logo gets animated. The logo moves (breathes, floats, flips, runs
// through the inks) and the effects apply to it wherever it's drawn, never to the rest of the
// board. Everything moving is periodic, so the loop closes.
import { readJson } from "../../packages/core/read-json.js"
import { formatSize } from "../../packages/core/formats.js"
import { resolve } from "../../packages/core/keys.js"
import { withEffects, applyEffects, effectById } from "../../packages/core/effects/index.js"
import { drawMark } from "../../packages/core/marks.js"
import { mix, mixHue, inkOn, rgbText, oklchText } from "../../packages/core/colour.js"

const raw = await readJson(new URL("./instrument.json", import.meta.url))
export const manifest = withEffects(raw)

const TAU = Math.PI * 2
const frac = (x) => x - Math.floor(x)
const LABEL_FONT = '"neue-haas-grotesk-text", "Helvetica Neue", Helvetica, Arial, sans-serif'
const DARK = "#121211", WHITE = "#FFFFFF"
const BODY = "The quick brown fox jumps over the lazy dog. Every brand is a handful of decisions, made once and kept: these are this one's."

export const size = (patch) => formatSize(patch.params)
export const frameCount = (patch) => Math.max(1, Math.round(patch.params.duration * Number(patch.params.fps)))

// ---- type ----

// The face for a role, or the nearest thing to it: a body face stands in for a caption.
export function face(p, role) {
  const by = (r) => p.faces.find((f) => f.role === r)
  const order = { headline: ["headline", "subhead", "accent"], subhead: ["subhead", "headline"], body: ["body", "caption", "subhead"], caption: ["caption", "body"], accent: ["accent", "headline"] }[role] ?? [role]
  return order.map(by).find(Boolean) ?? p.faces[0]
}
// A family's name for people: Adobe's CSS names ("neue-haas-grotesk-display") become words.
export const displayName = (family = "") => (/^[a-z0-9-]+$/.test(family) ? family.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ") : family)
const css = (f, px) => `${f.weight} ${px}px "${(f?.font ?? "sans-serif").replace(/"/g, "")}", sans-serif`

// What the font loader needs: each face, at its weight, with the characters the board sets.
export function fontRequests(patch) {
  const p = patch.params, sample = [...new Set(`${p.brandName}${p.tagline}${BODY}Aa0123456789`)].join("")
  return p.faces.map((f) => ({ source: f.fontSource, family: f.font, kit: p.adobeKit, weights: [f.weight], sample }))
}

function wrap(ctx, text, w) {
  const out = []
  let line = ""
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word
    if (line && ctx.measureText(next).width > w) { out.push(line); line = word } else line = next
  }
  if (line) out.push(line)
  return out
}

// Text no wider than max: the size comes down until it fits.
function fitText(ctx, text, x, y, px, max, colour, font) {
  ctx.font = font(px)
  const w = ctx.measureText(text).width
  if (w > max) ctx.font = font((px * max) / w)
  ctx.fillStyle = colour
  ctx.fillText(text, x, y)
}

// A small grey label at the top of a panel.
function caption(ctx, text, x, y, u, colour) {
  ctx.font = `400 ${14 * u}px ${LABEL_FONT}`
  ctx.letterSpacing = "0px"
  ctx.fillStyle = colour
  ctx.fillText(text, x, y + 14 * u)
}

function rect(ctx, x, y, w, h, r, fill) {
  r = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  if (r > 0) ctx.roundRect(x, y, w, h, r)
  else ctx.rect(x, y, w, h)
  ctx.fillStyle = fill
  ctx.fill()
}

// ---- the logo ----

// The logo's box inside a panel: as large as Logo size allows, keeping its proportions.
function logoBox(mark, x, y, w, h, k) {
  const b = mark ? mark.bounds : { w: 3, h: 1 }
  const s = Math.min((w * k) / b.w, (h * k) / b.h)
  return { x: x + (w - b.w * s) / 2, y: y + (h - b.h * s) / 2, w: b.w * s, h: b.h * s }
}

// Draws the logo (or, without one, the name in the headline face) moving as the patch says.
function logo(ctx, p, t, mark, panel, ink, scale) {
  const wave = Math.sin(TAU * p.beats * t), k = p.motion === "still" ? 0 : p.amount
  let { x, y, w, h } = logoBox(mark, panel.x, panel.y, panel.w, panel.h, p.logoSize)
  let colour = p.logoColour === "original" ? "original" : "ink"
  if (p.motion === "breathe") { const s = 1 + wave * k * 0.12; x -= (w * (s - 1)) / 2; y -= (h * (s - 1)) / 2; w *= s; h *= s }
  if (p.motion === "float") y += wave * k * panel.h * 0.06
  if (p.motion === "flip") {
    // A coin turning over: the width follows the cosine, and the back shows the second ink.
    const c = Math.cos(TAU * p.beats * t), s = Math.max(0.02, Math.abs(c)) ** (0.6 + k)
    x += (w * (1 - s)) / 2; w *= s
    if (c < 0 && p.inks[1]) { ink = p.inks[1]; colour = "ink" }
  }
  if (p.motion === "inks" && p.inks.length) {
    const f = frac(p.beats * t) * p.inks.length, i = Math.floor(f), e = Math.min(1, Math.max(0, (f - i - (1 - k)) / Math.max(0.05, k)))
    ink = mixHue(p.inks[i % p.inks.length], p.inks[(i + 1) % p.inks.length], e * e * (3 - 2 * e))
    colour = "ink"
  }
  if (mark) { drawMark(ctx, mark, x, y, w, h, ink, { fit: "stretch", colour, scale }); ctx.setTransform(scale, 0, 0, scale, 0, 0); return }
  const head = face(p, "headline")
  ctx.letterSpacing = `${(head?.tracking ?? 0) * h}px`
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  fitText(ctx, p.brandName, x + w / 2, y + h / 2, h * 0.6, w, ink, (px) => css(head, px))
  ctx.textAlign = "left"
  ctx.textBaseline = "alphabetic"
  ctx.letterSpacing = "0px"
}

// The logo panel with the effects applied to it alone: drawn on a canvas of its own, put through
// the effects, then laid onto the board.
const scratch = typeof document !== "undefined" ? document.createElement("canvas") : null
function logoPanel(ctx, p, t, env, mark, panel, ground, ink) {
  const { scale } = env
  if (!raw.effects.some((id) => effectById(id).active(p)) || !scratch) {
    ctx.save()
    if (ground) rect(ctx, panel.x, panel.y, panel.w, panel.h, panel.r, ground)
    ctx.beginPath(); ctx.roundRect(panel.x, panel.y, panel.w, panel.h, Math.min(panel.r, panel.w / 2, panel.h / 2)); ctx.clip()
    logo(ctx, p, t, mark, panel, ink, scale)
    ctx.restore()
    return
  }
  const W = Math.max(1, Math.round(panel.w * scale)), H = Math.max(1, Math.round(panel.h * scale))
  scratch.width = W; scratch.height = H
  const s = scratch.getContext("2d", { willReadFrequently: true })
  s.setTransform(1, 0, 0, 1, 0, 0)
  s.clearRect(0, 0, W, H)
  if (ground) { s.fillStyle = ground; s.fillRect(0, 0, W, H) }
  s.setTransform(scale, 0, 0, scale, 0, 0)
  logo(s, p, t, mark, { ...panel, x: 0, y: 0 }, ink, scale)
  s.setTransform(1, 0, 0, 1, 0, 0)
  applyEffects(s, p, { ...env, background: ground || p.background }, raw.effects)
  ctx.save()
  ctx.beginPath(); ctx.roundRect(panel.x, panel.y, panel.w, panel.h, Math.min(panel.r, panel.w / 2, panel.h / 2)); ctx.clip()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.drawImage(scratch, Math.round(panel.x * scale), Math.round(panel.y * scale))
  ctx.restore()
}

// ---- panels ----

function palette(ctx, p, box, u) {
  const n = p.inks.length, gap = Math.min(p.gap, box.w / n / 4), w = (box.w - gap * (n - 1)) / n
  p.inks.forEach((hex, i) => {
    const x = box.x + i * (w + gap)
    rect(ctx, x, box.y, w, box.h, p.corner * 0.6, hex)
    if (p.labels === "off") return
    const ink = inkOn(hex), pad = Math.min(20 * u, w * 0.12), px = Math.min(22 * u, w * 0.13)
    const lines = p.labels === "full" ? [hex, `RGB ${rgbText(hex)}`, `OKLCH ${oklchText(hex)}`] : [hex]
    lines.forEach((line, j) => {
      const size = j ? px * 0.66 : px, y = box.y + box.h - pad - (lines.length - 1 - j) * px * 1.15
      fitText(ctx, line, x + pad, y, size, w - 2 * pad, ink, (s) => `${j ? 400 : 500} ${s}px ${LABEL_FONT}`)
    })
  })
}

function typePanel(ctx, p, box, u, ink, sub) {
  const head = face(p, "headline"), body = face(p, "body"), pad = 28 * u
  const inner = { x: box.x + pad, y: box.y + pad + 22 * u, w: box.w - 2 * pad, h: box.h - 2 * pad - 22 * u }
  caption(ctx, "Type", box.x + pad, box.y + pad - 4 * u, u, sub)
  // "Aa" in the headline face, with its name beside it.
  const aa = Math.min(inner.h * 0.42, inner.w * 0.3)
  ctx.letterSpacing = `${(head?.tracking ?? 0) * aa}px`
  ctx.font = css(head, aa); ctx.fillStyle = ink
  ctx.fillText("Aa", inner.x, inner.y + aa * 0.8)
  const aw = ctx.measureText("Aa").width
  ctx.letterSpacing = "0px"
  const tx = inner.x + aw + 24 * u, tw = inner.x + inner.w - tx
  fitText(ctx, displayName(head?.font), tx, inner.y + 24 * u, 22 * u, tw, ink, (s) => `500 ${s}px ${LABEL_FONT}`)
  fitText(ctx, `Headline · ${head?.weight}`, tx, inner.y + 48 * u, 14 * u, tw, sub, (s) => `400 ${s}px ${LABEL_FONT}`)
  if (body && body !== head) {
    fitText(ctx, displayName(body.font), tx, inner.y + 80 * u, 22 * u, tw, ink, (s) => `500 ${s}px ${LABEL_FONT}`)
    fitText(ctx, `Body · ${body.weight}`, tx, inner.y + 104 * u, 14 * u, tw, sub, (s) => `400 ${s}px ${LABEL_FONT}`)
  }
  // The line in the headline face, then a paragraph in the body face, in what room is left.
  let y = inner.y + aa * 1.05
  const hpx = Math.min(inner.w / 12, (inner.y + inner.h - y) / 4)
  ctx.font = css(head, hpx); ctx.letterSpacing = `${(head?.tracking ?? 0) * hpx}px`; ctx.fillStyle = ink
  for (const line of wrap(ctx, p.tagline || p.brandName, inner.w).slice(0, 2)) { y += hpx * 1.1; ctx.fillText(line, inner.x, y) }
  ctx.letterSpacing = "0px"
  const bpx = Math.max(10 * u, Math.min(18 * u, hpx * 0.42))
  ctx.font = css(body ?? head, bpx); ctx.fillStyle = sub
  y += bpx * 1.2
  for (const line of wrap(ctx, BODY, inner.w)) { y += bpx * 1.45; if (y > inner.y + inner.h) break; ctx.fillText(line, inner.x, y) }
}

// ---- the board ----

export function render(ctx, patch, t, { scale = 1, frame = 0, marks = null } = {}) {
  const { w: W, h: H } = size(patch)
  t = frac(t)
  const p = resolve(manifest, patch, t)
  const mark = marks?.get(p.logo) ?? null
  const env = { t, frame, scale, seed: patch.seed }
  const u = Math.min(W, H) / 1080, light = inkOn(p.background) === DARK
  const ink = light ? DARK : WHITE, sub = mix(p.background, ink, 0.55)
  const logoInk = p.logoColour === "ink" ? p.inks[0] : inkOn(p.background)
  ctx.save()
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  ctx.textBaseline = "alphabetic"
  const m = Math.min(p.margin, W / 2 - 1, H / 2 - 1), g = p.gap, r = p.corner
  const box = { x: m, y: m, w: W - 2 * m, h: H - 2 * m }

  if (p.board === "logo") {
    if (!p.transparent) { ctx.fillStyle = p.background; ctx.fillRect(0, 0, W, H) }
    logoPanel(ctx, p, t, env, mark, { x: 0, y: 0, w: W, h: H, r: 0 }, p.transparent ? null : p.background, logoInk)
    ctx.restore()
    return
  }

  // The board is a shade off the paper, so panels of true paper stand out from it.
  ctx.fillStyle = mix(p.background, light ? DARK : WHITE, 0.05)
  ctx.fillRect(0, 0, W, H)
  if (p.board === "palette") { palette(ctx, p, box, u); ctx.restore(); return }
  if (p.board === "type") { rect(ctx, box.x, box.y, box.w, box.h, r, p.background); typePanel(ctx, p, box, u * 1.6, ink, sub); ctx.restore(); return }

  // The whole board: logo and its reversals above, palette and type below.
  const left = (box.w - g) * 0.6, right = box.w - g - left, top = (box.h - g) * 0.6, bottom = box.h - g - top
  const hero = { x: box.x, y: box.y, w: left, h: top, r }
  rect(ctx, hero.x, hero.y, hero.w, hero.h, r, p.background)
  logoPanel(ctx, p, t, env, mark, hero, p.background, logoInk)
  caption(ctx, p.brandName, hero.x + 28 * u, hero.y + 24 * u, u, sub)

  // The logo reversed out of the first four inks, in whichever of black or white reads.
  const tiles = p.inks.slice(0, 4), cols = 2, rows = Math.ceil(tiles.length / cols)
  const tw = (right - g * (cols - 1)) / cols, th = (top - g * (rows - 1)) / rows
  tiles.forEach((hex, i) => {
    const tile = { x: box.x + left + g + (i % cols) * (tw + g), y: box.y + Math.floor(i / cols) * (th + g), w: tw, h: th, r: r * 0.8 }
    logoPanel(ctx, { ...p, logoColour: "ink", logoSize: Math.min(0.7, p.logoSize * 1.15), motion: p.motion === "inks" ? "still" : p.motion }, t, env, mark, tile, hex, inkOn(hex))
  })

  palette(ctx, p, { x: box.x, y: box.y + top + g, w: left, h: bottom }, u)
  const typeBox = { x: box.x + left + g, y: box.y + top + g, w: right, h: bottom }
  rect(ctx, typeBox.x, typeBox.y, typeBox.w, typeBox.h, r, p.background)
  typePanel(ctx, p, typeBox, u, ink, sub)
  ctx.restore()
}
