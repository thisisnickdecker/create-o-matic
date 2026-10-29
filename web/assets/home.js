// The home page: the playground at the top and the live examples. Every loop is the real engine running a patch
// file; nothing here is a video. Tiles start their engine only when they come near the screen, and
// the engine rests when they leave it (see embed.js).
import { mount } from "/instruments/elastic/embed.js"
import { manifest, size } from "/instruments/elastic/elastic.js"
import { sanitize, toHash } from "/packages/core/patch.js"
import { EFFECTS, effectById } from "/packages/core/effects/index.js"

const PRESETS = "/instruments/elastic/presets/"
const SHOWCASE = [
  "kaleido", "signal", "golden-section", "c-fill", "heat", "black-glass", "phi", "night-shift", "bloom",
  "liquid", "meltdown", "gradient-maker", "coming-clear", "sizes", "o-sweep",
]
const HERO_SECONDS = 9

const load = (name) => fetch(`${PRESETS}${name}.json`).then((r) => r.json())
const openLink = (patch) => `/make/#${toHash(patch)}`

// A one-line description: frame, length, and what's switched on.
function specs(patch) {
  const p = sanitize(manifest, patch).params
  const { w, h } = size({ params: p })
  const fx = EFFECTS.filter((e) => e.active(p)).map((e) => e.label)
  if (patch.keys && Object.keys(patch.keys).length) fx.push("keyframes")
  if (p.shape) fx.push("shape fill")
  if (p.layout === "golden") fx.unshift("golden section")
  return [`${w}×${h}`, `${p.duration}s`, ...fx].join(" · ")
}

async function examples(host) {
  const patches = await Promise.all(SHOWCASE.map(load))
  const near = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue
      near.unobserve(e.target)
      mount(e.target, e.target._patch)
    }
  }, { rootMargin: "300px 0px" })

  host.replaceChildren(...patches.map((patch) => {
    const tile = Object.assign(document.createElement("a"), { className: "tile", href: openLink(patch) })
    tile.innerHTML = `<div class="art"><div></div></div><div class="meta"><span></span><span></span></div><span class="open">Open in the machine <span class="arrow"></span></span>`
    tile.querySelector(".meta span").textContent = patch.name
    tile.querySelector(".meta span:last-child").textContent = specs(patch)
    const art = tile.querySelector(".art > div")
    art._patch = patch
    near.observe(art)
    return tile
  }))
}

// ---- the playground ----
// The hero is a toy: your word (and your logo, if you add one) set in a run of looks, each a real
// Motion preset with your words swapped in. The looks take turns until you touch something.
const PLAY = [
  ["kaleido", "Kaleido"], ["signal", "ASCII"], ["golden-section", "Golden section"], ["heat", "Heat"],
  ["black-glass", "Black glass"], ["c-fill", "Shape fill"], ["night-shift", "Night shift"], ["meltdown", "Meltdown"],
]

// A preset with the word in place of its words. A logo joins as a mark; a shape fill fills the logo.
function playPatch(preset, words, logo) {
  const p = structuredClone(preset)
  const lines = words.trim().split(/\s+/).filter(Boolean)
  const content = lines.length ? lines : ["PLAY"]
  if (logo) {
    if (logo.svg) p.marks = { ...(p.marks ?? {}), [logo.name]: logo.svg }
    // Your logo fills the frame whole: the preset's zoom keyframes were cut for its own shape.
    if (p.params.shape) { p.params.shape = logo.name; p.params.shapeScale = 0.92; p.params.shapeX = 0; p.params.shapeY = 0; p.keys = {} }
    else content.push(`@${logo.name}`)
  }
  p.params.content = content.join("\n")
  delete p.name
  return p
}

const titleCase = (s) => s.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, a, b) => a + b.toUpperCase())

async function play(root) {
  const card = root.querySelector("[data-hero]"), input = root.querySelector(".play-word"), chips = root.querySelector(".chips")
  const open = root.querySelector("[data-open]"), brand = root.querySelector("[data-brand]"), hint = root.querySelector("[data-hint]")
  const presets = await Promise.all(PLAY.map(([id]) => load(id)))
  let look = 0, logo = null, auto = !matchMedia("(prefers-reduced-motion: reduce)").matches, stop = null, timer = 0

  const slots = [0, 1].map(() => { const s = Object.assign(document.createElement("div"), { className: "slot" }); s.append(document.createElement("div")); card.append(s); return s })
  let turn = 0
  const buttons = PLAY.map(([, label], i) => {
    const b = Object.assign(document.createElement("button"), { type: "button", textContent: label })
    b.setAttribute("role", "radio")
    b.onclick = () => { auto = false; look = i; show() }
    chips.append(b)
    return b
  })

  function show() {
    const patch = playPatch(presets[look], input.value, logo)
    const slot = slots[turn % 2], other = slots[(turn + 1) % 2]
    const host = document.createElement("div")
    slot.firstChild.replaceWith(host)
    const next = mount(host, patch)
    slot.classList.add("on"); other.classList.remove("on")
    const prev = stop
    setTimeout(() => prev?.(), 1000) // the outgoing loop stops once it has faded
    stop = next
    turn++
    buttons.forEach((b, i) => { b.classList.toggle("on", i === look); b.setAttribute("aria-checked", String(i === look)) })
    open.href = openLink(patch)
    const name = titleCase(input.value.trim()) || "Your brand"
    brand.href = `/brand/#${toHash({ instrument: "brand", params: { brandName: name, tagline: "", logo: logo?.name ?? "", logoColour: "original" }, marks: logo?.svg ? { [logo.name]: logo.svg } : {} })}`
    clearTimeout(timer)
    if (auto) timer = setTimeout(() => { look = (look + 1) % PLAY.length; show() }, HERO_SECONDS * 1000)
  }

  // Typing redraws once the typing pauses.
  let typing = 0
  input.addEventListener("input", () => { auto = false; clearTimeout(typing); typing = setTimeout(show, 280) })
  input.addEventListener("focus", () => input.select(), { once: true })

  // A logo: chosen, or dropped anywhere on the page. SVG travels in the links; an image is kept
  // in this browser, which is where Motion and the Brand bench will look for it.
  const { addMarkFile } = await import("/packages/core/marks.js")
  const useLogo = async (f) => {
    try {
      const { name, svg } = await addMarkFile(f)
      logo = { name, svg }
      auto = false
      hint.textContent = `${f.name} is in. Try Shape fill.`
      show()
    } catch (e) { hint.textContent = e.message }
  }
  const file = Object.assign(document.createElement("input"), { type: "file", accept: ".svg,image/svg+xml,image/png,image/jpeg,image/webp", hidden: true })
  file.onchange = () => { if (file.files[0]) useLogo(file.files[0]); file.value = "" }
  root.append(file)
  root.querySelector("[data-logo]").onclick = () => file.click()
  addEventListener("dragover", (e) => { if ([...e.dataTransfer.items].some((i) => i.kind === "file")) { e.preventDefault(); root.classList.add("dropping") } })
  addEventListener("dragleave", (e) => { if (!e.relatedTarget) root.classList.remove("dropping") })
  addEventListener("drop", (e) => {
    const f = [...e.dataTransfer.files].find((x) => /^image\//.test(x.type) || /\.svg$/i.test(x.name))
    root.classList.remove("dropping")
    if (!f) return
    e.preventDefault()
    useLogo(f)
  })

  show()
}

// The Texture lab's looks, each drawn once onto its test card when it comes near the screen.
const LOOKS = ["riso-duo", "photocopy-grunge", "newsprint", "film-still", "holographic-foil", "kraft-print"]
// One frame of Motion's Black glass, the Texture lab's own default source, for the looks to treat.
async function glassFrame() {
  const { ensureFont } = await import("/packages/core/fonts.js")
  const patch = sanitize(manifest, await load("black-glass"))
  const elastic = await import("/instruments/elastic/elastic.js")
  await ensureFont(elastic.fontRequest(patch))
  elastic.clearMetrics()
  const c = Object.assign(document.createElement("canvas"), { width: 1080, height: 608 })
  elastic.render(c.getContext("2d", { willReadFrequently: true }), patch, 0.25, { scale: 1080 / size(patch).w, frame: 60 })
  return c
}

async function looks(host) {
  const texture = await import("/instruments/texture/texture.js")
  const patches = await Promise.all(LOOKS.map((n) => fetch(`/instruments/texture/presets/${n}.json`).then((r) => r.json())))
  let source = null
  const near = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue
      near.unobserve(e.target)
      // A 4:3 frame, as the tiles are, with the whole source fitted inside it on its own black.
      const patch = sanitize(texture.manifest, { ...e.target._patch, params: { background: "#0B0B0A", ...e.target._patch.params, format: "custom", width: 1200, height: 900, fit: "contain", sourceWidth: 1080, sourceHeight: 608 } })
      const c = e.target.querySelector("canvas"), w = c.clientWidth * Math.min(devicePixelRatio || 1, 2)
      source ??= glassFrame()
      source.then((frame) => {
        c.width = Math.round(w); c.height = Math.round((w * 3) / 4)
        texture.render(c.getContext("2d", { willReadFrequently: true }), patch, 0.25, { scale: c.width / 1200, frame: 7, source: frame })
      })
    }
  }, { rootMargin: "300px 0px" })
  host.replaceChildren(...patches.map((patch) => {
    const tile = Object.assign(document.createElement("a"), { className: "tile", href: `/texture/#${toHash(sanitize(texture.manifest, patch))}` })
    tile.innerHTML = `<div class="art"><canvas></canvas></div><div class="meta"><span></span><span></span></div>`
    tile.querySelector(".meta span").textContent = patch.name
    tile.querySelector(".meta span:last-child").textContent = patch.params.layers.map((l) => effectById(l.effect).label).join(" · ")
    tile.querySelector(".art")._patch = patch
    near.observe(tile.querySelector(".art"))
    return tile
  }))
}

// The Type tester's sheets, set once their fonts arrive, when they come near the screen.
const SPECIMENS = ["specimen-sheet", "pairings", "weight-sweep"]
async function specimens(host) {
  const type = await import("/instruments/type/type.js")
  const { ensureFont } = await import("/packages/core/fonts.js")
  const patches = await Promise.all(SPECIMENS.map((n) => fetch(`/instruments/type/presets/${n}.json`).then((r) => r.json())))
  const near = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue
      near.unobserve(e.target)
      const patch = sanitize(type.manifest, e.target._patch), c = e.target.querySelector("canvas")
      Promise.all(type.fontRequests(patch).map((r) => ensureFont(r))).then(() => {
        const { w, h } = type.size(patch), k = Math.min(c.clientWidth / w, c.clientHeight / h) * Math.min(devicePixelRatio || 1, 2)
        c.width = Math.round(w * k); c.height = Math.round(h * k)
        type.render(c.getContext("2d"), patch, 0.3, { scale: k })
      })
    }
  }, { rootMargin: "300px 0px" })
  host.replaceChildren(...patches.map((patch) => {
    const tile = Object.assign(document.createElement("a"), { className: "tile", href: `/type/#${toHash(sanitize(type.manifest, patch))}` })
    tile.innerHTML = `<div class="art"><canvas></canvas></div><div class="meta"><span></span><span></span></div>`
    tile.querySelector(".meta span").textContent = patch.name
    tile.querySelector(".meta span:last-child").textContent = [...new Set(patch.params.rows.map((r) => r.font))].join(" · ")
    tile.querySelector(".art")._patch = patch
    near.observe(tile.querySelector(".art"))
    return tile
  }))
}

// The Colour lab's studies, drawn once when they come near the screen.
const STUDIES = ["homage", "tints-and-shades", "will-it-read"]
async function studies(host) {
  const colour = await import("/instruments/colour/colour.js")
  const patches = await Promise.all(STUDIES.map((n) => fetch(`/instruments/colour/presets/${n}.json`).then((r) => r.json())))
  const near = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue
      near.unobserve(e.target)
      const patch = sanitize(colour.manifest, e.target._patch), c = e.target.querySelector("canvas")
      document.fonts.ready.then(() => {
        const { w, h } = colour.size(patch), k = Math.min(c.clientWidth / w, c.clientHeight / h) * Math.min(devicePixelRatio || 1, 2)
        c.width = Math.round(w * k); c.height = Math.round(h * k)
        colour.render(c.getContext("2d"), patch, 0, { scale: k })
      })
    }
  }, { rootMargin: "300px 0px" })
  host.replaceChildren(...patches.map((patch) => {
    const tile = Object.assign(document.createElement("a"), { className: "tile", href: `/colour/#${toHash(sanitize(colour.manifest, patch))}` })
    tile.innerHTML = `<div class="art"><canvas></canvas></div><div class="meta"><span></span><span></span></div>`
    tile.querySelector(".meta span").textContent = patch.name
    tile.querySelector(".meta span:last-child").textContent = `${patch.params.inks.length} inks`
    tile.querySelector(".art")._patch = patch
    near.observe(tile.querySelector(".art"))
    return tile
  }))
}

// The Brand bench's boards, drawn once their logo and faces are ready.
const BOARDS = ["create-o-matic", "night-shift", "logo-loop"]
async function boards(host) {
  const brand = await import("/instruments/brand/brand.js")
  const { ensureFont } = await import("/packages/core/fonts.js")
  const { prepareMarks } = await import("/packages/core/marks.js")
  const patches = await Promise.all(BOARDS.map((n) => fetch(`/instruments/brand/presets/${n}.json`).then((r) => r.json())))
  const near = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue
      near.unobserve(e.target)
      const patch = sanitize(brand.manifest, e.target._patch), c = e.target.querySelector("canvas")
      Promise.all([prepareMarks({ params: { content: `@${patch.params.logo}` }, marks: patch.marks }), ...brand.fontRequests(patch).map((r) => ensureFont(r))]).then(([marks]) => {
        const { w, h } = brand.size(patch), k = Math.min(c.clientWidth / w, c.clientHeight / h) * Math.min(devicePixelRatio || 1, 2)
        c.width = Math.round(w * k); c.height = Math.round(h * k)
        brand.render(c.getContext("2d", { willReadFrequently: true }), patch, 0, { scale: k, frame: 0, marks })
      })
    }
  }, { rootMargin: "300px 0px" })
  host.replaceChildren(...patches.map((patch) => {
    const tile = Object.assign(document.createElement("a"), { className: "tile", href: `/brand/#${toHash(sanitize(brand.manifest, patch))}` })
    tile.innerHTML = `<div class="art"><canvas></canvas></div><div class="meta"><span></span><span></span></div>`
    tile.querySelector(".meta span").textContent = patch.name
    tile.querySelector(".meta span:last-child").textContent = { overview: "Brand board", logo: "Logo in ASCII" }[patch.params.board] ?? ""
    tile.querySelector(".art")._patch = patch
    near.observe(tile.querySelector(".art"))
    return tile
  }))
}

const playground = document.querySelector("[data-play]")
if (playground) play(playground)
const grid = document.querySelector("[data-examples]")
if (grid) examples(grid)
const lookGrid = document.querySelector("[data-looks]")
if (lookGrid) looks(lookGrid)
const specimenGrid = document.querySelector("[data-specimens]")
if (specimenGrid) specimens(specimenGrid)
const studyGrid = document.querySelector("[data-studies]")
if (studyGrid) studies(studyGrid)
const boardGrid = document.querySelector("[data-boards]")
if (boardGrid) boards(boardGrid)
