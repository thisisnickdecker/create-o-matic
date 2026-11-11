// Flyposter: the engine in the shared shell, plus what only it needs: fonts, the picture, the
// emoji, the logo; the brand pocket, remembered in this browser; Vary with locks, front and centre,
// which deals many posts, has the judge (score.js) score them and shows the best nine; Rewrite,
// which steps your headline through the copy lenses; pickers for emoji and stickers; working on
// the stage itself (stage.js); and undo for all of it.
import * as engine from "./flyposter.js"
import { MOODS, LOCKS, vary, nudge } from "./moods.js"
import { judge, choose, washout } from "./score.js"
import { LENSES, rewrites, lensOf } from "./copy.js"
import { STICKERS, stickersOf } from "./stickers.js"
import { stageEditing } from "./stage.js"
import { myBrand, keepBrand, forgetBrand } from "../../packages/core/brand.js"
import { campaign } from "./campaign.js"
import { zip } from "../../packages/core/zip.js"
import { download } from "../../packages/core/export.js"
import { createMachine } from "../../packages/core/shell.js"
import { ensureFont } from "../../packages/core/fonts.js"
import { openFontPicker } from "../../packages/core/fontpicker.js"
import { addMedia, loadMedia } from "../../packages/core/media.js"
import { prepareMarks, addMarkFile, listImageMarks } from "../../packages/core/marks.js"
import { EMOJI, EMOJI_GROUPS, emojiOf, loadEmoji } from "../../packages/core/emoji.js"
import { effectById } from "../../packages/core/effects/index.js"
import { mulberry32, newSeed } from "../../packages/core/rng.js"
import { formatSize } from "../../packages/core/formats.js"

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
    const names = [patch.params.logo, patch.params.logoMark].filter(Boolean)
    const ready = names.length ? await prepareMarks({ params: { content: names.map((n) => `@${n}`).join("\n") }, marks: patch.marks }) : new Map()
    if (token !== markToken) return
    marks = ready
    markNames = [...new Set([...Object.keys(patch.marks), ...(await listImageMarks()).map((r) => r.name)])]
    m?.redraw()
  })()
  return marksReady
}
const ready = (patch) => Promise.all([loadFonts(patch), loadImage(patch), loadEmojis(patch), marksReady])

// ---- the brand pocket: my brand (core/brand.js), shared with the Brand bench ----
const BRAND_KEYS = ["brandName", "logo", "logoMark", "logoColour", "inks", "paper", "black"]
const svgOf = (patch, name) => (name ? patch.marks[name] ?? null : null)
function rememberBrand(patch) {
  const p = patch.params
  keepBrand({
    name: p.brandName, inks: p.inks, paper: p.paper, black: p.black, logoColour: p.logoColour,
    logo: p.logo ? { name: p.logo, svg: svgOf(patch, p.logo) } : null, mark: p.logoMark ? { name: p.logoMark, svg: svgOf(patch, p.logoMark) } : null,
  })
}
// A patch with the brand in it: names, colours, logos, and the faces and voice when the brand has them.
function withBrand(patch, brand) {
  if (!brand) return patch
  const params = { ...patch.params, brandName: brand.name || patch.params.brandName, paper: brand.paper, black: brand.black, logoColour: brand.logoColour }
  if (brand.inks.length) params.inks = brand.inks
  const marks = { ...(patch.marks || {}) }
  for (const [key, l] of [["logo", brand.logo], ["logoMark", brand.mark]]) {
    params[key] = l?.name ?? ""
    if (l?.svg) marks[l.name] = l.svg
  }
  const { headline, body } = brand.faces
  if (headline) Object.assign(params, { display: headline.family, displaySource: headline.source, displayWeight: headline.weight, lockType: true })
  if (body) Object.assign(params, { text: body.family, textSource: body.source, textWeight: body.weight })
  if (brand.adobeKit) params.adobeKit = brand.adobeKit
  if (brand.voice && brand.voice !== "any") params.lens = brand.voice
  return { ...patch, params, marks }
}

// ---- the logo, the picture ----
// key: "logo" for the full lockup, "logoMark" for the mark alone.
async function useLogo(f, key = "logo") {
  const { name, svg } = await addMarkFile(f)
  if (svg) m.patch.marks[name] = svg
  m.patch.params[key] = name
  await loadLogo(m.patch)
  m.changed()
  rememberBrand(m.patch)
  m.note(`${f.name} is the ${key === "logo" ? "logo" : "mark alone"}. It's kept as your brand in this browser, for every instrument.`)
}
async function usePicture(f) {
  const name = await addMedia(f)
  m.set("image", name)
  const opaque = !/png|webp|gif/i.test(f.type)
  m.note(opaque ? `${f.name} is the picture. Cut out the background to make it a sticker.` : `${f.name} is the picture.`)
}
// The picture with its background taken out (core/cutout.js), kept beside the original.
let cutting = false
async function cutOut() {
  const name = m.patch.params.image
  if (!name || !image || cutting) return m.note(name ? "Still cutting the last one out." : "Add a picture first.", !name)
  cutting = true
  syncAll()
  m.note("Cutting out the background… The first time, the cutter itself arrives (about 16 MB).")
  try {
    const { cutout } = await import("../../packages/core/cutout.js")
    const t0 = performance.now()
    const blob = await cutout(image.el)
    const file = new File([blob], `${name.replace(/\.[a-z0-9]+$/i, "").replace(/-cutout$/, "")}-cutout.png`, { type: "image/png" })
    m.set("image", await addMedia(file))
    m.note(`Cut out in ${((performance.now() - t0) / 1000).toFixed(1)} s, and kept as ${file.name}. Undo goes back to the photo.`)
  } catch (e) {
    m.note(`The cutout didn't work: ${e.message}`, true)
  } finally { cutting = false; syncAll() }
}
const pictureInput = Object.assign(document.createElement("input"), { type: "file", accept: "image/*", hidden: true })
pictureInput.onchange = async () => { const f = pictureInput.files[0]; pictureInput.value = ""; if (f) await usePicture(f).catch((e) => m.note(e.message, true)) }
const logoInput = Object.assign(document.createElement("input"), { type: "file", accept: ".svg,image/svg+xml,image/png,image/jpeg,image/webp", hidden: true })
let logoKey = "logo"
logoInput.onchange = async () => { const f = logoInput.files[0]; logoInput.value = ""; if (f) await useLogo(f, logoKey).catch((e) => m.note(e.message, true)) }

// ---- Vary: many dealt, judged, the best nine shown ----
// A canvas only for measuring: the judge needs the words laid out, not drawn.
const ruler = document.createElement("canvas").getContext("2d")
async function judged(patch) {
  await Promise.all(engine.fontRequests(patch).map((r) => ensureFont(r).catch(() => null)))
  const { score, faults } = judge(engine.scene(ruler, patch, { fontGen, image, marks }))
  // The judge reads the layout; whether a texture drowns it takes pixels: a tiny render with and
  // without the Darkroom layers.
  if (patch.params.layers.some((l) => l.on)) {
    const cost = washout(pixels({ ...patch, params: { ...patch.params, layers: [] } }), pixels(patch), SMALL)
    if (cost > 0.05) return { patch, score: Math.max(0, Math.round(score - cost)), faults: [...faults, { id: "washed-out", cost: +cost.toFixed(1), note: "The texture drowns the post." }] }
  }
  return { patch, score, faults }
}
const SMALL = 64
const small = Object.assign(document.createElement("canvas"), { width: SMALL, height: SMALL })
const smallCtx = small.getContext("2d", { willReadFrequently: true })
function pixels(patch) {
  const { w: W, h: H } = formatSize(patch.params), k = SMALL / Math.max(W, H)
  small.height = Math.round(H * k); small.width = SMALL
  engine.render(smallCtx, patch, patch.params.phase ?? 0.5, { scale: k, frame: 0, fontGen, image, emoji, marks })
  return smallCtx.getImageData(0, 0, SMALL, small.height).data
}
// from: "fresh" deals from the mood; "like" grows near relations of the post you're on. Each
// candidate has its own seed from the round's, so a round can be dealt again exactly.
async function dealMany({ from = "fresh", count = from === "fresh" ? 27 : 18, keep = 9, seed = newSeed() } = {}) {
  const base = m.patch, out = []
  for (let i = 0; i < count; i++) {
    const r = mulberry32(seed * 31 + i * 7919)
    const params = structuredClone(base.params)
    if (from === "like") nudge(params, r)
    else vary(params, r)
    out.push(await judged({ ...structuredClone(base), params, seed: Math.floor(r() * 1e9) }))
  }
  return choose(out.sort((a, b) => b.score - a.score), keep)
}
// One post, the best of a dozen: what Vary does for an agent, and when the deck can't be shown.
async function dealOne(machine) {
  const [best] = await dealMany({ count: 12, keep: 1 })
  machine.setPatch(best.patch)
  return best
}

// The deck: nine over the stage. Click one to use it, or ask for more like it.
let deck = null
function openDeck(machine, from = "fresh") {
  const stage = machine.host.querySelector(".stage")
  deck?.remove()
  const mood = MOODS[machine.patch.params.mood]?.label ?? "this mood"
  const head = el("p", { className: "fly-deck-title", textContent: from === "like" ? "Nine more like that one." : `Nine from ${mood}.` })
  const grid = el("div", { className: "fly-deck-grid" })
  const again = button("Deal again", "Nine new ones from the mood", () => openDeck(machine), "btn")
  const close = button("Close", "Back to your post (Esc)", () => shut(), "btn")
  deck = el("div", { className: "fly-deck", role: "dialog", ariaLabel: "Nine posts to choose from", tabIndex: -1 },
    el("div", { className: "fly-deck-head" }, head, el("span", { className: "fly-deck-hint", textContent: "Pick one, or More like this." }), again, close), grid)
  stage.append(deck)
  const shut = () => { deck?.remove(); deck = null; removeEventListener("keydown", keys) }
  const keys = (e) => {
    if (e.key === "Escape") shut()
    else if (/^[1-9]$/.test(e.key) && !e.target.closest("input, textarea, select")) grid.children[+e.key - 1]?.querySelector(".fly-card-use")?.click()
  }
  addEventListener("keydown", keys)
  const { w: W, h: H } = formatSize(machine.patch.params)
  // Nine cells, as big as the stage allows.
  const fit = () => {
    const gap = 12, more = 34, aw = grid.clientWidth, ah = grid.clientHeight
    const cols = aw < 520 ? 2 : 3, rows = Math.ceil(9 / cols)
    const cw = Math.floor(Math.max(60, Math.min((aw - gap * (cols - 1)) / cols, aw < 520 ? Infinity : ((ah - gap * (rows - 1)) / rows - more) * (W / H))))
    grid.style.gridTemplateColumns = `repeat(${cols}, ${cw}px)`
    return cw
  }
  const cells = Array.from({ length: 9 }, (_, i) => {
    const canvas = el("canvas", { ariaHidden: "true" })
    const use = el("button", { type: "button", className: "fly-card-use", disabled: true, ariaLabel: `Post ${i + 1}, dealing…` }, canvas)
    use.style.aspectRatio = `${W} / ${H}`
    const cell = el("div", { className: "fly-card" }, use, button("More like this", "Nine near relations of this one", () => {}, "fly-card-more"))
    grid.append(cell)
    return cell
  })
  deck.focus()
  fit()
  const round = deck
  dealMany({ from }).then((nine) => {
    if (deck !== round) return
    const cw = fit()
    nine.forEach((x, i) => {
      const cell = cells[i], use = cell.querySelector(".fly-card-use"), canvas = cell.querySelector("canvas")
      const k = (cw * Math.min(devicePixelRatio || 1, 2)) / W
      canvas.width = Math.round(W * k); canvas.height = Math.round(H * k)
      engine.render(canvas.getContext("2d"), x.patch, x.patch.params.phase ?? 0.5, { scale: k, frame: 0, fontGen, image, emoji, marks })
      const p = x.patch.params
      use.disabled = false
      use.ariaLabel = `Post ${i + 1}: ${p.layout} layout, ${p.display}`
      use.title = x.faults.length ? `Judged ${x.score}: ${x.faults.map((f) => f.note).join(" ")}` : `Judged ${x.score}`
      use.onclick = () => { machine.setPatch(x.patch); shut() }
      cell.querySelector(".fly-card-more").onclick = () => { machine.setPatch(x.patch); openDeck(machine, "like") }
    })
    cells.slice(nine.length).forEach((c) => c.remove())
  }).catch((e) => { machine.note(e.message, true); shut() })
}

const el = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); n.append(...kids.filter((k) => k != null)); return n }
const button = (text, title, run, cls = "btn") => el("button", { type: "button", className: cls, textContent: text, title, onclick: run })

function varyBar(machine) {
  const body = machine.host.querySelector('[data-group="feel"] .group-body')
  const blurb = el("p", { className: "note fly-blurb" })
  const go = button("Vary", "Nine new posts from this mood, the best of many; locked things stay", () => openDeck(machine), "btn solid fly-vary")
  const locks = el("div", { className: "fly-chips", role: "group", ariaLabel: "Keep while varying" })
  const chips = Object.keys(LOCKS).map((facet) => {
    const key = `lock${facet[0].toUpperCase()}${facet.slice(1)}`
    const b = button(facet[0].toUpperCase() + facet.slice(1), `Keep the ${facet} when you Vary`, () => machine.set(key, !machine.patch.params[key]), "fly-chip")
    b.dataset.key = key
    return b
  })
  locks.append(el("span", { className: "fly-chips-label", textContent: "Keep" }), ...chips)
  const set = button("The whole set", "Every size and a carousel, from this post", () => openCampaign(machine), "btn fly-set-open")
  body.append(el("div", { className: "strip" }, go, set), locks, blurb)
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
  const cut = button("Cut out the background", "Finds the main thing in the picture and takes the rest away, in this browser", () => cutOut(), "btn")
  imageRow?.before(el("div", { className: "strip" }, button("Add a picture", "A cutout PNG or a photo", () => pictureInput.click(), "btn solid"), cut))
  return () => {
    cut.hidden = !machine.patch.params.image
    cut.disabled = cutting
    cut.textContent = cutting ? "Cutting out…" : "Cut out the background"
    const on = new Set(stickersOf(machine.patch.params.stickers))
    chips.querySelectorAll("button").forEach((b) => b.classList.toggle("on", on.has(b.dataset.id)))
    if (!pop.hidden) fill()
  }
}

function brandBar(machine) {
  const body = machine.host.querySelector('[data-group="brand"] .group-body')
  body.prepend(el("div", { className: "strip" },
    button("Add your logo", "An SVG, PNG or JPEG; it's remembered in this browser", () => { logoKey = "logo"; logoInput.click() }, "btn solid"),
    button("Add the mark alone", "The mark without the name, for round stickers", () => { logoKey = "logoMark"; logoInput.click() }),
    button("Forget", "Take the logos off and forget the brand kept in this browser (for every instrument)", () => {
      forgetBrand()
      machine.patch.params.logoMark = ""
      machine.set("logo", "")
      machine.note("Forgotten. The brand pocket starts empty next time.")
    }),
  ))
}

// { layout: true, … } keeps those facets while dealing; leave it out to go by the Keep chips.
function setLocks(keep) {
  if (keep) for (const facet of Object.keys(LOCKS)) m.patch.params[`lock${facet[0].toUpperCase()}${facet.slice(1)}`] = !!keep[facet]
}

// ---- the campaign: every size and a carousel, live, and exported as one .zip ----
let sheet = null, setTimer = 0
let exportingSet = false
const refreshSet = () => { if (!sheet || exportingSet) return; clearTimeout(setTimer); setTimer = setTimeout(() => sheet?.refresh(), 200) }
const sizeText = (patch) => { const { w, h } = formatSize(patch.params); return `${w}×${h}` }
function openCampaign(machine) {
  sheet?.remove()
  const grid = el("div", { className: "fly-set-grid" })
  const note = el("p", { className: "fly-deck-hint" })
  const head = el("div", { className: "fly-deck-head" },
    el("p", { className: "fly-deck-title", textContent: "The whole set" }), note,
    button("Export PNGs", "Every size and slide as a PNG, in one .zip", () => exportSet(machine, { video: false }), "btn solid"),
    button("PNGs and MP4s", "And each one moving: about half a minute", () => exportSet(machine, { video: true }), "btn"),
    button("Close", "Back to the post (Esc)", () => shut(), "btn"))
  sheet = el("div", { className: "fly-deck fly-set", role: "dialog", ariaLabel: "The whole set", tabIndex: -1 }, head, grid)
  machine.host.querySelector(".stage").append(sheet)
  const shut = () => { sheet?.remove(); sheet = null; removeEventListener("keydown", keys) }
  const keys = (e) => { if (e.key === "Escape" && !e.target.closest("input, textarea, select")) shut() }
  addEventListener("keydown", keys)
  sheet.focus()
  sheet.refresh = () => drawSet(machine, grid, note)
  sheet.refresh()
}
// Each tile drawn at its freeze frame, with what the judge made of it. A size opens on the stage;
// a slide is drawn from the post, so it's changed by changing the post.
let setToken = 0
async function drawSet(machine, grid, note) {
  const token = ++setToken, set = campaign(machine.patch)
  const rowH = Math.max(150, Math.min(260, (grid.clientHeight || 600) / 2 - 60))
  const tiles = set.map((x) => {
    const { w, h } = formatSize(x.patch.params), canvas = el("canvas")
    const k = (rowH * Math.min(devicePixelRatio || 1, 2)) / h
    canvas.width = Math.round(w * k); canvas.height = Math.round(h * k)
    canvas.style.height = `${rowH}px`; canvas.style.aspectRatio = `${w} / ${h}`
    const score = el("span", { className: "fly-set-score" })
    const face = x.group === "sizes"
      ? el("button", { type: "button", className: "fly-card-use", title: `Work on the ${x.name.toLowerCase()} size`, onclick: () => { machine.set("format", x.id); sheet?.remove(); sheet = null } }, canvas)
      : el("div", { className: "fly-set-slide" }, canvas)
    return { x, k, canvas, score, tile: el("figure", { className: "fly-set-tile" }, face, el("figcaption", {}, el("b", { textContent: x.name }), ` ${x.note} · ${sizeText(x.patch)} `, score)) }
  })
  const section = (title, group) => el("section", { className: "fly-set-row" }, el("h3", { textContent: title }), el("div", { className: "fly-set-tiles" }, ...tiles.filter((t) => t.x.group === group).map((t) => t.tile)))
  grid.replaceChildren(section("Sizes", "sizes"), ...(set.some((x) => x.group === "carousel") ? [section("Carousel", "carousel")] : []))
  let weak = 0
  for (const t of tiles) {
    const j = await judged(t.x.patch)
    if (token !== setToken) return
    engine.render(t.canvas.getContext("2d"), t.x.patch, t.x.patch.params.phase ?? 0.5, { scale: t.k, frame: 0, fontGen, image, emoji, marks })
    t.score.textContent = `· judged ${j.score}`
    t.score.title = j.faults.map((f) => f.note).join(" ")
    t.score.classList.toggle("weak", j.score < 70)
    if (j.score < 70) weak++
  }
  note.textContent = weak ? `${weak} of these could be better: open one to move things there, or Vary.` : "All in good shape. Change the post and they all change."
}

// save: false gives back the .zip as a Blob without downloading it, as render() does.
async function exportSet(machine, { video = false, save = true } = {}) {
  const note = sheet?.querySelector(".fly-deck-hint")
  const say = (t) => { if (note) note.textContent = t; machine.note(t) }
  const name = slug(machine.patch), files = []
  const set = campaign(machine.patch), home = structuredClone(machine.patch)
  exportingSet = true
  try {
    for (const [i, x] of set.entries()) {
      say(`Drawing ${x.name.toLowerCase()} (${i + 1} of ${set.length})…`)
      await ready(x.patch)
      const { w, h } = formatSize(x.patch.params)
      const c = Object.assign(document.createElement("canvas"), { width: w, height: h })
      engine.render(c.getContext("2d"), x.patch, x.patch.params.phase ?? 0.5, { scale: 1, frame: 0, fontGen, image, emoji, marks })
      const base = `${name}-campaign/${x.group === "sizes" ? "" : "carousel/"}${x.id}-${w}x${h}`
      files.push({ name: `${base}.png`, data: await new Promise((r) => c.toBlob(r, "image/png")) })
      if (video) {
        // Video goes through the shell's own exporter, so the post is swapped in for a moment.
        history.restoring = true
        machine.setPatch(x.patch)
        await ready(machine.patch)
        files.push({ name: `${base}.mp4`, data: await window.instrument.render("mp4") })
      }
    }
  } finally {
    if (video) { machine.setPatch(home); history.restoring = false }
    exportingSet = false
  }
  const blob = await zip(files)
  if (!save) { say(`Made ${name}-campaign.zip: ${files.length} files.`); return blob }
  download(blob, `${name}-campaign.zip`)
  say(`Saved ${name}-campaign.zip: ${files.length} files, every size${set.some((x) => x.group === "carousel") ? " and the carousel" : ""}.`)
  return blob
}

// ---- undo ----
// Every change, from the rack or the stage, can be undone: the patch as it was is kept (all but
// the freeze frame, which moves whenever you pause). A run of changes from the rack, a slider
// dragged or a word typed, counts as one (merge); each thing done on the stage is its own step.
const history = { past: [], future: [], last: null, at: 0, restoring: false }
const snapshot = (patch) => JSON.stringify({ ...patch, params: { ...patch.params, phase: 0 } })
function record(merge = false) {
  if (history.restoring || !m) return
  const now = snapshot(m.patch)
  if (history.last === null) { history.last = now; return }
  if (now === history.last) return
  const quick = merge && performance.now() - history.at < 600
  if (!quick || !history.past.length) history.past.push(history.last)
  history.past = history.past.slice(-100)
  history.last = now
  history.future = []
  history.at = performance.now()
}
function step(from, to) {
  if (!from.length) return false
  to.push(history.last)
  const back = JSON.parse(from.pop())
  back.params.phase = m.patch.params.phase
  history.restoring = true
  m.setPatch(back)
  history.restoring = false
  history.last = snapshot(m.patch)
  history.at = 0
  stage?.show()
  return true
}
const undo = () => step(history.past, history.future)
const redo = () => step(history.future, history.past)
addEventListener("keydown", (e) => {
  if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z" || e.target.closest?.("input, textarea")) return
  e.preventDefault()
  if (!(e.shiftKey ? redo() : undo())) m.note(e.shiftKey ? "Nothing to redo." : "Nothing to undo.")
})

// The Paste-up's own strip: how much is moved by hand, and putting it all back.
function movesBar(machine) {
  const body = machine.host.querySelector('[data-group="layout"] .group-body')
  const said = el("p", { className: "note" })
  const back = button("Put everything back", "Undo every move in this layout at this size", () => {
    const p = machine.patch.params
    const here = new Set(engine.movesHere(p))
    p.moves = p.moves.filter((mv) => !here.has(mv))
    machine.changed(); record(); stage?.show()
  })
  body.prepend(el("div", { className: "strip" }, back), said)
  return () => {
    const p = machine.patch.params, n = engine.movesHere(p).length
    back.hidden = !n
    said.textContent = n ? `${n} part${n > 1 ? "s" : ""} moved by hand in this layout at this size.` : "Click anything on the post to move it; double-click words to retype them."
  }
}

// ---- the machine ----
let stage = null
let syncers = []
const syncAll = () => syncers.forEach((s) => s())

m = await createMachine(document.querySelector("[data-machine]"), engine, {
  presets: new URL("presets/", import.meta.url),
  dropHint: "Drop a picture, a logo (on the Brand pocket, or any SVG) or a patch",

  load(patch, key) {
    // A new mood deals a new post from it straight away, and nine to choose from.
    if (key === "mood") { vary(patch.params, mulberry32(newSeed())); patch.seed = newSeed(); queueMicrotask(() => openDeck(m)) }
    if (!key || key === "logo" || key === "logoMark") loadLogo(patch)
    loadFonts(patch)
    loadImage(patch)
    loadEmojis(patch)
    if (BRAND_KEYS.includes(key)) rememberBrand(patch)
    queueMicrotask(() => { syncAll(); record(true); stage?.show(); refreshSet() })
  },
  playing: () => stage?.show(),
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
    const shop = machine.host.querySelector('[data-export="png"]')?.closest(".group-body")
    shop?.prepend(el("div", { className: "strip" }, button("Export the whole set", "Every size and a carousel from this post, as one .zip", () => openCampaign(machine), "btn solid")))
    machine.host.append(pictureInput, logoInput)
    const vary = machine.host.querySelector('[data-ref="vary"]')
    if (vary) Object.assign(vary, { title: "Nine new posts from this mood; locked things stay", onclick: () => openDeck(machine) })
    brandBar(machine)
    syncers = [varyBar(machine), rewriteBar(machine), stuffPickers(machine), movesBar(machine)]
    stage = stageEditing(machine, {
      options: () => ({ fontGen, image, emoji, marks }),
      record,
      onFirstMove: () => {
        machine.patch.params.lockLayout = true
        syncAll()
        machine.note("Moved by hand, so Keep layout is on: Vary leaves the layout and your moves alone.")
      },
    })
  },
  api: {
    // vary(): the best of a dozen new posts from the mood, put on the stage. keep as below.
    vary: async (keep) => {
      setLocks(keep)
      const best = await dealOne(m)
      return { patch: structuredClone(m.patch), score: best.score, faults: best.faults }
    },
    // deal(): nine judged posts, best first, without changing anything. from "fresh" or "like".
    deal: async ({ from = "fresh", keep, seed } = {}) => { setLocks(keep); return (await dealMany({ from, seed })).map((x) => structuredClone(x)) },
    // judge(): the score of the post on the stage, and its faults.
    judge: async () => { const { score, faults } = await judged(m.patch); return { score, faults } },
    // open(): show the deck of nine, as Vary does.
    open: (from = "fresh") => openDeck(m, from),
    // parts(): what's on the stage and where: [{ role, name, field, x, y, w, h, rot }] in output
    // pixels. move(role, { dx, dy, s, r, hide }) sets how a part is moved by hand (dx, dy as
    // fractions of the frame) at this size, or { everySize: true } as a third argument for all
    // sizes; move(role, null) puts it back. undo() and redo() as Cmd-Z.
    parts: () => engine.parts(document.createElement("canvas").getContext("2d"), m.patch, { fontGen, image, emoji, marks }),
    move: (role, mv, { everySize = false } = {}) => {
      const p = m.patch.params, id = everySize ? `${p.layout}:${role}` : engine.moveId(p, role)
      const moves = [...p.moves.filter((x) => x.id !== id), ...(mv ? [{ ...mv, id }] : [])]
      m.setPatch({ ...m.patch, params: { ...p, moves, lockLayout: p.lockLayout || !!mv } }) // checked and clamped
      return structuredClone(m.patch.params.moves)
    },
    // campaign(): every size and slide from this post, judged: [{ id, name, group, patch, score,
    // faults }]. exportSet({ video, save }) makes the .zip and downloads it, or with save: false
    // just resolves to the Blob.
    // openSet() shows the set over the stage.
    campaign: async () => Promise.all(campaign(m.patch).map(async (x) => ({ ...x, ...(await judged(x.patch)), patch: x.patch }))),
    exportSet: (opts = {}) => exportSet(m, opts),
    openSet: () => openCampaign(m),
    // cutout(): takes the background out of the picture, as the Junk drawer's button does.
    cutout: () => cutOut(),
    undo: () => undo(),
    redo: () => redo(),
    rewrites: () => rewrites(m.patch.params, m.patch.params.lens),
    lenses: () => LENSES.map(([id, name, blurb]) => ({ id, name, blurb })),
    moods: () => Object.entries(MOODS).map(([id, x]) => ({ id, name: x.label, blurb: x.blurb })),
    emoji: () => EMOJI.map(({ char, name, group }) => ({ char, name, group })),
    stickers: () => STICKERS.map(([id]) => id),
    ready: () => ready(m.patch),
  },
})

// With no patch in the link, the post opens with your brand: the one the Brand bench keeps, or the
// one you last used here.
if (location.hash.length <= 1) {
  const brand = myBrand()
  if (brand) m.setPatch(withBrand(m.patch, brand))
} else if (m.patch.params.logo) rememberBrand(m.patch) // a link that brings a brand, as the Brand bench's does
syncAll()
