// The Type tester: the type engine in the shared shell, plus what only it needs: a font for every
// row, the font browser per row, dropped font files as new rows, and Vary as a way to discover
// faces (it deals every row a different open font).
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

const slug = (p) => (p.params.rows[0]?.text || "type").split("\n")[0].toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "type"

m = await createMachine(document.querySelector("[data-machine]"), engine, {
  presets: new URL("presets/", import.meta.url),
  dropHint: "Drop font files to compare them, or a patch",

  load(patch, key) { if (!key || FONT_KEYS.has(key)) loadFonts(patch) },
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
    const kinds = Object.groupBy(pool, (e) => e.category)
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
  },
  api: { fontsReady: () => Promise.all(engine.fontRequests(m.patch).map((req) => ensureFont(req))) },
})
