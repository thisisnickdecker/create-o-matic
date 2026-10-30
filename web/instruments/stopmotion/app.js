// Stop motion: the engine in the shared shell, plus what only it needs: your frames (added,
// dropped, kept in this browser, in order), sample frames until there are some, your paper scan,
// the planner (how many drawings a loop takes, and a brief to plan them with an AI), and every
// frame out as a carousel.
import * as engine from "./stopmotion.js"
import { createMachine } from "../../packages/core/shell.js"
import { addMedia, loadMedia } from "../../packages/core/media.js"
import { newListItem } from "../../packages/core/patch.js"
import { hash } from "../../packages/core/rng.js"
import { zip } from "../../packages/core/zip.js"
import { download } from "../../packages/core/export.js"

let m
let frames = [], texture = null
let ready = Promise.resolve()
const framesDef = engine.manifest.parameters.find((d) => d.key === "frames")
const slug = (p) => (p.name || "stop-motion").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "stop-motion"

// ---- sample frames: nine block-printed headstones, one a drawing ----
// Each is a silhouette filled with a grid of inked blocks, each block a little uneven, as wood
// or lino blocks print.
const SHAPES = ["shoulders", "arch", "gothic", "steps", "cross", "obelisk", "round", "twin", "scroll"]
function headstone(kind, path, x, w, top, base) {
  const mid = x + w / 2
  path.moveTo(x, base)
  if (kind === "arch") { path.lineTo(x, top + w / 2); path.arc(mid, top + w / 2, w / 2, Math.PI, 0) }
  else if (kind === "gothic") { path.lineTo(x, top + w * 0.6); path.quadraticCurveTo(x, top + w * 0.1, mid, top); path.quadraticCurveTo(x + w, top + w * 0.1, x + w, top + w * 0.6) }
  else if (kind === "steps") { const s = w / 6; path.lineTo(x, top + 2 * s); path.lineTo(x + s, top + 2 * s); path.lineTo(x + s, top + s); path.lineTo(x + 2 * s, top + s); path.lineTo(x + 2 * s, top); path.lineTo(x + 4 * s, top); path.lineTo(x + 4 * s, top + s); path.lineTo(x + 5 * s, top + s); path.lineTo(x + 5 * s, top + 2 * s); path.lineTo(x + w, top + 2 * s) }
  else if (kind === "cross") { const a = w * 0.3; path.lineTo(x + a, base); path.moveTo(x, base); path.rect(x + a, top, w - 2 * a, base - top); path.rect(x, top + w * 0.3, w, w * 0.3); return }
  else if (kind === "obelisk") { path.moveTo(x + w * 0.15, base); path.lineTo(x + w * 0.28, top + w * 0.35); path.lineTo(mid, top); path.lineTo(x + w * 0.72, top + w * 0.35); path.lineTo(x + w * 0.85, base); path.closePath(); return }
  else if (kind === "round") { path.lineTo(x, top + w * 0.25); path.quadraticCurveTo(x, top, x + w * 0.25, top); path.lineTo(x + w * 0.75, top); path.quadraticCurveTo(x + w, top, x + w, top + w * 0.25) }
  else if (kind === "twin") { path.lineTo(x, top + w / 4); path.arc(x + w / 4, top + w / 4, w / 4, Math.PI, 0); path.arc(x + (3 * w) / 4, top + w / 4, w / 4, Math.PI, 0) }
  else if (kind === "scroll") { path.lineTo(x, top + w * 0.3); path.bezierCurveTo(x, top - w * 0.1, mid - w * 0.1, top + w * 0.2, mid, top + w * 0.05); path.bezierCurveTo(mid + w * 0.1, top + w * 0.2, x + w, top - w * 0.1, x + w, top + w * 0.3) }
  else { path.lineTo(x, top + w * 0.25); path.lineTo(x + w * 0.2, top); path.lineTo(x + w * 0.8, top); path.lineTo(x + w, top + w * 0.25) }
  path.lineTo(x + w, base)
  path.closePath()
}
function sampleFrame(i) {
  const W = 900, H = 1200, c = Object.assign(document.createElement("canvas"), { width: W, height: H }), g = c.getContext("2d")
  g.fillStyle = "#FFFFFF"; g.fillRect(0, 0, W, H)
  const path = new Path2D(), w = 420, x = (W - w) / 2, base = 820, top = 230
  headstone(SHAPES[i % SHAPES.length], path, x, w, top, base)
  path.rect(x - 40, base, w + 80, 90) // the plinth
  path.rect(x - 80, base + 90, w + 160, 120)
  g.save(); g.clip(path)
  const cell = 64
  for (let y = 120; y < H; y += cell) for (let xx = x - 120; xx < x + w + 120; xx += cell) {
    const r = hash(i, xx, y), d = 0.82 + r * 0.18
    g.fillStyle = `rgb(${Math.round(40 * d)},${Math.round(32 * d)},${Math.round(30 * d)})`
    g.fillRect(xx + 3, y + 3, cell - 6, cell - 6)
    // A speckle of unprinted paper in each block.
    g.fillStyle = "rgba(255,255,255,0.22)"
    for (let k = 0; k < 14; k++) { const a = hash(i, xx, y, k), b = hash(xx, y, k, i); g.fillRect(xx + 3 + a * (cell - 8), y + 3 + b * (cell - 8), 2 + a * 3, 1 + b * 2) }
  }
  g.restore()
  return { el: c, w: W, h: H }
}
let samples = null
const sampleFrames = () => (samples ??= SHAPES.map((_, i) => sampleFrame(i)))

// ---- loading and timing ----
function load(patch) {
  ready = (async () => {
    const list = patch.params.frames.filter((x) => x.src)
    const [got, tex] = await Promise.all([Promise.all(list.map((x) => loadMedia(x.src))), loadMedia(patch.params.textureImage)])
    frames = got.filter((x) => x?.kind === "image").map((x) => ({ el: x.el, w: x.el.naturalWidth, h: x.el.naturalHeight }))
    if (!frames.length) frames = sampleFrames()
    texture = tex?.kind === "image" ? { el: tex.el, w: tex.el.naturalWidth, h: tex.el.naturalHeight } : null
    timing(patch)
    m?.changed()
    shelf?.()
  })()
  return ready
}
function timing(patch) { patch.params.duration = Math.max(0.1, Math.round(engine.loopSeconds(patch, frames.length || 9) * 1000) / 1000) }

async function addFrames(files) {
  const added = []
  for (const f of [...files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))) if (/^image\//.test(f.type)) added.push(newListItem(framesDef, { src: await addMedia(f) }))
  if (added.length) m.set("frames", [...m.patch.params.frames, ...added].slice(0, framesDef.max))
  return added.length
}

// ---- the shelf of frames ----
let shelf = null
function buildShelf(machine) {
  const body = machine.host.querySelector('[data-group="frames"] .group-body')
  const thumbs = Object.assign(document.createElement("div"), { className: "shelf" })
  const input = Object.assign(document.createElement("input"), { type: "file", accept: "image/*", multiple: true, hidden: true })
  const btn = (text, title, run) => Object.assign(document.createElement("button"), { className: "btn", type: "button", textContent: text, title, onclick: run })
  const note = Object.assign(document.createElement("p"), { className: "note" })
  const add = btn("Add frames", "Photos or drawings, one a frame. Chosen together, they go in by file name (frame-01, frame-02…).", () => input.click())
  add.classList.add("solid")
  const reverse = btn("Reverse", "Play the frames the other way", () => machine.set("frames", [...machine.patch.params.frames].reverse()))
  const clear = btn("Clear", "Remove your frames and show the sample again", () => machine.set("frames", []))
  input.onchange = async () => { const n = await addFrames([...input.files]); input.value = ""; if (n) machine.note(`Added ${n} frame${n > 1 ? "s" : ""}.`) }
  const row = Object.assign(document.createElement("div"), { className: "strip" })
  row.append(add, reverse, clear)
  body.prepend(thumbs, row, note, input)
  shelf = () => {
    const list = machine.patch.params.frames
    reverse.hidden = clear.hidden = !list.length
    const secs = machine.patch.params.duration
    note.textContent = list.length
      ? `${list.length} frames · ${secs.toFixed(2)} s a loop. Drop more anywhere on the page; they go on the end.`
      : `Showing nine sample frames (${secs.toFixed(2)} s a loop). Add your own photos or drawings, one a frame.`
    thumbs.replaceChildren(...list.map((row, k) => {
      const cell = Object.assign(document.createElement("span"), { className: "thumb", title: `Frame ${k + 1}: ${row.src}` })
      loadMedia(row.src).then((x) => { if (x?.kind === "image") cell.style.backgroundImage = `url("${x.el.src}")` })
      const x = Object.assign(document.createElement("button"), { type: "button", className: "thumb-x", textContent: "×", title: "Remove" })
      x.onclick = () => machine.set("frames", list.filter((_, j) => j !== k))
      cell.append(x)
      return cell
    }))
    planner?.()
  }
  shelf()
}

// ---- the planner ----
let planner = null
function brief(p, n) {
  const rate = Number(p.rate), hold = Number(p.hold), plan = engine.plan(p.loopFor, rate, hold, p.play)
  const holds = { 1: "on ones (every drawing shown once)", 2: "on twos (every drawing shown for two beats)", 3: "on threes" }[hold]
  return `I'm making a stop-motion loop of ${p.idea.trim() || "something moving"}.

It plays at ${rate} drawings a second, ${holds}, and lasts ${plan.actual.toFixed(2)} seconds, so it needs ${plan.drawings} unique frames${p.play === "pingpong" ? ", played forward and then back" : ", and the last frame must lead straight back into the first so the loop never shows a seam"}.

Help me plan it:
1. Break the movement into ${plan.drawings} poses, one a frame. For each, say what it shows and exactly what changes from the frame before, so the spacing reads as ${p.play === "pingpong" ? "a smooth there-and-back" : "one continuous cycle"}.
2. Mark the key poses (the extremes and the contact points) and the in-betweens, and say where the movement should ease in and out.
3. Tell me how to make each frame: what to draw, cut, print or move, and how far each step is.
4. Tell me how to shoot or scan them so they register: a locked camera or a fixed corner, the same light and distance every time, marks to line things up.
5. Give me a checklist, frame by frame, that I can tick off as I go.

Keep it practical and specific. If the idea needs more or fewer frames to read well at this rate, say so and why.`
}
function buildPlanner(machine) {
  const body = machine.host.querySelector('[data-group="plan"] .group-body')
  const out = Object.assign(document.createElement("p"), { className: "note plan" })
  const copy = Object.assign(document.createElement("button"), { className: "btn solid", type: "button", textContent: "Copy the brief", title: "A brief to paste into Claude or ChatGPT: it plans every frame of your loop" })
  const note = Object.assign(document.createElement("p"), { className: "note" })
  copy.onclick = async () => {
    const text = brief(machine.patch.params, frames.length)
    try { await navigator.clipboard.writeText(text); note.textContent = "Copied. Paste it into Claude or ChatGPT, then make the frames it lists and add them above." }
    catch { download(new Blob([text], { type: "text/plain" }), `${slug(machine.patch)}-brief.txt`); note.textContent = "Saved the brief as a text file." }
  }
  const row = Object.assign(document.createElement("div"), { className: "strip" })
  row.append(copy)
  body.prepend(out, row, note)
  planner = () => {
    const p = machine.patch.params, plan = engine.plan(p.loopFor, Number(p.rate), Number(p.hold), p.play)
    const have = machine.patch.params.frames.length
    out.textContent = `A ${plan.actual.toFixed(2)}-second loop at ${p.rate} a second, ${{ 1: "on ones", 2: "on twos", 3: "on threes" }[p.hold]}${p.play === "pingpong" ? ", there and back" : ""}, takes ${plan.drawings} drawings.` +
      (have ? ` You have ${have}${have === plan.drawings ? ": exactly right." : have < plan.drawings ? `: ${plan.drawings - have} to go.` : `, which plays ${(engine.loopSeconds(machine.patch, have)).toFixed(2)} s.`}` : "")
  }
  planner()
}

// ---- every frame as a carousel ----
function framesButton(machine) {
  const shop = machine.host.querySelector('[data-export="png"]').closest(".group-body")
  const note = Object.assign(document.createElement("p"), { className: "note" })
  const b = Object.assign(document.createElement("button"), { className: "btn", type: "button", textContent: "Frames as a carousel (PNG)", title: "Every drawing on its paper, one PNG each, numbered: post them as a carousel that swipes like the animation" })
  b.onclick = async () => {
    await ready
    const p = machine.patch, { w, h } = engine.size(p), n = frames.length, c = Object.assign(document.createElement("canvas"), { width: w, height: h }), g = c.getContext("2d"), files = []
    const seqLen = engine.order(p, n).length
    for (let k = 0; k < n; k++) {
      // The moment in the loop where drawing k first shows.
      engine.render(g, p, (engine.order(p, n).indexOf(k) + 0.5) / seqLen, { scale: 1, frames, texture })
      files.push({ name: `${slug(p)}-${String(k + 1).padStart(2, "0")}.png`, data: await new Promise((r) => c.toBlob(r, "image/png")) })
    }
    const blob = await zip(files)
    download(blob, `${slug(p)}-frames.zip`)
    note.textContent = `Saved ${n} frames (${(blob.size / 1048576).toFixed(1)} MB). Instagram takes up to 20 in a carousel.`
  }
  const row = Object.assign(document.createElement("div"), { className: "strip" })
  row.append(b)
  shop.querySelector(".strip").after(row)
  shop.append(note)
}

let pickScan = null
const scanFile = Object.assign(document.createElement("input"), { type: "file", accept: "image/*", hidden: true })
scanFile.onchange = async () => { const f = scanFile.files[0]; scanFile.value = ""; if (f && pickScan) pickScan(await addMedia(f)) }

m = await createMachine(document.querySelector("[data-machine]"), engine, {
  presets: new URL("presets/", import.meta.url),
  dropHint: "Drop frames (images) or a patch",

  load(patch, key) {
    if (!key || key === "frames" || key === "textureImage") load(patch)
    else { timing(patch); shelf?.() }
  },
  options: () => ({ frames, texture }),
  ready: () => ready,

  async onFile(f, target, machine) {
    if (!/^image\//.test(f.type)) return false
    await addFrames([f])
    return true
  },
  // Presets are looks: paper, print and pace; your frames stay.
  adopt(preset, current) { return { ...preset, params: { ...preset.params, frames: current.params.frames, idea: current.params.idea } } },
  slug,
  panel: { onMedia: (anchor, pick) => { pickScan = pick; scanFile.click() } },
  setup(machine) {
    m = machine
    machine.host.append(scanFile)
    buildShelf(machine)
    buildPlanner(machine)
    framesButton(machine)
  },
  api: { brief: () => brief(m.patch.params, frames.length), plan: (s, r, h, p) => engine.plan(s, r, h, p) },
})
