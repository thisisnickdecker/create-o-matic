// The Type tester: the type engine in the shared shell, plus what only it needs: a font for every
// row, the font browser per row, dropped font files as new rows, Vary as a way to discover faces
// (it deals every row a different open font), and typing straight onto the stage.
import * as engine from "./type.js"
import { createMachine } from "../../packages/core/shell.js"
import { ensureFont, addFontFile, openCatalogue } from "../../packages/core/fonts.js"
import { openFontPicker } from "../../packages/core/fontpicker.js"
import { newListItem } from "../../packages/core/patch.js"

const rowsDef = engine.manifest.parameters.find((d) => d.key === "rows")
const FONT_KEYS = new Set(["rows", "adobeKit", "motion", "motionAmount"])
let m
let catalogue = [] // the open library, for Vary

let fontToken = 0
async function loadFonts(patch) {
  const token = ++fontToken
  const results = await Promise.all(engine.fontRequests(patch).map((req) => ensureFont(req)))
  if (token !== fontToken) return
  const missing = results.find((r) => !r.ok)
  if (missing) m?.note(missing.note, true)
  m?.redraw()
}

// ---- typing on the stage ----
// Double-click a row and a text box opens over it, set in the row's own font, size, weight,
// tracking and case, while the canvas leaves that row's text out. Every keystroke goes into the
// patch, so a row set to fill the width resizes as you type. Escape or clicking away finishes.
let editing = -1
const measure = typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : null
const CASES = { upper: "uppercase", lower: "lowercase", title: "capitalize", "as-is": "none" }

function rowAt(machine, e) {
  const canvas = machine.host.querySelector(".frame canvas"), rect = canvas.getBoundingClientRect()
  const k = rect.width / engine.size(machine.patch).w
  const x = (e.clientX - rect.left) / k, y = (e.clientY - rect.top) / k
  const boxes = engine.rowBoxes(measure, machine.patch, machine.t)
  const inside = boxes.find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h)
  return inside ?? boxes.reduce((best, b) => (Math.abs(b.y + b.h / 2 - y) < Math.abs(best.y + best.h / 2 - y) ? b : best), boxes[0])
}

function editRow(machine, e) {
  const hit = rowAt(machine, e)
  if (!hit) return
  window.instrument.pause()
  editing = hit.i
  const frame = machine.host.querySelector(".frame"), canvas = frame.querySelector("canvas")
  const box = Object.assign(document.createElement("textarea"), { className: "stage-edit", spellcheck: false, value: machine.patch.params.rows[editing].text })
  box.setAttribute("aria-label", "Row text")
  const place = () => {
    const p = machine.patch.params, r = p.rows[editing], b = engine.rowBoxes(measure, machine.patch, machine.t)[editing]
    const k = canvas.clientWidth / engine.size(machine.patch).w
    const left = canvas.offsetLeft + b.x * k, top = canvas.offsetTop + (b.y + b.label) * k
    Object.assign(box.style, {
      left: `${left}px`, top: `${top}px`, width: `${b.w * k}px`, height: `${(b.h - b.label) * k}px`,
      font: `${r.italic ? "italic " : ""}${b.weight} ${b.px * k}px "${r.font.replace(/"/g, "")}", sans-serif`,
      letterSpacing: `${b.tracking * b.px * k}px`, lineHeight: `${r.leading * b.px * k}px`,
      textTransform: CASES[r.case] ?? "none", textAlign: p.align, color: r.ink, background: p.background,
      whiteSpace: r.fit === "width" ? "pre" : "pre-wrap",
    })
  }
  const done = () => { if (editing < 0) return; editing = -1; box.remove(); machine.redraw() }
  box.addEventListener("input", () => {
    machine.set("rows", machine.patch.params.rows.map((r, i) => (i === editing ? { ...r, text: box.value } : r)))
    place()
  })
  box.addEventListener("keydown", (k) => { if (k.key === "Escape" || (k.key === "Enter" && (k.metaKey || k.ctrlKey))) { k.preventDefault(); box.blur() } })
  box.addEventListener("blur", done)
  frame.append(box)
  place()
  machine.redraw()
  box.focus()
  box.select()
}

const slug = (p) => (p.params.rows[0]?.text || "type").split("\n")[0].toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "type"

m = await createMachine(document.querySelector("[data-machine]"), engine, {
  presets: new URL("presets/", import.meta.url),
  dropHint: "Drop font files to compare them, or a patch",

  load(patch, key) { if (!key || FONT_KEYS.has(key)) loadFonts(patch) },
  options: () => ({ editing: m?.exporting ? -1 : editing }),
  ready: (patch) => Promise.all(engine.fontRequests(patch).map((req) => ensureFont(req))),

  // A dropped font joins as a new row, copying the last row's text and setting.
  async onFile(f, target, machine) {
    if (!/\.(otf|ttf|woff2?)$/i.test(f.name)) return false
    const family = await addFontFile(f)
    const rows = machine.patch.params.rows
    machine.set("rows", [...rows, newListItem(rowsDef, { ...(rows.at(-1) ?? {}), font: family, fontSource: "file" })])
    machine.note(`Added ${family} as a new row. It's kept in My fonts.`)
    return true
  },

  // Vary deals each row a different open font: a real text family for Latin-script text (Latin
  // Extended, three weights or a variable axis), of the same kind (serif, sans…) where it can.
  vary(p, r) {
    if (!catalogue.length) return
    const western = (sub) => /^(latin|greek|cyrillic)(-ext)?$|^vietnamese$|^math$/.test(sub)
    const pool = catalogue.filter((e) => e.latin && e.subsets?.includes("latin-ext") && e.subsets.every(western) && (e.variable || e.weights.length >= 3) && !/pixel|barcode|icons?|symbols?|emoji/i.test(e.family))
    const kinds = {}
    for (const e of pool) (kinds[e.category] ??= []).push(e)
    p.params.rows = p.params.rows.map((row) => {
      const same = kinds[catalogue.find((e) => e.family === row.font)?.category] ?? pool
      const pick = same[Math.floor(r() * same.length)]
      return { ...row, font: pick.family, fontSource: "open" }
    })
  },
  slug,

  panel: {
    onFontBrowse: (anchor, pick, current) => openFontPicker({
      anchor, kit: m.patch.params.adobeKit, current: current ? { family: current.font, source: current.fontSource } : null, onPick: pick,
    }),
  },
  setup(machine) {
    m = machine
    openCatalogue().then((list) => { catalogue = list })
    const canvas = machine.host.querySelector(".frame canvas")
    canvas.title = "Double-click a row to type in it"
    canvas.addEventListener("dblclick", (e) => editRow(machine, e))
  },
  api: { fontsReady: () => Promise.all(engine.fontRequests(m.patch).map((req) => ensureFont(req))) },
})
