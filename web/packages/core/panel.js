// The control rack, built from an instrument's manifest. Each parameter type gets one control:
//   number / int  fader + typed readout        select  menu
//   color         swatch (opens the picker)    palette swatches, + and −, and a pasteable hex list
//   text          multi-line field             string  one-line field
//   font          family field + font browser  media   choose / clear a backdrop file
//   mark          menu of the marks available (from hooks.markNames)
//   stack         an ordered list of effect layers, each with its own settings, opacity and blend
// A parameter marked "hidden" has no control (it's set by the instrument, such as an image's size).
//   bool          switch
// Numbers and colours that can be keyframed get a stopwatch, as in After Effects: click it to start
// animating that setting from the playhead. A parameter with "when": { key: value } only shows
// while that other parameter has that value. The rack never owns state: it reports changes
// through the callbacks and redraws through sync().
// "when" takes an exact value, or { not: value } to show while the other parameter is anything else.
import { openSwatches } from "./swatches.js"
import { keyable } from "./keys.js"
import { EFFECTS, GROUPS, BLENDS, effectById, newLayer } from "./effects/index.js"

// Whether a control shows, by its "when": exact values, or { not: value }.
const shows = (when, params) => !when || Object.entries(when).every(([k, v]) => (v !== null && typeof v === "object" ? params[k] !== v.not : params[k] === v))

// A range input's track fills up to its value; the stylesheet reads --p.
export const fillRange = (r) => r.style.setProperty("--p", `${((r.value - r.min) / (r.max - r.min || 1)) * 100}%`)

const el = (tag, attrs = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), attrs)
  for (const k of kids) if (k != null) n.append(k)
  return n
}

// hooks: { onChange(key, value), onStopwatch(key), onFontBrowse(anchor), onMedia(anchor, pick), markNames() }
// onMedia asks for a file; pick(name) sets the control to it.
export function createPanel(root, manifest, hooks) {
  const rows = new Map() // key -> { def, row, set(value), watch }

  for (const g of manifest.groups) {
    const defs = manifest.parameters.filter((d) => d.group === g.id)
    if (!defs.some((d) => !d.hidden)) continue
    const body = el("div", { className: "group-body" })
    const summary = el("summary", {}, g.label, g.hint ? el("small", { textContent: g.hint }) : null)
    const group = el("details", { className: "group", open: g.id !== "backdrop" }, summary, body)
    group.dataset.group = g.id
    for (const def of defs) {
      if (def.hidden) continue
      const ctl = control(def, (v) => hooks.onChange(def.key, v), hooks)
      const name = el("span", { className: "name", textContent: def.label })
      if (def.help) name.title = def.help
      let watch = null
      if (keyable(def)) {
        watch = el("button", { type: "button", className: "watch", title: "Animate: set a keyframe at the playhead", "aria-label": `Animate ${def.label}` })
        watch.addEventListener("click", (e) => { e.preventDefault(); hooks.onStopwatch(def.key) })
      }
      const row = el("div", { className: `row t-${def.type}` }, el("span", { className: "label" }, watch ?? el("span", { className: "watch-gap" }), name), ctl.node)
      row.dataset.key = def.key
      body.append(row)
      rows.set(def.key, { def, row, set: ctl.set, watch })
    }
    root.append(group)
  }

  return {
    // params: values to show (keyframes already resolved); keys: the patch's keyframes; u: playhead.
    sync(params, keys = {}, u = 0) {
      for (const [key, r] of rows) {
        r.set(params[key])
        const when = r.def.when
        r.row.hidden = !shows(when, params)
        if (r.watch) {
          const list = keys[key]
          r.row.classList.toggle("keyed", !!list)
          r.watch.classList.toggle("on-key", !!list?.some((k) => Math.abs(k.t - u) < 0.002))
          r.watch.title = list ? "Keyframe here: click to add one, or remove the one at the playhead" : "Animate: set a keyframe at the playhead"
        }
      }
    },
    // Cheap per-frame update for animated rows only, while playing.
    syncAnimated(params, keys, u) {
      for (const key of Object.keys(keys)) {
        const r = rows.get(key)
        if (!r) continue
        r.set(params[key])
        r.watch?.classList.toggle("on-key", keys[key].some((k) => Math.abs(k.t - u) < 0.002))
      }
    },
  }
}

function colourButton(onPick, getValue, extra = {}) {
  const b = el("button", { type: "button", className: "swatch" })
  b.addEventListener("click", (e) => { e.preventDefault(); openSwatches({ anchor: b, value: getValue(), onPick, ...extra() }) })
  return b
}

function control(d, emit, hooks) {
  switch (d.type) {
    case "number":
    case "int": {
      const decimals = d.type === "int" ? 0 : Math.max(0, -Math.floor(Math.log10(d.step)))
      const range = el("input", { type: "range", min: d.min, max: d.max, step: d.step, className: "fader" })
      const num = el("input", { type: "number", min: d.min, max: d.max, step: d.step, className: "readout" })
      range.addEventListener("input", () => { num.value = (+range.value).toFixed(decimals); fillRange(range); emit(+range.value) })
      num.addEventListener("change", () => emit(+num.value))
      const node = el("span", { className: "fader-wrap" }, range, num)
      if (d.unit) node.append(el("span", { className: "unit", textContent: d.unit }))
      return { node, set(v) { range.value = v; fillRange(range); if (document.activeElement !== num) num.value = (+v).toFixed(decimals) } }
    }
    case "select": {
      const sel = el("select", {}, ...d.options.map(([v, l]) => el("option", { value: v, textContent: l })))
      sel.addEventListener("change", () => emit(sel.value))
      return { node: sel, set(v) { sel.value = v } }
    }
    case "bool": {
      const box = el("input", { type: "checkbox", className: "switch" })
      box.addEventListener("change", () => emit(box.checked))
      return { node: box, set(v) { box.checked = v } }
    }
    case "color": {
      let value = d.default
      const sw = colourButton(emit, () => value, () => ({}))
      const hex = el("input", { type: "text", className: "hex", spellcheck: false, maxLength: 7, "aria-label": `${d.label} hex` })
      hex.addEventListener("change", () => emit(hex.value))
      return {
        node: el("span", { className: "colour" }, sw, hex),
        set(v) { value = v; sw.style.background = v; if (document.activeElement !== hex) hex.value = v },
      }
    }
    case "palette": {
      let current = []
      const swatches = el("span", { className: "swatches" })
      const list = el("input", { type: "text", className: "hexlist", spellcheck: false, title: "Paste hex colours, separated by spaces or commas" })
      const add = el("button", { type: "button", className: "mini", textContent: "+", title: "Add an ink" })
      const less = el("button", { type: "button", className: "mini", textContent: "−", title: "Remove the last ink" })
      add.addEventListener("click", (e) => { e.preventDefault(); emit([...current, current[current.length - 1] || "#000000"]) })
      less.addEventListener("click", (e) => { e.preventDefault(); if (current.length > 1) emit(current.slice(0, -1)) })
      list.addEventListener("change", () => emit(list.value.split(/[\s,]+/).filter(Boolean)))
      const node = el("span", { className: "palette" }, el("span", { className: "palette-top" }, swatches, add, less), list)
      return {
        node,
        set(v) {
          current = v.slice()
          if (swatches.children.length !== v.length) {
            swatches.replaceChildren(...v.map((_, i) => colourButton(
              (c) => { const next = current.slice(); next[i] = c; emit(next) },
              () => current[i],
              () => ({ inks: current, onInks: (l) => emit(l) }),
            )))
          }
          v.forEach((c, i) => { swatches.children[i].style.background = c; swatches.children[i].title = c })
          if (document.activeElement !== list) list.value = v.join(" ")
        },
      }
    }
    case "text": {
      const ta = el("textarea", { rows: 4, spellcheck: false })
      ta.addEventListener("input", () => emit(ta.value))
      return { node: ta, set(v) { if (document.activeElement !== ta) ta.value = v } }
    }
    case "font": {
      const input = el("input", { type: "text", spellcheck: false })
      input.addEventListener("change", () => emit(input.value.trim()))
      const browse = el("button", { type: "button", className: "btn", textContent: "Browse" })
      browse.addEventListener("click", (e) => { e.preventDefault(); hooks.onFontBrowse(browse) })
      return { node: el("span", { className: "font-field" }, input, browse), set(v) { if (document.activeElement !== input) input.value = v } }
    }
    case "mark": {
      const sel = el("select")
      sel.addEventListener("change", () => emit(sel.value))
      return {
        node: sel,
        set(v) {
          const names = hooks.markNames?.() ?? []
          if (v && !names.includes(v)) names.push(v)
          const want = ["", ...names].join("|")
          if (sel.dataset.names !== want) {
            sel.replaceChildren(el("option", { value: "", textContent: "None" }), ...names.map((n) => el("option", { value: n, textContent: `@${n}` })))
            sel.dataset.names = want
          }
          sel.value = v
        },
      }
    }
    case "stack": return stack(emit, hooks)
    case "media": {
      const name = el("span", { className: "media-name" })
      const choose = el("button", { type: "button", className: "btn", textContent: "Choose…" })
      const clear = el("button", { type: "button", className: "btn", textContent: "Clear" })
      choose.addEventListener("click", (e) => { e.preventDefault(); hooks.onMedia?.(choose, emit) })
      clear.addEventListener("click", (e) => { e.preventDefault(); emit("") })
      return {
        node: el("span", { className: "media" }, name, el("span", { className: "strip" }, choose, clear)),
        set(v) { name.textContent = v || "None yet."; clear.hidden = !v },
      }
    }
    default: {
      const input = el("input", { type: "text", spellcheck: false })
      input.addEventListener("change", () => emit(input.value.trim()))
      return { node: input, set(v) { if (document.activeElement !== input) input.value = v } }
    }
  }
}

// The effect stack: a card per layer, top of the list applied first. Each card switches its layer on
// or off, moves it, removes it, sets its blend and opacity, and opens to the effect's own controls.
function stack(emit, hooks) {
  let layers = []
  let shape = "" // the layers' ids and effects, to know when the cards need rebuilding
  const open = new Set()
  const cards = el("div", { className: "layers" })
  const add = el("select", { className: "layer-add", "aria-label": "Add an effect" },
    el("option", { value: "", textContent: "Add an effect…" }),
    ...GROUPS.map((g) => el("optgroup", { label: g }, ...EFFECTS.filter((e) => e.group === g).map((e) => el("option", { value: e.id, textContent: e.label })))))
  add.addEventListener("change", () => {
    if (!add.value) return
    const layer = newLayer(add.value)
    open.add(layer.id)
    add.value = ""
    emit([...layers, layer])
  })
  const update = (i, change) => emit(layers.map((l, j) => (j === i ? { ...l, ...change(l) } : l)))
  const move = (i, by) => {
    const next = layers.slice(), j = i + by
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    emit(next)
  }
  const setters = [] // per card: (layer) => void

  function build() {
    setters.length = 0
    cards.replaceChildren(...layers.map((layer, i) => {
      const e = effectById(layer.effect)
      const eye = el("button", { type: "button", className: "layer-eye", title: "Switch this layer on or off" })
      eye.addEventListener("click", () => update(i, (l) => ({ on: !l.on })))
      const name = el("button", { type: "button", className: "layer-name", textContent: e.label, title: "Show or hide this layer's settings" })
      const body = el("div", { className: "layer-body" })
      name.addEventListener("click", () => { open.has(layer.id) ? open.delete(layer.id) : open.add(layer.id); card.classList.toggle("open") })
      const up = el("button", { type: "button", className: "layer-btn", textContent: "↑", title: "Move up (applied earlier)" })
      const down = el("button", { type: "button", className: "layer-btn", textContent: "↓", title: "Move down (applied later)" })
      const x = el("button", { type: "button", className: "layer-btn", textContent: "×", title: "Remove this layer" })
      up.addEventListener("click", () => move(i, -1))
      down.addEventListener("click", () => move(i, 1))
      x.addEventListener("click", () => emit(layers.filter((_, j) => j !== i)))
      const blend = el("select", { "aria-label": "Blend mode" }, ...BLENDS.map(([v, l]) => el("option", { value: v, textContent: l })))
      blend.addEventListener("change", () => update(i, () => ({ blend: blend.value })))
      const opacity = control({ type: "number", min: 0, max: 1, step: 0.01 }, (v) => update(i, () => ({ opacity: v })), hooks)
      body.append(el("div", { className: "row" }, el("span", { className: "label" }, el("span", { className: "name", textContent: "Blend" })), blend),
        el("div", { className: "row t-number" }, el("span", { className: "label" }, el("span", { className: "name", textContent: "Opacity" })), opacity.node))
      const subs = e.params.map((d) => {
        const ctl = control(d, (v) => update(i, (l) => ({ params: { ...l.params, [d.key]: v } })), hooks)
        const label = el("span", { className: "name", textContent: d.label })
        if (d.help) label.title = d.help
        const row = el("div", { className: `row t-${d.type}` }, el("span", { className: "label" }, label), ctl.node)
        body.append(row)
        return { d, row, set: ctl.set }
      })
      const card = el("div", { className: `layer${open.has(layer.id) ? " open" : ""}` },
        el("div", { className: "layer-head" }, eye, name, up, down, x), body)
      setters.push((l) => {
        card.classList.toggle("off", !l.on)
        eye.setAttribute("aria-pressed", String(l.on))
        blend.value = l.blend
        opacity.set(l.opacity)
        for (const s of subs) { s.set(l.params[s.d.key]); s.row.hidden = !shows(s.d.when, l.params) }
      })
      return card
    }))
  }

  const node = el("div", { className: "stack" }, cards, add)
  return {
    node,
    set(v) {
      layers = v || []
      const next = layers.map((l) => `${l.id}:${l.effect}`).join("|")
      if (next !== shape) { shape = next; build() }
      layers.forEach((l, i) => setters[i](l))
    },
  }
}

