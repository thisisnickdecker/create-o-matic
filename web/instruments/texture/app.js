// The Texture lab: the texture engine in the shared shell, plus what only it needs: the source
// image or video (or, until there is one, a loop from another instrument, drawn live by its own
// engine), overlay textures for the stack, presets that change the look but keep your image, and
// a before-and-after wipe on the stage.
import * as engine from "./texture.js"
import { createMachine } from "../../packages/core/shell.js"
import { addMedia, loadMedia, seekVideo } from "../../packages/core/media.js"
import { sanitize } from "../../packages/core/patch.js"
import { ensureFont } from "../../packages/core/fonts.js"
import { prepareMarks } from "../../packages/core/marks.js"

const { videoTime } = engine
const MAX_SIDE = 6000 // larger sources are framed at this size; export Double for more

let m
let source = null // { kind, el, duration }
const assets = new Map() // overlay textures by name: image or video elements

// ---- the source ----
async function loadSource(patch, fresh = false) {
  source?.el.pause?.()
  const name = patch.params.source
  source = name ? await loadMedia(name) : null
  if (name && !source) m?.note(`“${name}” isn't in this browser. Drop the file again.`, true)
  if (source && fresh) {
    // A new source sets the frame to its own size and, for a video, the loop to its length.
    const el = source.el, w = el.videoWidth || el.naturalWidth, h = el.videoHeight || el.naturalHeight
    const k = Math.min(1, MAX_SIDE / Math.max(w, h))
    Object.assign(patch.params, { sourceWidth: Math.round(w * k), sourceHeight: Math.round(h * k), zoom: 1, panX: 0, panY: 0 })
    if (source.kind === "video") patch.params.duration = Math.min(60, Math.max(0.5, Math.round(source.duration * 2) / 2))
    m?.changed()
  }
  if (source?.kind === "video") {
    source.el.onseeked = () => m?.redraw()
    if (m?.playing) source.el.play().catch(() => {})
  }
  m?.redraw()
}

// ---- the samples ----
// Loops from the other instruments, each drawn by its own engine at the Texture lab's own time t,
// so the two loops run in step and an export closes exactly.
const SAMPLES = {
  heat: ["elastic/elastic.js", "elastic/presets/heat.json"],
  glass: ["elastic/elastic.js", "elastic/presets/black-glass.json"],
  sweep: ["type/type.js", "type/presets/weight-sweep.json"],
  blend: ["colour/colour.js", "colour/presets/sunset-strip.json"],
  logo: ["brand/brand.js", "brand/presets/logo-loop.json"],
}
const SAMPLE_SIDE = 1080 // the sample's longest side, in pixels
let sample = null // { engine, patch, canvas, ctx, k, marks }
let sampleReady = Promise.resolve()
let sampleToken = 0

function loadSample(patch, fresh = false) {
  sampleReady = (async () => {
    const token = ++sampleToken
    const entry = !patch.params.source && SAMPLES[patch.params.sample]
    if (!entry) { sample = null; m?.redraw(); return }
    const sampleEngine = await import(new URL(`../${entry[0]}`, import.meta.url))
    const sp = sanitize(sampleEngine.manifest, await fetch(new URL(`../${entry[1]}`, import.meta.url)).then((r) => r.json()))
    const fonts = sampleEngine.fontRequests?.(sp) ?? (sampleEngine.fontRequest ? [sampleEngine.fontRequest(sp)] : [])
    const marks = sp.params.logo !== undefined ? prepareMarks({ params: { content: `@${sp.params.logo}` }, marks: sp.marks })
      : sp.params.content !== undefined ? prepareMarks(sp) : Promise.resolve(new Map())
    const [ready] = await Promise.all([marks, ...fonts.map((r) => ensureFont(r))])
    sampleEngine.clearMetrics?.()
    if (token !== sampleToken) return
    const { w, h } = sampleEngine.size(sp), k = Math.min(1, SAMPLE_SIDE / Math.max(w, h))
    const canvas = Object.assign(document.createElement("canvas"), { width: Math.round(w * k), height: Math.round(h * k) })
    sample = { engine: sampleEngine, patch: sp, canvas, ctx: canvas.getContext("2d", { willReadFrequently: true }), k, marks: ready }
    // The frame takes the sample's shape, as it would a dropped image's.
    if (fresh) { Object.assign(patch.params, { sourceWidth: canvas.width, sourceHeight: canvas.height, zoom: 1, panX: 0, panY: 0 }); m?.changed() }
    drawSample(m?.t ?? 0)
    m?.redraw()
  })()
  return sampleReady
}

function drawSample(t) {
  if (!sample) return
  const { engine: e, patch, ctx, k, marks } = sample
  e.render(ctx, patch, t, { scale: k, frame: Math.floor(t * e.frameCount(patch)), marks })
}

// ---- before and after ----
// A wipe across the stage: left of the line, the frame untreated. Drag to move it. Preview only.
let compare = 0
function wipe(machine) {
  const frame = machine.host.querySelector(".frame"), canvas = frame.querySelector("canvas")
  const button = Object.assign(document.createElement("button"), { type: "button", className: "btn wipe-toggle", textContent: "Before / after" })
  button.title = "Compare with the untreated frame. Drag across the picture to move the line."
  button.onclick = () => { compare = compare ? 0 : 0.5; button.classList.toggle("on", !!compare); machine.redraw() }
  frame.append(button)
  const move = (e) => { const r = canvas.getBoundingClientRect(); compare = Math.min(0.99, Math.max(0.01, (e.clientX - r.left) / r.width)); machine.redraw() }
  canvas.addEventListener("pointerdown", (e) => { if (!compare) return; canvas.setPointerCapture(e.pointerId); move(e) })
  canvas.addEventListener("pointermove", (e) => { if (compare && canvas.hasPointerCapture(e.pointerId)) move(e) })
}

// Overlay textures named by the stack's layers.
async function loadAssets(patch) {
  const names = new Set(patch.params.layers.filter((l) => l.effect === "overlay" && l.params.overlayImage).map((l) => l.params.overlayImage))
  for (const name of names) {
    if (assets.has(name)) continue
    const media = await loadMedia(name)
    if (media) { assets.set(name, media.el); if (media.kind === "video") media.el.play().catch(() => {}) }
  }
  m?.redraw()
}

const mediaFile = Object.assign(document.createElement("input"), { type: "file", accept: "image/*,video/*", hidden: true })
let pickTexture = null // set while choosing an overlay texture for a layer
mediaFile.onchange = async () => {
  const f = mediaFile.files[0]
  mediaFile.value = ""
  if (!f) return
  if (pickTexture) { const pick = pickTexture; pickTexture = null; pick(await addMedia(f)); return }
  m.useFile(f)
}

const slug = (p) => (p.params.source || "texture").replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "texture"

m = await createMachine(document.querySelector("[data-machine]"), engine, {
  presets: new URL("presets/", import.meta.url),
  dropHint: "Drop an image, a video or a patch",

  load(patch, key) {
    if (!key) { loadSource(patch); loadSample(patch, !patch.params.source) }
    if (key === "source") { loadSource(patch, true); loadSample(patch) }
    if (key === "sample") loadSample(patch, true)
    if (!key || key === "layers") loadAssets(patch)
  },
  options: () => ({ source: source?.el ?? sample?.canvas ?? null, assets, compare: m?.exporting ? 0 : compare }),
  ready: () => sampleReady,

  sync(t, playing) {
    drawSample(t)
    if (source?.kind !== "video") return
    const p = m.patch
    const target = videoTime(p, t, source.duration)
    source.el.playbackRate = Math.max(0.0625, p.params.videoSpeed)
    const drift = Math.abs(source.el.currentTime - target)
    if (playing ? drift > 0.15 : drift > 0.001) source.el.currentTime = target
  },
  playing(on) { if (source?.kind === "video") on ? source.el.play().catch(() => {}) : source.el.pause() },
  seek: async (patch, time) => {
    drawSample(time)
    if (source?.kind === "video") await seekVideo(source.el, videoTime(patch, time, source.duration))
  },

  async onFile(f, target, machine) {
    if (!/^(image|video)\//.test(f.type)) return false
    machine.patch.params.source = await addMedia(f)
    await loadSource(machine.patch, true)
    loadSample(machine.patch)
    machine.changed()
    machine.note(`${f.name} is on the light table.`)
    return true
  },

  // Presets are looks: they bring their layers and paper, and keep your image and frame.
  adopt(preset, current) {
    return {
      ...current,
      name: preset.name,
      seed: preset.seed ?? current.seed,
      params: { ...current.params, layers: preset.params?.layers ?? [], background: preset.params?.background ?? current.params.background },
      keys: preset.keys ?? {},
    }
  },

  heavy: (p) => p.params.layers.some((l) => l.on),

  // Vary: nudge every numeric setting in the stack within a quarter of its range.
  vary(p, r) {
    p.params.layers = p.params.layers.map((l) => {
      const params = { ...l.params }
      for (const [k, v] of Object.entries(params)) {
        if (typeof v !== "number" || v === 0) continue
        const span = Math.abs(v) + 1
        params[k] = Math.round((v + (r() - 0.5) * span * 0.5) * 100) / 100
      }
      return { ...l, params }
    })
  },
  slug,

  panel: { onMedia: (anchor, pick) => { pickTexture = pick; mediaFile.click() } },
  setup(machine) {
    m = machine
    machine.host.append(mediaFile)
    wipe(machine)
  },
})
