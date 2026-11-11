// Flyposter: the engine. No clock, no Math.random: render(ctx, patch, t) draws the post at time t
// (0 to 1 around the loop), for the preview and every export alike.
//
// How a frame is built:
//   1. The words: your headline (or a rewrite of it, copy.js), details, where and call to action.
//   2. The colours: your brand colours and two neutrals, cast by the Colour use into parts: the
//      ground, the type, the accent, and what reads on the accent.
//   3. The layout composes a scene: a list of items (lines of type, shapes, stickers, bands, a
//      circle of words, the picture, the logo) in output pixels. It only changes when a setting
//      does, so it's kept between frames.
//   4. The stuff (emoji, stickers, the picture again) is thrown from its own seed, behind the words,
//      in front of them, or both.
//   5. Each item is drawn with the motion at time t: building in, holding, clearing before the
//      loop restarts, or moving all the time. Every cycle is a whole number per loop, so it closes.
//   6. The Darkroom stack (shared effects) is laid over the finished frame.
//   render(ctx, patch, t, { scale, frame, fontGen, image, emoji, marks })
//     image: { el, w, h } the picture; emoji: Map hex -> <img>; marks: Map name -> mark (the logo).
//     fontGen counts font loads, so the layout is measured again once a face arrives.
import { readJson } from "../../packages/core/read-json.js"
import { formatSize } from "../../packages/core/formats.js"
import { hash, mulberry32 } from "../../packages/core/rng.js"
import { resolve } from "../../packages/core/keys.js"
import { applyStack } from "../../packages/core/effects/index.js"
import { drawMark } from "../../packages/core/marks.js"
import { contrast } from "../../packages/core/colour.js"
import { emojiOf } from "../../packages/core/emoji.js"
import { rewrite } from "./copy.js"
import { stickerPath, stickersOf } from "./stickers.js"

export const manifest = await readJson(new URL("./instrument.json", import.meta.url))
export const size = (patch) => formatSize(patch.params)
export const frameCount = (patch) => Math.max(1, Math.round(patch.params.duration * Number(patch.params.fps)))

const TAU = Math.PI * 2
const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v))
const frac = (x) => x - Math.floor(x)
const smooth = (x) => { x = clamp(x); return x * x * (3 - 2 * x) }
const expoOut = (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * clamp(x)))
const backOut = (x, k = 1.7) => { x = clamp(x) - 1; return 1 + x * x * ((k + 1) * x + k) }
const quote = (f) => `"${String(f).replace(/"/g, "")}"`

// ---- words ----
const casing = (s, c) => c === "upper" ? s.toUpperCase() : c === "lower" ? s.toLowerCase()
  : c === "title" ? s.replace(/(^|[\s(“"-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()) : s
export function words(p) {
  const msg = { headline: p.headline, details: p.details, where: p.where, cta: p.cta }
  const small = p.case === "upper" ? (s) => s.toUpperCase() : (s) => s
  return {
    headline: casing(rewrite(msg, p.lens, p.take).trim() || " ", p.case),
    details: small(p.details.trim()), where: small(p.where.trim()), cta: casing(p.cta.trim(), p.case),
    brand: p.brandName.trim(),
  }
}

export function fontRequests(patch) {
  const p = patch.params, w = words(p)
  const sample = [...new Set(Object.values(w).join("") + "0123456789")].join("")
  return [
    { source: p.displaySource, family: p.display, kit: p.adobeKit, weights: [p.displayWeight], sample },
    { source: p.textSource, family: p.text, kit: p.adobeKit, weights: [p.textWeight, Math.min(900, p.textWeight + 200)], sample },
  ]
}

// ---- colour: the brand colours cast into parts ----
export function palette(p) {
  const inks = p.inks.length ? p.inks : ["#F2542D"]
  const all = [...new Set([...inks, p.paper, p.black])]
  const grounds = p.colourUse === "paper" ? [p.paper] : p.colourUse === "night" ? [p.black] : p.colourUse === "flood" ? inks : all
  const cands = []
  for (const g of grounds) {
    let types = all.filter((c) => c !== g && contrast(c, g) >= 3).sort((a, b) => contrast(b, g) - contrast(a, g))
    if (!types.length) types = [contrast(p.black, g) > contrast(p.paper, g) ? p.black : p.paper]
    for (const type of types) {
      if (p.colourUse === "duo") { cands.push({ ground: g, type, accent: type }); continue }
      const accents = all.filter((c) => c !== g && c !== type && contrast(c, g) >= 1.35)
        .sort((a, b) => (inks.includes(b) - inks.includes(a)) || contrast(b, g) - contrast(a, g))
      for (const accent of accents.length ? accents : [type]) cands.push({ ground: g, type, accent })
    }
  }
  const c = cands[p.colourway % cands.length] ?? { ground: p.paper, type: p.black, accent: inks[0] }
  const best = (bg, list) => list.reduce((a, b) => (contrast(b, bg) > contrast(a, bg) ? b : a))
  c.onAccent = best(c.accent, [c.ground, c.type, p.paper, p.black])
  c.onType = best(c.type, [c.ground, c.accent, p.paper, p.black])
  // Riot: every colour that reads on the ground, the type first.
  c.riot = p.colourUse === "riot" ? [c.type, ...all.filter((x) => x !== c.ground && x !== c.type && contrast(x, c.ground) >= 1.8)] : [c.type]
  return c
}
// Flash swaps the parts on the beat: ground and accent, then ground and type.
function flashed(c, k) {
  if (k % 3 === 1) return { ...c, ground: c.accent, accent: c.ground, type: c.onAccent, onAccent: c.type, riot: [c.onAccent] }
  if (k % 3 === 2) return { ...c, ground: c.type, type: c.ground, onType: c.type, riot: [c.ground] }
  return c
}

// ---- measuring ----
let G = null, F = null // the context and the faces while composing
const face = (k, px) => k === "d" ? `${F.dw} ${px}px ${quote(F.d)}, sans-serif` : k === "tb" ? `${Math.min(900, F.tw + 200)} ${px}px ${quote(F.t)}, sans-serif` : `${F.tw} ${px}px ${quote(F.t)}, sans-serif`
const spacing = "letterSpacing" in (globalThis.CanvasRenderingContext2D?.prototype ?? {})
function setFont(g, k, px, track = 0) {
  g.font = face(k, px)
  if (spacing) g.letterSpacing = `${(track * px).toFixed(2)}px`
}
function measure(text, k, px, track = k === "d" ? F.track : 0) { setFont(G, k, px, track); return G.measureText(text).width }
const capOf = new Map()
function cap(k) {
  const key = face(k, 100)
  if (!capOf.has(key)) { setFont(G, k, 100); const m = G.measureText("HXE"); capOf.set(key, clamp((m.actualBoundingBoxAscent || 70) / 100, 0.4, 1)) }
  return capOf.get(key)
}
// The size at which text is exactly width wide, up to most.
const fitWidth = (text, k, width, most = Infinity) => Math.min(most, (width / Math.max(1, measure(text, k, 100))) * 100)

// Widths at 100px, kept while composing: a width grows in step with the size, so each word is
// measured once however many sizes are tried.
let widths = new Map()
const w100 = (s, k) => {
  const key = `${k}|${s}`
  if (!widths.has(key)) widths.set(key, measure(s, k, 100))
  return widths.get(key)
}
// The words of a paragraph and what joins them: spaces, or nothing for Chinese, Japanese and
// Korean set without spaces, which break between characters.
const CJK = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af\uff00-\uffef]/
function tokens(text) {
  const ws = text.split(/\s+/).filter(Boolean)
  return ws.length === 1 && CJK.test(text) && [...text].length > 3 ? { ws: [...text], sep: "" } : { ws, sep: " " }
}
// Words a line shouldn't end on, and marks a line shouldn't start with.
const STOP = new Set("a an the and & + or of to in on at for by with from your our my is no every each this that all".split(" "))
const NO_START = /^[、。，．・：；！？）」』ーゃゅょっ!?,.;:)\]]/
// The best place to break words into n lines: each line as near the average width as can be,
// none wider than max (at 100px), no line ending on a little word, and no lonely last word.
function breakLines(ws, sep, k, n, max = Infinity) {
  const N = ws.length
  n = Math.max(1, Math.min(n, N))
  if (n === 1) return [ws.join(sep)]
  const ww = ws.map((s) => w100(s, k)), gap = sep ? w100(" ", k) : 0
  const span = (i, j) => { let s = gap * (j - i - 1); for (let x = i; x < j; x++) s += ww[x]; return s }
  const target = span(0, N) / n
  const cost = Array.from({ length: n + 1 }, () => new Array(N + 1).fill(Infinity))
  const from = Array.from({ length: n + 1 }, () => new Array(N + 1).fill(0))
  cost[0][0] = 0
  for (let l = 1; l <= n; l++) {
    for (let j = l; j <= N - (n - l); j++) {
      for (let i = l - 1; i < j; i++) {
        if (cost[l - 1][i] === Infinity) continue
        const w = span(i, j)
        if (w > max && j - i > 1) continue
        let c = ((w - target) / target) ** 2 + (w > max ? 100 : 0)
        if (j < N && STOP.has(ws[j - 1].toLowerCase().replace(/[^\p{L}&+]/gu, ""))) c += 0.5
        if (j < N && NO_START.test(ws[j])) c += 2
        if (j === N && j - i === 1 && w < target * 0.5) c += 0.8
        if (cost[l - 1][i] + c < cost[l][j]) { cost[l][j] = cost[l - 1][i] + c; from[l][j] = i }
      }
    }
  }
  if (cost[n][N] === Infinity) return null
  const out = []
  for (let l = n, j = N; l > 0; l--) { const i = from[l][j]; out.unshift(ws.slice(i, j).join(sep)); j = i }
  return out
}

// Break text into lines no wider than max at px: as few lines as fit, then evened out.
function wrap(text, k, px, max) {
  const out = []
  for (const para of text.split("\n")) {
    const { ws, sep } = tokens(para)
    let n = 1, line = 0
    ws.forEach((w, j) => {
      const add = w100(w, k) * px / 100 + (j && sep ? w100(" ", k) * px / 100 : 0)
      if (j && line + add > max) { n++; line = w100(w, k) * px / 100 } else line += add
    })
    out.push(...(breakLines(ws, sep, k, n, (max * 100) / px) ?? [ws.join(sep)]))
  }
  return out.filter((l, i) => l || i < out.length - 1)
}
// The largest size (up to most) at which the text wraps into the box.
function fitBox(text, k, w, h, lead, most) {
  let lo = 4, hi = most, best = null
  for (let i = 0; i < 16; i++) {
    const px = (lo + hi) / 2, lines = wrap(text, k, px, w)
    const ok = lines.length * px * lead <= h && lines.every((l) => measure(l, k, px) <= w + 0.5)
    if (ok) { lo = px; best = { px, lines } } else hi = px
  }
  return best ?? { px: lo, lines: wrap(text, k, lo, w) }
}
// Lines for a headline that fills the width a line at a time: your breaks, or words grouped into a
// few lines of about even width.
function balance(text, k = "d") {
  if (text.includes("\n")) return text.split("\n").map((l) => l.trim()).filter(Boolean)
  const { ws, sep } = tokens(text)
  const chars = ws.join("").length * (sep ? 1 : 2)
  const ideal = Math.max(Math.min(2, ws.length), Math.min(ws.length, 5, Math.round(chars / 7)))
  // Each line is sized to fill the width, so lines of very different widths end up at very
  // different sizes: take the count nearest the ideal that keeps them even.
  let best = [text], bestCost = Infinity
  for (let n = 1; n <= Math.min(ws.length, 6); n++) {
    const list = breakLines(ws, sep, k, n)
    if (!list) continue
    const ww = list.map((l) => w100(l, k))
    const cost = Math.log(Math.max(...ww) / Math.max(1, Math.min(...ww))) * 3 + Math.abs(n - ideal) * 0.5
    if (cost < bestCost) { bestCost = cost; best = list }
  }
  return best
}
// The biggest thing to say: a price, a percentage, a time or a number in your words.
export function bigThing(w) {
  for (const s of [w.headline, w.details, w.cta]) {
    const m = s.match(/[£$€]\s?\d+(?:[.,]\d+)?|\d+(?:[.,:]\d+)?\s?%|\d+\s?(?:-|–|for|4)\s?\d+|\d+(?:[.,:]\d+)?(?:am|pm)?/i)
    if (m) return m[0].replace(/\s+/g, "")
  }
  return (w.headline.match(/\p{L}/u)?.[0] ?? "!").toUpperCase()
}

// ---- the scene ----
// Items, in output pixels, centred on (x, y), turned by rot (radians). i is the order they arrive.
const text = (s, k, px, x, y, ink, extra = {}) => {
  const w = measure(s, k, px), h = px * cap(k)
  const ax = extra.align === "right" ? x - w / 2 : extra.align === "center" ? x : x + w / 2
  return { kind: "text", text: s, k, px, x: ax, y, w, h, ink, rot: 0, track: k === "d" ? F.track : extra.track ?? 0, ...extra }
}
// A block of lines, from a top edge; each line's own size. Returns the items and the bottom edge.
function lines(list, k, x, top, width, align, lead, ink, sizes) {
  const out = []
  let y = top
  list.forEach((l, j) => {
    const px = sizes[j], h = px * cap(k)
    // Quotes and stops hang outside the edge, so the letters line up.
    const hangL = align === "left" && /^[“‘"'(«]/.test(l) ? measure(l[0], k, px) : 0
    const hangR = align === "right" && /[.,”’"')»]$/.test(l) ? measure(l.at(-1), k, px) : 0
    const lx = align === "center" ? x + width / 2 : align === "right" ? x + width + hangR : x - hangL
    out.push(text(l, k, px, lx, y + h / 2, typeof ink === "function" ? ink(j) : ink, { align, line: j }))
    y += j < list.length - 1 ? px * lead : h
  })
  return { items: out, bottom: y }
}
const shape = (id, x, y, w, h, fill, extra = {}) => ({ kind: "shape", id, x, y, w, h, fill, rot: 0, ...extra })
// A call to action: a sticker shape holding the words, or the words underlined, or plain.
function ctaItem(s, x, y, size, c, p, r, extra = {}) {
  if (!s) return []
  const k = "tb", shapeId = p.ctaShape
  if (shapeId === "plain" || shapeId === "underline") {
    const px = Math.min(size * 0.22, fitWidth(s, k, size * 1.6))
    const it = text(s, k, px, x, y, "type", { align: "center", cta: true, ...extra })
    return shapeId === "underline" ? [it, shape("rule", x, y + it.h / 2 + px * 0.28, it.w, Math.max(2, px * 0.09), "accent", { i: it.i, follows: it })] : [it]
  }
  const round = shapeId === "burst" || shapeId === "circle"
  const inner = round ? size * 0.62 : size * 1.5
  // In a round sticker, the words take as many lines (up to three) as sets them clearly bigger.
  const { ws, sep } = tokens(s)
  let label = [s], px = Math.min(size * (round ? 0.24 : 0.2), fitWidth(s, k, inner))
  if (round) for (let n = 2; n <= Math.min(3, ws.length); n++) {
    const list = breakLines(ws, sep, k, n)
    const size2 = list && Math.min(size * 0.24, inner / (n * 1.15), ...list.map((l) => fitWidth(l, k, inner)))
    if (size2 > px * 1.2) { label = list; px = size2 }
  }
  const w = round ? size : Math.max(...label.map((l) => measure(l, k, px))) + px * 1.6
  const h = round ? size : px * (label.length * 1.15 + 0.9)
  const id = shapeId === "box" || shapeId === "tag" ? "box" : shapeId
  return [shape(id, x, y, w, h, "accent", { rot: ((r() - 0.5) * 0.4), label, labelPx: px, labelK: k, labelInk: "onAccent", tag: shapeId === "tag", cta: true, ...extra })]
}

// Each layout: (p, w, c, frame, r) -> { items, hero: { x, y, size } }. frame: { W, H, m, u, land }.
const LAYOUTS = {
  stack(p, w, c, f, r) {
    const { W, H, m, u } = f, items = []
    const list = balance(w.headline)
    const top = r() < 0.6
    const tpx = 34 * u, foot = (w.details ? 1 : 0) + (w.where ? 1 : 0)
    const footH = foot ? tpx * (foot * 1.3 + 0.8) : 0
    const avail = H - 2 * m - footH - f.logoRoom
    let sizes = list.map((l) => fitWidth(l, "d", W - 2 * m, (H - 2 * m) * 0.34) * p.scale)
    const total = sizes.reduce((a, b, j) => a + b * (j < sizes.length - 1 ? p.leading : cap("d")), 0)
    // With a picture to show, the headline leaves it room.
    const room = Math.min(avail * (0.62 + 0.3 * Math.min(1, p.scale)), f.star && !f.land ? Math.max(avail * 0.55, avail - Math.min(W, H) * 0.45) : Infinity)
    if (total > room) sizes = sizes.map((s) => (s * room) / total)
    const height = sizes.reduce((a, b, j) => a + b * (j < sizes.length - 1 ? p.leading : cap("d")), 0)
    const y0 = top ? m + f.logoRoom : H - m - footH - height
    const block = lines(list, "d", m, y0, W - 2 * m, p.align, p.leading, c.riot.length > 1 ? (j) => `riot${j}` : "type", sizes)
    items.push(...block.items)
    // The details under the headline (or above it, when it sits at the bottom).
    const info = [w.details, w.where].filter(Boolean)
    let ty = top ? block.bottom + tpx * 1.2 : y0 - tpx * 1.1 - (info.length - 1) * tpx * 1.3
    if (!top && ty < m + f.logoRoom) ty = H - m - footH + tpx
    if (top) ty = Math.max(ty, H - m - footH + tpx * 0.6)
    info.forEach((s, j) => items.push(text(s, j ? "t" : "tb", tpx, p.align === "center" ? W / 2 : p.align === "right" ? W - m : m, ty + j * tpx * 1.3, "type", { align: p.align })))
    const cs = Math.min(W, H) * 0.27
    const last = block.items.at(-1)
    items.push(...ctaItem(w.cta, clamp(last.x + last.w / 2 - cs * 0.15, m + cs / 2, W - m - cs / 2), top ? last.y + last.h / 2 + cs * 0.55 : block.items[0].y - block.items[0].h / 2 - cs * 0.45, cs, c, p, r))
    const free = top ? [block.bottom, H - m - footH] : [m + f.logoRoom, y0]
    const min = Math.min(W, H)
    // Room beside short lines (a wide frame): the picture goes there.
    const right = Math.max(...block.items.map((it) => it.x + it.w / 2))
    if (p.align === "left" && W - m - right > min * 0.32) {
      const room = W - m - right
      return { items, hero: { x: W - m - room / 2, y: (block.items[0].y + block.bottom) / 2, size: Math.min(room * 0.9, min * 0.6) } }
    }
    // No room for the picture: it comes forward, stuck over a corner of the headline.
    if (free[1] - free[0] < min * 0.42) {
      const size = min * 0.32, gap = block.items[Math.max(0, Math.floor(block.items.length / 2) - 1)]
      const left = p.align === "right" || (p.align === "center" && r() < 0.5)
      return { items, hero: { x: left ? size * 0.42 : W - size * 0.42, y: gap.y + gap.h / 2 + (block.items.length > 1 ? gap.px * (p.leading - cap("d")) / 2 : 0), size, front: true } }
    }
    return { items, hero: { x: W * (0.5 + (r() - 0.5) * 0.3), y: (free[0] + free[1]) / 2, size: clamp(free[1] - free[0], min * 0.3, min * 0.62) } }
  },

  number(p, w, c, f, r) {
    const { W, H, m, u, land } = f, items = []
    const big = bigThing(w)
    const right = r() < 0.5
    // The headline first, at the foot (or beside the number, in landscape)...
    const headline = /\d/.test(big) ? w.headline.replace(big, "").replace(/\s{2,}/g, " ").trim() || w.headline : w.headline
    const tpx = 32 * u, info = [w.details, w.where].filter(Boolean).length
    const infoH = info ? tpx * (1.5 + 1.3 * (info - 1)) + tpx : 0
    const lTop = m + f.logoRoom, lBottom = H - m - infoH
    const box = { w: land ? W * 0.46 : W - 2 * m, h: (land ? lBottom - lTop : H * 0.3) * p.scale }
    const fit = fitBox(headline, "d", box.w, box.h, p.leading, 260 * u)
    const hx = land ? (right ? m : W - m - box.w) : m
    const hh = fit.px * ((fit.lines.length - 1) * p.leading + cap("d"))
    const hTop = land ? lTop + (lBottom - lTop - hh) / 2 : H - m - hh - (w.details ? 90 * u : 0)
    const block = lines(fit.lines, "d", hx, hTop, box.w, land ? "left" : p.align, p.leading, "type", fit.lines.map(() => fit.px))
    // ...then the number, as big as the room above it. In the same colour as the type it's an
    // outline, and keeps clear; in another colour it can run behind the headline.
    const same = c.accent === c.type
    const top = m + f.logoRoom
    const room = land ? H * 1.05 : (hTop - top) * (same ? 0.94 : 1.2)
    const px = Math.min(fitWidth(big, "d", W * (big.length > 2 ? 1.1 : 0.9)) * p.scale, room / cap("d"))
    const bw = measure(big, "d", px), bh = px * cap("d")
    const bx = right ? W - bw / 2 + bw * 0.08 : bw / 2 - bw * 0.08
    items.push(text(big, "d", px, bx, land ? H / 2 : top + bh / 2, same ? "type" : "accent", { align: "center", big: true, stroke: same ? Math.max(3, px * 0.012) : 0 }))
    items.push(...block.items)
    ;[w.details, w.where].filter(Boolean).forEach((s, j) => items.push(text(s, j ? "t" : "tb", tpx, land ? hx : m, (land ? block.bottom + tpx * 1.5 : H - m - tpx * 0.5 - (w.where && w.details && !j ? tpx * 1.3 : 0)) + (land ? j * tpx * 1.3 : 0), "type", { align: "left" })))
    const cs = Math.min(W, H) * 0.25
    const side = right ? 0.27 : 0.73
    items.push(...ctaItem(w.cta, land ? (right ? W - m - cs * 0.6 : m + cs * 0.6) : W * side + (right ? -1 : 1) * cs * 0.15, land ? H - m - cs * 0.6 : hTop - cs * 0.6, cs, c, p, r))
    return { items, hero: { x: land ? (right ? W * 0.74 : W * 0.26) : W * side, y: land ? H * 0.3 : top + (hTop - top) * 0.4, size: Math.min(W, H) * 0.38 } }
  },

  ticker(p, w, c, f, r) {
    const { W, H, u, land } = f, items = []
    const n = land ? 5 : H > W * 1.5 ? 9 : H > W * 1.1 ? 7 : 6
    const reach = Math.hypot(W, H) * 1.1
    const bh = reach / n
    const say = [w.headline.replace(/\n/g, " "), w.details, w.where, w.cta].filter(Boolean)
    const grounds = [["ground", "type"], ["type", "onType"], ["accent", "onAccent"]]
    const mid = Math.floor(n / 2)
    for (let j = 0; j < n; j++) {
      const s = j === mid ? say[0] : say[(j + (j > mid ? 0 : 1)) % say.length]
      const big = j === mid
      const h = big ? bh * 1.5 : bh * 0.95
      const k = big || j % 2 ? "d" : "tb"
      const px = (h * 0.62) / cap(k)
      const [bg, ink] = big ? grounds[2] : grounds[j % 2]
      const y = H / 2 + (j - mid) * bh + (j > mid ? bh * 0.25 : j < mid ? -bh * 0.25 : 0)
      const segW = measure(s, k, px) + px * 1.2
      items.push({ kind: "ticker", under: true, text: s, k, px, x: W / 2, y, w: reach, h, bg, ink, segW, dir: j % 2 ? -1 : 1, rot: 0, track: k === "d" ? F.track : 0, mark: ["star", "asterisk", "sparkle", "burst"][j % 4] })
    }
    const cs = Math.min(W, H) * 0.26
    items.push(...ctaItem(w.cta || w.details, land ? W * 0.8 : W * 0.72, land ? H * 0.72 : H * 0.7, cs, c, p, r))
    return { items, hero: { x: W / 2, y: H / 2, size: Math.min(W, H) * 0.5 }, groupTilt: (p.tilt || (r() - 0.5) * 12) * Math.PI / 180 }
  },

  grid(p, w, c, f, r) {
    const { W, H, m, u, land } = f, items = []
    const cols = land ? 6 : 4, gut = 24 * u, cw = (W - 2 * m - gut * (cols - 1)) / cols
    const colX = (i) => m + i * (cw + gut)
    const tpx = 26 * u
    // The head: a hairline, the brand and a number.
    items.push(shape("rule", W / 2, m, W - 2 * m, Math.max(1.5, 2 * u), "type"))
    const logoRight = p.logoPlace === "corner" && p.layoutSeed % 2
    items.push(text(`No. ${String(p.layoutSeed % 100).padStart(2, "0")}`, "t", tpx, logoRight ? m : W - m, m + tpx * 1.4, "type", { align: logoRight ? "left" : "right" }))
    if (p.logoPlace === "none" && w.brand) items.push(text(w.brand, "tb", tpx, logoRight ? W - m : m, m + tpx * 1.4, "type", { align: logoRight ? "right" : "left" }))
    const hw = land ? colX(4) - gut - m : W - 2 * m
    const hTop = m + Math.max(tpx * 3.2, f.logoRoom)
    const fit = fitBox(w.headline, "d", hw, (land ? H - hTop - m - tpx * 5 : H * 0.42) * p.scale, p.leading, 300 * u)
    const block = lines(fit.lines, "d", m, hTop, hw, "left", p.leading, "type", fit.lines.map(() => fit.px))
    items.push(...block.items)
    // One big shape, on the grid.
    const sx = land ? colX(4) : colX(r() < 0.5 ? 1 : 2), sw = land ? cw * 2 + gut : cw * 2 + gut
    const sTop = land ? hTop : block.bottom + gut * 2
    const sBottom = H - m - tpx * 5.2
    const sh = Math.max(sw * 0.6, sBottom - sTop)
    const round = r() < 0.6
    const ss = Math.min(sw, sh)
    items.push(shape(round ? "circle" : "box", sx + sw / 2, sTop + sh / 2, round ? ss : sw, round ? ss : sh, "accent", { flat: true, under: true }))
    // The foot: three columns of facts, labelled.
    const fy = H - m - tpx * 3.6
    items.push(shape("rule", W / 2, fy - tpx * 1.2, W - 2 * m, Math.max(1, 1.5 * u), "type"))
    const facts = [["When", w.details], ["Where", w.where], ["Next", w.cta]].filter(([, v]) => v)
    const span = Math.max(1, Math.floor(cols / Math.max(1, facts.length)))
    facts.forEach(([label, v], j) => {
      const x = colX(j * span), width = cw * span + gut * (span - 1) - gut
      items.push(text(label, "t", tpx * 0.85, x, fy, "accentText"))
      const fitV = fitBox(v, "tb", width, tpx * 2.6, 1.15, tpx * 1.15)
      fitV.lines.forEach((l, k) => items.push(text(l, "tb", fitV.px, x, fy + tpx * 1.5 + k * fitV.px * 1.15, "type")))
    })
    return { items, hero: { x: sx + sw / 2, y: sTop + sh / 2, size: ss * 0.9 } }
  },

  scatter(p, w, c, f, r) {
    const { W, H, m, u } = f, items = []
    const ws = w.headline.split(/\s+/).filter(Boolean)
    const box = { w: W - 2 * m, h: (H - 2 * m) * (w.cta ? 0.54 : 0.62) * p.scale }
    // A size at which the words, each on its own sticker, flow into the box.
    const flow = (px) => {
      const rows = [[]]
      let x = 0
      for (const s of ws) {
        const sw = measure(s, "d", px) + px * 0.7
        if (rows.at(-1).length && x + sw > box.w) { rows.push([]); x = 0 }
        rows.at(-1).push({ s, sw }); x += sw + px * 0.18
      }
      return rows
    }
    let lo = 10, hi = 400 * u
    for (let i = 0; i < 14; i++) { const px = (lo + hi) / 2, rows = flow(px); if (rows.length * px * 1.45 <= box.h && rows.every((row) => row.reduce((a, b) => a + b.sw, 0) <= box.w)) lo = px; else hi = px }
    const px = lo, rows = flow(px), rh = px * 1.45
    const top = (H - rows.length * rh) / 2 - H * 0.04
    const swing = Math.max(Math.abs(p.tilt), 5) * Math.PI / 180
    const fills = c.riot.length > 1 ? ["riot1", "accent", "riot2", "type"] : ["accent", "type", "accent", "ground"]
    let n = 0
    rows.forEach((row, j) => {
      const rw = row.reduce((a, b) => a + b.sw, 0) + px * 0.18 * (row.length - 1)
      let x = p.align === "left" ? m : p.align === "right" ? W - m - rw : (W - rw) / 2
      for (const { s, sw } of row) {
        const fill = fills[n++ % fills.length]
        const sh = px * cap("d") + px * 0.55
        items.push(shape(r() < 0.5 ? "box" : "pill", x + sw / 2 + (r() - 0.5) * px * 0.2, top + j * rh + rh / 2 + (r() - 0.5) * px * 0.25, sw, sh, fill,
          { rot: (r() - 0.5) * 2 * swing, label: [s], labelPx: px, labelK: "d", labelInk: `on:${fill}`, outline: true }))
        x += sw + px * 0.18
      }
    })
    const tpx = 30 * u
    const info = [w.details, w.where].filter(Boolean)
    info.forEach((s, j) => {
      const pw = measure(s, "tb", tpx) + tpx * 1.4
      items.push(shape("box", m + pw / 2 + j * tpx * 1.2, H - m - tpx * 1.4 - (info.length - 1 - j) * tpx * 2.2, pw, tpx * 1.9, j ? "ground" : "type", { rot: (r() - 0.5) * 0.12, label: [s], labelPx: tpx, labelK: "tb", labelInk: j ? "type" : "onType", outline: true }))
    })
    // The call to action where there's most room: above the words, or below them on the right.
    const above = top - m - f.logoRoom, below = H - m - (top + rows.length * rh)
    const cs = Math.min(Math.min(W, H) * 0.26, Math.max(above, below) * 1.05)
    items.push(...ctaItem(w.cta, W - m - cs * 0.55, above > below ? top - cs * 0.5 : top + rows.length * rh + cs * 0.5, cs, c, p, r))
    // Each sticker has its own tilt, so the whole doesn't turn as well.
    return { items, hero: { x: W / 2, y: H / 2, size: Math.min(W, H) * 0.55 }, groupTilt: 0 }
  },

  poster(p, w, c, f, r) {
    const { W, H, m, u, land } = f, items = []
    const lw = Math.max(3, 7 * u), inset = m * 0.55
    items.push(shape("frame", W / 2, H / 2, W - 2 * inset, H - 2 * inset, "type", { line: lw }))
    const tpx = 30 * u
    const topY = m + tpx * 0.8 + f.logoRoom * 0.6
    if (w.where) items.push(text(w.where.toUpperCase(), "tb", Math.min(tpx, fitWidth(w.where.toUpperCase(), "tb", W - 2 * m)), W / 2, topY, "type", { align: "center", track: 0.12 }))
    items.push(shape("rule", W / 2, topY + tpx * 1.2, W - 2 * m, lw * 0.6, "type"))
    // The foot: the call to action in a bar, the details in columns above it.
    const barH = tpx * 2.6
    const barY = H - inset - lw / 2 - barH / 2 - m * 0.2
    if (w.cta) {
      items.push(shape("box", W / 2, barY, W - 2 * m, barH, "type", { flat: true }))
      items.push(text(w.cta, "d", Math.min(barH * 0.55 / cap("d"), fitWidth(w.cta, "d", W - 3 * m)), W / 2, barY, "onType", { align: "center", on: "type" }))
    }
    const cols = w.details.split(/\s*(?:·|•|\||,)\s*/).filter(Boolean).slice(0, land ? 4 : 3)
    const colY = barY - barH / 2 - tpx * 1.6
    const cw = (W - 2 * m) / Math.max(1, cols.length)
    cols.forEach((s, j) => {
      const x = m + cw * (j + 0.5)
      items.push(text(s, "tb", Math.min(tpx * 1.3, fitWidth(s, "tb", cw * 0.86)), x, colY, "type", { align: "center" }))
      if (j) items.push(shape("rule", m + cw * j, colY, lw * 0.5, tpx * 1.8, "type"))
    })
    // The headline, centred, a line at a time, as big as the space allows.
    const list = balance(w.headline)
    const top = topY + tpx * 2.4, bottom = colY - tpx * 2
    let sizes = list.map((l) => fitWidth(l, "d", W - 2 * m - lw * 2, (bottom - top) * 0.45) * p.scale)
    const total = sizes.reduce((a, b, j) => a + b * (j < sizes.length - 1 ? p.leading : cap("d")), 0)
    if (total > bottom - top) sizes = sizes.map((s) => (s * (bottom - top)) / total)
    const height = sizes.reduce((a, b, j) => a + b * (j < sizes.length - 1 ? p.leading : cap("d")), 0)
    const block = lines(list, "d", m, top + (bottom - top - height) / 2, W - 2 * m, "center", p.leading, c.riot.length > 1 ? (j) => `riot${j}` : "type", sizes)
    items.push(...block.items)
    return { items, hero: { x: W * (r() < 0.5 ? 0.24 : 0.76), y: top + (bottom - top) * 0.72, size: Math.min(W, bottom - top) * 0.42 } }
  },

  badge(p, w, c, f, r) {
    const { W, H, m, u, land } = f, items = []
    const R = Math.min(land ? H * 0.42 : W * 0.38, H * (land ? 0.32 : 0.26)) * (0.85 + 0.15 * p.scale)
    const cx = land ? m + R * 1.05 + W * 0.04 : W / 2, cy = land ? H / 2 : m + f.logoRoom + R * 1.08
    const ring = w.headline.replace(/\n/g, " ")
    const px = Math.min(R * 0.26, (TAU * R * 0.82) / Math.max(1, measure(ring, "d", 100) / 100 + 1.2))
    items.push(shape("circle", cx, cy, R * 2.25, R * 2.25, "accent", { flat: true, under: true }))
    items.push({ kind: "arc", text: ring, k: "d", px, x: cx, y: cy, r: R * 0.93, w: R * 2, h: R * 2, ink: "onAccent", rot: 0, track: F.track + 0.04, mark: "star" })
    const tpx = 34 * u
    const left = land ? cx + R * 1.3 : m, width = land ? W - left - m : W - 2 * m
    const info = [w.details, w.where].filter(Boolean)
    const align = land ? "left" : "center"
    let y = land ? H / 2 - tpx * 2 : cy + R * 1.2 + tpx
    info.forEach((s, j) => {
      const k = j ? "t" : "d", px2 = j ? tpx : Math.min(tpx * (land ? 2.4 : 2), fitWidth(s, "d", width))
      const it = text(s, k, px2, align === "center" ? W / 2 : left, y + px2 * cap(k) / 2, "type", { align })
      items.push(it); y += it.h + tpx * 0.9
    })
    const cs = Math.min(W, H) * 0.24
    items.push(...ctaItem(w.cta, land ? left + cs * 0.6 : Math.min(W - m - cs * 0.5, cx + R * 0.82), land ? y + cs * 0.7 : cy + R * 0.82, cs, c, p, r))
    return { items, hero: { x: cx, y: cy, size: R * 1.25 } }
  },
}

// ---- the stuff: emoji, stickers and the picture, thrown ----
function throwStuff(p, f, hero, heroToken, items, spot) {
  const { W, H } = f, min = Math.min(W, H)
  let tokens = [...emojiOf(p.emoji).map((e) => ({ type: "emoji", hex: e.hex })), ...stickersOf(p.stickers).map((id) => ({ type: "sticker", id })), ...(p.image && p.imageRole === "scatter" ? [{ type: "image" }] : [])]
  if (heroToken?.type === "emoji" && tokens.length > 1) {
    const rest = tokens.filter((t) => t.hex !== heroToken.hex)
    if (rest.length) tokens = rest
  }
  if (!tokens.length || !p.stuffCount) return []
  const r = mulberry32(p.stuffSeed * 7919 + 13)
  const out = []
  // What stuff in front shouldn't cover: the words, the shapes holding words, the logo.
  const keepClear = items.filter((it) => it.kind === "text" || it.label).map((it) => ({ x: it.x, y: it.y, w: it.w / 2, h: it.h / 2 + it.px * 0.2 || it.h / 2 }))
  if (spot && !spot.huge) keepClear.push({ x: spot.x, y: spot.y, w: spot.s, h: spot.s * 0.6 })
  const covers = (x, y, s) => keepClear.reduce((a, b) => a + Math.max(0, Math.min(x + s / 2, b.x + b.w) - Math.max(x - s / 2, b.x - b.w)) * Math.max(0, Math.min(y + s / 2, b.y + b.h) - Math.max(y - s / 2, b.y - b.h)), 0) / (s * s)
  for (let i = 0; i < p.stuffCount; i++) {
    const token = tokens[i % tokens.length]
    const s = p.stuffSize * min * (0.65 + 0.7 * r())
    const front = p.stuffDepth === "front" || (p.stuffDepth === "mixed" && i % 3 === 2)
    // Several tries; keep the one furthest from what's already down (and, in front, near an edge).
    let best = null, bestScore = -Infinity
    for (let k = 0; k < (front ? 40 : 10); k++) {
      const x = r() * W, y = r() * H
      let d = Infinity
      for (const o of out) d = Math.min(d, Math.hypot(o.x - x, o.y - y) - (o.s + s) * 0.4)
      const edge = Math.min(x, W - x, y, H - y) / min
      // Behind the words still matters: a lemon behind yellow words swallows them.
      const score = d - (front ? edge * min * 2 + covers(x, y, s) * min * 80 : covers(x, y, s) * min * 12)
      if (score > bestScore) { bestScore = score; best = [x, y] }
    }
    const angle = (i / p.stuffCount) * TAU + r() * 0.6
    out.push({
      kind: "stuff", token, x: best[0], y: best[1], s, rot: (r() - 0.5) * 0.9, front, i,
      orbit: { a: angle, rx: hero.size * (0.62 + 0.45 * r()), ry: hero.size * (0.5 + 0.4 * r()) },
      ph: r(), ph2: r(), dir: r() < 0.5 ? -1 : 1, seed: Math.floor(r() * 1000),
    })
  }
  return out
}

// ---- moved by hand ----
// Every part of a post has a role, the same each time the layout is composed: line0, line1… for
// the headline, word0… for scatter's stickers, details, where, cta, number, ring, band0…, picture,
// logo, stuff0…, and shape0… or text0… for the rest. A move (patch.params.moves) is kept by
// layout and role, so a post's own layout keeps what you placed by hand.
function roles(items, w) {
  const seen = {}
  // Parts that come in runs are always numbered (word0, word1…); the rest only from the second on.
  const RUNS = new Set(["word", "band", "shape", "text"])
  const name = (base) => {
    const n = (seen[base] = (seen[base] ?? -1) + 1)
    return RUNS.has(base) ? `${base}${n}` : n ? `${base}${n}` : base
  }
  const same = (a, b) => b && String(a ?? "").trim().toLowerCase() === b.trim().toLowerCase()
  for (const it of items) {
    if (it.follows) continue
    const said = it.text ?? it.label?.join(" ")
    it.role = name(it.cta || same(said, w.cta) ? "cta" : it.big ? "number" : it.kind === "text" && it.line != null ? `line${it.line}`
      : it.kind === "arc" ? "ring" : it.kind === "ticker" ? "band" : same(said, w.details) ? "details" : same(said, w.where) ? "where"
      : it.kind === "shape" && it.label && it.labelK === "d" ? "word" : it.kind === "text" ? "text" : "shape")
  }
}
// Turn and scale a part about its centre.
function grow(it, k) {
  for (const key of ["w", "h", "px", "labelPx", "r", "segW", "line", "stroke"]) if (typeof it[key] === "number") it[key] *= k
}
function moved(p) {
  const out = new Map()
  for (const mv of p.moves ?? []) if (mv.id.startsWith(`${p.layout}:`)) out.set(mv.id.slice(p.layout.length + 1), mv)
  return out
}

// ---- composing (kept between frames until a setting changes) ----
const MOTION_KEYS = new Set(["motion", "stuffMotion", "energy", "beats", "duration", "fps", "keyMode", "phase", "layers", "transparent", "lockLayout", "lockType", "lockColour", "lockMotion", "lockStuff", "lockTexture"])
let kept = { key: "", scene: null }
function compose(g, p, W, H, opts) {
  const key = JSON.stringify([W, H, opts.fontGen ?? 0, opts.image ? [opts.image.w, opts.image.h] : 0, opts.marks?.has(p.logo) ?? false, Object.entries(p).filter(([k]) => !MOTION_KEYS.has(k))])
  if (kept.key === key) return kept.scene
  if (kept.fontGen !== opts.fontGen) capOf.clear()
  widths = new Map()
  G = g
  F = { d: p.display, dw: p.displayWeight, t: p.text, tw: p.textWeight, track: p.tracking }
  const u = Math.min(W, H) / 1080, land = W > H * 1.2
  const m = p.margin * u
  const logoRoom = ["corner", "top", "sticker"].includes(p.logoPlace) && p.layout !== "ticker" ? Math.min(W, H) * Math.min(p.logoSize, 0.2) * 0.9 + 16 * u : 0
  const logoFoot = p.logoPlace === "bottom" ? Math.min(W, H) * Math.min(p.logoSize, 0.2) * 0.9 + 16 * u : 0
  const f = { W, H: H - logoFoot, m, u, land, logoRoom }
  const c = palette(p), w = words(p)
  const r = mulberry32(p.layoutSeed * 2654435761 + 7)
  // The star of the post: your picture, or else the first emoji.
  const first = emojiOf(p.emoji)[0]
  const heroToken = p.image && p.imageRole === "hero" ? { type: "image" } : first ? { type: "emoji", hex: first.hex } : null
  f.star = !!heroToken
  const built = (LAYOUTS[p.layout] ?? LAYOUTS.stack)(p, w, c, f, r)
  const hero = built.hero
  const items = built.items
  items.forEach((it, i) => { it.i ??= i })
  // Stickers holding words stay inside the frame.
  const spot = LOGO_SPOTS(p, { ...f, H })
  const inFrame = (it) => {
    if (it.w < W - 2 * m) it.x = clamp(it.x, m + it.w / 2, W - m - it.w / 2)
    if (it.h < f.H - 2 * m) it.y = clamp(it.y, m + it.h / 2, f.H - m - it.h / 2)
  }
  // How much of the words and the logo a box at x, y covers.
  const hit = (a, b) => Math.max(0, Math.min(a.x + a.w / 2, b.x + b.w / 2) - Math.max(a.x - a.w / 2, b.x - b.w / 2)) * Math.max(0, Math.min(a.y + a.h / 2, b.y + b.h / 2) - Math.max(a.y - a.h / 2, b.y - b.h / 2))
  const others = (it) => [...items.filter((o) => o !== it && (o.kind === "text" || o.label) && !o.big), ...(spot && !spot.huge ? [{ x: spot.x, y: spot.y, w: spot.s, h: spot.s * 0.8 }] : [])]
  for (const it of items) {
    if (it.kind === "shape" && it.label) inFrame(it)
    if (!it.cta) continue
    // The call to action takes the clearest of where the layout put it, the other side, below the
    // logo or one of the frame's corners and edges.
    const tries = [[it.x, it.y], [W - it.x, it.y]]
    if (spot && !spot.huge) tries.push([spot.x, spot.y + spot.s * 0.45 + it.h / 2 + m * 0.3], [W - spot.x, spot.y])
    for (const x of [0, W / 2, W]) for (const y of [0, f.H]) tries.push([x, y])
    let best = null, least = Infinity
    for (const [x, y] of tries) {
      const at = { ...it, x, y }
      inFrame(at)
      const cost = others(it).reduce((a, o) => a + hit(at, o), 0) + Math.hypot(at.x - it.x, at.y - it.y) * 0.01
      if (cost < least) { least = cost; best = at }
    }
    // An underline goes with its words.
    for (const o of items) if (o.follows === it) { o.x += best.x - it.x; o.y += best.y - it.y }
    it.x = best.x; it.y = best.y
  }
  f.H = H
  // The stuff lands where the layout left room, before anything's moved by hand, so moving one
  // thing doesn't throw everything again.
  const thrown = throwStuff(p, f, hero, heroToken, items, spot)
  // What you've moved by hand: shifted, scaled, turned or left out.
  roles(items, w)
  const moves = moved(p)
  const shift = (o, mv) => { o.x += mv.dx * W; o.y += mv.dy * H; o.rot = (o.rot ?? 0) + mv.r; if (mv.s !== 1) grow(o, mv.s) }
  for (const it of items) {
    const mv = it.role && moves.get(it.role)
    if (!mv) continue
    if (mv.hide) { it.hidden = true; continue }
    const x0 = it.x, y0 = it.y
    shift(it, mv)
    for (const o of items) if (o.follows === it) { o.x = it.x + (o.x - x0) * mv.s; o.y = it.y + (o.y - y0) * mv.s; if (mv.s !== 1) grow(o, mv.s); o.rot = (o.rot ?? 0) + mv.r }
  }
  const shown = items.filter((it) => !it.hidden && !it.follows?.hidden)
  const logoMove = moves.get("logo")
  const mark = spot && !logoMove?.hide ? { ...spot, rot: 0 } : null
  if (mark && logoMove) { mark.x += logoMove.dx * W; mark.y += logoMove.dy * H; mark.s *= logoMove.s; mark.rot = logoMove.r }
  const heroMove = moves.get("picture")
  const star0 = heroMove?.hide ? null : heroToken
  if (heroMove && !heroMove.hide) { hero.x += heroMove.dx * W; hero.y += heroMove.dy * H; hero.size *= heroMove.s; hero.rot = heroMove.r }
  const stuff = thrown.filter((o) => {
    const mv = moves.get(`stuff${o.i}`)
    if (mv) { if (mv.hide) return false; o.x += mv.dx * W; o.y += mv.dy * H; o.s *= mv.s; o.rot += mv.r }
    return true
  })
  // Where the logo and the star end up, for the judge (score.js).
  const logo = mark && (opts.marks?.has(p.logo) || p.brandName.trim()) ? mark : null
  const hs = hero.size * (p.imageSize / 0.6), aspect = heroToken?.type === "image" && opts.image ? opts.image.w / opts.image.h : 1
  const star = star0 ? { x: hero.x + (p.imageX * W) / 2, y: hero.y - (p.imageY * H) / 2, w: aspect >= 1 ? hs : hs * aspect, h: aspect >= 1 ? hs / aspect : hs, front: !!hero.front, rot: hero.rot ?? 0 } : null
  kept = { key, fontGen: opts.fontGen, scene: { p, items: shown, stuff, hero, heroToken: star0, star, logo, spot: mark, groupTilt: built.groupTilt ?? (p.tilt * Math.PI) / 180, f, c } }
  return kept.scene
}

// What's where on the stage, at rest, in the order it's drawn (the top one last), for picking
// things up and moving them: { role, name, field, x, y, w, h, rot, tilt } in output pixels, the
// centre already turned by the group's tilt. field is the setting its words come from, if any.
const FIELDS = { cta: "cta", details: "details", where: "where", ring: "headline" }
const NAMES = { cta: "Call to action", details: "Details", where: "Where", number: "Giant number", ring: "Ring of words", picture: "Picture", logo: "Logo" }
export function parts(ctx, patch, opts = {}) {
  const s = scene(ctx, patch, opts), { W, H } = s.f, tilt = s.groupTilt
  const turn = (x, y) => {
    const dx = x - W / 2, dy = y - H / 2
    return [W / 2 + dx * Math.cos(tilt) - dy * Math.sin(tilt), H / 2 + dx * Math.sin(tilt) + dy * Math.cos(tilt)]
  }
  const named = (role) => NAMES[role] ?? role.replace(/^line(\d+)$/, (m, j) => `Headline, line ${+j + 1}`).replace(/^word(\d+)$/, (m, j) => `Headline, word ${+j + 1}`)
    .replace(/^band(\d+)$/, (m, j) => `Band ${+j + 1}`).replace(/^stuff(\d+)$/, (m, j) => `Sticker ${+j + 1}`).replace(/^(shape|text)(\d+)$/, (m, k, j) => `${k === "shape" ? "Shape" : "Words"} ${+j + 1}`)
  // A ticker's bands each say one of your lines; which one is in its words.
  const w = words(s.p), said = (it) => ["details", "where", "cta"].find((k) => w[k] && it.text?.trim().toLowerCase() === w[k].toLowerCase())
  const field = (it) => FIELDS[it.role] ?? (it.kind === "ticker" ? said(it) ?? "headline" : /^(line|word)/.test(it.role) ? "headline" : null)
  const item = (it) => {
    const [x, y] = turn(it.x, it.y)
    const round = it.kind === "arc"
    return { role: it.role, name: named(it.role), field: field(it), x, y, w: round ? it.r * 2 + it.px : it.w, h: round ? it.r * 2 + it.px : it.h, rot: (it.rot ?? 0) + tilt, tilt }
  }
  const out = []
  for (const o of s.stuff) if (!o.front) out.push({ role: `stuff${o.i}`, name: named(`stuff${o.i}`), field: null, x: o.x, y: o.y, w: o.s, h: o.s, rot: o.rot, tilt: 0 })
  for (const it of s.items) if (it.under && it.role) out.push(item(it))
  const hero = s.star && { role: "picture", name: NAMES.picture, field: null, x: s.star.x, y: s.star.y, w: s.star.w, h: s.star.h, rot: s.star.rot, tilt: 0 }
  if (hero && !s.star.front) out.push(hero)
  for (const it of s.items) if (!it.under && it.role) out.push(item(it))
  if (hero && s.star.front) out.push(hero)
  for (const o of s.stuff) if (o.front) out.push({ role: `stuff${o.i}`, name: named(`stuff${o.i}`), field: null, x: o.x, y: o.y, w: o.s, h: o.s, rot: o.rot, tilt: 0 })
  if (s.spot) {
    // On a round sticker it's the circle; otherwise the box a wide mark or the brand name fills.
    const round = s.spot.sticker || (patch.params.layout === "ticker" && !s.spot.huge)
    const box = s.spot.huge ? { w: s.spot.s, h: s.spot.s * 0.5 } : round ? { w: s.spot.s * 1.24, h: s.spot.s * 1.24 } : { w: s.spot.s * 1.6, h: s.spot.s * 0.8 }
    out.push({ role: "logo", name: NAMES.logo, field: null, x: s.spot.x, y: s.spot.y, w: box.w, h: box.h, rot: s.spot.rot, tilt: 0 })
  }
  return out
}

// The post composed but not drawn, at its freeze frame: for the judge (score.js) and the tests.
// ctx only measures, so anything with measureText will do.
export function scene(ctx, patch, opts = {}) {
  const p = resolve(manifest, patch, patch.params.phase ?? 0.5)
  const { w: W, h: H } = size(patch)
  return compose(ctx, p, W, H, opts)
}

// ---- motion ----
const BUILDS = new Set(["pop", "slide", "stamp", "type"])
// Where an item is at time t: { a: alpha, s: scale, dx, dy, rot, chars }.
function move(p, t, i, n, W, u, seed = 0) {
  const e = p.energy, beats = p.beats
  const out = { a: 1, s: 1, dx: 0, dy: 0, rot: 0, chars: 1 }
  const at = 0.03 + 0.26 * (n > 1 ? i / (n - 1) : 0)
  const leave = 0.86 + 0.07 * (n > 1 ? i / (n - 1) : 0)
  switch (p.motion) {
    case "pop": {
      const k = (t - at) / 0.11, o = smooth((t - leave) / 0.05)
      out.s = backOut(k, 1 + 2 * e) * (1 - o)
      out.a = k > 0 && o < 1 ? 1 : 0
      break
    }
    case "slide": {
      const dir = i % 2 ? -1 : 1, k = expoOut((t - at) / 0.14), o = smooth((t - leave) / 0.06)
      out.dx = ((1 - k) - o) * W * (0.5 + 0.5 * e) * dir
      out.a = t >= at && o < 1 ? 1 : 0
      break
    }
    case "stamp": {
      const q = 1 / (beats * 4), when = Math.ceil(at / q) * q
      const k = clamp((t - when) / 0.03)
      out.a = t >= when && t < 0.95 ? 1 : 0
      out.s = 1 + (1 - k) * (1 - k) * 0.6 * e
      out.rot = (hash(seed, i, 3) - 0.5) * 0.12 * e
      break
    }
    case "type": {
      out.chars = clamp((t - at) / 0.12)
      out.a = t < 0.94 ? 1 : 0
      break
    }
    case "wobble": {
      out.rot = Math.sin(TAU * (beats * t + hash(seed, i, 5))) * 0.06 * e
      out.dy = Math.sin(TAU * (beats * t + hash(seed, i, 6))) * 12 * u * e
      out.s = 1 + Math.sin(TAU * (beats * t + hash(seed, i, 7))) * 0.025 * e
      break
    }
    case "jitter": {
      const step = Math.floor(t * beats * 6)
      out.dx = (hash(seed, i, step, 1) - 0.5) * 12 * u * e
      out.dy = (hash(seed, i, step, 2) - 0.5) * 12 * u * e
      out.rot = (hash(seed, i, step, 3) - 0.5) * 0.06 * e
      break
    }
    case "flash": out.s = 1 + 0.05 * e * Math.pow(1 - frac(t * beats), 4); break
  }
  return out
}

// ---- drawing ----
const surfaces = new Map()
function surface(key, w, h) {
  let c = surfaces.get(key)
  if (!c) {
    c = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h })
    surfaces.set(key, c)
  }
  return c
}
// An image's silhouette in one colour, grown by a border (a die-cut sticker's white edge) or not.
const silhouettes = new Map()
function silhouette(img, colour, grow) {
  const key = `${img.src || img.width}|${colour}|${grow}`
  if (silhouettes.has(key)) return silhouettes.get(key)
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height
  const k = 512 / Math.max(iw, ih), w = Math.round(iw * k), h = Math.round(ih * k)
  const pad = Math.ceil(grow * 512)
  const c = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w + pad * 2, h + pad * 2) : Object.assign(document.createElement("canvas"), { width: w + pad * 2, height: h + pad * 2 })
  const x = c.getContext("2d")
  const steps = grow ? 24 : 1
  for (let j = 0; j < steps; j++) {
    const a = (j / steps) * TAU
    x.drawImage(img, pad + Math.cos(a) * pad, pad + Math.sin(a) * pad, w, h)
  }
  if (grow) x.drawImage(img, pad, pad, w, h)
  x.globalCompositeOperation = "source-in"
  x.fillStyle = colour
  x.fillRect(0, 0, c.width, c.height)
  const out = { canvas: c, pad: pad / 512 }
  silhouettes.set(key, out)
  return out
}
// Draw an image centred on 0, 0 at width w, with its finish.
function drawPicture(g, img, w, h, finish, colours, u) {
  if (finish === "sticker") {
    const s = silhouette(img, "#FFFFFF", 0.035)
    const k = Math.max(w, h)
    g.save(); g.shadowColor = "rgba(0,0,0,0.25)"; g.shadowBlur = 0; g.shadowOffsetY = 0.012 * k * g.getTransform().a
    g.drawImage(s.canvas, -w / 2 - s.pad * k, -h / 2 - s.pad * k, w + 2 * s.pad * k, h + 2 * s.pad * k)
    g.restore()
  } else if (finish === "shadow") {
    const s = silhouette(img, colours.shadow, 0)
    const o = Math.max(w, h) * 0.04
    g.drawImage(s.canvas, -w / 2 + o, -h / 2 + o, w, h)
  }
  if (finish === "ink") g.drawImage(silhouette(img, colours.ink, 0).canvas, -w / 2, -h / 2, w, h)
  else g.drawImage(img, -w / 2, -h / 2, w, h)
}

function drawSticker(g, id, w, h, fill, finish, colours, seed) {
  const { path, line, rule } = stickerPath(id, seed)
  g.save()
  g.scale(w / 2, h / 2)
  const lw = 0.16
  if (line) {
    g.lineCap = "round"; g.lineJoin = "round"
    if (finish === "sticker") { g.strokeStyle = "#FFFFFF"; g.lineWidth = lw * 2.6; g.stroke(path) }
    if (finish === "shadow") { g.save(); g.translate(0.1, 0.1); g.strokeStyle = colours.shadow; g.lineWidth = lw; g.stroke(path); g.restore() }
    g.strokeStyle = fill; g.lineWidth = lw; g.stroke(path)
  } else {
    if (finish === "sticker") { g.strokeStyle = "#FFFFFF"; g.lineWidth = lw * 1.2; g.lineJoin = "round"; g.stroke(path) }
    if (finish === "shadow") { g.save(); g.translate(0.1, 0.1); g.fillStyle = colours.shadow; g.fill(path, rule); g.restore() }
    g.fillStyle = fill; g.fill(path, rule)
  }
  g.restore()
}

export const ink = (c, role) => {
  if (role?.startsWith("riot")) { const j = +role.slice(4); return c.riot[j % c.riot.length] }
  if (role?.startsWith("on:")) { const bg = ink(c, role.slice(3)); return [c.ground, c.type, c.onAccent, c.onType].reduce((a, b) => (contrast(b, bg) > contrast(a, bg) ? b : a)) }
  if (role === "accentText") return contrast(c.accent, c.ground) >= 3 ? c.accent : c.type
  return c[role] ?? role
}

function drawText(g, it, c, chars = 1) {
  g.font = face(it.k, it.px)
  if (spacing) g.letterSpacing = `${(it.track * it.px).toFixed(2)}px`
  g.fillStyle = g.strokeStyle = ink(c, it.ink)
  g.textBaseline = "alphabetic"
  const base = it.h / 2
  if (it.stroke) { g.lineWidth = it.stroke; g.lineJoin = "round"; g.textAlign = "center"; g.strokeText(it.text, 0, base); return }
  if (chars < 1) {
    const n = Math.floor([...it.text].length * chars)
    g.textAlign = "left"
    g.fillText([...it.text].slice(0, n).join(""), -it.w / 2, base)
  } else {
    g.textAlign = "center"
    g.fillText(it.text, 0, base)
  }
}

function drawItem(g, it, c, t, p, f, anim) {
  switch (it.kind) {
    case "text": return drawText(g, it, c, anim.chars)
    case "shape": {
      if (it.id === "rule") { g.fillStyle = ink(c, it.fill); g.fillRect(-it.w / 2, -it.h / 2, it.w, it.h); return }
      if (it.id === "frame") { g.strokeStyle = ink(c, it.fill); g.lineWidth = it.line; g.strokeRect(-it.w / 2, -it.h / 2, it.w, it.h); return }
      const fill = ink(c, it.fill)
      if (it.id === "box") {
        g.save()
        if (it.outline && p.stuffTreat === "shadow") { g.fillStyle = c.type === fill ? c.accent : c.type; g.fillRect(-it.w / 2 + it.h * 0.08, -it.h / 2 + it.h * 0.08, it.w, it.h) }
        g.fillStyle = fill
        if (it.tag) {
          const n = it.h * 0.35
          g.beginPath(); g.moveTo(-it.w / 2 - n, 0); g.lineTo(-it.w / 2, -it.h / 2); g.lineTo(it.w / 2, -it.h / 2); g.lineTo(it.w / 2, it.h / 2); g.lineTo(-it.w / 2, it.h / 2); g.closePath(); g.fill()
          g.fillStyle = c.ground; g.beginPath(); g.arc(-it.w / 2 + n * 0.1, 0, it.h * 0.08, 0, TAU); g.fill()
        } else g.fillRect(-it.w / 2, -it.h / 2, it.w, it.h)
        g.restore()
      } else if (it.id === "pill") {
        g.fillStyle = fill; g.beginPath(); g.roundRect(-it.w / 2, -it.h / 2, it.w, it.h, it.h / 2); g.fill()
      } else drawSticker(g, it.id, it.w, it.h, fill, it.flat ? "plain" : p.stuffTreat === "sticker" ? "plain" : p.stuffTreat, { shadow: c.type === fill ? c.ground : c.type }, 0)
      if (it.label) {
        const lab = { kind: "text", k: it.labelK, px: it.labelPx, ink: it.labelInk, track: it.labelK === "d" ? F?.track ?? 0 : 0.01 }
        const lead = it.labelPx * 1.12
        it.label.forEach((s, j) => {
          g.save()
          g.translate(0, (j - (it.label.length - 1) / 2) * lead)
          g.font = face(it.labelK, it.labelPx)
          drawText(g, { ...lab, text: s, w: 0, h: it.labelPx * cap(it.labelK) }, c, anim.chars)
          g.restore()
        })
      }
      return
    }
    case "ticker": {
      g.fillStyle = ink(c, it.bg)
      g.fillRect(-it.w / 2, -it.h / 2, it.w, it.h)
      const run = p.motion === "still" ? 0 : t * it.segW * it.dir * (it.big ? 1 : 1)
      const start = -it.w / 2 - frac(run / it.segW) * it.segW - it.segW
      const colour = ink(c, it.ink)
      for (let x = start; x < it.w / 2 + it.segW; x += it.segW) {
        g.save(); g.translate(x, 0)
        g.font = face(it.k, it.px)
        if (spacing) g.letterSpacing = `${(it.track * it.px).toFixed(2)}px`
        g.fillStyle = colour; g.textAlign = "left"; g.textBaseline = "alphabetic"
        g.fillText(it.text, 0, (it.px * cap(it.k)) / 2)
        g.translate(it.segW - it.px * 0.6, 0)
        drawSticker(g, it.mark, it.px * 0.5, it.px * 0.5, colour, "plain", {}, 0)
        g.restore()
      }
      return
    }
    case "arc": {
      // The words round the circle, repeated to fill it; it turns by one repeat a loop, so it closes.
      g.font = face(it.k, it.px)
      if (spacing) g.letterSpacing = `${(it.track * it.px).toFixed(2)}px`
      const seg = measure(it.text, it.k, it.px, it.track) + it.px * 1.1
      const n = Math.max(1, Math.floor((TAU * it.r) / seg))
      const step = TAU / n
      const spin = p.motion === "still" ? 0 : -t * step * (p.beats > 3 ? 2 : 1)
      g.fillStyle = ink(c, it.ink); g.textAlign = "left"; g.textBaseline = "alphabetic"
      for (let j = 0; j < n; j++) {
        let a = spin + j * step - Math.PI / 2
        for (const ch of it.text) {
          const cw = measure(ch, it.k, it.px, it.track)
          g.save(); g.rotate(a + cw / it.r / 2); g.translate(0, -it.r); g.fillText(ch, -cw / 2, 0); g.restore()
          a += cw / it.r
        }
        g.save(); g.rotate(a + (it.px * 0.55) / it.r); g.translate(0, -it.r - it.px * 0.35)
        drawSticker(g, it.mark, it.px * 0.45, it.px * 0.45, ink(c, it.ink), "plain", {}, 0); g.restore()
      }
      return
    }
  }
}

function drawToken(g, token, s, opts, c, p, finish, fill, seed) {
  if (token.type === "emoji") {
    const img = opts.emoji?.get(token.hex)
    if (img) drawPicture(g, img, s, s, finish, { shadow: c.type, ink: c.type }, 1)
  } else if (token.type === "sticker") drawSticker(g, token.id, s, s, fill, finish, { shadow: c.type === fill ? c.ground : c.type }, seed)
  else if (token.type === "image" && opts.image) {
    const { el, w, h } = opts.image, k = s / Math.max(w, h)
    drawPicture(g, el, w * k, h * k, finish === "plain" ? "as" : finish, { shadow: c.type, ink: c.accent }, 1)
  }
}

// Where a piece of stuff is at time t.
function stuffAt(o, p, t, f, hero) {
  const { W, H, u } = f, e = p.energy, cyc = Math.max(1, Math.round(p.beats / 2))
  let { x, y, rot } = o
  switch (p.stuffMotion) {
    case "float": y += Math.sin(TAU * (cyc * t + o.ph)) * 18 * u * (0.4 + e); rot += Math.sin(TAU * (t + o.ph2)) * 0.15 * e; break
    case "orbit": {
      const a = o.orbit.a + TAU * t * o.dir * (o.i % 2 ? 1 : 1)
      x = hero.x + Math.cos(a) * o.orbit.rx * (1.1 + 0.3 * e); y = hero.y + Math.sin(a) * o.orbit.ry * (1.1 + 0.3 * e); break
    }
    case "drift": {
      const span = W + o.s * 2
      x = ((o.x + t * span * o.dir + span * 4) % span) - o.s
      y += Math.sin(TAU * (cyc * t + o.ph)) * 10 * u; break
    }
    case "rain": {
      const span = H + o.s * 2
      y = ((o.y + t * span * (o.i % 3 ? 1 : 2)) % span) - o.s
      rot += TAU * t * o.dir * 0.25 * (o.i % 3 ? 0 : 4); break
    }
    case "spin": rot += TAU * t * o.dir * (o.i % 2 ? 1 : 2); break
    case "jitter": {
      const step = Math.floor(t * p.beats * 6)
      x += (hash(o.seed, step, 1) - 0.5) * 14 * u * e; y += (hash(o.seed, step, 2) - 0.5) * 14 * u * e; rot += (hash(o.seed, step, 3) - 0.5) * 0.1 * e
      break
    }
  }
  return { x, y, rot }
}

const LOGO_SPOTS = (p, f, r) => {
  const { W, H, m } = f, s = Math.min(W, H) * p.logoSize
  switch (p.logoPlace) {
    case "top": return { x: W / 2, y: m + s * 0.5, s }
    case "bottom": return { x: W / 2, y: H - m * 0.5 - s * 0.45, s }
    case "sticker": return { x: W - m - s * 0.65, y: m + s * 0.65, s, sticker: true }
    case "huge": return { x: W / 2, y: H / 2, s: Math.min(W, H) * 0.85, huge: true }
    case "none": return null
    default: return { x: (p.layoutSeed % 2 ? W - m - s / 2 : m + s / 2), y: m + s * 0.5, s, corner: true }
  }
}

function drawLogo(g, p, f, c, opts, a, at) {
  if (!at || a.a <= 0) return
  const spot = { ...at }
  if (p.layout === "ticker" && !spot.huge) spot.sticker = true
  const mark = opts.marks?.get(p.logo)
  g.save()
  g.translate(spot.x + a.dx, spot.y + a.dy)
  g.rotate(a.rot + spot.rot + (spot.sticker ? -0.15 : 0))
  g.scale(a.s, a.s)
  if (spot.huge) g.globalAlpha = 0.14
  if (spot.sticker) { g.fillStyle = c.accent === c.ground ? c.type : c.accent; g.beginPath(); g.arc(0, 0, spot.s * 0.62, 0, TAU); g.fill() }
  const on = spot.sticker ? (c.accent === c.ground ? c.ground : c.onAccent) : c.type
  const box = spot.s * (spot.sticker ? 0.78 : 1)
  if (mark) {
    const colour = p.logoColour === "original" ? "original" : "ink"
    const on2 = p.logoColour === "auto" ? (contrast(p.black, c.ground) > contrast(p.paper, c.ground) ? p.black : p.paper) : on
    const k = f.scale
    const tall = mark.bounds.h > mark.bounds.w * 0.6
    const bw = tall ? box * 0.8 : box * 1.6, bh = tall ? box * 0.8 : box * 0.8
    drawMarkAt(g, mark, -bw / 2, -bh / 2, bw, bh, on2, colour, k)
  } else if (p.brandName.trim()) {
    const s = p.brandName.trim()
    G = g
    const k = spot.huge ? "d" : "tb"
    const px = Math.min(spot.huge ? spot.s : box * 0.3, fitWidth(s, k, spot.huge ? f.W * 0.9 : box * (spot.sticker ? 1 : 2.2)))
    g.font = face(k, px)
    if (spacing) g.letterSpacing = `${(0.04 * px).toFixed(2)}px`
    g.fillStyle = on; g.textAlign = spot.corner ? (spot.x > f.W / 2 ? "right" : "left") : "center"; g.textBaseline = "middle"
    g.fillText(s, spot.corner ? (spot.x > f.W / 2 ? spot.s / 2 : -spot.s / 2) : 0, 0)
  }
  g.restore()
}
// drawMark works in output pixels and sets the transform itself; draw it inside the current one.
function drawMarkAt(g, mark, x, y, w, h, colour, mode, k) {
  const base = g.getTransform()
  const proxy = new Proxy(g, {
    get(target, prop) {
      if (prop === "setTransform") return (a, b, c, d, e, f) => target.setTransform(base.multiply(new DOMMatrix([a / k, b / k, c / k, d / k, e / k, f / k])))
      const v = target[prop]
      return typeof v === "function" ? v.bind(target) : v
    },
    set(target, prop, value) { target[prop] = value; return true },
  })
  drawMark(proxy, mark, x, y, w, h, colour, { fit: "contain", colour: mode, scale: k })
}

export function render(ctx, patch, t, opts = {}) {
  const p = resolve(manifest, patch, t)
  const { w: W, h: H } = size(patch)
  const scale = opts.scale ?? 1
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  const scene = compose(ctx, p, W, H, opts)
  const f = { ...scene.f, scale }
  let c = scene.c
  if (p.motion === "flash") c = flashed(c, Math.floor(t * p.beats * 2))
  const u = f.u

  // The ground, or the picture as the whole background.
  if (!p.transparent) { ctx.fillStyle = c.ground; ctx.fillRect(0, 0, W, H) }
  if (opts.image && p.imageRole === "backdrop") {
    const { el, w, h } = opts.image, k = Math.max(W / w, H / h) * (0.6 + p.imageSize * 0.7)
    ctx.save()
    ctx.translate(W / 2 + (p.imageX * W) / 2, H / 2 - (p.imageY * H) / 2)
    const drift = 1 + 0.04 * p.energy * Math.sin(TAU * t)
    ctx.scale(drift, drift)
    ctx.drawImage(el, (-w * k) / 2, (-h * k) / 2, w * k, h * k)
    ctx.restore()
    ctx.globalAlpha = 0.28; ctx.fillStyle = c.ground; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1
  }
  if (p.logoPlace === "huge") drawLogo(ctx, p, f, c, opts, { a: 1, s: 1, dx: 0, dy: 0, rot: 0 }, scene.spot)

  const build = BUILDS.has(p.motion)
  const n = scene.items.length + 2
  const stuffMove = (o) => {
    if (!build) return { a: 1, s: 1 }
    const at = 0.05 + 0.4 * (o.i / Math.max(1, p.stuffCount)), k = (t - at) / 0.1, out = smooth((t - 0.9) / 0.05)
    return { a: k > 0 && out < 1 ? 1 : 0, s: backOut(k, 2) * (1 - out) }
  }
  const drawStuff = (front) => {
    for (const o of scene.stuff) {
      if (o.front !== front) continue
      const m = stuffMove(o)
      if (m.a <= 0 || m.s <= 0.001) continue
      const at = stuffAt(o, p, t, f, scene.hero)
      ctx.save()
      ctx.translate(at.x, at.y); ctx.rotate(at.rot); ctx.scale(m.s, m.s)
      const fills = [c.accent, c.type, ...c.riot]
      drawToken(ctx, o.token, o.s, opts, c, p, p.stuffTreat, fills[o.i % fills.length] === c.ground ? c.type : fills[o.i % fills.length], o.seed)
      ctx.restore()
    }
  }
  drawStuff(false)

  // The words and shapes, turned together by the tilt: what lies under the picture first.
  const drawItems = (under) => {
    ctx.save()
    ctx.translate(W / 2, H / 2); ctx.rotate(scene.groupTilt); ctx.translate(-W / 2, -H / 2)
    G = ctx
    F = { d: p.display, dw: p.displayWeight, t: p.text, tw: p.textWeight, track: p.tracking }
    for (const it of scene.items) {
      if (!!it.under !== under) continue
      const a = it.kind === "ticker" || it.kind === "arc" ? { a: 1, s: 1, dx: 0, dy: 0, rot: 0, chars: 1 } : move(p, t, it.i + 1, n, W, u, it.line ?? 0)
      if (a.a <= 0 || a.s <= 0.001) continue
      ctx.save()
      ctx.translate(it.x + a.dx, it.y + a.dy)
      ctx.rotate(it.rot + a.rot)
      ctx.scale(a.s, a.s)
      drawItem(ctx, it, c, t, p, f, a)
      ctx.restore()
    }
    ctx.restore()
  }
  drawItems(true)

  // The star: your picture or the first emoji.
  const ht = scene.heroToken
  const drawHero = () => {
    if (ht && (ht.type === "emoji" ? opts.emoji?.get(ht.hex) : opts.image)) {
      const h = scene.hero
      const a = move(p, t, 0, n, W, u, 7)
      const bob = build ? 0 : Math.sin(TAU * t) * 10 * u * p.energy
      if (a.a > 0 && a.s > 0.001) {
        ctx.save()
        ctx.translate(h.x + (p.imageX * W) / 2 + a.dx, h.y - (p.imageY * H) / 2 + a.dy + bob)
        ctx.rotate(a.rot + (h.rot ?? 0))
        ctx.scale(a.s, a.s)
        const size = h.size * (p.imageSize / 0.6)
        if (ht.type === "emoji") drawPicture(ctx, opts.emoji.get(ht.hex), size, size, p.stuffTreat === "plain" ? "as" : p.stuffTreat, { shadow: c.type, ink: c.type }, u)
        else {
          const { el, w: iw, h: ih } = opts.image, k = size / Math.max(iw, ih)
          drawPicture(ctx, el, iw * k, ih * k, p.imageTreat, { shadow: c.type, ink: c.accent }, u)
        }
        ctx.restore()
      }
    }
  }
  if (!scene.hero.front) drawHero()
  drawItems(false)
  if (scene.hero.front) drawHero()

  drawStuff(true)
  if (p.logoPlace !== "huge") drawLogo(ctx, p, f, c, opts, move(p, t, 0, n, W, u, 11), scene.spot)

  ctx.restore()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  if (p.layers?.length) applyStack(ctx, p.layers, { t, frame: opts.frame ?? 0, scale, seed: patch.seed, background: c.ground, clear: p.transparent, assets: opts.assets })
}
