// Carousel creator: the engine in the shared shell, plus what only it needs: fonts, your images,
// a strip of every slide under the stage (click one to work on it), and the whole carousel out of
// the Print shop as PNGs (a .zip) or a PDF for LinkedIn.
import * as engine from "./carousel.js"
import { createMachine } from "../../packages/core/shell.js"
import { ensureFont } from "../../packages/core/fonts.js"
import { openFontPicker } from "../../packages/core/fontpicker.js"
import { addMedia, loadMedia } from "../../packages/core/media.js"
import { newListItem } from "../../packages/core/patch.js"
import { zip } from "../../packages/core/zip.js"
import { download } from "../../packages/core/export.js"

let m
let images = []
let ready = Promise.resolve()
const imagesDef = engine.manifest.parameters.find((d) => d.key === "images")
const slug = (p) => (p.name || p.params.kicker || "carousel").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "carousel"

function load(patch) {
  ready = (async () => {
    const list = patch.params.images.filter((x) => x.src)
    const [, got] = await Promise.all([
      Promise.all(engine.fontRequests(patch).map((r) => ensureFont(r).catch(() => null))),
      Promise.all(list.map((x) => loadMedia(x.src))),
    ])
    images = got.filter((x) => x?.kind === "image").map((x) => ({ el: x.el, w: x.el.naturalWidth, h: x.el.naturalHeight }))
    m?.redraw()
    strip?.()
  })()
  return ready
}

// The loop: one slide's seconds, or every slide in turn for the whole carousel.
function timing(patch) {
  const n = Math.max(1, engine.slides(patch).length), p = patch.params
  p.slide = Math.min(p.slide, n)
  p.duration = p.view === "sequence" ? n * p.perSlide : p.perSlide
}

// ---- the strip of slides ----
let strip = null
function buildStrip(machine) {
  const stage = machine.host.querySelector(".stage")
  const row = Object.assign(document.createElement("div"), { className: "slides" })
  stage.append(row)
  let timer = 0
  strip = () => {
    clearTimeout(timer)
    timer = setTimeout(async () => {
      const p = machine.patch, list = engine.slides(p), { w, h } = engine.size(p), k = 132 / h
      row.replaceChildren(...list.map((s, i) => {
        const b = Object.assign(document.createElement("button"), { type: "button", className: `slide-thumb${i + 1 === p.params.slide ? " on" : ""}`, title: `Slide ${i + 1}: ${s.kind}` })
        const c = Object.assign(document.createElement("canvas"), { width: Math.round(w * k), height: Math.round(h * k) })
        engine.draw(c.getContext("2d"), p, i, p.params.phase, { scale: k, images })
        b.append(c, Object.assign(document.createElement("span"), { textContent: String(i + 1) }))
        b.onclick = () => { machine.set("view", "slide"); machine.set("slide", i + 1) }
        return b
      }))
    }, 120)
  }
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

// ---- your images ----
async function addImages(files) {
  const added = []
  for (const f of files) if (/^image\//.test(f.type)) added.push(newListItem(imagesDef, { src: await addMedia(f) }))
  if (added.length) m.set("images", [...m.patch.params.images, ...added].slice(0, imagesDef.max))
  return added.length
}
function imageRow(machine) {
  const body = machine.host.querySelector('[data-group="words"] .group-body')
  const input = Object.assign(document.createElement("input"), { type: "file", accept: "image/*", multiple: true, hidden: true })
  const note = Object.assign(document.createElement("p"), { className: "note" })
  const add = Object.assign(document.createElement("button"), { className: "btn", type: "button", textContent: "Add images", onclick: () => input.click() })
  const clear = Object.assign(document.createElement("button"), { className: "btn", type: "button", textContent: "Clear images", onclick: () => machine.set("images", []) })
  input.onchange = async () => { await addImages([...input.files]); input.value = "" }
  const row = Object.assign(document.createElement("div"), { className: "strip" })
  row.append(add, clear)
  body.append(row, note, input)
  const show = () => { const n = machine.patch.params.images.length; clear.hidden = !n; note.textContent = n ? `${n} image${n > 1 ? "s" : ""}. A slide that starts [image] uses the next one.` : "Add photos or screenshots, then start a slide with [image]." }
  show()
  return show
}

let showImages = null
m = await createMachine(document.querySelector("[data-machine]"), engine, {
  presets: new URL("presets/", import.meta.url),
  dropHint: "Drop images or a patch",

  load(patch, key) {
    timing(patch)
    if (!key || ["display", "displaySource", "displayWeight", "body", "bodySource", "bodyWeight", "adobeKit", "images", "text", "kicker", "footer"].includes(key)) load(patch)
    else strip?.()
    showImages?.()
  },
  options: () => ({ images }),
  ready: () => ready,

  async onFile(f, target, machine) {
    if (!/^image\//.test(f.type)) return false
    await addImages([f])
    machine.note(`${f.name} added. Start a slide with [image] to place it.`)
    return true
  },

  // Presets are systems with their fonts and colours; your words and images stay.
  adopt(preset, current) {
    const keep = ["text", "kicker", "footer", "images", "platform", "width", "height", "slide", "view", "perSlide", "numbers"]
    const params = { ...preset.params }
    for (const k of keep) if (current.params[k] !== undefined) params[k] = current.params[k]
    return { ...preset, params }
  },

  slug,
  panel: {
    onFontBrowse: (anchor, pick, current) => {
      // Which font field asked: the headline's or the text's.
      const field = anchor.closest(".row")?.querySelector(".name")?.textContent === "Text font" ? "body" : "display"
      openFontPicker({
        anchor, kit: m.patch.params.adobeKit, current: { family: m.patch.params[field], source: m.patch.params[`${field}Source`] },
        onPick: (e) => { Object.assign(m.patch.params, { [field]: e.family, [`${field}Source`]: e.source }); m.changed({ reload: true }) },
      })
    },
  },
  setup(machine) {
    m = machine
    buildStrip(machine)
    carouselButtons(machine)
    showImages = imageRow(machine)
  },
  api: { slides: () => engine.slides(m.patch), fontsReady: () => ready },
})
