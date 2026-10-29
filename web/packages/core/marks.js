// Marks: logos, brand marks and graphics that ride in the grid like words. A line "@logo" in
// Content puts the mark called logo in that slot; it stretches, swaps by size, takes the inks
// and goes through the effects exactly as a word does.
//   SVG   parsed into vector paths (never put into the page), so it stays crisp at any export size
//         and can be filled with any ink. The SVG text travels inside the patch, so a patch with
//         marks works anywhere: links, presets, embeds.
//   PNG, JPEG, WebP   kept in this browser (store.js); the patch names them. Transparent images
//         use their alpha as the shape; opaque ones use darkness (dark is ink, light is paper).
// Supported SVG: path, rect, circle, ellipse, polygon, polyline, with transforms and fills (attribute,
// style or class). Strokes, gradients, masks and text inside the SVG are ignored: outline them first.
import { files } from "./store.js"

export const MAX_SVG = 300000
export const markName = (fileName) =>
  fileName.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "mark"
export const looksLikeSvg = (text) => typeof text === "string" && text.length <= MAX_SVG && /<svg[\s>]/i.test(text.slice(0, 4000))

// Names of the marks a patch's content refers to.
export const referenced = (content) => [...new Set(content.split("\n").map((l) => l.trim()).filter((l) => /^@[a-z0-9-]+$/.test(l)).map((l) => l.slice(1)))]

// ---- SVG ----
const SHAPES = new Set(["path", "rect", "circle", "ellipse", "polygon", "polyline"])
const SKIP = new Set(["defs", "clipPath", "mask", "symbol", "style", "title", "desc", "metadata", "linearGradient", "radialGradient", "pattern", "text"])

function parseTransform(s) {
  let m = new DOMMatrix()
  if (!s) return m
  for (const [, fn, args] of s.matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
    const a = args.split(/[\s,]+/).filter(Boolean).map(Number)
    if (fn === "matrix") m = m.multiply(new DOMMatrix(a))
    else if (fn === "translate") m = m.translate(a[0], a[1] ?? 0)
    else if (fn === "scale") m = m.scale(a[0], a[1] ?? a[0])
    else if (fn === "rotate") m = a.length === 3 ? m.translate(a[1], a[2]).rotate(a[0]).translate(-a[1], -a[2]) : m.rotate(a[0])
    else if (fn === "skewX") m = m.skewX(a[0])
    else if (fn === "skewY") m = m.skewY(a[0])
  }
  return m
}

function shapeData(el) {
  const n = (k) => parseFloat(el.getAttribute(k)) || 0
  switch (el.localName) {
    case "path": return el.getAttribute("d") || ""
    case "rect": { const x = n("x"), y = n("y"), w = n("width"), h = n("height"); return `M${x} ${y}h${w}v${h}h${-w}Z` }
    case "circle": { const r = n("r"), cx = n("cx"), cy = n("cy"); return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z` }
    case "ellipse": { const rx = n("rx"), ry = n("ry"), cx = n("cx"), cy = n("cy"); return `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z` }
    default: {
      const pts = (el.getAttribute("points") || "").trim().split(/[\s,]+/).map(Number)
      let d = ""
      for (let i = 0; i + 1 < pts.length; i += 2) d += `${i ? "L" : "M"}${pts[i]} ${pts[i + 1]}`
      return el.localName === "polygon" ? d + "Z" : d
    }
  }
}

export function parseSvg(text) {
  const doc = new DOMParser().parseFromString(text, "image/svg+xml")
  const svg = doc.documentElement
  if (svg.localName !== "svg" || doc.querySelector("parsererror")) throw new Error("That SVG couldn't be read.")
  // Class rules from <style>, as Illustrator writes them: .cls-1 { fill: #231f20; }
  const classes = {}
  for (const st of doc.querySelectorAll("style")) {
    for (const [, sel, body] of st.textContent.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      const fill = body.match(/fill\s*:\s*([^;]+)/)?.[1].trim()
      if (fill) for (const c of sel.split(",")) { const k = c.trim().match(/^\.([\w-]+)$/); if (k) classes[k[1]] = fill }
    }
  }
  const fillOf = (el, inherited) => {
    const style = el.getAttribute("style")?.match(/fill\s*:\s*([^;]+)/)?.[1].trim()
    const cls = (el.getAttribute("class") || "").split(/\s+/).map((c) => classes[c]).find(Boolean)
    return style || el.getAttribute("fill") || cls || inherited
  }
  const shapes = []
  const walk = (node, m, fill) => {
    for (const el of node.children) {
      if (SKIP.has(el.localName)) continue
      const mm = m.multiply(parseTransform(el.getAttribute("transform")))
      const f = fillOf(el, fill)
      if (SHAPES.has(el.localName)) {
        if (f === "none") continue
        const path = new Path2D()
        path.addPath(new Path2D(shapeData(el)), mm)
        const rule = (el.getAttribute("fill-rule") || el.getAttribute("style")?.match(/fill-rule\s*:\s*(\w+)/)?.[1]) === "evenodd" ? "evenodd" : "nonzero"
        shapes.push({ path, fill: f && f !== "currentColor" ? f : null, rule })
      } else walk(el, mm, f)
    }
  }
  walk(svg, new DOMMatrix(), null)
  if (!shapes.length) throw new Error("That SVG has no filled shapes. Outline strokes and text first.")
  const vb = svg.viewBox?.baseVal
  const box = vb && vb.width ? { x: vb.x, y: vb.y, w: vb.width, h: vb.height }
    : { x: 0, y: 0, w: parseFloat(svg.getAttribute("width")) || 100, h: parseFloat(svg.getAttribute("height")) || 100 }
  const mark = { kind: "svg", shapes, box }
  mark.bounds = inkBounds(box, (c, k) => {
    c.setTransform(k, 0, 0, k, -box.x * k, -box.y * k)
    for (const s of shapes) c.fill(s.path, s.rule)
  }) || box
  return mark
}

// The tight box around what's actually drawn, found by rasterising once. In the mark's own units.
function inkBounds(box, draw, size = 640) {
  const k = size / Math.max(box.w, box.h)
  const W = Math.max(1, Math.ceil(box.w * k)), H = Math.max(1, Math.ceil(box.h * k))
  const c = cpuCanvas(W, H)
  draw(c, k)
  const { data } = c.getImageData(0, 0, W, H)
  let x0 = W, y0 = H, x1 = -1, y1 = -1
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (data[(y * W + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
  }
  if (x1 < 0) return null
  return { x: box.x + x0 / k, y: box.y + y0 / k, w: (x1 - x0 + 1) / k, h: (y1 - y0 + 1) / k }
}

// Pinned to the CPU so stretched draws match between preview and export (see effects/photocopy.js).
function cpuCanvas(w, h) {
  const c = Object.assign(document.createElement("canvas"), { width: w, height: h })
  return c.getContext("2d", { willReadFrequently: true })
}

// ---- images ----
async function parseRaster(blob) {
  const img = await createImageBitmap(blob)
  const k = Math.min(1, 2048 / Math.max(img.width, img.height))
  const W = Math.round(img.width * k), H = Math.round(img.height * k)
  const art = cpuCanvas(W, H)
  art.drawImage(img, 0, 0, W, H)
  const d = art.getImageData(0, 0, W, H)
  let transparent = false
  for (let i = 3; i < d.data.length; i += 4 * 37) if (d.data[i] < 250) { transparent = true; break }
  // The shape: alpha if the image has any. Otherwise the background is taken out: its colour is
  // read from the corners, and each pixel is as solid as it is different from it.
  const mask = cpuCanvas(W, H)
  const m = mask.createImageData(W, H)
  const bg = [0, 1, 2].map((c) => [0, W - 1, (H - 1) * W, H * W - 1].reduce((a, q) => a + d.data[q * 4 + c], 0) / 4)
  for (let i = 0; i < d.data.length; i += 4) {
    const away = Math.max(Math.abs(d.data[i] - bg[0]), Math.abs(d.data[i + 1] - bg[1]), Math.abs(d.data[i + 2] - bg[2]))
    m.data[i] = m.data[i + 1] = m.data[i + 2] = 0
    m.data[i + 3] = transparent ? d.data[i + 3] : Math.max(0, Math.min(255, (away - 12) * 4))
  }
  mask.putImageData(m, 0, 0)
  // In colour too: each pixel takes the shape's alpha, with the background it was blended into
  // taken back out, so edges don't keep a fringe of the old background.
  if (!transparent) {
    for (let i = 0; i < d.data.length; i += 4) {
      const a = m.data[i + 3] / 255
      for (let c = 0; c < 3; c++) d.data[i + c] = a > 0.02 ? Math.max(0, Math.min(255, (d.data[i + c] - bg[c] * (1 - a)) / a)) : 0
      d.data[i + 3] = m.data[i + 3]
    }
    art.putImageData(d, 0, 0)
  }
  const box = { x: 0, y: 0, w: W, h: H }
  return { kind: "image", art: art.canvas, mask: mask.canvas, tints: new Map(), box, bounds: inkBounds(box, (c, s) => { c.scale(s, s); c.drawImage(mask.canvas, 0, 0) }, Math.min(640, Math.max(W, H))) || box }
}

function tinted(mark, ink) {
  let c = mark.tints.get(ink)
  if (!c) {
    const t = cpuCanvas(mark.mask.width, mark.mask.height)
    t.drawImage(mark.mask, 0, 0)
    t.globalCompositeOperation = "source-in"
    t.fillStyle = ink
    t.fillRect(0, 0, mark.mask.width, mark.mask.height)
    mark.tints.set(ink, (c = t.canvas))
  }
  return c
}

// ---- loading and drawing ----
const svgCache = new Map() // text -> parsed
const rasterCache = new Map() // name -> Promise<parsed>

// Everything the patch's content refers to, ready to draw: Map name -> mark.
export async function prepareMarks(patch) {
  const out = new Map()
  const names = referenced(patch.params.content)
  if (patch.params.shape && !names.includes(patch.params.shape)) names.push(patch.params.shape)
  for (const name of names) {
    const text = patch.marks?.[name]
    if (text) {
      if (!svgCache.has(text)) { try { svgCache.set(text, parseSvg(text)) } catch { svgCache.set(text, null) } }
      if (svgCache.get(text)) out.set(name, svgCache.get(text))
      continue
    }
    if (!rasterCache.has(name)) rasterCache.set(name, files.get("marks", name).then((r) => (r ? parseRaster(r.blob) : null)).catch(() => null))
    const m = await rasterCache.get(name)
    if (m) out.set(name, m)
  }
  return out
}

// An added file: SVG text comes back to go in the patch; images are stored in the browser.
export async function addMarkFile(file) {
  const name = markName(file.name)
  if (/\.svg$/i.test(file.name) || file.type === "image/svg+xml") {
    const text = await file.text()
    if (!looksLikeSvg(text)) throw new Error(`${file.name} isn't an SVG, or it's over 300 KB.`)
    parseSvg(text)
    return { name, svg: text }
  }
  if (!/^image\//.test(file.type)) throw new Error(`${file.name} isn't an image.`)
  await parseRaster(file)
  await files.put("marks", name, file)
  rasterCache.delete(name)
  return { name }
}

export const listImageMarks = () => files.list("marks")
export async function removeImageMark(name) { await files.remove("marks", name); rasterCache.delete(name) }

// Draw a mark into a rectangle (output pixels). fit: "stretch" fills it, "contain" keeps proportions.
// colour: "ink" fills the shape with ink, "original" keeps the artwork's own colours.
export function drawMark(ctx, mark, x, y, w, h, ink, { fit = "stretch", colour = "ink", scale = 1 } = {}) {
  const b = mark.bounds
  let sx = w / b.w, sy = h / b.h
  if (fit === "contain") {
    const s = Math.min(sx, sy)
    x += (w - b.w * s) / 2; y += (h - b.h * s) / 2
    sx = sy = s
  }
  if (mark.kind === "svg") {
    ctx.setTransform(scale * sx, 0, 0, scale * sy, scale * (x - b.x * sx), scale * (y - b.y * sy))
    for (const s of mark.shapes) {
      ctx.fillStyle = colour === "original" && s.fill ? s.fill : ink
      ctx.fill(s.path, s.rule)
    }
  } else {
    ctx.setTransform(scale, 0, 0, scale, 0, 0)
    ctx.drawImage(colour === "original" ? mark.art : tinted(mark, ink), b.x, b.y, b.w, b.h, x, y, b.w * sx, b.h * sy)
  }
}

// A small preview for the rack.
export function thumbnail(mark, w = 64, h = 32) {
  const c = Object.assign(document.createElement("canvas"), { width: w * 2, height: h * 2 })
  c.style.width = `${w}px`
  c.style.height = `${h}px`
  drawMark(c.getContext("2d"), mark, 4, 4, w * 2 - 8, h * 2 - 8, "#1A1714", { fit: "contain" })
  return c
}

// ---- shape fill: a mark as the silhouette the type lives in ----

// Where the shape sits, in output pixels: the frame scaled about its centre, then moved.
// x and y run -1 to 1 (a half frame each way), so the shape can travel across and off the frame.
export function shapeRect({ shapeScale = 1, shapeX = 0, shapeY = 0 }, W, H) {
  const w = W * shapeScale, h = H * shapeScale
  return { x: (W - w) / 2 + (shapeX * W) / 2, y: (H - h) / 2 + (shapeY * H) / 2, w, h }
}

const maskCtx = typeof document !== "undefined" ? document.createElement("canvas").getContext("2d", { willReadFrequently: true }) : null

// The silhouette at canvas resolution, drawn from the vector each frame so its edges are as sharp
// as the export. withData also returns its pixels, for testing which cells fall inside.
export function shapeMask(mark, p, W, H, scale, cw, ch, withData = false) {
  const c = maskCtx.canvas
  if (c.width !== cw || c.height !== ch) { c.width = cw; c.height = ch }
  maskCtx.setTransform(1, 0, 0, 1, 0, 0)
  maskCtx.clearRect(0, 0, cw, ch)
  const r = shapeRect(p, W, H)
  drawMark(maskCtx, mark, r.x, r.y, r.w, r.h, "#000000", { fit: p.shapeFit, scale })
  return { canvas: c, data: withData ? maskCtx.getImageData(0, 0, cw, ch).data : null, width: cw }
}

// How much of a cell (output pixels) the silhouette covers, from its centre and four inner points.
export function coverage(mask, cell, scale) {
  let a = 0
  for (const [fx, fy] of [[0.5, 0.5], [0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
    const x = Math.min(mask.width - 1, Math.max(0, ((cell.x + cell.w * fx) * scale) | 0))
    const y = Math.max(0, ((cell.y + cell.h * fy) * scale) | 0)
    a += (mask.data[(y * mask.width + x) * 4 + 3] || 0) / 255
  }
  return a / 5
}
