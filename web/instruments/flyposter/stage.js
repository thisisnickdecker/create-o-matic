// Working on the stage itself: click a part of the post to pick it up, drag it, pull the corner to
// scale it, the knob above to turn it; double-click (or double-tap) words to retype them. Guides
// snap to the middle, the margins and the other parts (hold Alt to place freely). The keys, with
// something picked: arrows nudge (Shift for ten), [ and ] turn, - and = scale, Delete hides it,
// R puts it back, Esc lets go. Cmd-Z and Shift-Cmd-Z undo and redo anything, rack included.
// What you move is kept in the patch (moves, by layout and part), so it's a setting like any other.
import * as engine from "./flyposter.js"

const el = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); n.append(...kids.filter((k) => k != null)); return n }
const ruler = document.createElement("canvas").getContext("2d")
const SNAP = 7 // css pixels

export function stageEditing(machine, { options, onFirstMove, record }) {
  const frame = machine.host.querySelector(".frame"), canvas = frame.querySelector("canvas")
  canvas.style.touchAction = "none"
  const layer = el("div", { className: "fly-edit" })
  const box = el("div", { className: "fly-sel", hidden: true })
  const scaleKnob = el("span", { className: "fly-knob fly-knob-scale", title: "Drag to scale" })
  const turnKnob = el("span", { className: "fly-knob fly-knob-turn", title: "Drag to turn (Shift for 15° steps)" })
  const tag = el("span", { className: "fly-sel-tag" })
  box.append(scaleKnob, turnKnob, tag)
  const bar = el("div", { className: "fly-sel-bar", hidden: true })
  const guides = el("div", { className: "fly-guides" })
  layer.append(guides, box)
  frame.append(layer, bar)

  let picked = null // a role
  let gesture = null

  // ---- where things are ----
  const p = () => machine.patch.params
  const dims = () => engine.size(machine.patch)
  const scale = () => canvas.getBoundingClientRect().width / dims().w
  const all = () => engine.parts(ruler, machine.patch, options()).filter((x) => !(x.w > dims().w * 0.95 && x.h > dims().h * 0.95))
  const find = (role) => all().find((x) => x.role === role)
  const toPost = (e) => {
    const r = canvas.getBoundingClientRect(), k = r.width / dims().w
    return { x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k }
  }
  // The top part under a point, turned boxes and all; a little slack round small things.
  function hit(pt) {
    const k = scale(), list = all()
    for (let i = list.length - 1; i >= 0; i--) {
      const x = list[i], dx = pt.x - x.x, dy = pt.y - x.y
      const lx = dx * Math.cos(-x.rot) - dy * Math.sin(-x.rot), ly = dx * Math.sin(-x.rot) + dy * Math.cos(-x.rot)
      const slack = 6 / k
      if (Math.abs(lx) <= x.w / 2 + slack && Math.abs(ly) <= x.h / 2 + slack) return x
    }
    return null
  }

  // ---- the moves in the patch ----
  const idOf = (role) => `${p().layout}:${role}`
  const moveOf = (role) => p().moves.find((mv) => mv.id === idOf(role))
  function ensure(role) {
    let mv = moveOf(role)
    if (!mv) {
      mv = { id: idOf(role), dx: 0, dy: 0, s: 1, r: 0, hide: false }
      p().moves = [...p().moves.slice(-63), mv]
    }
    return mv
  }
  // After a change: kept, undoable, and the first real move keeps the layout when you Vary.
  const settle = () => {
    if (!p().lockLayout && p().moves.some((mv) => mv.id.startsWith(`${p().layout}:`))) onFirstMove()
    machine.changed(); record(); show()
  }

  // ---- the selection, drawn over the canvas ----
  function show() {
    const x = picked && !machine.playing && find(picked)
    if (!x) { box.hidden = bar.hidden = true; if (picked && !machine.playing && !moveOf(picked)?.hide) picked = null; return }
    const k = scale()
    Object.assign(box.style, { left: `${canvas.offsetLeft + x.x * k}px`, top: `${canvas.offsetTop + x.y * k}px`, width: `${x.w * k}px`, height: `${x.h * k}px`, transform: `translate(-50%, -50%) rotate(${x.rot}rad)` })
    box.hidden = false
    tag.textContent = x.name
    const mv = moveOf(picked)
    bar.replaceChildren(
      x.field ? button("Retype", "Double-click works too", () => retype(x)) : null,
      button("Hide", "Leave it out (Delete)", () => { record(); ensure(picked).hide = true; settle() }),
      mv ? button("Put back", "Where the layout had it (R)", () => reset(picked)) : null,
    )
    bar.hidden = false
    // The bar sits clear of the box however it's turned (and of its knobs): below, or above when
    // there's no room below.
    const reach = (Math.hypot(x.w, x.h) / 2) * k, cy = canvas.offsetTop + x.y * k
    const below = cy + reach + 18, above = cy - reach - 46 - 30
    const half = bar.offsetWidth / 2 + 8
    Object.assign(bar.style, { left: `${Math.min(frame.clientWidth - half, Math.max(half, canvas.offsetLeft + x.x * k))}px`, top: `${below + 34 < frame.clientHeight || above < 0 ? below : above}px` })
  }
  const button = (text, title, run) => el("button", { type: "button", className: "fly-chip", textContent: text, title, onclick: (e) => { e.stopPropagation(); run() } })
  function pick(role) { picked = role; show() }
  function reset(role) {
    record()
    p().moves = p().moves.filter((mv) => mv.id !== idOf(role))
    settle()
  }

  // ---- snapping ----
  // The lines a part can snap to: the middle, the margins, and the other parts' edges and middles.
  function lines(except) {
    const { w: W, h: H } = dims(), m = p().margin * Math.min(W, H) / 1080
    const xs = [W / 2, m, W - m], ys = [H / 2, m, H - m]
    for (const x of all()) {
      if (x.role === except || Math.abs(Math.sin(x.rot)) > 0.05) continue
      xs.push(x.x, x.x - x.w / 2, x.x + x.w / 2); ys.push(x.y, x.y - x.h / 2, x.y + x.h / 2)
    }
    return { xs, ys }
  }
  function snap(x, at, free) {
    guides.replaceChildren()
    if (free) return [0, 0]
    const k = scale(), { xs, ys } = lines(x.role), upright = Math.abs(Math.sin(x.rot)) < 0.05
    const near = (marks, edges) => {
      let best = null
      for (const e of edges) for (const v of marks) { const d = v - e; if (Math.abs(d) * k < SNAP && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, v } }
      return best
    }
    const sx = near(xs, upright ? [at.x - x.w / 2, at.x, at.x + x.w / 2] : [at.x])
    const sy = near(ys, upright ? [at.y - x.h / 2, at.y, at.y + x.h / 2] : [at.y])
    if (sx) guides.append(el("i", { className: "fly-guide v", style: `left:${canvas.offsetLeft + sx.v * k}px; top:${canvas.offsetTop}px; height:${canvas.clientHeight}px` }))
    if (sy) guides.append(el("i", { className: "fly-guide h", style: `top:${canvas.offsetTop + sy.v * k}px; left:${canvas.offsetLeft}px; width:${canvas.clientWidth}px` }))
    return [sx?.d ?? 0, sy?.d ?? 0]
  }

  // ---- gestures ----
  function begin(e, kind, x) {
    // Work at the freeze frame, where everything is in place.
    if (machine.playing) window.instrument.seek(p().phase)
    record()
    const mv = ensure(x.role), at = toPost(e)
    gesture = { kind, role: x.role, start: at, x, mv: { ...mv }, id: e.pointerId }
    canvas.setPointerCapture?.(e.pointerId)
    e.preventDefault()
  }
  function during(e) {
    if (!gesture || e.pointerId !== gesture.id) return
    const g = gesture, mv = moveOf(g.role), at = toPost(e), { w: W, h: H } = dims()
    if (!mv) return
    if (g.kind === "drag") {
      let dx = at.x - g.start.x, dy = at.y - g.start.y
      const [sx, sy] = snap(g.x, { x: g.x.x + dx, y: g.x.y + dy }, e.altKey)
      dx += sx; dy += sy
      // Words turn with the group's tilt, so a drag on screen is turned back for them.
      const t = -g.x.tilt, ux = dx * Math.cos(t) - dy * Math.sin(t), uy = dx * Math.sin(t) + dy * Math.cos(t)
      mv.dx = clampMove(g.mv.dx + ux / W); mv.dy = clampMove(g.mv.dy + uy / H)
    } else if (g.kind === "scale") {
      const d0 = Math.hypot(g.start.x - g.x.x, g.start.y - g.x.y), d1 = Math.hypot(at.x - g.x.x, at.y - g.x.y)
      mv.s = Math.min(5, Math.max(0.2, g.mv.s * (d1 / Math.max(1, d0))))
    } else if (g.kind === "turn") {
      const a0 = Math.atan2(g.start.y - g.x.y, g.start.x - g.x.x), a1 = Math.atan2(at.y - g.x.y, at.x - g.x.x)
      let r = g.mv.r + a1 - a0
      if (e.shiftKey) r = Math.round(r / (Math.PI / 12)) * (Math.PI / 12)
      mv.r = Math.atan2(Math.sin(r), Math.cos(r))
    }
    machine.redraw()
    show()
  }
  function end(e) {
    if (!gesture || e.pointerId !== gesture.id) return
    const mv = moveOf(gesture.role)
    // A click that didn't move anything leaves no move behind.
    if (mv && !mv.hide && Math.abs(mv.dx) < 1e-4 && Math.abs(mv.dy) < 1e-4 && Math.abs(mv.s - 1) < 1e-4 && Math.abs(mv.r) < 1e-4) p().moves = p().moves.filter((x) => x !== mv)
    gesture = null
    guides.replaceChildren()
    settle()
  }
  const clampMove = (v) => Math.min(2, Math.max(-2, v))

  let lastTap = { role: null, at: 0 }
  canvas.addEventListener("pointerdown", (e) => {
    if (e.button > 0) return
    const x = hit(toPost(e))
    if (!x) { pick(null); return }
    // Two taps on the same part: retype it (dblclick doesn't reach a canvas that takes touches).
    const now = performance.now()
    if (lastTap.role === x.role && now - lastTap.at < 380 && x.field) { lastTap = { role: null, at: 0 }; pick(x.role); retype(x); e.preventDefault(); return }
    lastTap = { role: x.role, at: now }
    pick(x.role)
    begin(e, "drag", x)
  })
  for (const [knob, kind] of [[scaleKnob, "scale"], [turnKnob, "turn"]]) {
    knob.addEventListener("pointerdown", (e) => { const x = picked && find(picked); if (x) { e.stopPropagation(); begin(e, kind, x); knob.setPointerCapture?.(e.pointerId) } })
    knob.addEventListener("pointermove", during)
    knob.addEventListener("pointerup", end)
    knob.addEventListener("pointercancel", end)
  }
  canvas.addEventListener("pointermove", (e) => {
    if (gesture) return during(e)
    canvas.style.cursor = hit(toPost(e)) ? "move" : ""
  })
  canvas.addEventListener("pointerup", end)
  canvas.addEventListener("pointercancel", end)

  // ---- retyping ----
  function retype(x) {
    if (machine.playing) window.instrument.seek(p().phase)
    const field = x.field, k = scale()
    const value = field === "headline" ? engine.words({ ...p(), case: "as" }).headline : p()[field]
    const area = el("textarea", { className: "fly-retype", value, spellcheck: true, rows: Math.min(5, value.split("\n").length + (field === "headline" ? 1 : 0)) })
    area.setAttribute("aria-label", `Retype ${x.name.toLowerCase()}`)
    Object.assign(area.style, { left: `${canvas.offsetLeft + x.x * k}px`, top: `${canvas.offsetTop + x.y * k}px` })
    const hint = el("span", { className: "fly-retype-hint", textContent: field === "headline" ? "Return for a new line, Esc when done" : "Return or Esc when done" })
    const wrap = el("div", { className: "fly-retype-wrap" }, area, hint)
    Object.assign(wrap.style, { left: area.style.left, top: area.style.top })
    area.style.left = area.style.top = ""
    record()
    let first = true
    area.addEventListener("input", () => {
      // The first keystroke on a rewrite makes it yours.
      if (field === "headline" && first && p().take) machine.patch.params.take = 0
      first = false
      machine.set(field, area.value)
    })
    const done = () => { wrap.remove(); record(); show() }
    area.addEventListener("keydown", (k2) => {
      k2.stopPropagation()
      if (k2.key === "Escape" || (k2.key === "Enter" && (field !== "headline" || k2.metaKey || k2.ctrlKey))) { k2.preventDefault(); area.blur() }
    })
    area.addEventListener("blur", done)
    frame.append(wrap)
    area.focus()
    area.select()
  }
  canvas.addEventListener("dblclick", (e) => { const x = hit(toPost(e)); if (x?.field) retype(x) })

  // ---- keys ----
  addEventListener("keydown", (e) => {
    if (e.target.closest?.("input, textarea, select, .fp-pop, .sw-pop")) return
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") return
    if (!picked || !find(picked) && !moveOf(picked)?.hide) return
    const { w: W, h: H } = dims()
    const step = e.shiftKey ? 10 : 1
    const act = {
      ArrowLeft: (mv) => { mv.dx -= step / W }, ArrowRight: (mv) => { mv.dx += step / W },
      ArrowUp: (mv) => { mv.dy -= step / H }, ArrowDown: (mv) => { mv.dy += step / H },
      "[": (mv) => { mv.r -= (e.shiftKey ? 15 : 5) * Math.PI / 180 }, "]": (mv) => { mv.r += (e.shiftKey ? 15 : 5) * Math.PI / 180 },
      "-": (mv) => { mv.s = Math.max(0.2, mv.s / 1.05) }, "=": (mv) => { mv.s = Math.min(5, mv.s * 1.05) },
      Backspace: (mv) => { mv.hide = true }, Delete: (mv) => { mv.hide = true },
    }[e.key]
    if (e.key === "Escape") { pick(null); return }
    if (e.key === "r" || e.key === "R") { e.preventDefault(); reset(picked); return }
    if (!act) return
    e.preventDefault()
    e.stopImmediatePropagation() // the shell's arrows seek; with something picked they move it
    record()
    act(ensure(picked))
    settle()
  }, true)

  new ResizeObserver(show).observe(frame)
  return {
    show,
    pick: (role) => pick(role),
    get picked() { return picked },
  }
}
