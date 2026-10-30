// Carousel creator: the engine. Your words become slides: one paragraph a slide, read for what it
// is (cover, statement, list, quote, big word, image, closing card), then set by a layout system.
// Each system is a small art director with its own rules for type, space and ornament; your fonts,
// colours and images go through it. A slide's motion runs in and out within its loop, so a loop
// closes; the whole carousel can also play as one sequence.
//
//   render(ctx, patch, t, { scale, images })    images: [{ el, w, h }], loaded by the app
//   slides(patch)                               the parsed slides, for thumbnails and exports
//   draw(ctx, patch, index, t, opts)            one slide at its own time t, whatever the view
import { readJson } from "../../packages/core/read-json.js"
import { resolve } from "../../packages/core/keys.js"
import { hash } from "../../packages/core/rng.js"

export const manifest = await readJson(new URL("./instrument.json", import.meta.url))

const TAU = Math.PI * 2
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const frac = (x) => x - Math.floor(x)
const ease = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x) }
const mix = (a, b, k) => "#" + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - k) + parseInt(b.slice(i, i + 2), 16) * k).toString(16).padStart(2, "0")).join("")

export const PLATFORMS = {
  instagram: [1080, 1350], instagram34: [1080, 1440], square: [1080, 1080], linkedin: [1080, 1350],
  tiktok: [1080, 1920], threads: [1080, 1350], substack: [1456, 1048],
}
const even = (n) => Math.max(2, Math.round(n / 2) * 2)
export function size(patch) {
  const p = patch.params
  if (p.platform === "custom") return { w: even(p.width), h: even(p.height) }
  const [w, h] = PLATFORMS[p.platform] ?? PLATFORMS.instagram
  return { w, h }
}
export const frameCount = (patch) => Math.max(1, Math.round(patch.params.duration * Number(patch.params.fps)))

const quote = (f) => `"${String(f).replace(/"/g, "")}"`
export const fontRequests = (patch) => {
  const p = patch.params, sample = [...new Set(p.text + p.kicker + p.footer + "0123456789/")].join("")
  return [
    { source: p.displaySource, family: p.display, kit: p.adobeKit, weights: [p.displayWeight], italic: true, sample },
    { source: p.bodySource, family: p.body, kit: p.adobeKit, weights: [p.bodyWeight, 600], italic: true, sample },
  ]
}

// ---- reading the words ----
// Paragraphs (blank-line separated) become slides. A paragraph can start with #cover, #big,
// #list, #quote, #statement, #image or #end to say what it is; otherwise it's read from its shape.
export function slides(patch) {
  const blocks = patch.params.text.replace(/\r/g, "").split(/\n\s*\n/).map((b) => b.split("\n").map((l) => l.trim()).filter(Boolean)).filter((b) => b.length)
  let image = 0
  return blocks.map((lines, i) => {
    let kind = null
    const tag = lines[0].match(/^#(cover|big|list|quote|statement|image|end)\b\s*(.*)$/i)
    if (tag) { kind = tag[1].toLowerCase(); lines = tag[2] ? [tag[2], ...lines.slice(1)] : lines.slice(1) }
    const listy = lines.length > 1 && lines.every((l) => /^([-•*]|\d+[.)])\s+/.test(l))
    if (!kind) {
      if (/^\[image( \d+)?\]/i.test(lines[0])) kind = "image"
      else if (i === 0) kind = "cover"
      else if (/^(->|→)/.test(lines[0])) kind = "end"
      else if (lines[0].startsWith(">")) kind = "quote"
      else if (listy) kind = "list"
      else if (lines.length === 1 && lines[0].split(/\s+/).length <= 3) kind = "big"
      else kind = "statement"
    }
    const slide = { kind, lines }
    if (kind === "image") {
      const m = lines[0]?.match(/^\[image(?: (\d+))?\]\s*(.*)$/i)
      slide.image = m?.[1] ? +m[1] - 1 : image++
      slide.lines = [m?.[2], ...lines.slice(1)].filter(Boolean)
    }
    if (kind === "list") slide.lines = lines.map((l) => l.replace(/^([-•*]|\d+[.)])\s+/, ""))
    if (kind === "quote") slide.lines = lines.map((l) => l.replace(/^>\s*/, ""))
    if (kind === "end") slide.lines = lines.map((l) => l.replace(/^(->|→)\s*/, ""))
    return slide
  })
}

// ---- type ----
// "*x*" marks emphasis. Words keep their emphasis as they wrap.
function words(text, transform) {
  const out = []
  for (const part of text.split(/(\*[^*]+\*)/)) {
    if (!part) continue
    const em = part.length > 2 && part.startsWith("*") && part.endsWith("*")
    const body = transform(em ? part.slice(1, -1) : part)
    for (const w of body.split(/(\s+)/)) if (w && !/^\s+$/.test(w)) out.push({ text: w, em, join: false })
  }
  return out
}
// Break words into lines no wider than max at size px.
function wrap(g, ws, font, px, max) {
  const lines = [[]]
  let width = 0
  const space = (() => { g.font = font(false, px); return g.measureText(" ").width })()
  for (const w of ws) {
    g.font = font(w.em, px)
    const ww = g.measureText(w.text).width
    const line = lines.at(-1)
    if (line.length && width + space + ww > max) { lines.push([]); width = 0 }
    const l = lines.at(-1)
    width += (l.length ? space : 0) + ww
    l.push({ ...w, w: ww })
  }
  return lines.map((l) => ({ words: l, w: l.reduce((s, w, k) => s + w.w + (k ? space : 0), 0), space }))
}
// The largest size (up to most) at which the words fit the box.
function fit(g, ws, font, box, lead, most, least = 8) {
  let lo = least, hi = most, best = null
  for (let k = 0; k < 18; k++) {
    const px = (lo + hi) / 2, lines = wrap(g, ws, font, px, box.w)
    const ok = lines.length * px * lead <= box.h && lines.every((l) => l.w <= box.w + 0.5)
    if (ok) { lo = px; best = { px, lines } } else hi = px
  }
  return best ?? { px: least, lines: wrap(g, ws, font, least, box.w) }
}
// Set lines from y (their first baseline sits one cap below y). Returns the y under the last line.
function set(g, S, { lines, px }, x, y, w, { font, lead = 1.1, align = "left", ink, emInk = ink, k = 0, by = 1 }) {
  lines.forEach((line, i) => {
    const a = S.anim(k + i * by)
    if (a.alpha <= 0) return
    let cx = align === "center" ? x + (w - line.w) / 2 : align === "right" ? x + w - line.w : x
    const base = y + px * 0.8 + i * px * lead + a.dy
    g.globalAlpha = a.alpha
    let shown = a.chars
    for (const word of line.words) {
      g.font = font(word.em, px)
      g.fillStyle = word.em ? emInk : ink
      let t = word.text
      if (shown !== Infinity) { if (shown <= 0) break; t = t.slice(0, shown); shown -= word.text.length + 1 }
      g.fillText(t, cx, base)
      cx += word.w + line.space
    }
  })
  g.globalAlpha = 1
  return y + lines.length * px * lead
}

// ---- texture ----
let grainCache = null
function grainTile() {
  if (grainCache) return grainCache
  const n = 256, c = Object.assign(document.createElement("canvas"), { width: n, height: n }), x = c.getContext("2d")
  const img = x.createImageData(n, n)
  for (let i = 0; i < n * n; i++) { const v = Math.round(hash(i, 7) * 255); img.data.set([v, v, v, 255], i * 4) }
  x.putImageData(img, 0, 0)
  return (grainCache = c)
}
function texture(g, S) {
  const { p, W, H, u } = S
  if (p.texture === "none" || p.textureAmount <= 0) return
  g.save()
  if (p.texture === "riso") {
    const step = 9 * u
    g.globalAlpha = 0.18 * p.textureAmount
    g.fillStyle = p.ink
    for (let y = 0; y < H + step; y += step) for (let x = (y / step) % 2 ? step / 2 : 0; x < W + step; x += step) { g.beginPath(); g.arc(x, y, step * 0.18, 0, TAU); g.fill() }
  } else {
    const tile = grainTile(), pat = g.createPattern(tile, "repeat"), k = p.texture === "paper" ? 3 * u : 1.2 * u
    pat.setTransform(new DOMMatrix().scale(k, k))
    g.globalCompositeOperation = "soft-light"
    g.globalAlpha = (p.texture === "paper" ? 0.55 : 0.35) * p.textureAmount
    g.fillStyle = pat
    g.fillRect(0, 0, W, H)
    if (p.texture === "paper") {
      // A little unevenness across the sheet, as paper has.
      const grad = g.createRadialGradient(W * 0.3, H * 0.2, 0, W * 0.5, H * 0.5, Math.max(W, H) * 0.8)
      grad.addColorStop(0, "rgba(255,255,255,0.5)"); grad.addColorStop(1, "rgba(0,0,0,0.35)")
      g.globalAlpha = 0.3 * p.textureAmount
      g.fillStyle = grad
      g.fillRect(0, 0, W, H)
    }
  }
  g.restore()
}

// An image covering a box, optionally as a black-and-white print.
function picture(g, img, x, y, w, h, { mono = false, radius = 0, arch = false } = {}) {
  g.save()
  g.beginPath()
  if (arch) { g.moveTo(x, y + h); g.lineTo(x, y + w / 2); g.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0); g.lineTo(x + w, y + h); g.closePath() }
  else g.roundRect(x, y, w, h, radius)
  g.clip()
  if (!img) { g.fillStyle = "rgba(127,127,127,0.25)"; g.fillRect(x, y, w, h) }
  else {
    const k = Math.max(w / img.w, h / img.h), dw = img.w * k, dh = img.h * k
    if (mono) g.filter = "grayscale(1) contrast(1.25)"
    g.drawImage(img.el, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
    g.filter = "none"
  }
  g.restore()
}

// ---- the frame every system shares: series line, signature, slide number ----
function frame(g, S, { color, font, align = "center", top, bottom }) {
  const { p, W, H, u, i, n } = S
  const px = 20 * u * p.density
  g.save()
  g.fillStyle = color
  g.font = font(px)
  g.letterSpacing = `${px * 0.16}px`
  g.textBaseline = "alphabetic"
  const tx = align === "center" ? W / 2 : S.m
  g.textAlign = align === "center" ? "center" : "left"
  if (p.kicker) g.fillText(p.kicker.toUpperCase(), tx, top ?? S.m * 0.7 + px)
  if (p.footer) g.fillText(p.footer.toUpperCase(), tx, bottom ?? H - S.m * 0.7)
  if (p.numbers && n > 1) { g.textAlign = "right"; g.fillText(`${String(i + 1).padStart(2, "0")} / ${String(n).padStart(2, "0")}`, W - S.m, bottom ?? H - S.m * 0.7) }
  g.restore()
}

// Thin diagrams for statement slides, a different one by slide: what editorial carousels use to
// make an idea visible without a picture.
function diagram(g, S, cx, cy, r, ink) {
  const kind = (S.i + Math.floor(S.i / 4)) % 4, t = S.t
  g.save()
  g.strokeStyle = ink; g.fillStyle = ink; g.lineWidth = Math.max(1, 1.6 * S.u)
  const a = S.anim(6).alpha
  g.globalAlpha = a
  if (kind === 0) { for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(cx, cy, r * (0.3 + k * 0.23), 0, TAU); g.stroke() } g.beginPath(); g.arc(cx + r * 0.95 * Math.cos(TAU * t), cy + r * 0.95 * Math.sin(TAU * t), 5 * S.u, 0, TAU); g.fill() }
  if (kind === 1) { for (let k = 0; k < 7; k++) { const x = cx - r + (k * 2 * r) / 6; g.beginPath(); g.arc(x, cy, 9 * S.u, 0, TAU); k === 3 ? g.fill() : g.stroke() } g.beginPath(); g.moveTo(cx - r, cy + 40 * S.u); g.lineTo(cx + r, cy + 40 * S.u); g.stroke() }
  if (kind === 2) { g.beginPath(); g.arc(cx - r * 0.35, cy, r * 0.5, 0, TAU); g.stroke(); g.beginPath(); g.arc(cx + r * 0.35, cy, r * 0.5, 0, TAU); g.stroke() }
  if (kind === 3) { g.beginPath(); g.moveTo(cx - r, cy + r * 0.5); g.bezierCurveTo(cx, cy + r * 0.5, cx, cy - r * 0.5, cx + r, cy - r * 0.5); g.stroke(); g.beginPath(); g.moveTo(cx - r, cy + r * 0.6); g.lineTo(cx + r, cy + r * 0.6); g.stroke() }
  g.restore()
}

// ---- the systems ----
const SYSTEMS = {
  editorial(g, S) {
    const { p, W, H, u, slide } = S, m = S.m
    frame(g, S, { color: p.ink, font: (px) => `600 ${px}px ${quote(p.body)}, sans-serif` })
    const box = { w: W - 2 * m, h: H - 2 * m - 120 * u }
    const disp = (em, px) => `${em ? "italic " : ""}${p.displayWeight} ${px}px ${quote(p.display)}, serif`
    const text = (em, px) => `${em ? "italic " : ""}${p.bodyWeight} ${px}px ${quote(p.body)}, sans-serif`
    const d = p.density
    if (slide.kind === "cover" || slide.kind === "big" || slide.kind === "end") {
      const [head, ...rest] = slide.lines
      const f = fit(g, words(head, (s) => s), disp, { w: box.w, h: box.h * (rest.length ? 0.6 : 0.75) }, 1.0, (slide.kind === "end" ? 110 : 190) * u * d)
      const sub = rest.length ? fit(g, words(rest.join(" "), (s) => s), text, { w: box.w * 0.8, h: 160 * u }, 1.3, 30 * u * d) : null
      const total = f.lines.length * f.px + (sub ? 40 * u + sub.lines.length * sub.px * 1.3 : 0)
      let y = (H - total) / 2
      y = set(g, S, f, m, y, box.w, { font: disp, lead: 1.0, align: "center", ink: p.ink })
      if (sub) set(g, S, sub, m + box.w * 0.1, y + 40 * u, box.w * 0.8, { font: text, lead: 1.3, align: "center", ink: p.ink, k: 3 })
    } else if (slide.kind === "list") {
      const rows = slide.lines, rowH = Math.min(140 * u * d, (H - 2 * m - 160 * u) / rows.length)
      let y = (H - rows.length * rowH) / 2
      rows.forEach((r, k) => {
        const a = S.anim(k)
        g.globalAlpha = a.alpha
        g.strokeStyle = p.ink; g.lineWidth = Math.max(1, 1.2 * u)
        g.beginPath(); g.moveTo(m, y + a.dy); g.lineTo(W - m, y + a.dy); g.stroke()
        g.fillStyle = p.accent; g.font = disp(false, rowH * 0.42)
        g.fillText(String(k + 1).padStart(2, "0"), m, y + rowH * 0.62 + a.dy)
        g.globalAlpha = 1
        const f = fit(g, words(r, (s) => s), disp, { w: box.w - 150 * u, h: rowH * 0.7 }, 1.05, rowH * 0.5)
        set(g, S, f, m + 150 * u, y + (rowH - f.lines.length * f.px * 1.05) / 2, box.w - 150 * u, { font: disp, lead: 1.05, ink: p.ink, k })
        y += rowH
      })
    } else if (slide.kind === "quote") {
      const f = fit(g, words(slide.lines.join(" "), (s) => s), (em, px) => disp(true, px), { w: box.w * 0.9, h: box.h * 0.7 }, 1.1, 96 * u * d)
      g.fillStyle = p.accent; g.font = disp(true, 220 * u); g.textAlign = "center"; g.globalAlpha = S.anim(0).alpha
      g.fillText("“", W / 2, (H - f.lines.length * f.px * 1.1) / 2 - 20 * u); g.textAlign = "left"; g.globalAlpha = 1
      set(g, S, f, m + box.w * 0.05, (H - f.lines.length * f.px * 1.1) / 2 + 30 * u, box.w * 0.9, { font: (em, px) => disp(true, px), lead: 1.1, align: "center", ink: p.ink, k: 1 })
    } else if (slide.kind === "image") {
      const ih = H * 0.56
      g.globalAlpha = S.anim(0).alpha
      picture(g, S.images[slide.image % Math.max(1, S.images.length)], m, m + 70 * u, W - 2 * m, ih, { mono: true })
      g.globalAlpha = 1
      if (slide.lines.length) set(g, S, fit(g, words(slide.lines.join(" "), (s) => s), disp, { w: box.w, h: H - ih - 2 * m - 200 * u }, 1.1, 64 * u * d), m, m + 110 * u + ih, box.w, { font: disp, lead: 1.1, ink: p.ink, k: 1 })
    } else {
      const [head, ...rest] = slide.lines
      const f = fit(g, words(head, (s) => s), disp, { w: box.w, h: H * 0.34 }, 1.05, 112 * u * d)
      let y = m + 110 * u
      y = set(g, S, f, m, y, box.w, { font: disp, lead: 1.05, ink: p.ink })
      if (rest.length) y = set(g, S, fit(g, words(rest.join(" "), (s) => s), text, { w: box.w * 0.85, h: H * 0.22 }, 1.35, 30 * u * d), m, y + 34 * u, box.w * 0.85, { font: text, lead: 1.35, ink: p.ink, k: f.lines.length })
      const room = H - m - 90 * u - y
      if (room > 200 * u) diagram(g, S, W / 2, y + room / 2, Math.min(room * 0.38, W * 0.3), p.ink)
    }
  },

  poster(g, S) {
    const { p, W, H, u, slide } = S, m = S.m * 0.8
    const disp = (em, px) => `${p.displayWeight} ${px}px ${quote(p.display)}, sans-serif`
    const upper = (s) => s.toUpperCase()
    // Each line of the slide set to the full width, like wood type: big words big, small words small.
    const rows = slide.kind === "image" ? slide.lines : slide.lines.flatMap((l) => {
      const ws = l.replace(/\*/g, "").split(/\s+/)
      if (ws.length <= 3) return [l]
      const out = []; for (let k = 0; k < ws.length; k += 3) out.push(ws.slice(k, k + 3).join(" "))
      return out
    })
    let top = m + 60 * u, bottom = H - m - 70 * u
    if (slide.kind === "image") {
      g.globalAlpha = S.anim(0).alpha
      picture(g, S.images[slide.image % Math.max(1, S.images.length)], m, top, W - 2 * m, (bottom - top) * 0.62)
      g.globalAlpha = 1
      top += (bottom - top) * 0.66
    }
    const gap = 14 * u
    const sized = rows.map((r) => {
      const ws = words(r, upper)
      g.font = disp(false, 100); const w100 = ws.reduce((s, w) => s + g.measureText(w.text).width, 0) + g.measureText(" ").width * (ws.length - 1)
      return { ws, px: ((W - 2 * m) / w100) * 100 }
    })
    const total = sized.reduce((s, r) => s + r.px * 0.86, 0) + gap * (rows.length - 1)
    const k = Math.min(1, (bottom - top) / total)
    let y = top + ((bottom - top) - total * k) / 2
    sized.forEach((r, i) => {
      const px = r.px * k, lines = wrap(g, r.ws, disp, px, W)
      const mark = slide.lines.length > 1 && i % 2 === 1
      set(g, S, { px, lines }, m, y - px * 0.08, W - 2 * m, { font: disp, lead: 1, align: "center", ink: mark ? p.accent : p.ink, emInk: p.accent, k: i })
      y += px * 0.86 + gap
    })
    frame(g, S, { color: p.ink, font: (px) => `600 ${px}px ${quote(p.body)}, sans-serif`, top: m * 0.55 + 20 * u })
  },

  tide(g, S) {
    const { p, W, H, u, slide, t } = S, m = S.m
    // Full-bleed colour with soft bands, and a shape that drifts through.
    const span = p.panorama ? S.n : 1, off = p.panorama ? S.i * W : 0
    // The accent, deepening towards the ink across the slide (or across the whole carousel), so
    // the type, in the paper colour, reads everywhere.
    const grad = g.createLinearGradient(-off, 0, -off + W * span, H)
    grad.addColorStop(0, p.accent); grad.addColorStop(0.5, mix(p.accent, p.ink, 0.25)); grad.addColorStop(1, p.accent)
    g.fillStyle = grad; g.fillRect(0, 0, W, H)
    g.save(); g.globalAlpha = 0.18; g.strokeStyle = p.ground; g.lineWidth = 3 * u
    for (let k = 0; k < 26; k++) { g.beginPath(); for (let x = 0; x <= W; x += 20 * u) { const X = x + off; g.lineTo(x, (k / 26) * H + Math.sin(X / (90 * u) + k + TAU * t) * 14 * u) } g.stroke() }
    g.restore()
    const drift = p.motion === "drift" || p.motion === "marquee" ? Math.sin(TAU * t) * 40 * u : 0
    g.save(); g.fillStyle = p.ink; g.globalAlpha = 0.92; g.beginPath()
    const cx = W * (0.5 + 0.14 * Math.sin(S.i * 1.7)) + drift, cy = H * (0.52 + 0.06 * Math.cos(S.i * 1.3)), R = Math.min(W, H) * 0.34
    for (let a = 0; a <= TAU + 0.01; a += 0.05) { const r = R * (1 + 0.28 * Math.sin(3 * a + S.i) + 0.12 * Math.sin(5 * a + S.i * 2)); g.lineTo(cx + Math.cos(a) * r * 0.75, cy + Math.sin(a) * r) }
    g.fill(); g.restore()
    const disp = (em, px) => `${p.displayWeight} ${px}px ${quote(p.display)}, sans-serif`
    const text = (em, px) => `italic ${p.bodyWeight} ${px}px ${quote(p.body)}, serif`
    const all = slide.lines.join(" ").replace(/\*/g, ""), ws = all.split(/\s+/), cut = Math.max(1, Math.ceil(ws.length / 2))
    if (slide.kind === "image") { g.globalAlpha = S.anim(0).alpha; picture(g, S.images[slide.image % Math.max(1, S.images.length)], W * 0.22, H * 0.2, W * 0.56, H * 0.5, { radius: 24 * u }); g.globalAlpha = 1 }
    const a = fit(g, words(ws.slice(0, cut).join(" "), (s) => s), disp, { w: W - 2 * m, h: H * 0.42 }, 0.95, 170 * u * p.density)
    set(g, S, a, m, m, W - 2 * m, { font: disp, lead: 0.95, ink: p.ground })
    if (ws.length > cut) {
      const b = fit(g, words(ws.slice(cut).join(" "), (s) => s), text, { w: W - 2 * m, h: H * 0.36 }, 1.0, 150 * u * p.density)
      set(g, S, b, m, H - m - b.lines.length * b.px - 30 * u, W - 2 * m, { font: text, lead: 1.0, align: "right", ink: p.ground, k: a.lines.length })
    }
  },

  zine(g, S) {
    const { p, W, H, u, slide } = S, m = S.m
    const head = (em, px) => `italic ${p.displayWeight} ${px}px ${quote(p.display)}, serif`
    const type = (em, px) => `${em ? 700 : p.bodyWeight} ${px}px ${quote(p.body)}, monospace`
    // Text sits in label boxes, line by line, like cut-out strips.
    const strips = (f, x, y, w, k, fill, ink, font, lead = 1.45) => {
      f.lines.forEach((line, i) => {
        const a = S.anim(k + i), pad = f.px * 0.3, yy = y + i * f.px * lead + a.dy
        g.globalAlpha = a.alpha
        g.fillStyle = fill; g.fillRect(x + (w - line.w) / 2 - pad, yy - pad * 0.3, line.w + 2 * pad, f.px * 1.15)
        g.globalAlpha = 1
      })
      set(g, S, f, x, y + f.px * 0.05, w, { font, lead, align: "center", ink, k })
    }
    let y = m
    if (p.kicker) { const f = fit(g, words(p.kicker, (s) => s), head, { w: W * 0.6, h: 70 * u }, 1.2, 46 * u); strips(f, (W - W * 0.6) / 2, y, W * 0.6, 0, p.ink, p.ground, head, 1.2); y += 100 * u }
    const img = slide.kind === "image" || (slide.kind === "cover" && S.images.length) ? S.images[(slide.image ?? 0) % Math.max(1, S.images.length)] : null
    if (img || slide.kind === "image") { const w = W * 0.42; g.globalAlpha = S.anim(1).alpha; picture(g, img, (W - w) / 2, y + 20 * u, w, H * 0.3, { arch: true }); g.globalAlpha = 1; y += H * 0.3 + 60 * u }
    if (slide.kind === "cover" || slide.kind === "big" || slide.kind === "end") {
      const f = fit(g, words(slide.lines.join(" "), (s) => s), head, { w: W - 2 * m, h: H - y - m - 80 * u }, 1.15, 150 * u * p.density)
      strips(f, m, y + (H - y - m - f.lines.length * f.px * 1.15) / 2, W - 2 * m, 2, p.ground === "#FFFFFF" ? p.accent : "#FFFFFF", p.ink, head, 1.15)
    } else {
      const room = H - y - m - 80 * u, w = W - 2 * m - 40 * u
      if (slide.kind === "list") {
        // Each item its own strip, all at one size: the size the longest needs.
        const items = slide.lines.map((l, i) => words(`${i + 1}.\u00a0${l}`, (s) => s))
        const px = Math.min(...items.map((ws) => fit(g, ws, type, { w, h: (room * 0.8) / items.length / 1.6 }, 1.45, 62 * u * p.density).px))
        const blocks = items.map((ws) => ({ px, lines: wrap(g, ws, type, px, w) }))
        const total = blocks.reduce((t, b) => t + b.lines.length * px * 1.45, 0) + (blocks.length - 1) * px * 0.6
        let yy = y + (room - total) / 2
        blocks.forEach((b, i) => { strips(b, m + 20 * u, yy, w, 2 + i, "#FFFFFF", p.ink, type); yy += b.lines.length * px * 1.45 + px * 0.6 })
      } else {
        const f = fit(g, words(slide.lines.join(" "), (s) => s), type, { w, h: room * 0.8 }, 1.45, 62 * u * p.density)
        strips(f, m + 20 * u, y + (room - f.lines.length * f.px * 1.45) / 2, w, 2, "#FFFFFF", p.ink, type)
      }
    }
    if (p.footer || p.numbers) frame(g, S, { color: p.ink, font: (px) => `600 ${px}px ${quote(p.body)}, monospace`, top: -100 })
  },

  notebook(g, S) {
    const { p, W, H, u, slide } = S, m = S.m * 1.15
    const disp = (em, px) => `${em ? "italic " : ""}${p.displayWeight} ${px}px ${quote(p.display)}, serif`
    const lower = (s) => s.toLowerCase()
    const all = slide.kind === "list" ? slide.lines.map((l) => `· ${l}`) : slide.lines
    const [head, ...rest] = all
    const img = slide.kind === "image" || (slide.kind === "cover" && S.images.length) ? S.images[(slide.image ?? 0) % Math.max(1, S.images.length)] : null
    const big = slide.kind === "cover" || slide.kind === "big"
    const f = fit(g, words(slide.kind === "list" ? all.join("  ") : head, lower), disp, { w: W - 2 * m, h: H * (big ? 0.36 : 0.3) }, 1.05, (big ? 116 : 84) * u * p.density)
    // Without a picture, the words sit a little above the middle, with air all round.
    const alone = !(img || slide.kind === "image")
    let y = alone ? H * 0.42 - (f.lines.length * f.px * 1.05) / 2 - (rest.length && slide.kind !== "list" ? 60 * u : 0) : m + 50 * u
    y = set(g, S, f, m, y, W - 2 * m, { font: disp, lead: 1.05, align: "center", ink: p.accent })
    if (img || slide.kind === "image") { const w = W * 0.38, h = w * 0.78; g.globalAlpha = S.anim(2).alpha; picture(g, img, (W - w) / 2, y + 60 * u, w, h, { mono: true }); g.globalAlpha = 1; y += h + 100 * u }
    else y += 80 * u
    if (slide.kind !== "list" && rest.length) {
      const b = fit(g, words(rest.join(" "), lower), disp, { w: W - 2 * m, h: H - y - m - 90 * u }, 1.2, 46 * u * p.density)
      set(g, S, b, m, alone ? y : H - m - 90 * u - b.lines.length * b.px * 1.2, W - 2 * m, { font: disp, lead: 1.2, align: "center", ink: p.accent, k: 3 })
    }
    frame(g, S, { color: p.accent, font: (px) => `${p.bodyWeight} ${px}px ${quote(p.body)}, sans-serif` })
  },

  swiss(g, S) {
    const { p, W, H, u, slide, i, n } = S, m = S.m * 0.8
    const disp = (em, px) => `${p.displayWeight} ${px}px ${quote(p.display)}, sans-serif`
    const text = (em, px) => `${em ? 600 : p.bodyWeight} ${px}px ${quote(p.body)}, sans-serif`
    // A block of accent, placed by the grid and the slide.
    const cols = 6, cw = (W - 2 * m) / cols
    const bx = m + cw * Math.floor(hash(i, 3) * 4), bw = cw * (2 + Math.floor(hash(i, 4) * 2))
    g.globalAlpha = S.anim(0).alpha
    g.fillStyle = p.accent
    g.fillRect(bx, m + 150 * u, bw, H * 0.22)
    g.globalAlpha = 1
    g.fillStyle = p.ink; g.font = disp(false, 150 * u * p.density); g.globalAlpha = S.anim(0).alpha
    g.fillText(String(i + 1).padStart(2, "0"), m - 6 * u, m + 120 * u * p.density); g.globalAlpha = 1
    g.strokeStyle = p.ink; g.lineWidth = 2 * u
    g.beginPath(); g.moveTo(m, H * 0.5); g.lineTo(W - m, H * 0.5); g.stroke()
    const box = { w: W - 2 * m, h: H * 0.4 - 60 * u }
    if (slide.kind === "image") { picture(g, S.images[slide.image % Math.max(1, S.images.length)], m, H * 0.5 + 30 * u, W - 2 * m, H * 0.28) }
    if (slide.kind === "list") {
      const rh = box.h / slide.lines.length
      slide.lines.forEach((l, k) => {
        const f = fit(g, words(l, (s) => s), disp, { w: box.w - 90 * u, h: rh * 0.8 }, 1, rh * 0.55)
        g.fillStyle = p.accent; g.font = text(true, 26 * u); g.globalAlpha = S.anim(k).alpha; g.fillText(String(k + 1), m, H * 0.5 + 40 * u + k * rh + rh * 0.45); g.globalAlpha = 1
        set(g, S, f, m + 90 * u, H * 0.5 + 30 * u + k * rh, box.w - 90 * u, { font: disp, lead: 1, ink: p.ink, k })
      })
    } else {
      const [head, ...rest] = slide.lines
      const f = fit(g, words(head, (s) => s), disp, { w: box.w, h: box.h * (rest.length ? 0.62 : 1) }, 0.98, 170 * u * p.density)
      let y = H * 0.5 + 40 * u
      y = set(g, S, f, m, y, box.w, { font: disp, lead: 0.98, ink: p.ink, emInk: p.accent })
      if (rest.length) set(g, S, fit(g, words(rest.join(" "), (s) => s), text, { w: box.w * 0.66, h: H - y - m - 60 * u }, 1.3, 30 * u * p.density), m, y + 26 * u, box.w * 0.66, { font: text, lead: 1.3, ink: p.ink, k: f.lines.length })
    }
    frame(g, S, { color: p.ink, font: (px) => `600 ${px}px ${quote(p.body)}, sans-serif`, align: "left", top: m * 0.5 + 18 * u + 0 * n })
  },
}

// ---- motion ----
// Rise in and Type on: elements arrive one after another in the first part of the slide's loop,
// hold, and leave at the very end, so the loop closes. Drift and Marquee move the ground instead.
function animator(p, t) {
  if (p.motion === "rise") return (k) => {
    const a = ease((t - 0.04 - k * 0.06) / 0.18) * (1 - ease((t - 0.9) / 0.09))
    return { alpha: a, dy: (1 - a) * 30, chars: Infinity }
  }
  if (p.motion === "type") return (k) => {
    const c = Math.floor(clamp((t - 0.03 - k * 0.07) / 0.5, 0, 1) * 60), out = t > 0.92 ? 0 : 1
    return { alpha: c > 0 && out ? 1 : 0, dy: 0, chars: t > 0.6 ? Infinity : c }
  }
  return () => ({ alpha: 1, dy: 0, chars: Infinity })
}

// One slide, at its own time t.
export function draw(ctx, patch, index, t, { scale = 1, images = [] } = {}) {
  const { w: W, h: H } = size(patch)
  const p = { ...resolve(manifest, patch, t) }
  const list = slides(patch), n = list.length
  const slide = list[clamp(index, 0, n - 1)] ?? { kind: "big", lines: ["Write something"] }
  const u = Math.min(W, H) / 1080
  const anim = animator(p, t)
  const S = { p, W, H, u, t, i: clamp(index, 0, Math.max(0, n - 1)), n, slide, images, m: 84 * u, anim: (k) => { const a = anim(k); return { ...a, dy: a.dy * u } } }
  ctx.save()
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  if (p.transparent) ctx.clearRect(0, 0, W, H)
  else { ctx.fillStyle = p.ground; ctx.fillRect(0, 0, W, H) }
  ctx.textBaseline = "alphabetic"
  // A panorama: one huge word or shape across every slide, each slide a window onto it.
  if (p.panorama && p.system !== "tide") {
    const word = (list[0]?.lines[0] ?? "").replace(/\*/g, "").split(/\s+/)[0] || "A"
    ctx.save()
    ctx.font = `${p.displayWeight} ${H * 1.15}px ${quote(p.display)}, sans-serif`
    const ww = ctx.measureText(word).width, slideX = p.motion === "marquee" ? frac(t) * W : 0
    ctx.fillStyle = p.accent
    ctx.globalAlpha = 0.16
    ctx.fillText(word, -(S.i * W) + (n * W - ww) / 2 - slideX, H * 0.95)
    ctx.restore()
  }
  SYSTEMS[p.system]?.(ctx, S)
  texture(ctx, S)
  ctx.restore()
}

export function render(ctx, patch, t, opts = {}) {
  t = frac(t)
  const n = Math.max(1, slides(patch).length)
  if (patch.params.view === "sequence") {
    const s = t * n, k = Math.min(n - 1, Math.floor(s))
    return draw(ctx, patch, k, s - k, opts)
  }
  return draw(ctx, patch, patch.params.slide - 1, t, opts)
}
