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

// { layout: true, … } keeps those facets while dealing; leave it out to go by the Keep chips.
function setLocks(keep) {
  if (keep) for (const facet of Object.keys(LOCKS)) m.patch.params[`lock${facet[0].toUpperCase()}${facet.slice(1)}`] = !!keep[facet]
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
  const back = button("Put everything back", "Undo every move in this layout", () => {
    const p = machine.patch.params
    p.moves = p.moves.filter((mv) => !mv.id.startsWith(`${p.layout}:`))
    machine.changed(); record(); stage?.show()
  })
  body.prepend(el("div", { className: "strip" }, back), said)
  return () => {
    const p = machine.patch.params, n = p.moves.filter((mv) => mv.id.startsWith(`${p.layout}:`)).length
    back.hidden = !n
    said.textContent = n ? `${n} part${n > 1 ? "s" : ""} moved by hand in this layout.` : "Click anything on the post to move it; double-click words to retype them."
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
    if (!key || key === "logo") loadLogo(patch)
    loadFonts(patch)
    loadImage(patch)
    loadEmojis(patch)
    if (BRAND_KEYS.includes(key)) rememberBrand(patch)
    queueMicrotask(() => { syncAll(); record(true); stage?.show() })
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
    // fractions of the frame); move(role, null) puts it back. undo() and redo() as Cmd-Z.
    parts: () => engine.parts(document.createElement("canvas").getContext("2d"), m.patch, { fontGen, image, emoji, marks }),
    move: (role, mv) => {
      const p = m.patch.params, id = `${p.layout}:${role}`
      const moves = [...p.moves.filter((x) => x.id !== id), ...(mv ? [{ ...mv, id }] : [])]
      m.setPatch({ ...m.patch, params: { ...p, moves, lockLayout: p.lockLayout || !!mv } }) // checked and clamped
      return structuredClone(m.patch.params.moves)
    },
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

// With no patch in the link, the post opens with the brand you used last.
if (location.hash.length <= 1) {
  const brand = recalledBrand()
  if (brand) m.setPatch(withBrand(m.patch, brand))
} else if (m.patch.params.logo) rememberBrand(m.patch) // a link that brings a brand, as the Brand bench's does
syncAll()
