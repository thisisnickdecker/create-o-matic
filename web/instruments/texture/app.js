// The Texture lab: the texture engine in the shared shell, plus what only it needs: the source
// image or video, overlay textures for the stack, and presets that change the look but keep your image.
import * as engine from "./texture.js"
import { createMachine } from "../../packages/core/shell.js"
import { addMedia, loadMedia, seekVideo } from "../../packages/core/media.js"

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
    if (!key) loadSource(patch)
    if (key === "source") loadSource(patch, true)
    if (!key || key === "layers") loadAssets(patch)
  },
  options: () => ({ source: source?.el ?? null, assets }),

  sync(t, playing) {
    if (source?.kind !== "video") return
    const p = m.patch
    const target = videoTime(p, t, source.duration)
    source.el.playbackRate = Math.max(0.0625, p.params.videoSpeed)
    const drift = Math.abs(source.el.currentTime - target)
    if (playing ? drift > 0.15 : drift > 0.001) source.el.currentTime = target
  },
  playing(on) { if (source?.kind === "video") on ? source.el.play().catch(() => {}) : source.el.pause() },
  seek: async (patch, time) => { if (source?.kind === "video") await seekVideo(source.el, videoTime(patch, time, source.duration)) },

  async onFile(f, target, machine) {
    if (!/^(image|video)\//.test(f.type)) return false
    machine.patch.params.source = await addMedia(f)
    await loadSource(machine.patch, true)
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
  },
})
