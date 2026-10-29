// The home page: the playground at the top and the live examples. Every loop is the real engine running a patch
// file; nothing here is a video. Tiles start their engine only when they come near the screen, and
// the engine rests when they leave it (see embed.js).
import { mount } from "/instruments/elastic/embed.js"
import { manifest, size } from "/instruments/elastic/elastic.js"
import { sanitize, toHash } from "/packages/core/patch.js"
import { EFFECTS, effectById } from "/packages/core/effects/index.js"

const PRESETS = "/instruments/elastic/presets/"
const SHOWCASE = [
  "kaleido", "signal", "sorted", "scatter", "golden-section", "c-fill", "led-sign", "decode", "heat", "black-glass", "phi", "night-shift", "bloom", "tiles",
  "liquid", "meltdown", "gradient-maker", "coming-clear", "sizes", "o-sweep",
]

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
// The top of the page is a toy you can work in. Type something (or add a logo), pick a look, and
// adjust it: size, typeface, colour, how much it moves, the look's own effect, the loop's length.
// Each look is a real Motion preset with your words in. Download it here, or open it in Motion.
const PLAY = [
  ["clean-type", "Type"], ["c-fill", "Shape fill"], ["night-shift", "Night shift"], ["black-glass", "Black glass"],
  ["signal", "ASCII"], ["led-sign", "LED"], ["sorted", "Pixel sort"], ["decode", "Decode"], ["scatter", "Scatter"],
  ["heat", "Heat"], ["monolith", "Cube"], ["tumbling-blocks", "Blocks"], ["kaleido", "Kaleido"],
]
// Each look's own effect, on one 0 to 1 slider: the setting, and its value at each end.
const EFFECT = {
  signal: ["Character size", "ascii", 22, 5], "led-sign": ["Dot size", "dots", 18, 5], sorted: ["Pixel sort", "pixelSort", 0.15, 0.9],
  decode: ["Scramble", "scramble", 0.1, 0.95], scatter: ["Scatter", "dotScatter", 0, 1], kaleido: ["Mirrors", "kaleido", 3, 14],
  monolith: ["Cube size", "cube", 0.35, 1], "tumbling-blocks": ["Block size", "cube", 0.06, 0.45],
}
const PLACEHOLDER = "TYPE\nSOMETHING"

// The look with your words in: a logo joins as a mark, and fills a shape fill whole.
function playPatch(preset, words, logo) {
  const p = structuredClone(preset)
  const lines = words.trim().split(/\s+/).filter(Boolean)
  const content = lines.length ? lines : logo ? [] : PLACEHOLDER.split("\n")
  if (logo) {
    if (logo.svg) p.marks = { ...(p.marks ?? {}), [logo.name]: logo.svg }
    if (p.params.shape) { p.params.shape = logo.name; p.params.shapeScale = 0.92; p.params.shapeX = 0; p.params.shapeY = 0; p.keys = {} }
    else content.push(`@${logo.name}`)
  }
  p.params.content = (content.length ? content : PLACEHOLDER.split("\n")).join("\n")
  delete p.name
  return p
}

const titleCase = (s) => s.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, a, b) => a + b.toUpperCase())
const fileSlug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "create-o-matic"

async function play(root) {
  const $ = (q) => root.querySelector(q)
  const card = $("[data-hero]"), input = $(".play-word"), chips = $(".chips"), hint = $("[data-hint]")
  const ui = { size: $("[data-size]"), font: $("[data-font]"), colours: $("[data-colours]"), motion: $("[data-motion]"), effect: $("[data-effect]"),
    effectRow: $("[data-effect-row]"), effectName: $("[data-effect-name]"), speed: $("[data-speed]"), speedOut: $("[data-speed-out]"),
    rows: $("[data-rows]"), columns: $("[data-columns]"), gap: $("[data-gap]"), ripple: $("[data-ripple]"),
    rowsOut: $("[data-rows-out]"), columnsOut: $("[data-columns-out]"), gridRows: root.querySelectorAll("[data-grid-row]") }
  const presets = await Promise.all(PLAY.map(([id]) => load(id)))
  const { PALETTES } = await import("/assets/brand.js")
  let look = 0, logo = null, colour = -1, stop = null

  // Looks
  const buttons = PLAY.map(([, label], i) => {
    const b = Object.assign(document.createElement("button"), { type: "button", textContent: label })
    b.setAttribute("role", "radio")
    b.onclick = () => { look = i; fromLook(); show(true) }
    chips.append(b)
    return b
  })
  // Colours: the look's own, then the site's palettes.
  const swatch = (label, inks, i) => {
    const b = Object.assign(document.createElement("button"), { type: "button", title: label })
    b.setAttribute("role", "radio")
    b.setAttribute("aria-label", label)
    b.style.background = inks ? `linear-gradient(90deg, ${inks.map((c, k) => `${c} ${(k / inks.length) * 100}% ${((k + 1) / inks.length) * 100}%`).join(", ")})` : ""
    if (!inks) b.textContent = "Own"
    b.onclick = () => { colour = i; show() }
    ui.colours.append(b)
    return b
  }
  const swatches = [swatch("The look's own colours", null, -1), ...PALETTES.slice(0, 6).map((pal, i) => swatch(pal.name, pal.colours, i))]

  // The sliders start where the look itself sits.
  function fromLook() {
    const p = presets[look].params, e = EFFECT[PLAY[look][0]]
    ui.motion.value = p.amount ?? 0.6
    ui.speed.value = p.duration
    ui.rows.value = p.rows ?? 12
    ui.columns.value = p.columns ?? 6
    ui.gap.value = p.gap ?? 0
    ui.ripple.value = p.rowOffset ?? 0.09
    for (const r of ui.gridRows) r.hidden = (p.layout ?? "grid") !== "grid"
    ui.effectRow.hidden = !e
    if (e) { const [name, key, a, b] = e; ui.effectName.textContent = name; ui.effect.value = Math.min(1, Math.max(0, ((p[key] ?? a) - a) / (b - a))) }
  }

  // The patch as it stands: the look, your words, and the controls.
  function current() {
    const patch = playPatch(presets[look], input.value, logo), p = patch.params, e = EFFECT[PLAY[look][0]]
    if (ui.size.value) p.format = ui.size.value
    if (ui.font.value) Object.assign(p, { font: ui.font.value, fontSource: "open" })
    if (colour >= 0) { p.palette = PALETTES[colour].colours; if (p.gradient && p.gradient !== "off") p.gradientInks = PALETTES[colour].colours }
    p.amount = +ui.motion.value
    p.duration = +ui.speed.value
    p.gap = +ui.gap.value
    p.rowOffset = +ui.ripple.value
    if ((p.layout ?? "grid") === "grid") { p.rows = +ui.rows.value; p.columns = +ui.columns.value }
    if (e) { const [, key, a, b] = e, v = a + (b - a) * +ui.effect.value; p[key] = key === "kaleido" ? Math.round(v) : v }
    return patch
  }

  // A new look fades in; a change to the controls updates the loop in place.
  const slots = [0, 1].map(() => { const s = Object.assign(document.createElement("div"), { className: "slot" }); s.append(document.createElement("div")); card.append(s); return s })
  let turn = 0
  function show(fresh = false) {
    const patch = current()
    if (fresh || !stop) {
      const slot = slots[turn % 2], other = slots[(turn + 1) % 2], host = document.createElement("div")
      slot.firstChild.replaceWith(host)
      const next = mount(host, patch)
      slot.classList.add("on"); other.classList.remove("on")
      const prev = stop
      setTimeout(() => prev?.(), 1000)
      stop = next
      turn++
    } else stop.update(patch)
    buttons.forEach((b, i) => { b.classList.toggle("on", i === look); b.setAttribute("aria-checked", String(i === look)) })
    swatches.forEach((b, i) => b.classList.toggle("on", i - 1 === colour))
    ui.speedOut.textContent = `${(+ui.speed.value).toFixed(1)} s`
    ui.rowsOut.textContent = ui.rows.value
    ui.columnsOut.textContent = ui.columns.value
    $("[data-open]").href = openLink(patch)
    $("[data-brand]").href = `/brand/#${toHash({ instrument: "brand", params: { brandName: titleCase(input.value.trim()) || "Your brand", tagline: "", logo: logo?.name ?? "", logoColour: "original", ...(colour >= 0 ? { inks: PALETTES[colour].colours } : {}) }, marks: logo?.svg ? { [logo.name]: logo.svg } : {} })}`
  }

  let wait = 0
  const soon = (ms = 160) => { clearTimeout(wait); wait = setTimeout(() => show(), ms) }
  input.addEventListener("input", () => soon(280))
  for (const el of [ui.size, ui.font]) el.addEventListener("change", () => show())
  for (const el of [ui.motion, ui.effect, ui.speed, ui.rows, ui.columns, ui.gap, ui.ripple]) el.addEventListener("input", () => soon())

  // A logo: chosen, or dropped anywhere on the page.
  const { addMarkFile } = await import("/packages/core/marks.js")
  const useLogo = async (f) => {
    try {
      const { name, svg } = await addMarkFile(f)
      logo = { name, svg }
      hint.textContent = `${f.name} is in${svg ? "" : ", with its background taken out"}. Try Shape fill, Black glass or ASCII; clear the words to fill every cell with it.`
      show(true)
    } catch (e) { hint.textContent = e.message }
  }
  const file = Object.assign(document.createElement("input"), { type: "file", accept: ".svg,image/svg+xml,image/png,image/jpeg,image/webp", hidden: true })
  file.onchange = () => { if (file.files[0]) useLogo(file.files[0]); file.value = "" }
  root.append(file)
  $("[data-logo]").onclick = () => file.click()
  addEventListener("dragover", (e) => { if ([...e.dataTransfer.items].some((i) => i.kind === "file")) { e.preventDefault(); root.classList.add("dropping") } })
  addEventListener("dragleave", (e) => { if (!e.relatedTarget) root.classList.remove("dropping") })
  addEventListener("drop", (e) => {
    const f = [...e.dataTransfer.files].find((x) => /^image\//.test(x.type) || /\.svg$/i.test(x.name))
    root.classList.remove("dropping")
    if (!f) return
    e.preventDefault()
    useLogo(f)
  })

  // Download, save or copy, right here: rendered frame by frame at full size (GIF at half), the
  // same as Motion does. On a phone the file goes to the share sheet (Save to Photos, AirDrop,
  // Messages); on a computer it downloads, and a PNG can go straight to the clipboard.
  const engine = await import("/instruments/elastic/elastic.js")
  const exporters = await import("/packages/core/export.js")
  const { ensureFont } = await import("/packages/core/fonts.js")
  const { prepareMarks } = await import("/packages/core/marks.js")
  const shareButton = $("[data-share]"), copyButton = $("[data-copy]")
  let busy = false, ready = null

  async function make(kind, onProgress) {
    const patch = sanitize(engine.manifest, current())
    const marks = await prepareMarks(patch)
    await ensureFont(engine.fontRequest(patch))
    engine.clearMetrics()
    const { w: W, h: H } = engine.size(patch), k = kind === "gif" ? 0.5 : 1
    const w = Math.max(2, Math.round((W * k) / 2) * 2), h = Math.max(2, Math.round((H * k) / 2) * 2), s = w / W
    const n = engine.frameCount(patch), fps = Number(patch.params.fps)
    const draw = (c, i) => engine.render(c, patch, kind === "png" ? 0.25 : i / n, { scale: s, frame: i, marks })
    const blob = kind === "png" ? await exporters.exportPng({ w, h, draw })
      : kind === "gif" ? await exporters.exportGif({ w, h, fps, frames: n, draw, onProgress })
      : await exporters.exportVideo({ kind, w, h, fps, frames: n, draw, onProgress })
    return { blob, name: `${fileSlug(input.value || logo?.name || "create-o-matic")}-${w}x${h}.${kind}`, w, h, kind }
  }
  const mb = (blob) => `${(blob.size / 1048576).toFixed(1)} MB`

  for (const b of root.querySelectorAll("[data-export]")) {
    b.onclick = async () => {
      if (busy) return
      busy = true
      shareButton.hidden = true
      const label = b.textContent
      try {
        ready = await make(b.dataset.export, (f) => { b.textContent = `${Math.round(f * 100)}%` })
        const { blob, name, w, h, kind } = ready, sharable = exporters.canShare(blob, name)
        if (sharable) { shareButton.hidden = false; shareButton.textContent = kind === "png" ? "Save or share image" : `Save or share ${kind.toUpperCase()}` }
        if (sharable && exporters.touchFirst()) hint.textContent = `Your ${w}×${h} ${kind.toUpperCase()} is ready (${mb(blob)}). Tap Save or share to put it in Photos, or send it.`
        else { exporters.download(blob, name); hint.textContent = `Saved a ${w}×${h} ${kind.toUpperCase()} (${mb(blob)}).${sharable ? " Share sends it by AirDrop or Messages." : ""}` }
      } catch (e) { hint.textContent = e.message }
      b.textContent = label
      busy = false
    }
  }
  shareButton.onclick = () => {
    if (!ready) return
    exporters.share(ready.blob, ready.name).catch((e) => { if (e.name !== "AbortError") { exporters.download(ready.blob, ready.name); hint.textContent = "Sharing didn't work here, so it's downloaded instead." } })
  }
  if (exporters.canCopyImage()) {
    copyButton.hidden = false
    copyButton.onclick = () => {
      const png = make("png").then((r) => r.blob)
      exporters.copyPng(png)
        .then(() => png.then((blob) => { hint.textContent = `Copied a full-size PNG (${mb(blob)}). Paste it into Figma, Slack or a message.` }))
        .catch((e) => { hint.textContent = `Couldn't copy: ${e.message}` })
    }
  }

  fromLook()
  show(true)
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
