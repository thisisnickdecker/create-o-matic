// The motion machine: the Elastic engine in the shared shell, plus what only it needs: fonts,
// marks (logos that move like type), a backdrop image or video, Vary, and the embed code.
import * as engine from "./elastic.js"
import { createMachine } from "../../packages/core/shell.js"
import { ensureFont, addFontFile } from "../../packages/core/fonts.js"
import { openFontPicker } from "../../packages/core/fontpicker.js"
import { addMedia, loadMedia, seekVideo } from "../../packages/core/media.js"
import { prepareMarks, addMarkFile, listImageMarks, removeImageMark, thumbnail, parseSvg } from "../../packages/core/marks.js"

const { fontRequest, clearMetrics, videoTime } = engine
const FONT_KEYS = new Set(["font", "fontSource", "adobeKit", "weightMin", "weightMax", "content", "mode", "case", "scramble", "scrambleSet"])
const HEAVY = ["kaleido", "liquid", "melt", "pixelSort", "mosaic", "ascii", "dots", "halftone", "copier", "grain", "cube", "pin"]

let m // the machine, once it's built
let media = null // the loaded backdrop: { kind, el, duration }
let marks = new Map() // the marks the content refers to, ready to draw
let markNames = [] // every mark available here, for the Shape menu

// ---- resources ----
let fontToken = 0
async function loadFonts(patch) {
  const token = ++fontToken
  const r = await ensureFont(fontRequest(patch))
  if (token !== fontToken) return
  clearMetrics()
  m?.note(r.note, !r.ok)
  m?.redraw()
}

async function loadBackdrop(patch) {
  media?.el.pause?.()
  const name = patch.params.backdrop
  media = name ? await loadMedia(name) : null
  if (name && !media) m?.note(`The backdrop “${name}” isn't in this browser. Add the file again.`, true)
  if (media?.kind === "video") {
    media.el.onseeked = () => m?.redraw()
    if (m?.playing) media.el.play().catch(() => {})
  }
  m?.redraw()
}

let marksToken = 0
async function loadMarks(patch) {
  const token = ++marksToken
  const ready = await prepareMarks(patch)
  if (token !== marksToken) return
  marks = ready
  m?.redraw()
  drawMarkRow()
}

// ---- marks row, under Content ----
const markRow = Object.assign(document.createElement("div"), { className: "row t-marks" })
markRow.innerHTML = `<span class="label"><span class="watch-gap"></span><span class="name" title="Logos and graphics that move like type. SVG stays sharp and takes the inks; PNG and JPEG work too. Click one to add it to Content.">Marks</span></span>
  <span class="marks"><span class="mark-list"></span><span class="strip"><button class="btn" type="button">Add mark…</button><span class="note">SVG, PNG or JPEG, or drop one here</span></span></span>`
const markFile = Object.assign(document.createElement("input"), { type: "file", accept: ".svg,image/svg+xml,image/png,image/jpeg,image/webp", multiple: true, hidden: true })
const mediaFile = Object.assign(document.createElement("input"), { type: "file", accept: "image/*,video/*", hidden: true })
markRow.querySelector(".btn").onclick = () => markFile.click()
markFile.onchange = async () => { for (const f of markFile.files) await useMarkFile(f); markFile.value = "" }
mediaFile.onchange = () => { if (mediaFile.files[0]) m.useFile(mediaFile.files[0]); mediaFile.value = "" }

async function drawMarkRow() {
  if (!m) return
  const patch = m.patch
  const list = markRow.querySelector(".mark-list")
  const images = await listImageMarks()
  const entries = [...Object.keys(patch.marks).map((name) => ({ name, svg: true })), ...images.map((r) => ({ name: r.name, svg: false }))]
  markNames = entries.map((e) => e.name)
  m.changed()
  const used = new Set(patch.params.content.split("\n").map((l) => l.trim()))
  list.replaceChildren(...await Promise.all(entries.map(async ({ name, svg }) => {
    const chip = Object.assign(document.createElement("span"), { className: "mark-chip" })
    const add = Object.assign(document.createElement("button"), { type: "button", className: "mark-add", title: `Add @${name} to Content` })
    let mk = marks.get(name)
    if (!mk && svg) { try { mk = parseSvg(patch.marks[name]) } catch {} }
    if (!mk && !svg) mk = (await prepareMarks({ params: { content: `@${name}` }, marks: {} })).get(name)
    if (mk) add.append(thumbnail(mk, 56, 28))
    add.append(Object.assign(document.createElement("span"), { textContent: `@${name}` }))
    if (used.has(`@${name}`)) chip.classList.add("used")
    add.onclick = () => m.set("content", `${m.patch.params.content.replace(/\s+$/, "")}\n@${name}`)
    const x = Object.assign(document.createElement("button"), { type: "button", className: "mark-x", textContent: "×", title: `Remove ${name}` })
    x.onclick = async () => { if (svg) delete m.patch.marks[name]; else await removeImageMark(name); loadMarks(m.patch); m.changed() }
    chip.append(add, x)
    return chip
  })))
}

async function useMarkFile(f) {
  try {
    const { name, svg } = await addMarkFile(f)
    const p = m.patch
    if (svg) p.marks[name] = svg
    if (!p.params.content.split("\n").some((l) => l.trim() === `@${name}`)) p.params.content = `${p.params.content.replace(/\s+$/, "")}\n@${name}`
    await loadMarks(p)
    m.changed()
    m.note(`Added @${name}. It's a line in Content now, so it moves like a word.`)
  } catch (e) { m.note(e.message, true) }
}

const slug = (p) => (p.params.content.split("\n")[0] || "elastic").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "elastic"

m = await createMachine(document.querySelector("[data-machine]"), engine, {
  presets: new URL("presets/", import.meta.url),
  dropHint: "Drop fonts, marks, images, videos or patches",

  load(patch, key) {
    if (!key || FONT_KEYS.has(key)) loadFonts(patch)
    if (!key || key === "backdrop") loadBackdrop(patch)
    if (!key || key === "content" || key === "shape") loadMarks(patch)
  },
  options: () => ({ backdrop: media?.el ?? null, marks }),

  // The backdrop video plays along with the preview, corrected whenever it drifts.
  sync(t, playing) {
    if (media?.kind !== "video") return
    const p = m.patch
    const target = videoTime(p, t, media.duration)
    media.el.playbackRate = Math.max(0.0625, p.params.backdropSpeed)
    const drift = Math.abs(media.el.currentTime - target)
    if (playing ? drift > 0.15 : drift > 0.001) media.el.currentTime = target
  },
  playing(on) { if (media?.kind === "video") on ? media.el.play().catch(() => {}) : media.el.pause() },
  ready: (patch) => ensureFont(fontRequest(patch)),
  seek: async (patch, time) => { if (media?.kind === "video") await seekVideo(media.el, videoTime(patch, time, media.duration)) },

  async onFile(f, target, machine) {
    if (/\.svg$/i.test(f.name) || (/^image\//.test(f.type) && target?.closest?.(".t-marks"))) { await useMarkFile(f); return true }
    if (/\.(otf|ttf|woff2?)$/i.test(f.name)) {
      const family = await addFontFile(f)
      Object.assign(machine.patch.params, { fontSource: "file", font: family })
      machine.changed({ reload: true })
      machine.note(`Added ${family} to My fonts.`)
      return true
    }
    if (/^(image|video)\//.test(f.type)) {
      machine.patch.params.backdrop = await addMedia(f)
      document.querySelector('[data-group="backdrop"]').open = true
      await loadBackdrop(machine.patch)
      machine.changed()
      return true
    }
    return false
  },

  heavy: (p) => HEAVY.some((k) => p.keys[k] || (k === "kaleido" ? p.params[k] >= 2 : p.params[k] > 0)) || p.params.mirror !== "off",

  // Vary: a new grid and motion inside ranges that tend to look good; type, colour and format stay.
  vary(p, r) {
    const pick = (a) => a[Math.floor(r() * a.length)]
    const round = (v, s) => Math.round(v / s) * s
    Object.assign(p.params, {
      direction: pick(["vertical", "horizontal"]),
      columns: 2 + Math.floor(r() * 9), rows: 3 + Math.floor(r() * 14),
      columnOffset: round(r() * 0.5, 0.005), rowOffset: round(r() * 0.25, 0.005),
      crossAmount: r() < 0.35 ? round(r() * 0.7, 0.01) : 0,
      wave: pick(["sine", "sine", "noise", "steps", "saw"]),
      cycles: 1 + Math.floor(r() * r() * 3),
      amount: round(0.65 + r() * 0.35, 0.01), ease: round(0.8 + r() * 4, 0.05),
      goldenSwing: round(r() * 0.4, 0.01), goldenDepth: 4 + Math.floor(r() * 8),
    })
  },

  embed(p) {
    const src = new URL("embed.js", import.meta.url).href
    const { w, h } = engine.size(p)
    const id = `elastic-${p.seed}`
    return `<div id="${id}" style="aspect-ratio:${w}/${h}"></div>
<script type="module">
  import { mount } from "${src}"
  mount(document.getElementById("${id}"), ${JSON.stringify(p)})
</script>`
  },
  slug,

  panel: {
    onFontBrowse: (anchor) => openFontPicker({
      anchor, current: { family: m.patch.params.font, source: m.patch.params.fontSource }, kit: m.patch.params.adobeKit,
      onPick: (e) => { Object.assign(m.patch.params, { font: e.family, fontSource: e.source }); m.changed({ reload: true }) },
    }),
    onMedia: () => mediaFile.click(),
    markNames: () => markNames,
  },
  setup(machine) {
    m = machine
    machine.host.querySelector('[data-group="type"] .group-body [data-key="content"]').after(markRow)
    machine.host.append(markFile, mediaFile)
  },
  api: { fontsReady: () => ensureFont(fontRequest(m.patch)) },
})
