// Elastic on any web page: the live engine, sized to its element, playing its patch in a loop.
//   import { mount } from "https://…/instruments/elastic/embed.js"
//   const stop = mount(element, patch)        // patch: an object, or the URL of a .json
//   mount(element, patch, { backdrop: "https://…/clip.mp4" })   // an image or video behind the type
//   stop.update(patch)                         // a new patch for the same loop: it changes in place
//   stop.time()                                // where in the loop it is now, 0 to 1
// Backdrops and added fonts live in the browser that made the patch, so a page supplies its own.
// SVG marks travel inside the patch and just work; PNG or JPEG marks don't travel.
// The canvas fits inside the element, keeping the patch's proportions (give the element a size or an
// aspect-ratio). Visitors who ask for reduced motion get the still frame. Off screen, it rests.
import { manifest, render, size, frameCount, fontRequest, clearMetrics } from "./elastic.js"
import { sanitize } from "../../packages/core/patch.js"
import { ensureFont } from "../../packages/core/fonts.js"
import { prepareMarks } from "../../packages/core/marks.js"

export function mount(el, patchOrUrl, { backdrop: backdropUrl } = {}) {
  const canvas = document.createElement("canvas")
  canvas.style.display = "block"
  canvas.setAttribute("role", "img")
  el.append(canvas)
  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches
  let patch, scale = 1, visible = true, raf = 0, stopped = false, start = performance.now(), backdrop = null, marks = null

  const fit = () => {
    if (!patch) return
    const { w, h } = size(patch)
    const bw = el.clientWidth, bh = el.clientHeight || (bw * h) / w
    const k = Math.min(bw / w, bh / h)
    const cssW = Math.max(1, Math.floor(w * k)), cssH = Math.max(1, Math.floor(h * k))
    const dpr = Math.min(devicePixelRatio || 1, 2)
    canvas.style.width = `${cssW}px`
    canvas.style.height = `${cssH}px`
    canvas.width = Math.round(cssW * dpr)
    canvas.height = Math.round(cssH * dpr)
    scale = canvas.width / w
    if (still) draw(patch.params.phase)
  }
  const draw = (t) => render(ctx, patch, t, { scale, frame: Math.floor(t * frameCount(patch)), backdrop, marks })
  const loop = (now) => {
    if (stopped) return
    if (visible) draw(((now - start) / 1000 / patch.params.duration) % 1)
    raf = requestAnimationFrame(loop)
  }
  const ro = new ResizeObserver(fit)
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting })

  // Fonts and marks arrive before a patch is shown, so it never flashes in a fallback face.
  let token = 0
  const use = async (raw) => {
    const mine = ++token
    const next = sanitize(manifest, raw)
    const ready = await prepareMarks(next)
    await ensureFont(fontRequest(next))
    if (mine !== token || stopped) return
    clearMetrics()
    patch = next
    marks = ready
    canvas.setAttribute("aria-label", patch.params.content.replace(/\s+/g, " ").trim())
    fit()
  }

  ;(async () => {
    const raw = typeof patchOrUrl === "string" ? await fetch(patchOrUrl).then((r) => r.json()) : patchOrUrl
    if (backdropUrl) backdrop = await loadBackdrop(backdropUrl, still)
    await use(raw)
    ro.observe(el)
    io.observe(el)
    if (!still && !stopped) raf = requestAnimationFrame(loop)
  })()

  const stop = () => { stopped = true; cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); canvas.remove() }
  stop.update = (raw) => use(raw)
  stop.time = () => (still ? patch?.params.phase ?? 0 : ((performance.now() - start) / 1000 / (patch?.params.duration || 1)) % 1)
  return stop
}

async function loadBackdrop(url, still) {
  if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(url)) {
    const v = Object.assign(document.createElement("video"), { src: url, muted: true, loop: true, playsInline: true, crossOrigin: "anonymous" })
    await new Promise((r) => { v.onloadeddata = r; v.onerror = r })
    if (!still) v.play().catch(() => {})
    return v
  }
  const img = Object.assign(new Image(), { src: url, crossOrigin: "anonymous" })
  await img.decode().catch(() => {})
  return img
}
