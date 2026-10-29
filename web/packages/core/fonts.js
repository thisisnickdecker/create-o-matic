// Fonts from five places, made ready for canvas drawing:
//   open    the open catalogue: every Google family plus ~120 more open-source faces, served by
//           Fontsource (fontsource.org) from jsDelivr. Free to use, embed and ship (mostly OFL).
//   google  a Google Fonts family by name, through Google's own CSS (kept for older patches)
//   adobe   a family from an Adobe Fonts web project (kit); the kit must list this domain
//   system  a family installed on this computer (fine for previews, not portable)
//   file    a font file you added; kept in this browser (store.js) under its family name
// Canvas only draws fonts the document has already loaded, so instruments await ensureFont()
// before drawing and again whenever the family, source or weights change.
import { files } from "./store.js"

const quote = (family) => `"${family.replace(/"/g, "")}"`
export const fontString = (weight, size, family) => `${weight} ${size}px ${quote(family)}, sans-serif`

// ---- the catalogues the font picker lists ----

let catalogue
export function openCatalogue() {
  catalogue ??= fetch("https://api.fontsource.org/v1/fonts").then((r) => r.json())
    .then((list) => list.map((f) => ({ family: f.family, source: "open", id: f.id, category: f.category, variable: f.variable, weights: f.weights, google: f.type === "google", license: f.license })))
    .catch(() => [])
  return catalogue
}

export async function adobeFamilies(kit) {
  if (!/^[a-z0-9]+$/i.test(kit || "")) return []
  const css = await fetch(`https://use.typekit.net/${kit}.css`).then((r) => r.text()).catch(() => "")
  return [...new Set([...css.matchAll(/font-family:"([^"]+)"/g)].map((m) => m[1]))].map((family) => ({ family, source: "adobe", category: "adobe", kit }))
}

// Chrome and Edge only, and it asks permission the first time.
export async function installedFamilies() {
  if (!("queryLocalFonts" in window)) return null
  const fonts = await window.queryLocalFonts().catch(() => [])
  return [...new Set(fonts.map((f) => f.family))].sort().map((family) => ({ family, source: "system", category: "installed" }))
}

export async function myFamilies() {
  return (await files.list("fonts")).map((f) => ({ family: f.name, source: "file", category: "my fonts" }))
}

// A dropped or chosen font file: registered now and kept for next time.
export async function addFontFile(file) {
  const family = file.name.replace(/\.(otf|ttf|woff2?)$/i, "").replace(/[-_](Variable|VF|Regular)$/i, "")
  const face = new FontFace(family, await file.arrayBuffer(), { weight: "1 1000" })
  await face.load()
  document.fonts.add(face)
  await files.put("fonts", family, file)
  registered.add(`file|${family}`)
  return family
}

// ---- loading ----

const registered = new Set()
const sheets = new Map()

function addSheet(url) {
  if (!sheets.has(url)) sheets.set(url, new Promise((resolve) => {
    const link = Object.assign(document.createElement("link"), { rel: "stylesheet", href: url })
    link.onload = () => resolve(true)
    link.onerror = () => resolve(false)
    document.head.appendChild(link)
  }))
  return sheets.get(url)
}

async function googleSheet(family, lo, hi) {
  const base = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}`
  const tries = lo === hi ? [`${base}:wght@${lo}`, `${base}:wght@100..900`, base] : [`${base}:wght@100..900`, `${base}:wght@${lo};${hi}`, `${base}:wght@${lo}`, base]
  for (const url of tries) {
    const key = `${url}&display=block`
    if (sheets.has(key) && (await sheets.get(key))) return true
    // Google answers 400 when a family has no variable range, so fetch first to find out.
    const res = await fetch(key).catch(() => null)
    if (!res?.ok) continue
    const style = document.createElement("style")
    style.textContent = await res.text()
    document.head.appendChild(style)
    sheets.set(key, Promise.resolve(true))
    return true
  }
  return false
}

const meta = new Map()
const fontsourceMeta = (id) => {
  if (!meta.has(id)) meta.set(id, fetch(`https://api.fontsource.org/v1/fonts/${id}`).then((r) => (r.ok ? r.json() : null)).catch(() => null))
  return meta.get(id)
}

// Fontsource serves one file per weight (or one variable file); register what the patch needs.
async function fontsourceFaces(family, weights) {
  const id = family.toLowerCase().replace(/[^a-z0-9]+/g, "-")
  const m = await fontsourceMeta(id)
  if (!m) return false
  const subset = m.defSubset || "latin"
  const cdn = "https://cdn.jsdelivr.net/fontsource/fonts"
  if (m.variable && !registered.has(`open|${family}|vf`)) {
    const face = new FontFace(family, `url(${cdn}/${id}:vf@latest/${subset}-wght-normal.woff2)`, { weight: "100 900" })
    try { await face.load(); document.fonts.add(face); registered.add(`open|${family}|vf`); return true } catch {}
  }
  if (registered.has(`open|${family}|vf`)) return true
  const nearest = (w) => m.weights.reduce((a, b) => (Math.abs(b - w) < Math.abs(a - w) ? b : a))
  await Promise.all([...new Set(weights.map(nearest))].map(async (w) => {
    if (registered.has(`open|${family}|${w}`)) return
    const face = new FontFace(family, `url(${cdn}/${id}@latest/${subset}-${w}-normal.woff2)`, { weight: String(w) })
    try { await face.load(); document.fonts.add(face); registered.add(`open|${family}|${w}`) } catch {}
  }))
  return true
}

async function fileFace(family) {
  if (registered.has(`file|${family}`)) return true
  const rec = await files.get("fonts", family)
  if (!rec) return false
  const face = new FontFace(family, await rec.blob.arrayBuffer(), { weight: "1 1000" })
  await face.load()
  document.fonts.add(face)
  registered.add(`file|${family}`)
  return true
}

export async function ensureFont({ source, family, kit, weights = [400], sample = "" }) {
  family = (family || "").trim()
  if (!family) return { ok: false, note: "No family set." }
  const lo = Math.min(...weights), hi = Math.max(...weights)

  if (source === "open") {
    if (!(await fontsourceFaces(family, weights))) return { ok: false, note: `“${family}” isn't in the open catalogue.` }
  } else if (source === "google") {
    if (!(await googleSheet(family, lo, hi))) return { ok: false, note: `Google Fonts has no family called “${family}”.` }
  } else if (source === "adobe") {
    if (!/^[a-z0-9]+$/i.test(kit || "")) return { ok: false, note: "Set the Adobe kit ID." }
    if (!(await addSheet(`https://use.typekit.net/${kit}.css`))) return { ok: false, note: "The Adobe kit didn't load." }
  } else if (source === "file") {
    if (!(await fileFace(family).catch(() => false))) return { ok: false, note: `“${family}” isn't in My fonts on this computer. Add the file again.` }
  }

  const text = sample || "AaBbCc"
  try { await Promise.all([...new Set(weights)].map((w) => document.fonts.load(`${w} 100px ${quote(family)}`, text))) } catch {}
  const ok = document.fonts.check(`${lo} 100px ${quote(family)}`, text)
  if (ok) return { ok, note: "" }
  if (source === "adobe") return { ok, note: `“${family}” isn't in kit ${kit}, or the kit doesn't allow this domain.` }
  if (source === "system") return { ok, note: `“${family}” isn't installed here; showing a fallback.` }
  return { ok, note: `“${family}” loaded without the characters used.` }
}

// For the picker: load just enough of a face to show its name in it.
const previews = new Map()
export function previewFont(entry) {
  const key = `${entry.source}|${entry.family}`
  if (!previews.has(key)) {
    previews.set(key, (async () => {
      if (entry.source === "open") {
        const w = entry.weights?.includes(400) ? 400 : entry.weights?.[0] ?? 400
        const face = new FontFace(`preview ${entry.family}`, `url(https://cdn.jsdelivr.net/fontsource/fonts/${entry.id}@latest/latin-${w}-normal.woff2)`)
        await face.load(); document.fonts.add(face)
        return `preview ${entry.family}`
      }
      if (entry.source === "file") { await fileFace(entry.family); return entry.family }
      if (entry.source === "adobe") { await addSheet(`https://use.typekit.net/${entry.kit}.css`); await document.fonts.load(`16px "${entry.family}"`) }
      return entry.family
    })().catch(() => null))
  }
  return previews.get(key)
}
