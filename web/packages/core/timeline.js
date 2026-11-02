// The keyframe timeline: a ruler in seconds and one lane per animated setting, under the transport.
//   drag the ruler or a lane   scrub; the playhead lands on whole frames
//   drag a key        move it frame by frame; it catches on the playhead and on other keys.
//                     Hold Shift to step by half seconds
//   click a key       select it and take the playhead to it
//   ← →               with a key selected, nudge it a frame (Shift: half a second)
//   double-click key  change its easing: smooth → linear → hold
//   Delete or Backspace   remove the selected key; Escape lets go of it
//   ×                 stop animating that setting (it keeps its value at the playhead)
// The timeline runs 0 to 1. With Boomerang it plays forwards then backwards across one loop, so
// it lasts half the loop.
import { EASES } from "./keys.js"

const el = (tag, attrs = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), attrs)
  for (const k of kids) if (k != null) n.append(k)
  return n
}
const clamp = (u) => Math.min(1, Math.max(0, u))
const pct = (u) => `${u * 100}%`
const CATCH = 6 // pixels within which a dragged key catches on the playhead or another key

// hooks: { patch(), frames(), seconds(), onEdit(), onSeek(u), onUnanimate(key) }
// frames() and seconds() are the timeline's own length (half the loop with Boomerang).
export function createTimeline(root, manifest, hooks) {
  let selected = null // { key, k }
  let head = 0

  const onFrame = (u) => { const n = hooks.frames(); return clamp(Math.round(u * n) / n) }
  const onHalf = (u) => { const step = 0.5 / hooks.seconds(); return clamp(Math.round(u / step) * step) }
  const label = (u) => `${(u * hooks.seconds()).toFixed(2)} s`
  const at = (e, surface) => { const r = surface.getBoundingClientRect(); return clamp((e.clientX - r.left) / r.width) }

  function select(sel) {
    selected = sel
    for (const b of root.querySelectorAll(".tl-key")) b.classList.toggle("sel", b.key === selected?.k)
  }

  // Follow a drag on one element until it lets go, wherever the pointer goes.
  function drag(target, e, move, up) {
    target.setPointerCapture(e.pointerId)
    const end = () => {
      target.removeEventListener("pointermove", move)
      target.removeEventListener("pointerup", end)
      target.removeEventListener("pointercancel", end)
      up?.()
    }
    target.addEventListener("pointermove", move)
    target.addEventListener("pointerup", end)
    target.addEventListener("pointercancel", end)
  }

  function scrub(surface) {
    surface.addEventListener("pointerdown", (e) => {
      if (e.button || e.target.closest(".tl-key")) return
      e.preventDefault()
      select(null)
      const go = (ev) => hooks.onSeek(onFrame(at(ev, surface)))
      go(e)
      drag(surface, e, go)
    })
  }

  // Labelled every half, one, two, five… seconds: the finest step that leaves room for the labels.
  function ruler(width = root.clientWidth - 160) {
    const L = hooks.seconds()
    const major = [0.5, 1, 2, 5, 10, 15, 30, 60].find((s) => (s / L) * width >= 34) ?? 60
    const r = el("div", { className: "tl-ruler" })
    const count = Math.round(L / (major / 2))
    for (let i = 0; i <= count; i++) {
      const s = Math.min(L, (i * major) / 2), u = s / L
      r.append(Object.assign(el("i", { className: i % 2 ? "" : "major" }), { style: `left:${pct(u)}` }))
      if (i % 2 === 0) {
        const b = el("b", { textContent: `${+s.toFixed(1)}s`, className: i === 0 ? "first" : u > 0.97 ? "last" : "" })
        b.style.left = pct(u)
        r.append(b)
      }
    }
    r.append(el("i", { className: "tl-head" }))
    scrub(r)
    return el("div", { className: "tl-lane tl-ruler-row" }, el("span"), r, el("span"))
  }

  function build() {
    const keys = hooks.patch().keys
    const names = Object.keys(keys)
    root.hidden = !names.length
    if (selected && !keys[selected.key]?.includes(selected.k)) selected = null
    const lanes = names.map((key) => {
      const def = manifest.parameters.find((d) => d.key === key)
      const track = el("div", { className: "tl-track" })
      const x = el("button", { type: "button", className: "tl-x", textContent: "×", title: `Stop animating ${def.label}` })
      x.onclick = () => hooks.onUnanimate(key)
      const lane = el("div", { className: "tl-lane" }, el("span", { className: "tl-name", textContent: def.label }), track, x)
      scrub(track)
      const tip = el("span", { className: "tl-tip", hidden: true })
      for (const k of keys[key]) {
        const m = el("button", { type: "button", className: `tl-key ease-${k.ease}`, title: `${def.label}: ${fmt(k.v)} · ${k.ease}. Drag to move (Shift: half seconds), double-click for easing, Delete to remove.` })
        m.key = k
        m.style.left = pct(k.t)
        if (selected?.k === k) m.classList.add("sel")
        m.addEventListener("pointerdown", (e) => {
          if (e.button) return
          e.preventDefault()
          select({ key, k })
          const x0 = e.clientX, t0 = k.t
          let moved = false
          drag(m, e, (ev) => {
            if (!moved && Math.abs(ev.clientX - x0) < 3) return
            moved = true
            const w = track.getBoundingClientRect().width
            const raw = clamp(t0 + (ev.clientX - x0) / w)
            const u = ev.shiftKey ? onHalf(raw) : catchOn(raw, w, k) ?? onFrame(raw)
            tip.hidden = false
            tip.textContent = label(u)
            tip.style.left = pct(u)
            if (u === k.t || keys[key].some((o) => o !== k && o.t === u)) return
            k.t = u
            keys[key].sort((a, b) => a.t - b.t)
            m.style.left = pct(u)
            hooks.onEdit()
          }, () => {
            tip.hidden = true
            if (!moved) hooks.onSeek(k.t)
            build()
          })
        })
        m.addEventListener("dblclick", () => { k.ease = EASES[(EASES.indexOf(k.ease) + 1) % EASES.length]; hooks.onEdit(); build() })
        track.append(m)
      }
      track.append(el("i", { className: "tl-head" }), tip)
      return lane
    })
    root.replaceChildren(
      el("div", { className: "tl-top" }, el("span", { textContent: "Keyframes" }), el("span", { className: "tl-hint", textContent: "Drag to scrub or move keys · Shift for half seconds · ← → nudge · double-click for easing · Delete removes" })),
      ruler(measured || undefined),
      ...lanes,
    )
    playhead(head)
  }

  // The nearest of the playhead and the other keys, if one is within a few pixels of u.
  function catchOn(u, width, self) {
    let best = null, gap = CATCH / width
    const near = (t) => { const d = Math.abs(t - u); if (d < gap) { gap = d; best = t } }
    near(head)
    for (const list of Object.values(hooks.patch().keys)) for (const o of list) if (o !== self) near(o.t)
    return best
  }

  function playhead(u) {
    head = u
    for (const h of root.querySelectorAll(".tl-head")) h.style.left = pct(u)
  }

  addEventListener("keydown", (e) => {
    if (!selected || e.target.closest("input, textarea, select")) return
    const keys = hooks.patch().keys
    const list = keys[selected.key]
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault()
      if (list) {
        list.splice(list.indexOf(selected.k), 1)
        if (!list.length) delete keys[selected.key]
      }
      selected = null
      hooks.onEdit()
      build()
    } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      // Takes the arrows from the playhead while a key is selected.
      e.preventDefault()
      e.stopImmediatePropagation()
      const k = selected.k, dir = e.key === "ArrowRight" ? 1 : -1
      const u = e.shiftKey ? onHalf(k.t + (dir * 0.5) / hooks.seconds()) : onFrame(k.t + dir / hooks.frames())
      if (!list || list.some((o) => o !== k && o.t === u)) return
      k.t = u
      list.sort((a, b) => a.t - b.t)
      hooks.onEdit()
      hooks.onSeek(u)
      build()
    } else if (e.key === "Escape") select(null)
  })

  // Space the ruler again when the timeline changes width.
  let measured = 0
  new ResizeObserver(() => {
    const track = root.querySelector(".tl-ruler")
    if (!track || Math.abs(track.clientWidth - measured) < 24) return
    measured = track.clientWidth
    track.parentElement.replaceWith(ruler(measured))
    playhead(head)
  }).observe(root)

  return { build, playhead }
}

const fmt = (v) => (typeof v === "number" ? +v.toFixed(3) : v)
