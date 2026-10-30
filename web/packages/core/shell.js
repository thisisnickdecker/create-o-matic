// The machine shell: everything around an instrument's engine that every instrument shares.
//   const m = await createMachine(host, engine, hooks)
// It builds the stage, transport, keyframe timeline, rack, Patch bay and Print shop into host, and
// owns the patch, playback, keyframing, saving, presets, drops, exports and window.instrument.
//
// engine: the instrument's pure module, { manifest, render(ctx, patch, t, options), size(patch),
//   frameCount(patch) }. render gets { scale, frame, ...hooks.options() }.
//
// hooks, all optional; each receives the machine m where useful:
//   presets       URL of the instrument's presets/ folder
//   load(patch, key)    fetch what render needs (fonts, media…). key is the setting that changed,
//                       or undefined for a whole new patch. Call m.redraw() when it arrives.
//   options()     extra render options: the loaded resources
//   sync(t, playing)    keep live media in step with the preview, every drawn frame
//   playing(on)   playback started or stopped (or an export took over)
//   ready(patch)  before an export: make sure resources are loaded
//   seek(patch, time)   before each export frame: put media at its exact time
//   onFile(file, target) a dropped or chosen file; resolve true if it was handled
//   heavy(patch)  true when the preview should lighten its resolution while playing
//   vary(patch, rng)    "Vary": new settings in a pleasing range
//   embed(patch)  the embed code for "Copy embed code", or leave it out
//   slug(patch)   a short name for exported files
//   adopt(preset, patch)  what choosing a preset makes: by default the preset itself; an
//                       instrument can keep parts of the current patch (the Texture lab keeps your image)
//   panel         extra hooks for the rack (font browser, media picker, mark menu)
//   setup(m)      add instrument-specific controls once the rack is built
//   api           extra methods for window.instrument
import { defaults, sanitize, coerce, toHash, fromHash, library } from "./patch.js"
import { createPanel, fillRange } from "./panel.js"
import { createTimeline } from "./timeline.js"
import { resolve, timelinePos, setKey } from "./keys.js"
import { exportPng, exportVideo, exportGif, exportMov, videoSupport, download, canShare, share, touchFirst, canCopyImage, copyPng } from "./export.js"
import { mulberry32, newSeed } from "./rng.js"

const TEMPLATE = `
  <section class="stage" aria-label="Preview">
    <div class="frame"><span class="dims"></span><canvas aria-label="Preview"></canvas></div>
    <div class="transport">
      <button class="play" type="button" aria-label="Play">
        <svg viewBox="0 0 12 12" class="i-play"><path d="M2 0l10 6-10 6z"/></svg>
        <svg viewBox="0 0 12 12" class="i-pause" hidden><path d="M1 0h3.5v12H1zM7.5 0H11v12H7.5z"/></svg>
      </button>
      <input class="scrub" type="range" min="0" max="1" step="0.0001" value="0" aria-label="Playhead">
      <span class="clock"></span>
    </div>
    <div class="timeline" hidden></div>
  </section>
  <aside class="rack" aria-label="Controls">
    <details class="group" open data-group="patch">
      <summary>Patch bay <small>presets and saving</small></summary>
      <div class="group-body">
        <div class="strip"><select data-ref="presets" aria-label="Presets"></select></div>
        <div class="strip">
          <input data-ref="seed" type="number" class="readout seed" aria-label="Seed">
          <button class="btn" data-ref="dice" type="button" title="New seed, same settings">Reroll</button>
          <button class="btn" data-ref="vary" type="button" title="New settings in a pleasing range; your content and colour stay" hidden>Vary</button>
        </div>
        <div class="strip">
          <input data-ref="name" type="text" placeholder="Name this patch" aria-label="Patch name">
          <button class="btn solid" data-ref="save" type="button">Save</button>
        </div>
        <div class="saved" data-ref="saved"></div>
        <div class="strip">
          <button class="btn" data-ref="download" type="button">Download .json</button>
          <button class="btn" data-ref="open" type="button">Open .json</button>
          <button class="btn" data-ref="share" type="button">Copy link</button>
          <button class="btn" data-ref="addPreset" type="button" hidden title="Writes this patch into the presets folder (dev server only)">Add to presets</button>
        </div>
        <p class="note" data-ref="patchNote"></p>
      </div>
    </details>
    <div data-ref="controls"></div>
    <details class="group" open data-group="export">
      <summary>Print shop <small>export</small></summary>
      <div class="group-body">
        <div class="strip">
          <button class="btn solid" data-export="png" type="button">PNG</button>
          <button class="btn" data-export="mp4" type="button">MP4</button>
          <button class="btn" data-export="webm" type="button">WebM</button>
          <button class="btn" data-export="gif" type="button">GIF</button>
          <button class="btn" data-export="mov" type="button" title="ProRes 4444 .mov, see-through if the frame is: for Final Cut, Premiere, After Effects, Keynote and Photos. Large.">MOV</button>
          <button class="btn" data-ref="copy" type="button" hidden title="The freeze frame as a full-size PNG on the clipboard, to paste into Figma, Slack or a message">Copy PNG</button>
          <button class="btn" data-ref="cancel" type="button" hidden>Cancel</button>
        </div>
        <div class="strip">
          <button class="btn solid" data-ref="send" type="button" hidden>Save or share</button>
        </div>
        <div class="strip">
          <select data-ref="exportScale" aria-label="Export size">
            <option value="1" selected>Full size</option>
            <option value="0.5">Half size</option>
            <option value="0.25">Quarter size</option>
            <option value="2">Double size, PNG only</option>
          </select>
          <button class="btn" data-ref="embed" type="button" hidden>Copy embed code</button>
        </div>
        <div class="progress"><i></i></div>
        <p class="note" data-ref="exportNote"></p>
      </div>
    </details>
    <p class="meta" data-ref="meta"></p>
  </aside>
  <input type="file" data-ref="patchFile" accept=".json,application/json" hidden>
  <div class="drop" data-ref="drop"></div>`

const even = (n) => Math.max(2, Math.round(n / 2) * 2)

export async function createMachine(host, engine, hooks = {}) {
  const { manifest, render, size, frameCount } = engine
  host.innerHTML = TEMPLATE
  const ref = Object.fromEntries([...host.querySelectorAll("[data-ref]")].map((el) => [el.dataset.ref, el]))
  const q = (s) => host.querySelector(s)
  const canvas = q(".frame canvas")
  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  const lib = library(manifest.id)

  let patch = defaults(manifest)
  let t = 0
  let playing = !matchMedia("(prefers-reduced-motion: reduce)").matches
  let dirty = true
  let scale = 1
  let presets = []
  let exporting = false

  const u = () => timelinePos(patch.params.keyMode, t)
  const now = () => resolve(manifest, patch, t)
  const slug = () => hooks.slug?.(patch) || manifest.id

  function note(text, warn = false, where = ref.patchNote) {
    where.textContent = text || ""
    where.classList.toggle("warn", !!warn)
  }

  // ---- the machine, as hooks see it ----
  const m = {
    host, manifest,
    get patch() { return patch },
    get t() { return t },
    get playing() { return playing },
    get exporting() { return exporting },
    set: (key, value) => set(key, value),
    setPatch: (p) => setPatch(p),
    // After a hook changes patch.params directly. reload: fetch resources again, as for a new patch.
    changed: ({ reload = false } = {}) => { if (reload) hooks.load?.(patch); changed() },
    redraw: () => { dirty = true },
    note,
  }

  // ---- rack ----
  ref.meta.textContent = `${manifest.name} · v${manifest.version} · ${manifest.status}`
  ref.drop.textContent = hooks.dropHint || "Drop a patch"
  const panel = createPanel(ref.controls, manifest, { onChange: set, onStopwatch: stopwatch, ...hooks.panel })
  const timeline = createTimeline(q(".timeline"), manifest, {
    patch: () => patch,
    frames: () => frameCount(patch),
    onEdit: () => { dirty = true; persist(); syncPanel() },
    onSeek: (pos) => seekTo(patch.params.keyMode === "boomerang" ? pos / 2 : pos),
    onUnanimate: (key) => { patch.params[key] = now()[key]; delete patch.keys[key]; changed() },
  })

  function set(key, value) {
    const def = manifest.parameters.find((d) => d.key === key)
    if (!def) return
    const v = coerce(def, value)
    if (v === undefined) return
    // An animated setting: changing it sets a keyframe at the playhead, as in After Effects.
    if (patch.keys[key]) { if (playing) setPlaying(false); setKey(patch, key, u(), v); timeline.build() }
    else patch.params[key] = v
    if (key === "phase" && !playing) t = v
    hooks.load?.(patch, key)
    changed()
  }

  // The stopwatch: start animating from the playhead; on a key, remove it; otherwise add one.
  function stopwatch(key) {
    if (playing) setPlaying(false)
    const pos = u(), list = patch.keys[key]
    const hit = list?.find((k) => Math.abs(k.t - pos) < 0.002)
    if (hit) {
      list.splice(list.indexOf(hit), 1)
      if (!list.length) { patch.params[key] = hit.v; delete patch.keys[key] }
    } else setKey(patch, key, pos, now()[key])
    timeline.build()
    changed()
  }

  function syncPanel() { panel.sync(now(), patch.keys, u()) }

  // The export sizes, in pixels, for the current format. Full size is always the default.
  function labelSizes() {
    const { w, h } = size(patch)
    for (const o of ref.exportScale.options) {
      const k = +o.value, name = { 1: "Full size", 0.5: "Half size", 0.25: "Quarter size", 2: "Double size" }[k]
      o.textContent = `${name} · ${even(w * k)}×${even(h * k)}${k > 1 ? ", PNG only" : ""}`
    }
  }

  function changed() {
    syncPanel()
    labelSizes()
    ref.seed.value = patch.seed
    resize()
    dirty = true
    persist()
  }

  function setPatch(next) {
    patch = sanitize(manifest, next)
    t = patch.params.phase ?? 0
    timeline.build()
    hooks.load?.(patch)
    changed()
  }

  let persistTimer
  function persist() {
    clearTimeout(persistTimer)
    persistTimer = setTimeout(() => history.replaceState(null, "", "#" + toHash(patch)), 250)
  }

  // ---- patches ----
  async function loadPresets() {
    if (!hooks.presets) return
    const index = await fetch(new URL("index.json", hooks.presets)).then((r) => r.json()).catch(() => [])
    presets = await Promise.all(index.map((f) => fetch(new URL(f, hooks.presets)).then((r) => r.json())))
    ref.presets.replaceChildren(new Option("Presets…", ""), ...presets.map((p, i) => new Option(p.name, i)))
    ref.presets.onchange = () => {
      const i = ref.presets.value
      if (i !== "") { setPatch(hooks.adopt ? hooks.adopt(presets[i], patch) : presets[i]); ref.name.value = presets[i].name }
      ref.presets.value = ""
    }
  }

  function renderSaved() {
    ref.saved.replaceChildren(...lib.list().map((e) => {
      const b = Object.assign(document.createElement("button"), { type: "button" })
      b.innerHTML = `<span class="n"></span><span><time></time><span class="x" title="Delete">×</span></span>`
      b.querySelector(".n").textContent = e.name
      b.querySelector("time").textContent = new Date(e.saved).toLocaleDateString(undefined, { month: "short", day: "numeric" })
      b.onclick = (ev) => {
        if (ev.target.classList.contains("x")) { lib.remove(e.name); renderSaved() }
        else { setPatch(e.patch); ref.name.value = e.name }
      }
      return b
    }))
  }

  const patchName = () => ref.name.value.trim() || `${slug()} ${patch.seed}`
  ref.save.onclick = () => {
    const name = patchName()
    lib.save(name, { name, ...structuredClone(patch) })
    ref.name.value = name
    renderSaved()
    note(`Saved “${name}” in this browser. Download the .json to keep it anywhere.`)
  }
  // With the dev server running, a patch can go straight into the instrument's presets folder.
  if (["localhost", "127.0.0.1"].includes(location.hostname)) fetch("/api/ping").then((r) => { if (r.ok && hooks.presets) ref.addPreset.hidden = false }).catch(() => {})
  ref.addPreset.onclick = async () => {
    const name = patchName()
    const res = await fetch("/api/presets", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instrument: manifest.id, name, patch: { name, ...patch } }) }).catch(() => null)
    if (!res?.ok) return note("Couldn't write the preset. Is npm run dev running?", true)
    const { file } = await res.json()
    await loadPresets()
    note(`Added to presets as ${file}.`)
  }

  ref.seed.onchange = () => { patch.seed = Math.round(+ref.seed.value) || 1; changed() }
  ref.dice.onclick = () => { patch.seed = newSeed(); changed() }
  if (hooks.vary) {
    ref.vary.hidden = false
    ref.vary.onclick = () => {
      hooks.vary(patch, mulberry32(newSeed()))
      patch = sanitize(manifest, { ...patch, seed: newSeed() })
      hooks.load?.(patch) // Vary can deal new fonts or media: fetch them, as for a new patch
      changed()
    }
  }

  ref.download.onclick = () => download(new Blob([JSON.stringify({ name: ref.name.value.trim() || undefined, ...patch }, null, 2)], { type: "application/json" }), `${slug()}-${patch.seed}.json`)
  ref.open.onclick = () => ref.patchFile.click()
  ref.patchFile.onchange = async (e) => {
    const f = e.target.files[0]
    if (!f) return
    try { setPatch(JSON.parse(await f.text())); note(`Opened ${f.name}.`) }
    catch { note(`${f.name} isn't a patch.`, true) }
    e.target.value = ""
  }
  ref.share.onclick = async () => {
    history.replaceState(null, "", "#" + toHash(patch))
    await navigator.clipboard.writeText(location.href).catch(() => {})
    note("Link copied. It carries the whole patch (not files you've added).")
  }

  // ---- files, chosen or dropped anywhere ----
  async function useFile(f, target) {
    try {
      if (await hooks.onFile?.(f, target, m)) return
      if (/\.json$/i.test(f.name)) setPatch(JSON.parse(await f.text()))
      else note(`${f.name} isn't something this instrument can use.`, true)
    } catch (e) { note(e.message || `${f.name} couldn't be used.`, true) }
  }
  m.useFile = useFile
  addEventListener("dragover", (e) => { if ([...e.dataTransfer.items].some((i) => i.kind === "file")) { e.preventDefault(); document.body.classList.add("dragging") } })
  addEventListener("dragleave", (e) => { if (!e.relatedTarget) document.body.classList.remove("dragging") })
  addEventListener("drop", (e) => {
    e.preventDefault()
    document.body.classList.remove("dragging")
    for (const f of e.dataTransfer.files) useFile(f, e.target)
  })

  // ---- stage ----
  const frame = q(".frame")
  function resize() {
    const { w: W, h: H } = size(patch)
    const cs = getComputedStyle(frame)
    const aw = frame.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
    const ah = frame.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)
    const fit = Math.min(aw / W, ah / H)
    const cssW = Math.max(1, Math.floor(W * fit)), cssH = Math.max(1, Math.floor(H * fit))
    let dpr = Math.min(devicePixelRatio || 1, 2)
    // Pixel effects cost per pixel: while playing, preview them at a lighter resolution so motion
    // stays smooth. Paused, and in every export, it's full resolution.
    if (playing && hooks.heavy?.(patch)) dpr = Math.min(dpr, Math.sqrt(420000 / (cssW * cssH)))
    const pw = Math.max(1, Math.round(cssW * dpr)), ph = Math.max(1, Math.round(cssH * dpr))
    if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; dirty = true }
    canvas.style.width = cssW + "px"
    canvas.style.height = cssH + "px"
    scale = pw / W
    canvas.classList.toggle("see-through", Boolean(patch.params.transparent))
    q(".dims").textContent = `${W} × ${H} · ${Math.round(fit * 100)}%`
  }
  new ResizeObserver(resize).observe(frame)

  const playBtn = q(".play"), scrub = q(".scrub"), clock = q(".clock")
  function setPlaying(on) {
    playing = on
    if (!on) {
      const n = frameCount(patch)
      t = Math.round(t * n) / n
      if ("phase" in patch.params) patch.params.phase = +t.toFixed(3)
      syncPanel(); persist()
    }
    hooks.playing?.(on && !exporting)
    resize()
    // SVG elements have no hidden property, so the attribute is set directly.
    playBtn.querySelector(".i-play").toggleAttribute("hidden", on)
    playBtn.querySelector(".i-pause").toggleAttribute("hidden", !on)
    playBtn.setAttribute("aria-label", on ? "Pause" : "Play")
    dirty = true
  }
  function seekTo(time) {
    if (playing) setPlaying(false)
    t = ((time % 1) + 1) % 1
    if ("phase" in patch.params) patch.params.phase = +t.toFixed(3)
    syncPanel(); persist(); dirty = true
  }
  playBtn.onclick = () => setPlaying(!playing)
  scrub.oninput = () => seekTo(+scrub.value)
  addEventListener("keydown", (e) => {
    if (e.target.closest("input, textarea, select, .fp-pop, .sw-pop")) return
    const n = frameCount(patch)
    if (e.code === "Space") { e.preventDefault(); setPlaying(!playing) }
    else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault()
      seekTo(((Math.round(t * n) + (e.key === "ArrowRight" ? 1 : -1) + n) % n) / n)
    }
  })

  let last = performance.now(), tickCount = 0
  function tick(at) {
    const dt = Math.min(0.1, (at - last) / 1000)
    last = at
    if (playing) { t = (t + dt / patch.params.duration) % 1; dirty = true }
    if (dirty && !exporting) {
      const n = frameCount(patch)
      hooks.sync?.(t, playing)
      render(ctx, patch, t, { scale, frame: Math.floor(t * n), ...hooks.options?.() })
      scrub.value = t
      fillRange(scrub)
      clock.textContent = `${(t * patch.params.duration).toFixed(2)} / ${patch.params.duration.toFixed(2)} s · frame ${Math.floor(t * n)}`
      timeline.playhead(u())
      if (playing && Object.keys(patch.keys).length && tickCount++ % 3 === 0) panel.syncAnimated(now(), patch.keys, u())
      dirty = playing
    }
    requestAnimationFrame(tick)
  }

  // ---- export ----
  let abort = null
  async function doExport(kind, { save = true } = {}) {
    if (abort) return null
    const snap = structuredClone(patch)
    const { w: W, h: H } = size(snap)
    let k = +ref.exportScale.value
    if (kind !== "png" && k > 1) k = 1
    const w = even(W * k), h = even(H * k)
    const s = w / W
    const n = frameCount(snap), fps = Number(snap.params.fps)
    const bar = q(".progress i")
    const where = ref.exportNote
    abort = new AbortController()
    exporting = true
    hooks.playing?.(false)
    setBusy(true)
    note(kind === "png" ? "Rendering…" : `Rendering ${n} frames at ${w}×${h}…`, false, where)
    // Each frame waits for any media to reach its exact time before drawing.
    const draw = async (c, i, time) => {
      await hooks.seek?.(snap, time)
      render(c, snap, time, { scale: s, frame: i, ...hooks.options?.() })
    }
    try {
      await hooks.ready?.(snap)
      let blob
      const phase = snap.params.phase ?? 0
      if (kind === "png") {
        blob = await exportPng({ w, h, draw: (c) => draw(c, Math.floor(phase * n), phase) })
      } else {
        // A see-through frame stays see-through where the format can hold it, and is laid on the
        // background where it can't.
        const job = { w, h, fps, frames: n, signal: abort.signal, onProgress: (p) => { bar.style.width = `${p * 100}%` }, draw: (c, i) => draw(c, i, i / n),
          clear: Boolean(snap.params.transparent), matte: snap.params.background ?? "#FFFFFF" }
        blob = kind === "gif" ? await exportGif(job) : kind === "mov" ? await exportMov(job) : await exportVideo({ kind, ...job })
      }
      const name = `${slug()}-${snap.seed}-${w}x${h}.${kind}`
      const size = `${(blob.size / 1048576).toFixed(2)} MB`
      if (save) {
        // On a phone the share sheet saves to Photos (and it needs its own tap); elsewhere the file
        // downloads, and Share stays on offer for AirDrop and Messages.
        const sharable = canShare(blob, name)
        ref.send.hidden = !sharable
        if (sharable) {
          ref.send.textContent = kind === "png" ? "Save or share image" : `Save or share ${kind.toUpperCase()}`
          ref.send.onclick = () => share(blob, name).catch((e) => { if (e.name !== "AbortError") download(blob, name) })
        }
        if (sharable && touchFirst()) note(`${name} is ready · ${size}. Tap Save or share to put it in Photos, or send it.`, false, where)
        else { download(blob, name); note(`${name} · ${size}`, false, where) }
      } else note(`${name} · ${size}`, false, where)
      return blob
    } catch (e) {
      note(e.name === "AbortError" ? "Cancelled." : e.message || String(e), e.name !== "AbortError", where)
      if (!save) throw e
      return null
    } finally {
      abort = null
      exporting = false
      hooks.playing?.(playing)
      dirty = true
      setBusy(false)
      setTimeout(() => { bar.style.width = "0" }, 600)
    }
  }
  function setBusy(on) {
    host.querySelectorAll("[data-export]").forEach((b) => { b.disabled = on || b.dataset.unsupported === "1" })
    ref.cancel.hidden = !on
  }
  host.querySelectorAll("[data-export]").forEach((b) => { b.onclick = () => doExport(b.dataset.export) })
  // Copy PNG: the clipboard is handed the render while it's still going, so the copy stays inside
  // the click (browsers allow it only then).
  if (canCopyImage()) {
    ref.copy.hidden = false
    ref.copy.onclick = () => {
      const png = doExport("png", { save: false }).then((blob) => blob ?? Promise.reject(new Error("an export is already running")))
      copyPng(png).then(() => note("Copied the frame as a full-size PNG. Paste it into Figma, Slack or a message.", false, ref.exportNote))
        .catch((e) => note(`Couldn't copy: ${e.message}`, true, ref.exportNote))
    }
  }
  ref.cancel.onclick = () => abort?.abort()

  // Grey out the video buttons this browser can't encode, and say why on hover.
  for (const kind of ["mp4", "webm"]) {
    videoSupport(kind).then((codec) => {
      const b = host.querySelector(`[data-export="${kind}"]`)
      if (codec) { b.title = `Encodes with ${codec}`; return }
      b.dataset.unsupported = "1"; b.disabled = true
      b.title = `This browser can't encode ${kind.toUpperCase()}. Try Chrome.`
    })
  }

  if (hooks.embed) {
    ref.embed.hidden = false
    ref.embed.onclick = async () => {
      await navigator.clipboard.writeText(hooks.embed(patch)).catch(() => {})
      note("Embed code copied. It runs the live engine, so it stays sharp at any size; host this folder for it to load.", false, ref.exportNote)
    }
  }

  // ---- the agent interface ----
  // Everything a person can do from the rack, as plain calls. Patches in and out are plain JSON.
  window.instrument = {
    manifest,
    getPatch: () => structuredClone(patch),
    setPatch: (p) => { setPatch(p); return structuredClone(patch) },
    set: (key, value) => { set(key, value); return patch.params[key] },
    // Keyframe a setting: at timeline position pos (0 to 1), value v.
    key: (key, pos, v) => {
      const def = manifest.parameters.find((d) => d.key === key)
      setKey(patch, key, pos, coerce(def, v))
      timeline.build()
      changed()
      return structuredClone(patch.keys[key])
    },
    play: () => setPlaying(true),
    pause: () => setPlaying(false),
    seek: (time) => seekTo(time),
    // Renders without downloading and resolves to the Blob, for scripted checks and batch runs.
    render: (kind = "png") => doExport(kind, { save: false }),
    export: (kind = "png") => doExport(kind),
    ...hooks.api,
  }

  // ---- start ----
  hooks.setup?.(m)
  await loadPresets()
  renderSaved()
  const fromUrl = location.hash.length > 1 ? fromHash(location.hash.slice(1)) : null
  setPatch(fromUrl || (presets[0] && hooks.adopt ? hooks.adopt(presets[0], patch) : presets[0]) || defaults(manifest))
  setPlaying(playing)
  requestAnimationFrame(tick)
  return m
}
