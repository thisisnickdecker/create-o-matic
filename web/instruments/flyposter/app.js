// Flyposter: the engine in the shared shell, plus what only it needs: fonts, the picture, the
// emoji, the logo; the brand pocket, remembered in this browser; Vary with locks, front and centre;
// Rewrite, which steps your headline through the copy lenses; and pickers for emoji and stickers.
import * as engine from "./flyposter.js"
import { MOODS, LOCKS, vary } from "./moods.js"
import { LENSES, rewrites, lensOf } from "./copy.js"
import { STICKERS, stickersOf } from "./stickers.js"
import { createMachine } from "../../packages/core/shell.js"
import { ensureFont } from "../../packages/core/fonts.js"
import { openFontPicker } from "../../packages/core/fontpicker.js"
import { addMedia, loadMedia } from "../../packages/core/media.js"
import { prepareMarks, addMarkFile, listImageMarks } from "../../packages/core/marks.js"
import { EMOJI, EMOJI_GROUPS, emojiOf, loadEmoji } from "../../packages/core/emoji.js"
import { effectById } from "../../packages/core/effects/index.js"
import { mulberry32, newSeed } from "../../packages/core/rng.js"

let m
let fontGen = 0
let image = null // { el, w, h }
const emoji = new Map() // hex -> <img>
let marks = new Map() // the logo, ready to draw
let markNames = []
const slug = (p) => (p.name || p.params.brandName || "post").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "post"

// ---- resources ----
let fontKey = "", fontsReady = Promise.resolve()
function loadFonts(patch) {
  const reqs = engine.fontRequests(patch), key = JSON.stringify(reqs)
  if (key === fontKey) return fontsReady
  fontKey = key
  fontsReady = Promise.all(reqs.map((r) => ensureFont(r).catch(() => ({ ok: false })))).then((res) => {
    if (key !== fontKey) return
    const missing = res.find((r) => !r.ok && r.note)
    if (missing) m?.note(missing.note, true)
    fontGen++
    m?.redraw()
  })
  return fontsReady
}
let imageName = null, imageReady = Promise.resolve()
function loadImage(patch) {
  const name = patch.params.image
  if (name === imageName) return imageReady
  imageName = name
  imageReady = (async () => {
    const got = name ? await loadMedia(name) : null
    if (name !== imageName) return
    image = got?.kind === "image" ? { el: got.el, w: got.el.naturalWidth, h: got.el.naturalHeight } : null
    if (name && !image) m?.note(`${name} isn't in this browser any more. Add it again.`, true)
    m?.redraw()
  })()
  return imageReady
}
function loadEmojis(patch) {
  const want = emojiOf(patch.params.emoji)
  return Promise.all(want.map(async (e) => { if (!emoji.has(e.hex)) { const img = await loadEmoji(e.hex); if (img) emoji.set(e.hex, img) } })).then(() => m?.redraw())
}
let markToken = 0, marksReady = Promise.resolve()
function loadLogo(patch) {
  const token = ++markToken
  marksReady = (async () => {
    const ready = patch.params.logo ? await prepareMarks({ params: { content: `@${patch.params.logo}` }, marks: patch.marks }) : new Map()
    if (token !== markToken) return
    marks = ready
    markNames = [...new Set([...Object.keys(patch.marks), ...(await listImageMarks()).map((r) => r.name)])]
    m?.redraw()
  })()
  return marksReady
}
const ready = (patch) => Promise.all([loadFonts(patch), loadImage(patch), loadEmojis(patch), marksReady])

// ---- the brand pocket, remembered in this browser ----
const POCKET = "flyposter.brand"
const BRAND_KEYS = ["brandName", "logo", "logoColour", "inks", "paper", "black"]
function rememberBrand(patch) {
  const p = patch.params, brand = Object.fromEntries(BRAND_KEYS.map((k) => [k, p[k]]))
  brand.mark = patch.marks[p.logo] ?? null
  try { localStorage.setItem(POCKET, JSON.stringify(brand)) } catch {}
}
function recalledBrand() {
  try { return JSON.parse(localStorage.getItem(POCKET)) } catch { return null }
}
// A patch with the remembered brand in it.
function withBrand(patch, brand = recalledBrand()) {
  if (!brand) return patch
  const params = { ...patch.params }
  for (const k of BRAND_KEYS) if (brand[k] !== undefined) params[k] = brand[k]
  const marks = { ...(patch.marks || {}) }
  if (brand.mark && brand.logo) marks[brand.logo] = brand.mark
  return { ...patch, params, marks }
}

// ---- the logo, the picture ----
async function useLogo(f) {
  const { name, svg } = await addMarkFile(f)
  if (svg) m.patch.marks[name] = svg
  m.patch.params.logo = name
  await loadLogo(m.patch)
  m.changed()
  rememberBrand(m.patch)
  m.note(`${f.name} is the logo. It's kept in your brand pocket in this browser.`)
}
async function usePicture(f) {
  const name = await addMedia(f)
  m.set("image", name)
  m.note(`${f.name} is the picture. A PNG with a see-through background makes the best cutout.`)
}
const pictureInput = Object.assign(document.createElement("input"), { type: "file", accept: "image/*", hidden: true })
pictureInput.onchange = async () => { const f = pictureInput.files[0]; pictureInput.value = ""; if (f) await usePicture(f).catch((e) => m.note(e.message, true)) }
const logoInput = Object.assign(document.createElement("input"), { type: "file", accept: ".svg,image/svg+xml,image/png,image/jpeg,image/webp", hidden: true })
logoInput.onchange = async () => { const f = logoInput.files[0]; logoInput.value = ""; if (f) await useLogo(f).catch((e) => m.note(e.message, true)) }

// ---- Vary ----
// A new post from the mood, keeping what's locked. Words, brand, pictures and size always stay.
function deal(machine, r = mulberry32(newSeed())) {
  vary(machine.patch.params, r)
  machine.patch.seed = newSeed()
  machine.changed({ reload: true })
}

const el = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); n.append(...kids.filter((k) => k != null)); return n }
const button = (text, title, run, cls = "btn") => el("button", { type: "button", className: cls, textContent: text, title, onclick: run })

function varyBar(machine) {
  const body = machine.host.querySelector('[data-group="feel"] .group-body')
  const blurb = el("p", { className: "note fly-blurb" })
  const go = button("Vary", "A new post from this mood; locked things stay", () => deal(machine), "btn solid fly-vary")
  const locks = el("div", { className: "fly-chips", role: "group", ariaLabel: "Keep while varying" })
  const chips = Object.keys(LOCKS).map((facet) => {
    const key = `lock${facet[0].toUpperCase()}${facet.slice(1)}`
    const b = button(facet[0].toUpperCase() + facet.slice(1), `Keep the ${facet} when you Vary`, () => machine.set(key, !machine.patch.params[key]), "fly-chip")
    b.dataset.key = key
    return b
  })
  locks.append(el("span", { className: "fly-chips-label", textContent: "Keep" }), ...chips)
  body.append(el("div", { className: "strip" }, go), locks, blurb)
  return () => {
    const p = machine.patch.params
    for (const b of chips) { const on = p[b.dataset.key]; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on) }
    blurb.textContent = MOODS[p.mood]?.blurb ?? ""
  }
}

function rewriteBar(machine) {
  const body = machine.host.querySelector('[data-group="words"] .group-body')
  const said = el("p", { className: "note fly-said" })
  const row = el("div", { className: "strip" },
    button("Rewrite", "Your headline through the copy lens, a new way each time", () => {
      const p = machine.patch.params, n = rewrites(p, p.lens).length
      machine.set("take", n ? (p.take % n) + 1 : 0)
    }, "btn solid"),
    button("As written", "Back to your own line", () => machine.set("take", 0)),
    button("Keep this", "Make this rewrite your headline", () => {
      const p = machine.patch.params
      if (!p.take) return
      const line = engine.words({ ...p, case: "as" }).headline
      machine.patch.params.headline = line
      machine.patch.params.take = 0
      machine.changed({ reload: true })
      machine.note("Kept. It's your headline now; Rewrite starts from it.")
    }),
  )
  body.append(row, said)
  return () => {
    const p = machine.patch.params, lens = lensOf(p, p.lens, p.take)
    said.textContent = p.take ? `${lens ? lens[1] : "Rewrite"}, take ${p.take}: “${engine.words({ ...p, case: "as" }).headline.replace(/\n/g, " / ")}”` : "Your line, as written."
  }
}

// Toggle a token in a space-separated string.
const toggle = (list, token) => {
  const parts = String(list || "").split(/\s+/).filter(Boolean)
  return (parts.includes(token) ? parts.filter((x) => x !== token) : [...parts, token]).join(" ")
}

function stuffPickers(machine) {
  const body = machine.host.querySelector('[data-group="stuff"] .group-body')
  const emojiRow = [...body.querySelectorAll(".row")].find((r) => r.querySelector(".name")?.textContent === "Emoji")
  const stickerRow = [...body.querySelectorAll(".row")].find((r) => r.querySelector(".name")?.textContent === "Stickers")
  // Emoji: the whole set, by group; a tap adds or removes one.
  const grid = el("div", { className: "fly-emoji", hidden: true })
  const tabs = el("div", { className: "fly-chips" })
  let group = "food"
  const fill = () => {
    tabs.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.g === group))
    const have = new Set(emojiOf(machine.patch.params.emoji).map((e) => e.hex))
    grid.querySelectorAll(".fly-emoji-set").forEach((s) => { s.hidden = s.dataset.g !== group })
    grid.querySelectorAll("[data-hex]").forEach((b) => b.classList.toggle("on", have.has(b.dataset.hex)))
  }
  for (const [g, label] of EMOJI_GROUPS) {
    const b = button(label, "", () => { group = g; fill() }, "fly-chip")
    b.dataset.g = g
    tabs.append(b)
  }
  for (const [g] of EMOJI_GROUPS) {
    const set = el("div", { className: "fly-emoji-set" })
    set.dataset.g = g
    for (const e of EMOJI.filter((x) => x.group === g)) {
      const b = el("button", { type: "button", title: e.name.replace(/-/g, " ") }, el("img", { src: new URL(`../../packages/core/vendor/noto-emoji/${e.hex}.svg`, import.meta.url).href, alt: e.name, loading: "lazy", width: 28, height: 28 }))
      b.dataset.hex = e.hex
      b.onclick = () => machine.set("emoji", toggle(machine.patch.params.emoji, e.char))
      set.append(b)
    }
    grid.append(set)
  }
  const pop = el("div", { className: "fly-pop", hidden: true }, tabs, grid)
  const open = button("Choose…", "The whole emoji set", () => { pop.hidden = !pop.hidden; grid.hidden = pop.hidden; fill() }, "btn")
  emojiRow?.after(el("div", { className: "strip" }, open, button("None", "No emoji", () => machine.set("emoji", ""))), pop)
  // Stickers: a chip each.
  const chips = el("div", { className: "fly-chips" })
  for (const [id, label] of STICKERS) {
    const b = button(label, "", () => machine.set("stickers", toggle(machine.patch.params.stickers, id)), "fly-chip")
    b.dataset.id = id
    chips.append(b)
  }
  stickerRow?.after(chips)
  // The picture: add one.
  const imageRow = [...body.querySelectorAll(".row")].find((r) => r.querySelector(".name")?.textContent === "Picture")
  imageRow?.before(el("div", { className: "strip" }, button("Add a picture", "A cutout PNG or a photo", () => pictureInput.click(), "btn solid")))
  return () => {
    const on = new Set(stickersOf(machine.patch.params.stickers))
    chips.querySelectorAll("button").forEach((b) => b.classList.toggle("on", on.has(b.dataset.id)))
    if (!pop.hidden) fill()
  }
}

function brandBar(machine) {
  const body = machine.host.querySelector('[data-group="brand"] .group-body')
  body.prepend(el("div", { className: "strip" },
    button("Add your logo", "An SVG, PNG or JPEG; it's remembered in this browser", () => logoInput.click(), "btn solid"),
    button("Forget", "Take the logo off and forget the remembered brand", () => {
      try { localStorage.removeItem(POCKET) } catch {}
      machine.set("logo", "")
      machine.note("Forgotten. The brand pocket starts empty next time.")
    }),
  ))
}

// ---- the machine ----
let syncers = []
const syncAll = () => syncers.forEach((s) => s())

m = await createMachine(document.querySelector("[data-machine]"), engine, {
  presets: new URL("presets/", import.meta.url),
  dropHint: "Drop a picture, a logo (on the Brand pocket, or any SVG) or a patch",

  load(patch, key) {
    // A new mood deals a new post from it straight away.
    if (key === "mood") { vary(patch.params, mulberry32(newSeed())); patch.seed = newSeed() }
    if (!key || key === "logo") loadLogo(patch)
    loadFonts(patch)
    loadImage(patch)
    loadEmojis(patch)
    if (BRAND_KEYS.includes(key)) rememberBrand(patch)
    queueMicrotask(syncAll)
  },
  options: () => ({ fontGen, image, emoji, marks }),
  ready,
  heavy: (p) => p.params.layers.some((l) => l.on && effectById(l.effect)?.active(l.params)),

  async onFile(f, target) {
    const svg = /\.svg$/i.test(f.name) || f.type === "image/svg+xml"
    if (!svg && !/^image\//.test(f.type)) return false
    if (svg || target?.closest?.('[data-group="brand"]')) await useLogo(f)
    else await usePicture(f)
    return true
  },

  vary: (patch, r) => vary(patch.params, r),

  // A preset is a look: your brand, words, pictures, emoji and size stay.
  adopt(preset, current) {
    const keep = [...BRAND_KEYS, "headline", "details", "where", "cta", "lens", "take", "image", "imageRole", "imageTreat", "imageSize", "imageX", "imageY", "emoji", "format"]
    const params = { ...preset.params }
    for (const k of keep) if (current.params[k] !== undefined) params[k] = current.params[k]
    return { ...preset, params, marks: { ...(preset.marks || {}), ...current.marks } }
  },

  slug,
  panel: {
    onFontBrowse: (anchor) => {
      const field = anchor.closest(".row")?.querySelector(".name")?.textContent === "Text font" ? "text" : "display"
      openFontPicker({
        anchor, kit: m.patch.params.adobeKit, current: { family: m.patch.params[field], source: m.patch.params[`${field}Source`] },
        onPick: (e) => { Object.assign(m.patch.params, { [field]: e.family, [`${field}Source`]: e.source }); m.changed({ reload: true }) },
      })
    },
    onMedia: () => pictureInput.click(),
    markNames: () => markNames,
  },
  setup(machine) {
    m = machine
    machine.host.append(pictureInput, logoInput)
    const vary = machine.host.querySelector('[data-ref="vary"]')
    if (vary) vary.title = "A new post from this mood; locked things stay"
    brandBar(machine)
    syncers = [varyBar(machine), rewriteBar(machine), stuffPickers(machine)]
  },
  api: {
    // vary(): a new post from the mood; locks as in the rack, or { layout: true, … } to keep those.
    vary: (keep) => {
      if (keep) for (const facet of Object.keys(LOCKS)) m.patch.params[`lock${facet[0].toUpperCase()}${facet.slice(1)}`] = !!keep[facet]
      deal(m)
      return structuredClone(m.patch)
    },
    rewrites: () => rewrites(m.patch.params, m.patch.params.lens),
    lenses: () => LENSES.map(([id, name, blurb]) => ({ id, name, blurb })),
    moods: () => Object.entries(MOODS).map(([id, x]) => ({ id, name: x.label, blurb: x.blurb })),
    emoji: () => EMOJI.map(({ char, name, group }) => ({ char, name, group })),
    stickers: () => STICKERS.map(([id]) => id),
    ready: () => ready(m.patch),
  },
})

// With no patch in the link, the post opens with the brand you used last.
if (location.hash.length <= 1) {
  const brand = recalledBrand()
  if (brand) m.setPatch(withBrand(m.patch, brand))
} else if (m.patch.params.logo) rememberBrand(m.patch) // a link that brings a brand, as the Brand bench's does
syncAll()
