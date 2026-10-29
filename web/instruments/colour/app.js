// The Colour lab: the colour engine in the shared shell, plus what only it needs: Vary as a palette
// dealer (by harmony, in OKLCH), palette files dropped in as inks, and the palette itself out of
// the Print shop as CSS, JSON or an Adobe swatch file.
import * as engine from "./colour.js"
import { createMachine } from "../../packages/core/shell.js"
import { readPaletteFile, writeAse } from "../../packages/core/swatches.js"
import { download } from "../../packages/core/export.js"
import { mulberry32 } from "../../packages/core/rng.js"
import { oklchText } from "../../packages/core/colour.js"

// ---- the palette as files ----
const css = (inks) => `:root {\n${inks.map((c, i) => `  --ink-${i + 1}: ${c}; /* oklch(${oklchText(c)}) */`).join("\n")}\n}\n`
const json = (name, inks) => JSON.stringify({ name, colours: inks }, null, 2) + "\n"

let m
const slug = (p) => (p.name || "palette").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "palette"
const paletteName = () => m.patch.name || "Create-o-matic palette"

function paletteStrip(machine) {
  const shop = machine.host.querySelector('[data-export="png"]').closest(".group-body")
  const note = Object.assign(document.createElement("p"), { className: "note" })
  const button = (text, title, run) => Object.assign(document.createElement("button"), { className: "btn", type: "button", textContent: text, title, onclick: run })
  const copy = async (text, what) => {
    try { await navigator.clipboard.writeText(text); note.textContent = `Copied the palette as ${what}.` }
    catch { download(new Blob([text], { type: "text/plain" }), `${slug(machine.patch)}.${what === "CSS" ? "css" : "json"}`); note.textContent = `Saved the palette as ${what}.` }
  }
  const strip = Object.assign(document.createElement("div"), { className: "strip" })
  strip.append(
    button("Copy CSS", "The inks as CSS custom properties, with their OKLCH values", () => copy(css(machine.patch.params.inks), "CSS")),
    button("Copy JSON", "The inks as JSON, which the swatch picker and this lab read back", () => copy(json(paletteName(), machine.patch.params.inks), "JSON")),
    button("Adobe .ase", "A swatch file for Illustrator, Photoshop and InDesign", () => { download(writeAse(paletteName(), machine.patch.params.inks), `${slug(machine.patch)}.ase`); note.textContent = "Saved an Adobe swatch file." }),
  )
  shop.querySelector(".progress").before(strip)
  shop.append(note)
}

m = await createMachine(document.querySelector("[data-machine]"), engine, {
  presets: new URL("presets/", import.meta.url),
  dropHint: "Drop a palette (.ase, .gpl, .json, .css) or a patch",

  // A dropped palette file becomes the inks. A patch (JSON with params) is left to the shell.
  async onFile(f, target, machine) {
    if (!/\.(ase|gpl|json|css|txt)$/i.test(f.name)) return false
    if (/\.json$/i.test(f.name)) { const data = JSON.parse(await f.text()); if (data.params || data.instrument) return false }
    const [first] = await readPaletteFile(f)
    if (!first?.colours.length) { machine.note(`No colours found in ${f.name}.`, true); return true }
    machine.set("inks", first.colours.slice(0, 12))
    machine.note(`${first.name}: ${Math.min(12, first.colours.length)} inks.`)
    return true
  },

  // Vary deals a new palette in the chosen harmony, keeping the number of inks.
  vary(p, r) { p.params.inks = engine.deal(p.params.harmony, p.params.inks.length, r) },
  slug,

  setup(machine) {
    m = machine
    const vary = machine.host.querySelector('[data-ref="vary"]')
    if (vary) vary.title = "Deal a new palette in the harmony set under Swatch book"
    paletteStrip(machine)
  },
  api: { deal: (harmony = m.patch.params.harmony, n = m.patch.params.inks.length, seed = Date.now()) => engine.deal(harmony, n, mulberry32(seed)) },
})
