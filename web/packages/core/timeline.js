// The keyframe timeline: one lane per animated setting, under the transport.
//   drag a key        move it in time
//   double-click key  change its easing: smooth → linear → hold
//   click a key, then Delete or Backspace   remove it
//   click the lane    move the playhead there
//   ×                 stop animating that setting (it keeps its value at the playhead)
// The timeline runs 0 to 1. With Boomerang it plays forwards then backwards across one loop.
import { EASES } from "./keys.js"

const el = (tag, attrs = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), attrs)
  for (const k of kids) if (k != null) n.append(k)
  return n
}

// hooks: { patch(), frames(), onEdit(), onSeek(u), onUnanimate(key) }
export function createTimeline(root, manifest, hooks) {
  let selected = null // { key, k }
  let lanes = []

  function build() {
    const keys = hooks.patch().keys
    const names = Object.keys(keys)
    root.hidden = !names.length
    lanes = names.map((key) => {
      const def = manifest.parameters.find((d) => d.key === key)
      const track = el("div", { className: "tl-track" })
      const x = el("button", { type: "button", className: "tl-x", textContent: "×", title: `Stop animating ${def.label}` })
      x.onclick = () => hooks.onUnanimate(key)
      const lane = el("div", { className: "tl-lane" }, el("span", { className: "tl-name", textContent: def.label }), track, x)
      track.addEventListener("pointerdown", (e) => {
        if (e.target !== track) return
        const r = track.getBoundingClientRect()
        hooks.onSeek(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)))
      })
      for (const k of keys[key]) {
        const m = el("button", { type: "button", className: `tl-key ease-${k.ease}`, title: `${def.label}: ${fmt(k.v)} · ${k.ease}. Drag to move, double-click for easing, Delete to remove.` })
        m.style.left = `${k.t * 100}%`
        if (selected && selected.key === key && selected.k === k) m.classList.add("sel")
        m.addEventListener("pointerdown", (e) => {
          e.preventDefault()
          selected = { key, k }
          build()
          const r = track.getBoundingClientRect(), n = hooks.frames()
          const move = (ev) => {
            k.t = Math.round(Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)) * n) / n
            keys[key].sort((a, b) => a.t - b.t)
            hooks.onEdit()
          }
          const up = () => { removeEventListener("pointermove", move); removeEventListener("pointerup", up); build() }
          addEventListener("pointermove", move)
          addEventListener("pointerup", up)
        })
        m.addEventListener("dblclick", () => { k.ease = EASES[(EASES.indexOf(k.ease) + 1) % EASES.length]; hooks.onEdit(); build() })
        track.append(m)
      }
      track.append(el("i", { className: "tl-head" }))
      return lane
    })
    root.replaceChildren(el("div", { className: "tl-top" }, el("span", { textContent: "Keyframes" }), el("span", { className: "tl-hint", textContent: "Drag to move · double-click for easing · Delete removes" })), ...lanes)
  }

  addEventListener("keydown", (e) => {
    if (!selected || e.target.closest("input, textarea, select")) return
    if (e.key !== "Delete" && e.key !== "Backspace") return
    e.preventDefault()
    const keys = hooks.patch().keys
    const list = keys[selected.key]
    if (list) {
      list.splice(list.indexOf(selected.k), 1)
      if (!list.length) delete keys[selected.key]
    }
    selected = null
    hooks.onEdit()
    build()
  })

  return {
    build,
    playhead(u) { for (const h of root.querySelectorAll(".tl-head")) h.style.left = `${u * 100}%` },
  }
}

const fmt = (v) => (typeof v === "number" ? +v.toFixed(3) : v)
