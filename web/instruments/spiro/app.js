// Spirotype: the engine in the shared shell, plus what only it needs: fonts (the browser, Adobe,
// your own files), SVG or image logos dropped on the page as the track, and SVG out of the Print
// shop for plotters and vector editing.
import * as engine from "./spiro.js"
import { createMachine } from "../../packages/core/shell.js"
import { ensureFont, addFontFile } from "../../packages/core/fonts.js"
import { openFontPicker } from "../../packages/core/fontpicker.js"
import { prepareMarks, addMarkFile } from "../../packages/core/marks.js"
import { download, canShare, share, touchFirst } from "../../packages/core/export.js"

let m
let marks = new Map()
let version = 0 // bumped when a font or logo arrives, so the track is traced again
let ready = Promise.resolve()

function load(patch) {
  ready = (async () => {
    const [, ready] = await Promise.all([ensureFont(engine.fontRequest(patch)).catch(() => m?.note(`Couldn't load ${patch.params.font}.`, true)), prepareMarks(patch)])
    marks = ready
    version++
    m?.redraw()
  })()
  return ready
}

const slug = (p) => (p.params.content.split("\n")[0] || "spirotype").replace(/^@/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "spirotype"

// SVG in the Print shop: the frame at the playhead, one path per pen.
function svgButton(machine) {
  const shop = machine.host.querySelector('[data-export="png"]').closest(".strip")
  const b = Object.assign(document.createElement("button"), { className: "btn", type: "button", textContent: "SVG", title: "The lines at the playhead as vectors, one path per ink: for Illustrator, Figma or a pen plotter" })
  b.onclick = async () => {
    await ready
    const text = engine.svg(machine.patch, machine.t, { marks, version })
    const blob = new Blob([text], { type: "image/svg+xml" }), name = `${slug(machine.patch)}.svg`
    if (touchFirst() && canShare(blob, name)) await share(blob, name).catch(() => {})
    else download(blob, name)
    machine.note(`Saved ${name} (${Math.round(blob.size / 1024)} KB).`)
  }
  shop.querySelector('[data-export="webm"]')?.after(b) ?? shop.append(b)
}

m = await createMachine(document.querySelector("[data-machine]"), engine, {
  presets: new URL("presets/", import.meta.url),
  dropHint: "Drop an SVG logo, a font or a patch",

  load(patch, key) {
    if (!key || ["font", "fontSource", "weight", "content", "adobeKit"].includes(key)) load(patch)
  },
  options: () => ({ marks, version }),
  ready: () => ready,

  // A dropped SVG (or image) becomes the track; a font file becomes the font.
  async onFile(f, target, machine) {
    if (/\.(otf|ttf|woff2?)$/i.test(f.name)) {
      const family = await addFontFile(f)
      machine.patch.params.font = family
      machine.patch.params.fontSource = "file"
      load(machine.patch); machine.changed()
      machine.note(`${family} is the font now.`)
      return true
    }
    if (!/\.svg$/i.test(f.name) && !/^image\//.test(f.type)) return false
    const { name, svg } = await addMarkFile(f)
    if (svg) machine.patch.marks[name] = svg
    machine.patch.params.content = `@${name}`
    load(machine.patch); machine.changed()
    machine.note(`The wheel rolls round ${f.name} now. Type in Word to go back to letters.`)
    return true
  },

  // Vary: a new wheel, pen and motion; your word, font and inks stay.
  vary(p, r) {
    const span = (lo, hi, d = 2) => Math.round((lo + r() * (hi - lo)) * 10 ** d) / 10 ** d
    Object.assign(p.params, {
      side: ["outside", "outside", "inside", "both"][Math.floor(r() * 4)],
      wheel: span(0.04, 0.3, 3), pen: span(0.4, 1.8), laps: 1 + Math.floor(r() * 8), drift: Math.floor(r() * 7) - 3,
      lobes: r() < 0.7 ? 0 : 2 + Math.floor(r() * 6), wobble: span(0.1, 0.6), spread: span(0, 0.8),
      motion: ["draw", "spin", "breathe", "crawl"][Math.floor(r() * 4)],
    })
  },
  slug,

  panel: {
    onFontBrowse: (anchor) => openFontPicker({
      anchor, kit: m.patch.params.adobeKit, current: { family: m.patch.params.font, source: m.patch.params.fontSource },
      onPick: (e) => { Object.assign(m.patch.params, { font: e.family, fontSource: e.source }); m.changed({ reload: true }) },
    }),
  },
  setup(machine) {
    m = machine
    svgButton(machine)
  },
  api: { svg: (t = m.t) => engine.svg(m.patch, t, { marks, version }), fontsReady: () => ready },
})
