// The Brand bench: the brand engine in the shared shell, plus what only it needs: the logo (an SVG,
// or a PNG or JPEG with its background taken out), a palette taken from the logo, faces for each
// role, the kit (design tokens, CSS, BRAND.md, the logo, the patch) as one .zip, and the brand
// sent on to Motion, the Colour lab and the Type tester.
import * as engine from "./brand.js"
import { tokens, css, brandMd } from "./kit.js"
import { createMachine } from "../../packages/core/shell.js"
import { ensureFont, addFontFile } from "../../packages/core/fonts.js"
import { openFontPicker } from "../../packages/core/fontpicker.js"
import { prepareMarks, addMarkFile, listImageMarks, drawMark } from "../../packages/core/marks.js"
import { readPaletteFile } from "../../packages/core/swatches.js"
import { hexToOklab, rgbToHex, deal } from "../../packages/core/colour.js"
import { newListItem, toHash } from "../../packages/core/patch.js"
import { download } from "../../packages/core/export.js"
import { zip } from "../../packages/core/zip.js"
import { effectById } from "../../packages/core/effects/index.js"

const facesDef = engine.manifest.parameters.find((d) => d.key === "faces")
const FONT_KEYS = new Set(["faces", "adobeKit", "brandName", "tagline"])
let m
let marks = new Map() // the logo, ready to draw
let markNames = [] // every logo available here, for the Logo menu

// ---- resources ----
let fontToken = 0
async function loadFonts(patch) {
  const token = ++fontToken
  const results = await Promise.all(engine.fontRequests(patch).map((r) => ensureFont(r)))
  if (token !== fontToken) return
  const missing = results.find((r) => !r.ok)
  if (missing) m?.note(missing.note, true)
  m?.redraw()
}

let markToken = 0
async function loadLogo(patch) {
  const token = ++markToken
  const ready = await prepareMarks({ params: { content: `@${patch.params.logo}` }, marks: patch.marks })
  if (token !== markToken) return
  marks = ready
  markNames = [...new Set([...Object.keys(patch.marks), ...(await listImageMarks()).map((r) => r.name)])]
  m?.changed()
}

// ---- the logo ----
const logoFile = Object.assign(document.createElement("input"), { type: "file", accept: ".svg,image/svg+xml,image/png,image/jpeg,image/webp", hidden: true })
logoFile.onchange = async () => { if (logoFile.files[0]) await useLogo(logoFile.files[0]); logoFile.value = "" }

async function useLogo(f) {
  try {
    const { name, svg } = await addMarkFile(f)
    if (svg) m.patch.marks[name] = svg
    m.patch.params.logo = name
    await loadLogo(m.patch)
    m.note(svg ? `${f.name} is the logo. It keeps its own colours.` : `${f.name} is the logo, with its background taken out.`)
  } catch (e) { m.note(e.message, true) }
}

// The colours in the logo: an SVG's fills, or an image's commonest colours, near-duplicates merged.
function logoColours(mark) {
  const found = []
  const add = (hex) => { const a = hexToOklab(hex); if (!found.some((f) => Math.hypot(...a.map((v, i) => v - f.lab[i])) < 0.06)) found.push({ hex, lab: a }) }
  if (mark.kind === "svg") {
    const probe = document.createElement("canvas").getContext("2d")
    for (const s of mark.shapes) {
      if (!s.fill) continue
      probe.fillStyle = "#000"; probe.fillStyle = s.fill
      if (/^#[0-9a-f]{6}$/i.test(probe.fillStyle)) add(probe.fillStyle.toUpperCase())
    }
  } else {
    const c = document.createElement("canvas").getContext("2d", { willReadFrequently: true })
    c.canvas.width = 96; c.canvas.height = Math.max(1, Math.round((96 * mark.box.h) / mark.box.w))
    c.drawImage(mark.art, 0, 0, c.canvas.width, c.canvas.height)
    const { data } = c.getImageData(0, 0, c.canvas.width, c.canvas.height), counts = new Map()
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 200) continue
      const key = rgbToHex(data[i] & 0xf0 | 8, data[i + 1] & 0xf0 | 8, data[i + 2] & 0xf0 | 8)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    // Edges where two shapes meet make in-between colours: only those covering 2% of the logo count.
    const solid = [...counts.values()].reduce((a, b) => a + b, 0)
    for (const [hex, n] of [...counts].sort((a, b) => b[1] - a[1])) if (n >= solid * 0.02) add(hex)
  }
  return found.slice(0, 6).map((f) => f.hex)
}

// Buttons under the Logo menu: add a logo, take its colours.
function logoStrip(machine) {
  const row = machine.host.querySelector('[data-key="logo"]')
  const strip = Object.assign(document.createElement("div"), { className: "strip" })
  const button = (text, title, run) => Object.assign(document.createElement("button"), { className: "btn", type: "button", textContent: text, title, onclick: run })
  strip.append(
    button("Add your logo…", "SVG keeps its colours; PNG and JPEG lose their background", () => logoFile.click()),
    button("Take its colours", "Make the logo's own colours the inks", () => {
      const mark = marks.get(machine.patch.params.logo)
      const colours = mark ? logoColours(mark) : []
      if (!colours.length) return machine.note("The logo has no colours to take: it's drawn in one ink. Set the inks yourself, or let Vary deal some.", true)
      machine.set("inks", colours)
      machine.note(`The inks are the logo's ${colours.length === 1 ? "colour" : `${colours.length} colours`}.`)
    }),
  )
  row.after(strip)
}

// ---- the kit ----
const slug = (p) => (p.params.brandName || "brand").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "brand"
// A link that opens the brand, when it's short enough to read; a long logo makes it go in brand.json only.
const link = (p) => { const url = `${location.origin}/brand/#${toHash(p)}`; return url.length < 2000 ? url : "" }

// The logo as a file: the SVG as it came, or a 2048px PNG of the cut-out image.
async function logoAsset(p) {
  const name = p.params.logo, svg = p.marks[name]
  if (svg) return { name: "logo.svg", data: svg }
  const mark = marks.get(name)
  if (!mark) return null
  const k = 2048 / Math.max(mark.bounds.w, mark.bounds.h), c = document.createElement("canvas")
  c.width = Math.round(mark.bounds.w * k); c.height = Math.round(mark.bounds.h * k)
  drawMark(c.getContext("2d"), mark, 0, 0, c.width, c.height, "#121211", { fit: "stretch", colour: "original" })
  return { name: "logo.png", data: await new Promise((r) => c.toBlob(r, "image/png")) }
}

async function kit(machine, note) {
  const p = structuredClone(machine.patch), logo = await logoAsset(p)
  note.textContent = "Packing the kit…"
  const board = await window.instrument.render("png")
  const files = [
    { name: "BRAND.md", data: brandMd(p, { link: link(p), logoFile: logo?.name }) },
    { name: "tokens.json", data: tokens(p) },
    { name: "brand.css", data: css(p) },
    { name: "brand.json", data: JSON.stringify({ name: p.params.brandName, ...p }, null, 2) + "\n" },
    { name: "board.png", data: board },
    ...(logo ? [logo] : []),
  ]
  download(await zip(files.map((f) => ({ ...f, name: `${slug(p)}-brand/${f.name}` }))), `${slug(p)}-brand.zip`)
  note.textContent = `Saved ${slug(p)}-brand.zip: BRAND.md, design tokens, CSS, the patch, the board${logo ? " and the logo" : ""}.`
}

// The brand, sent on to the other instruments as a patch in the link.
function sendTo(p) {
  const P = p.params, head = engine.face(P, "headline"), body = engine.face(P, "body")
  const logoLine = marks.has(P.logo) ? `@${P.logo}` : P.brandName.toUpperCase()
  return {
    motion: `/make/#${toHash({ instrument: "elastic", seed: p.seed, marks: p.marks[P.logo] ? { [P.logo]: p.marks[P.logo] } : {}, params: { content: `${logoLine}\n${P.brandName.toUpperCase()}`, mode: "sequence", font: head.font, fontSource: head.fontSource, adobeKit: P.adobeKit, palette: P.inks, background: P.background } })}`,
    colour: `/colour/#${toHash({ instrument: "colour", params: { inks: P.inks, background: P.background, study: "card" } })}`,
    type: `/type/#${toHash({ instrument: "type", params: { adobeKit: P.adobeKit, background: P.background, rows: [
      { text: P.brandName, font: head.font, fontSource: head.fontSource, weight: head.weight, tracking: head.tracking, fit: "width" },
      { text: P.tagline || "The quick brown fox jumps over the lazy dog", font: head.font, fontSource: head.fontSource, weight: head.weight, size: 72 },
      { text: "Every brand is a handful of decisions, made once and kept.", font: body.font, fontSource: body.fontSource, weight: body.weight, size: 34 },
    ] } })}`,
  }
}

function kitStrip(machine) {
  const shop = machine.host.querySelector('[data-export="png"]').closest(".group-body")
  const note = Object.assign(document.createElement("p"), { className: "note" })
  const button = (text, title, run, solid) => Object.assign(document.createElement("button"), { className: `btn${solid ? " solid" : ""}`, type: "button", textContent: text, title, onclick: run })
  const copy = async (text, what) => { try { await navigator.clipboard.writeText(text); note.textContent = `Copied ${what}.` } catch { note.textContent = `Couldn't reach the clipboard. Download the kit instead.` } }
  const kitRow = Object.assign(document.createElement("div"), { className: "strip" })
  kitRow.append(
    button("Download the kit", "A .zip: BRAND.md, design tokens, CSS, the patch, the board and the logo", () => kit(machine, note).catch((e) => { note.textContent = e.message }), true),
    button("Copy BRAND.md", "The brand in words and tables, for people and agents", () => copy(brandMd(machine.patch, { link: link(machine.patch) }), "BRAND.md")),
    button("Copy CSS", "The palette, faces and radius as CSS custom properties", () => copy(css(machine.patch), "the CSS")),
  )
  const sendRow = Object.assign(document.createElement("div"), { className: "strip" })
  const go = (text, key) => button(text, "Opens with this brand's logo, inks and faces", () => { location.href = sendTo(machine.patch)[key] })
  sendRow.append(go("Animate in Motion", "motion"), go("Study in the Colour lab", "colour"), go("Set in the Type tester", "type"))
  shop.querySelector(".progress").before(kitRow, sendRow)
  shop.append(note)
}

// ---- the machine ----
m = await createMachine(document.querySelector("[data-machine]"), engine, {
  presets: new URL("presets/", import.meta.url),
  dropHint: "Drop a logo (SVG, PNG, JPEG), a palette, fonts or a patch",

  load(patch, key) {
    if (!key || FONT_KEYS.has(key)) loadFonts(patch)
    if (!key || key === "logo") loadLogo(patch)
  },
  options: () => ({ marks }),
  ready: (patch) => Promise.all(engine.fontRequests(patch).map((r) => ensureFont(r))),
  heavy: (p) => engine.manifest.effects.some((id) => effectById(id).active(p.params)),

  async onFile(f, target, machine) {
    if (/\.svg$/i.test(f.name) || /^image\//.test(f.type)) { await useLogo(f); return true }
    if (/\.(otf|ttf|woff2?)$/i.test(f.name)) {
      const family = await addFontFile(f)
      machine.set("faces", [...machine.patch.params.faces, newListItem(facesDef, { role: "accent", font: family, fontSource: "file", weight: 400 })])
      machine.note(`Added ${family} as an accent face. Change its role in Type case.`)
      return true
    }
    if (/\.(ase|gpl|css|txt)$/i.test(f.name) || (/\.json$/i.test(f.name) && !(await f.text()).includes('"params"'))) {
      const [first] = await readPaletteFile(f)
      if (!first?.colours.length) return false
      machine.set("inks", first.colours.slice(0, 12))
      machine.note(`${first.name}: ${Math.min(12, first.colours.length)} inks.`)
      return true
    }
    return false
  },

  // Vary deals a new palette, keeping the number of inks; the logo and faces stay.
  vary(p, r) { p.params.inks = deal("any", p.params.inks.length, r) },
  slug,

  panel: {
    onFontBrowse: (anchor, pick, current) => openFontPicker({
      anchor, kit: m.patch.params.adobeKit, current: current ? { family: current.font, source: current.fontSource } : null, onPick: pick,
    }),
    markNames: () => markNames,
  },
  setup(machine) {
    m = machine
    machine.host.append(logoFile)
    const vary = machine.host.querySelector('[data-ref="vary"]')
    if (vary) vary.title = "Deal a new palette; the logo and faces stay"
    logoStrip(machine)
    kitStrip(machine)
  },
  api: { kit: () => ({ tokens: tokens(m.patch), css: css(m.patch), brandMd: brandMd(m.patch) }), sendTo: () => sendTo(m.patch) },
})
