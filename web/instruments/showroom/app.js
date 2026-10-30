// Showroom: the engine in the shared shell, plus what only it needs: your images (added, dropped,
// kept in this browser), sample work to show until there are some, and the preview as a handle:
// drag to turn the arrangement, scroll or pinch to zoom.
import * as engine from "./showroom.js"
import { createMachine } from "../../packages/core/shell.js"
import { addMedia, loadMedia } from "../../packages/core/media.js"
import { newListItem } from "../../packages/core/patch.js"
import { mulberry32 } from "../../packages/core/rng.js"

let m
let tiles = []
let ready = Promise.resolve()
const imagesDef = engine.manifest.parameters.find((d) => d.key === "images")

// ---- sample work: made-up sites and posters, drawn once, so the room is never empty ----
const DISPLAY = '"neue-haas-grotesk-display", "Helvetica Neue", Helvetica, Arial, sans-serif'
const TEXT = '"neue-haas-grotesk-text", "Helvetica Neue", Helvetica, Arial, sans-serif'
const INKS = [
  ["#FF4D1F", "#111111", "#FFE14D"], ["#1530FF", "#FFFFFF", "#FFE800"], ["#F2EFE6", "#121211", "#E4372B"],
  ["#0E0E0E", "#F4F4F1", "#7CFF6B"], ["#FFD3E0", "#2A0F3D", "#FF2E88"], ["#0E6E6E", "#F2EFE6", "#F4D35E"],
  ["#FFE800", "#111111", "#1530FF"], ["#E9E4FF", "#1E1A4A", "#6B4BFF"], ["#1E2A4A", "#F2C9C0", "#E4372B"],
  ["#DCEBDD", "#13321C", "#FF6A3D"], ["#FFFFFF", "#121211", "#FF4D1F"], ["#2A0F3D", "#FFD3E0", "#7CFF6B"],
]
const WORDS = ["Bloom", "Index", "Tempo", "Kiln", "Orbit", "Paper", "Field", "Signal", "Hello", "Drift", "Atlas", "Halo", "Nº 07", "Mono", "Wild", "Echo"]
const KINDS = ["hero", "chips", "number", "blobs", "page", "specimen"]

function sample(i) {
  const r = mulberry32(i * 977 + 5)
  const [bg, ink, accent] = INKS[i % INKS.length], word = WORDS[i % WORDS.length], kind = KINDS[i % KINDS.length]
  const W = 1600, H = kind === "page" ? 4200 : 1000
  const c = Object.assign(document.createElement("canvas"), { width: W, height: H }), g = c.getContext("2d")
  const rr = (x, y, w, h, rad, fill) => { g.fillStyle = fill; g.beginPath(); g.roundRect(x, y, w, h, rad); g.fill() }
  const text = (s, x, y, px, fill, font = DISPLAY, weight = 500) => { g.fillStyle = fill; g.font = `${weight} ${px}px ${font}`; g.fillText(s, x, y) }
  const nav = (y) => {
    text(word.toLowerCase() + ".", 64, y, 30, ink, TEXT)
    ;["Work", "About", "Index", "Contact"].forEach((s, k) => text(s, W - 520 + k * 120, y, 22, ink, TEXT, 400))
  }
  g.fillStyle = bg
  g.fillRect(0, 0, W, H)
  g.textBaseline = "alphabetic"
  if (kind === "hero") {
    nav(80)
    g.fillStyle = accent
    g.beginPath(); g.arc(W * (0.6 + r() * 0.2), H * 0.42, 210 + r() * 80, 0, Math.PI * 2); g.fill()
    text(word, 56, H - 90, 380, ink)
  } else if (kind === "chips") {
    nav(80)
    text(`${word} store`, 64, 230, 96, ink)
    for (let k = 0; k < 6; k++) {
      const x = 64 + (k % 3) * 498, y = 300 + Math.floor(k / 3) * 330
      rr(x, y, 470, 300, 28, k % 2 ? accent : ink)
      text(`0${k + 1}`, x + 30, y + 270, 44, k % 2 ? ink : bg, TEXT)
    }
  } else if (kind === "number") {
    text(word, 64, 140, 120, ink)
    text(String(1 + Math.floor(r() * 98)).padStart(2, "0"), 40, H - 60, 620, accent)
    for (let k = 0; k < 9; k++) rr(W - 560, 260 + k * 52, 480 - (k % 3) * 90, 14, 7, ink)
  } else if (kind === "blobs") {
    for (let k = 0; k < 4; k++) {
      const x = r() * W, y = r() * H, rad = 300 + r() * 500, grad = g.createRadialGradient(x, y, 0, x, y, rad)
      grad.addColorStop(0, k % 2 ? accent : ink); grad.addColorStop(1, bg + "00")
      g.fillStyle = grad; g.fillRect(0, 0, W, H)
    }
    text(word, 64, H - 80, 160, ink === "#FFFFFF" || bg === "#0E0E0E" ? "#FFFFFF" : ink)
  } else if (kind === "specimen") {
    text("Aa", 40, H - 120, 640, ink)
    text(word, W - 640, 220, 120, accent)
    for (let k = 0; k < 3; k++) text("ABCDEFGHIJKLM".slice(0, 9 + k), W - 640, 360 + k * 90, 56, ink, TEXT, 400)
  } else {
    // A tall landing page, for Scroll pages: sections one under another.
    nav(80)
    text(word, 56, 560, 420, ink)
    rr(64, 700, W - 128, 900, 36, accent)
    text("Selected work", 64, 1760, 72, ink)
    for (let k = 0; k < 4; k++) rr(64 + (k % 2) * 750, 1820 + Math.floor(k / 2) * 560, 722, 520, 28, k % 3 ? ink : accent)
    rr(0, 3000, W, 900, 0, ink)
    text("Let's talk.", 64, 3500, 220, bg)
    text(`hello@${word.toLowerCase().replace(/[^a-z]/g, "")}.studio`, 64, 3640, 48, accent, TEXT, 400)
  }
  return { el: c, w: W, h: H, sample: true }
}
let samples = null
async function sampleWork() {
  if (samples) return samples
  try { await Promise.all([document.fonts.load(`500 100px ${DISPLAY}`), document.fonts.load(`400 40px ${TEXT}`)]) } catch {}
  samples = Array.from({ length: 16 }, (_, i) => sample(i))
  return samples
}

// ---- your images ----
function loadTiles(patch) {
  ready = (async () => {
    const list = patch.params.images.filter((x) => x.src)
    const got = (await Promise.all(list.map((x) => loadMedia(x.src)))).filter((x) => x?.kind === "image")
    tiles = got.length ? got.map((x) => ({ el: x.el, w: x.el.naturalWidth, h: x.el.naturalHeight })) : await sampleWork()
    if (list.length > got.length) m?.note(`${list.length - got.length} of your images aren't in this browser. Add them again.`, true)
    shelf?.()
    m?.redraw()
  })()
  return ready
}

async function addImages(files) {
  const added = []
  for (const f of files) {
    if (!/^image\//.test(f.type)) continue
    added.push(newListItem(imagesDef, { src: await addMedia(f) }))
  }
  if (!added.length) return 0
  m.set("images", [...m.patch.params.images, ...added].slice(0, imagesDef.max))
  return added.length
}

// The shelf: your images as thumbnails at the top of The work, with Add and Clear.
let shelf = null
function buildShelf(machine) {
  const body = machine.host.querySelector('[data-group="work"] .group-body')
  const thumbs = Object.assign(document.createElement("div"), { className: "shelf" })
  const input = Object.assign(document.createElement("input"), { type: "file", accept: "image/*", multiple: true, hidden: true })
  const btn = (text, title, run) => Object.assign(document.createElement("button"), { className: "btn", type: "button", textContent: text, title, onclick: run })
  const note = Object.assign(document.createElement("p"), { className: "note" })
  const addBtn = btn("Add images", "Screenshots, landing pages, posters: any images. They stay in this browser.", () => input.click())
  addBtn.classList.add("solid")
  const clear = btn("Clear", "Remove your images and show the sample work again", () => machine.set("images", []))
  input.onchange = async () => { const n = await addImages([...input.files]); input.value = ""; if (n) machine.note(`Added ${n} image${n > 1 ? "s" : ""}.`) }
  const strip = Object.assign(document.createElement("div"), { className: "strip" })
  strip.append(addBtn, clear)
  body.prepend(thumbs, strip, note, input)
  shelf = () => {
    const list = machine.patch.params.images
    clear.hidden = !list.length
    note.textContent = list.length ? `${list.length} image${list.length > 1 ? "s" : ""}. Drop more anywhere on the page.` : "Showing sample work. Add your own screenshots and images, or drop them anywhere on the page."
    thumbs.replaceChildren(...list.map((row, k) => {
      const cell = Object.assign(document.createElement("span"), { className: "thumb", title: row.src })
      loadMedia(row.src).then((x) => { if (x?.kind === "image") cell.style.backgroundImage = `url("${x.el.src}")` })
      const x = Object.assign(document.createElement("button"), { type: "button", className: "thumb-x", textContent: "×", title: "Remove" })
      x.onclick = () => machine.set("images", list.filter((_, j) => j !== k))
      cell.append(x)
      return cell
    }))
  }
  shelf()
}

// ---- the preview as a handle ----
function handle(machine) {
  const canvas = machine.host.querySelector(".frame canvas")
  canvas.style.touchAction = "pan-y"
  canvas.style.cursor = "grab"
  const pointers = new Map()
  let start = null
  const round = (v) => Math.round(v * 10) / 10
  canvas.addEventListener("pointerdown", (e) => {
    pointers.set(e.pointerId, [e.clientX, e.clientY])
    canvas.setPointerCapture(e.pointerId)
    const p = machine.patch.params
    start = { rotX: p.rotX, rotY: p.rotY, zoom: p.zoom, spread: spread(), at: [e.clientX, e.clientY] }
    canvas.style.cursor = "grabbing"
  })
  const spread = () => { const [a, b] = [...pointers.values()]; return b ? Math.hypot(a[0] - b[0], a[1] - b[1]) : 0 }
  canvas.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId) || !start) return
    pointers.set(e.pointerId, [e.clientX, e.clientY])
    if (pointers.size > 1) { if (start.spread) machine.set("zoom", Math.round(start.zoom * (spread() / start.spread) * 100) / 100); return }
    const k = 180 / canvas.clientWidth
    machine.set("rotY", round(start.rotY + (e.clientX - start.at[0]) * k))
    machine.set("rotX", round(start.rotX + (e.clientY - start.at[1]) * k))
  })
  const end = (e) => {
    pointers.delete(e.pointerId)
    canvas.style.cursor = "grab"
    if (!pointers.size) start = null
    else { const p = machine.patch.params; start = { rotX: p.rotX, rotY: p.rotY, zoom: p.zoom, spread: spread(), at: [...pointers.values()][0] } }
  }
  canvas.addEventListener("pointerup", end)
  canvas.addEventListener("pointercancel", end)
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault()
    machine.set("zoom", Math.round(machine.patch.params.zoom * Math.exp(-e.deltaY * 0.0015) * 100) / 100)
  }, { passive: false })
}

const LAYOUTS = ["grid", "cloud", "ring", "helix", "tunnel", "stack", "wave"]
const MOVES = { grid: ["drift", "pan", "scroll", "dive"], wave: ["drift", "pan", "still"], cloud: ["fly", "drift", "orbit", "dive"], ring: ["orbit", "drift"], helix: ["orbit", "drift"], tunnel: ["fly"], stack: ["fly", "drift", "dive"] }

m = await createMachine(document.querySelector("[data-machine]"), engine, {
  presets: new URL("presets/", import.meta.url),
  dropHint: "Drop images or a patch",

  load(patch, key) { if (!key || key === "images") loadTiles(patch) },
  options: () => ({ tiles }),
  ready: () => ready,

  async onFile(f, target, machine) {
    if (!/^image\//.test(f.type)) return false
    await addImages([f])
    machine.note(`${f.name} is on the wall.`)
    return true
  },

  // Presets are rooms: they bring the arrangement, camera and finish, and keep your images.
  adopt(preset, current) {
    return { ...preset, params: { ...preset.params, images: current.params.images } }
  },

  // Vary: a new room in space. Your images, format and background stay.
  vary(p, r) {
    const pick = (list) => list[Math.floor(r() * list.length)]
    const span = (lo, hi, d = 2) => Math.round((lo + r() * (hi - lo)) * 10 ** d) / 10 ** d
    p.params.layout = pick(LAYOUTS)
    p.params.move = pick(MOVES[p.params.layout])
    Object.assign(p.params, {
      columns: 3 + Math.floor(r() * 6), gap: span(0.04, 0.3), depth: span(0, 0.9), scatter: r() < 0.5 ? 0 : span(0.1, 0.8),
      tilt: r() < 0.4 ? 0 : span(0.1, 0.9), sizeMix: r() < 0.5 ? 0 : span(0.2, 0.9), radius: pick([0, 0.02, 0.04, 0.08, 0.16, 0.5]),
      rotX: r() < 0.5 ? 0 : Math.round(span(-35, 25, 0)), rotY: r() < 0.5 ? 0 : Math.round(span(-40, 40, 0)), rotZ: r() < 0.7 ? 0 : Math.round(span(-15, 15, 0)),
      fov: Math.round(span(20, 70, 0)), zoom: span(0.9, 1.8), focus: r() < 0.5 ? 0 : span(0.1, 0.5), fog: span(0, 0.5),
      float: r() < 0.6 ? 0 : span(0.2, 0.8), shadow: span(0, 0.6), spin: r() < 0.85 ? 0 : 1,
    })
  },
  slug: (p) => p.name ? p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "showroom" : "showroom",

  setup(machine) {
    m = machine
    buildShelf(machine)
    handle(machine)
  },
})
