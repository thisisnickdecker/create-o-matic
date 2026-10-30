// Carousel creator: the engine in the shared shell, plus what only it needs: fonts, each slide's
// image (added from the toolbar, a slide's card or a drop, then dragged and scrolled into place on
// the stage), a strip of every slide with a toolbar to add, copy, move and remove them, a draft box
// that turns pasted writing into slides, and the whole carousel out as PNGs or a LinkedIn PDF.
import * as engine from "./carousel.js"
import { createMachine } from "../../packages/core/shell.js"
import { ensureFont } from "../../packages/core/fonts.js"
import { openFontPicker } from "../../packages/core/fontpicker.js"
import { addMedia, loadMedia } from "../../packages/core/media.js"
import { newListItem } from "../../packages/core/patch.js"
import { zip } from "../../packages/core/zip.js"
import { download } from "../../packages/core/export.js"

let m
const images = new Map() // media name -> { el, w, h }
let ready = Promise.resolve()
const slidesDef = engine.manifest.parameters.find((d) => d.key === "slides")
const draftDefault = engine.manifest.parameters.find((d) => d.key === "text").default
const slug = (p) => (p.name || p.params.kicker || "carousel").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "carousel"
const current = () => Math.min(m.patch.params.slide, m.patch.params.slides.length) - 1
const card = (from) => newListItem(slidesDef, from)

// ---- loading: fonts for the words, and every slide's image ----
let loaded = ""
function load(patch, force = false) {
  const p = patch.params
  const key = JSON.stringify([p.display, p.displaySource, p.displayWeight, p.body, p.bodySource, p.bodyWeight, p.adobeKit, p.slides.map((c) => [c.text, c.image]), p.kicker, p.footer])
  if (!force && key === loaded) { strip?.(); return ready }
  loaded = key
  ready = (async () => {
    const names = [...new Set(p.slides.map((c) => c.image).filter(Boolean))]
    const [, got] = await Promise.all([Promise.all(engine.fontRequests(patch).map((r) => ensureFont(r).catch(() => null))), Promise.all(names.map((n) => loadMedia(n)))])
    images.clear()
    names.forEach((n, i) => { const x = got[i]; if (x?.kind === "image") images.set(n, { el: x.el, w: x.el.naturalWidth, h: x.el.naturalHeight }) })
    const missing = names.filter((n) => !images.has(n))
    if (missing.length) m?.note(`${missing.length} image${missing.length > 1 ? "s aren't" : " isn't"} in this browser. Add ${missing.length > 1 ? "them" : "it"} again.`, true)
    m?.redraw()
    strip?.()
  })()
  return ready
}

// The loop: one slide's seconds, or every slide in turn for the whole carousel. Older patches'
// words (one text, a paragraph a slide) become slide cards once.
function tidy(patch) {
  const p = patch.params
  if (p.text && p.text !== draftDefault) { p.slides = engine.cardsFromText(p.text).map((c) => card(c)); p.text = draftDefault }
  if (!p.slides.length) p.slides = [card({ text: "Write something" })]
  const n = p.slides.length
  p.slide = Math.min(Math.max(1, p.slide), n)
  p.duration = p.view === "sequence" ? n * p.perSlide : p.perSlide
}

// Change one slide's card (or the list) and redraw.
function editSlides(fn) {
  const list = m.patch.params.slides.map((c) => ({ ...c }))
  const next = fn(list) ?? list
  m.set("slides", next)
}
const editCurrent = (change) => editSlides((list) => { list[current()] = { ...list[current()], ...change } })

// ---- images ----
async function addImages(files) {
  files = [...files].filter((f) => /^image\//.test(f.type))
  if (!files.length) return 0
  const names = []
  for (const f of files) names.push(await addMedia(f))
  if (names.length === 1) { editCurrent({ image: names[0] }); m.note("Image on this slide. Drag it on the stage to move it; scroll or pinch to resize. Image fills, in the slide's card, places it.") }
  else {
    // Several at once: a new slide for each, after this one.
    const at = current() + 1
    editSlides((list) => { list.splice(at, 0, ...names.map((image) => card({ text: "", image }))) })
    m.set("slide", at + 1)
    m.note(`${names.length} new slides, one for each image.`)
  }
  return names.length
}
const imageInput = Object.assign(document.createElement("input"), { type: "file", accept: "image/*", multiple: true, hidden: true })
imageInput.onchange = async () => { const files = [...imageInput.files]; imageInput.value = ""; if (pickOne) { const pick = pickOne; pickOne = null; if (files[0]) pick(await addMedia(files[0])) } else await addImages(files) }
let pickOne = null

// ---- the strip of slides, with its toolbar ----
let strip = null
function buildStrip(machine) {
  const stage = machine.host.querySelector(".stage")
  const bar = Object.assign(document.createElement("div"), { className: "slide-tools" })
  const btn = (text, title, run) => { const b = Object.assign(document.createElement("button"), { className: "btn", type: "button", textContent: text, title }); b.onclick = run; return b }
  const addImg = btn("Add image", "An image for this slide (choose several to make a slide for each)", () => { pickOne = null; imageInput.click() })
  addImg.classList.add("solid")
  const removeImg = btn("Remove image", "Take the image off this slide", () => editCurrent({ image: "" }))
  bar.append(
    addImg, removeImg,
    btn("New slide", "A new slide after this one", () => { const at = current() + 1; editSlides((l) => { l.splice(at, 0, card({ text: "A new slide" })) }); machine.set("slide", at + 1) }),
    btn("Duplicate", "Copy this slide", () => { const at = current(); editSlides((l) => { l.splice(at + 1, 0, card(l[at])) }); machine.set("slide", at + 2) }),
    btn("←", "Move this slide earlier", () => { const at = current(); if (at < 1) return; editSlides((l) => { [l[at - 1], l[at]] = [l[at], l[at - 1]] }); machine.set("slide", at) }),
    btn("→", "Move this slide later", () => { const at = current(); if (at >= machine.patch.params.slides.length - 1) return; editSlides((l) => { [l[at + 1], l[at]] = [l[at], l[at + 1]] }); machine.set("slide", at + 2) }),
    btn("Delete", "Remove this slide", () => { if (machine.patch.params.slides.length < 2) return; const at = current(); editSlides((l) => { l.splice(at, 1) }); machine.set("slide", Math.max(1, at)) }),
  )
  const row = Object.assign(document.createElement("div"), { className: "slides" })
  stage.append(bar, row)
  let timer = 0
  strip = () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      const p = machine.patch, list = engine.slides(p), { w, h } = engine.size(p), k = 132 / h
      removeImg.hidden = !p.params.slides[current()]?.image
      row.replaceChildren(...list.map((s, i) => {
        const b = Object.assign(document.createElement("button"), { type: "button", className: `slide-thumb${i + 1 === p.params.slide ? " on" : ""}`, title: `Slide ${i + 1}` })
        const c = Object.assign(document.createElement("canvas"), { width: Math.round(w * k), height: Math.round(h * k) })
        engine.draw(c.getContext("2d"), p, i, p.params.phase, { scale: k, images })
        b.append(c, Object.assign(document.createElement("span"), { textContent: String(i + 1) }))
        b.onclick = () => { machine.set("view", "slide"); machine.set("slide", i + 1); openCard(i) }
        return b
      }))
    }, 120)
  }
}
// Open a slide's card in the rack, and close the others.
function openCard(i) {
  const cards = m.host.querySelectorAll('[data-group="slides"] .layer')
  cards.forEach((c, j) => { if (c.classList.contains("open") !== (j === i)) c.querySelector(".layer-name")?.click() })
  cards[i]?.scrollIntoView({ block: "nearest", behavior: "smooth" })
}

// ---- the stage as a handle: drag a slide's image to move it, scroll or pinch to resize ----
function handle(machine) {
  const canvas = machine.host.querySelector(".frame canvas")
  const pointers = new Map()
  let start = null
  const has = () => machine.patch.params.view === "slide" && machine.patch.params.slides[current()]?.image
  const round = (v) => Math.round(v * 1000) / 1000
  const spread = () => { const [a, b] = [...pointers.values()]; return b ? Math.hypot(a[0] - b[0], a[1] - b[1]) : 0 }
  canvas.addEventListener("pointerdown", (e) => {
    if (!has()) return
    pointers.set(e.pointerId, [e.clientX, e.clientY])
    canvas.setPointerCapture(e.pointerId)
    const c = machine.patch.params.slides[current()]
    start = { x: c.x, y: c.y, zoom: c.zoom, at: [e.clientX, e.clientY], spread: spread() }
  })
  canvas.addEventListener("pointermove", (e) => {
    canvas.style.cursor = has() ? (start ? "grabbing" : "grab") : ""
    if (!start || !pointers.has(e.pointerId)) return
    pointers.set(e.pointerId, [e.clientX, e.clientY])
    if (pointers.size > 1 && start.spread) return editCurrent({ zoom: round(Math.min(4, Math.max(0.1, start.zoom * (spread() / start.spread)))) })
    const r = canvas.getBoundingClientRect()
    editCurrent({ x: round(Math.max(-1, Math.min(1, start.x + ((e.clientX - start.at[0]) / r.width) * 2))), y: round(Math.max(-1, Math.min(1, start.y + ((e.clientY - start.at[1]) / r.height) * 2))) })
  })
  const end = (e) => { pointers.delete(e.pointerId); if (!pointers.size) start = null }
  canvas.addEventListener("pointerup", end)
  canvas.addEventListener("pointercancel", end)
  canvas.addEventListener("wheel", (e) => {
    if (!has()) return
    e.preventDefault()
    const c = machine.patch.params.slides[current()]
    editCurrent({ zoom: round(Math.min(4, Math.max(0.1, c.zoom * Math.exp(-e.deltaY * 0.0015)))) })
  }, { passive: false })
  canvas.style.touchAction = "pan-y"
}

// ---- a draft: paste writing, get slides ----
function draftBox(machine) {
  const body = machine.host.querySelector('[data-group="slides"] .group-body')
  const box = Object.assign(document.createElement("details"), { className: "draft" })
  const area = Object.assign(document.createElement("textarea"), { rows: 6, placeholder: "Paste or write everything at once. A blank line starts a new slide." })
  const go = Object.assign(document.createElement("button"), { className: "btn", type: "button", textContent: "Make slides from this", title: "Replaces the slides with one for each paragraph; their images and settings start fresh" })
  go.onclick = () => {
    const cards = engine.cardsFromText(area.value).map((c) => card(c))
    if (!cards.length) return
    machine.set("slides", cards); machine.set("slide", 1)
    machine.note(`${cards.length} slides from your draft.`)
  }
  box.append(Object.assign(document.createElement("summary"), { textContent: "Write it all at once" }), area, go)
  body.prepend(box)
}

// ---- the whole carousel out ----
async function slideBlobs(machine, type, quality) {
  await ready
  const p = machine.patch, n = engine.slides(p).length, { w, h } = engine.size(p), out = []
  const c = Object.assign(document.createElement("canvas"), { width: w, height: h }), g = c.getContext("2d")
  for (let i = 0; i < n; i++) {
    engine.draw(g, p, i, p.params.phase, { scale: 1, images })
    out.push(await new Promise((r) => c.toBlob(r, type, quality)))
  }
  return { out, w, h }
}
// A PDF with one full-bleed JPEG a page: what LinkedIn takes as a document carousel.
function pdf(jpegs, w, h) {
  const enc = new TextEncoder(), parts = [], offsets = []
  let size = 0
  const put = (x) => { const b = typeof x === "string" ? enc.encode(x) : x; parts.push(b); size += b.length }
  const obj = (id, body) => { offsets[id] = size; put(`${id} 0 obj\n`); for (const b of [].concat(body)) put(b); put("\nendobj\n") }
  put("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n")
  const n = jpegs.length, kids = Array.from({ length: n }, (_, i) => `${3 + i * 3} 0 R`).join(" ")
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>")
  obj(2, `<< /Type /Pages /Kids [${kids}] /Count ${n} >>`)
  jpegs.forEach((bytes, i) => {
    const page = 3 + i * 3, content = page + 1, image = page + 2, draw = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`
    obj(page, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 ${image} 0 R >> >> /Contents ${content} 0 R >>`)
    obj(content, [`<< /Length ${draw.length} >>\nstream\n`, draw, "\nendstream"])
    obj(image, [`<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`, bytes, "\nendstream"])
  })
  const xref = size, count = 3 + n * 3
  put(`xref\n0 ${count}\n0000000000 65535 f \n`)
  for (let id = 1; id < count; id++) put(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`)
  put(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)
  return new Blob(parts, { type: "application/pdf" })
}
function carouselButtons(machine) {
  const shop = machine.host.querySelector('[data-export="png"]').closest(".group-body")
  const note = Object.assign(document.createElement("p"), { className: "note" })
  const btn = (text, title, run) => Object.assign(document.createElement("button"), { className: "btn", type: "button", textContent: text, title, onclick: run })
  const row = Object.assign(document.createElement("div"), { className: "strip" })
  row.append(
    btn("All slides (PNG)", "Every slide at full size, in a .zip, numbered in order", async () => {
      note.textContent = "Rendering every slide…"
      const { out } = await slideBlobs(machine, "image/png")
      const files = out.map((data, i) => ({ name: `${slug(machine.patch)}-${String(i + 1).padStart(2, "0")}.png`, data }))
      const blob = await zip(files)
      download(blob, `${slug(machine.patch)}-slides.zip`)
      note.textContent = `Saved ${files.length} slides (${(blob.size / 1048576).toFixed(1)} MB).`
    }),
    btn("PDF for LinkedIn", "Every slide as a page of one PDF: upload it to LinkedIn as a document", async () => {
      note.textContent = "Rendering every slide…"
      const { out, w, h } = await slideBlobs(machine, "image/jpeg", 0.92)
      const blob = pdf(await Promise.all(out.map(async (b) => new Uint8Array(await b.arrayBuffer()))), w, h)
      download(blob, `${slug(machine.patch)}.pdf`)
      note.textContent = `Saved a ${out.length}-page PDF (${(blob.size / 1048576).toFixed(1)} MB).`
    }),
  )
  shop.querySelector(".strip").after(row)
  shop.append(note)
}

m = await createMachine(document.querySelector("[data-machine]"), engine, {
  presets: new URL("presets/", import.meta.url),
  dropHint: "Drop images (one goes on this slide; several make a slide each) or a patch",

  load(patch, key) {
    tidy(patch)
    load(patch, !key)
  },
  options: () => ({ images }),
  ready: () => ready,

  async onFile(f, target, machine) {
    if (!/^image\//.test(f.type)) return false
    await addImages([f])
    return true
  },

  // Presets are systems with their fonts, colours and motion; your slides stay.
  adopt(preset, current) {
    const keep = ["slides", "kicker", "footer", "platform", "width", "height", "slide", "view", "perSlide", "numbers"]
    const params = { ...preset.params }
    for (const k of keep) if (current.params[k] !== undefined) params[k] = current.params[k]
    return { ...preset, params }
  },

  slug,
  panel: {
    onFontBrowse: (anchor) => {
      // Which font field asked: the headline's or the text's.
      const field = anchor.closest(".row")?.querySelector(".name")?.textContent === "Text font" ? "body" : "display"
      openFontPicker({
        anchor, kit: m.patch.params.adobeKit, current: { family: m.patch.params[field], source: m.patch.params[`${field}Source`] },
        onPick: (e) => { Object.assign(m.patch.params, { [field]: e.family, [`${field}Source`]: e.source }); m.changed({ reload: true }) },
      })
    },
    // A slide card's Choose… button: one image, for that card.
    onMedia: (anchor, pick) => { pickOne = pick; imageInput.click() },
  },
  setup(machine) {
    m = machine
    machine.host.append(imageInput)
    buildStrip(machine)
    draftBox(machine)
    handle(machine)
    carouselButtons(machine)
  },
  api: { slides: () => engine.slides(m.patch), fontsReady: () => ready, addImages },
})
