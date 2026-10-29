// The home page: the hero loop and the live examples. Every loop is the real engine running a patch
// file; nothing here is a video. Tiles start their engine only when they come near the screen, and
// the engine rests when they leave it (see embed.js).
import { mount } from "/instruments/elastic/embed.js"
import { manifest, size } from "/instruments/elastic/elastic.js"
import { sanitize, toHash } from "/packages/core/patch.js"
import { EFFECTS, effectById } from "/packages/core/effects/index.js"

const PRESETS = "/instruments/elastic/presets/"
const SHOWCASE = [
  "campaign-pin", "golden-section", "phi", "heat", "kaleido", "tumbling-blocks", "signature-fill", "black-glass", "liquid",
  "monolith", "gradient-maker", "studiolo-sweep", "night-shift", "coming-clear", "meltdown", "bloom", "sizes",
]
const HERO = ["phi", "heat", "campaign-pin", "black-glass", "monolith", "golden-section"]
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
  if (p.gradient !== "off") fx.unshift("gradient")
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

async function hero(card, caption) {
  const patches = await Promise.all(HERO.map(load))
  const slots = [0, 1].map(() => {
    const s = Object.assign(document.createElement("div"), { className: "slot" })
    s.append(document.createElement("div"))
    card.append(s)
    return s
  })
  let i = 0, stop = null
  const show = () => {
    const patch = patches[i % patches.length]
    const slot = slots[i % 2], other = slots[(i + 1) % 2]
    const host = document.createElement("div")
    slot.firstChild.replaceWith(host)
    const stopNext = mount(host, patch)
    slot.classList.add("on")
    other.classList.remove("on")
    // Stop the outgoing loop once it has faded.
    const stopPrev = stop
    setTimeout(() => stopPrev?.(), 1000)
    stop = stopNext
    caption.querySelector("[data-name]").textContent = patch.name
    caption.querySelector("a").href = openLink(patch)
    i++
  }
  show()
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches) setInterval(show, HERO_SECONDS * 1000)
}

// The Texture lab's looks, each drawn once onto its test card when it comes near the screen.
const LOOKS = ["riso-duo", "photocopy-grunge", "newsprint", "film-still", "holographic-foil", "kraft-print"]
async function looks(host) {
  const texture = await import("/instruments/texture/texture.js")
  const patches = await Promise.all(LOOKS.map((n) => fetch(`/instruments/texture/presets/${n}.json`).then((r) => r.json())))
  const near = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue
      near.unobserve(e.target)
      const patch = sanitize(texture.manifest, e.target._patch)
      const c = e.target.querySelector("canvas"), w = c.clientWidth * Math.min(devicePixelRatio || 1, 2)
      c.width = Math.round(w); c.height = Math.round((w * 3) / 4)
      texture.render(c.getContext("2d", { willReadFrequently: true }), patch, 0.25, { scale: c.width / 1600, frame: 7, caption: false })
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

const card = document.querySelector("[data-hero]")
if (card) hero(card, document.querySelector("[data-hero-caption]"))
const grid = document.querySelector("[data-examples]")
if (grid) examples(grid)
const lookGrid = document.querySelector("[data-looks]")
if (lookGrid) looks(lookGrid)
const specimenGrid = document.querySelector("[data-specimens]")
if (specimenGrid) specimens(specimenGrid)
const studyGrid = document.querySelector("[data-studies]")
if (studyGrid) studies(studyGrid)
