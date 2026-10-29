// The swatch picker: one popover for every colour control, modelled on Illustrator's.
//   Swatches  recent colours, then folders: basics, process, greys, the studio's papers and inks,
//             named palettes, and your brand palettes
//   Mixer     hue / saturation / brightness, with RGB and CMYK readouts you can type into
//   Eyedropper picks any colour on screen (Chrome and Edge)
// Brand palettes load from Adobe .ase (Illustrator, Photoshop, InDesign swatch exchange), GIMP
// .gpl, .json, or any text with hex codes in it (.css, .txt), and are kept in this browser.
//   openSwatches({ anchor, value, onPick(hex), inks?, onInks?(list) })

const el = (tag, attrs = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), attrs)
  for (const k of kids) if (k != null) n.append(k)
  return n
}

// CMYK swatches are the usual on-screen stand-ins for process inks, not a colour-managed conversion.
const GROUPS = [
  { name: "Basics", colours: ["#FFFFFF", "#000000", "#FF0000", "#00FF00", "#0000FF", "#00FFFF", "#FF00FF", "#FFFF00"] },
  { name: "Process (CMYK on screen)", colours: ["#00AEEF", "#EC008C", "#FFF200", "#231F20", "#ED1C24", "#00A651", "#2E3192"] },
  { name: "Greys", colours: ["#FFFFFF", "#E6E6E6", "#CCCCCC", "#B3B3B3", "#999999", "#808080", "#666666", "#4D4D4D", "#333333", "#1A1A1A", "#000000"] },
  { name: "Nick", colours: ["#F4F4F1", "#1A1714", "#C43A3E", "#E93D4C", "#7A746C", "#F7684F", "#E2566B", "#D07045", "#FBA83B", "#7585A6"] },
  { name: "Papers", colours: ["#F3EBD8", "#EFE9DE", "#E6E1D3", "#F4D35E", "#C19A6B", "#8C6A4A", "#C5D3B5", "#C9B6E4", "#F2C9C0", "#BFD7EA", "#4B2A7B", "#1C1B19"] },
  { name: "Inks", colours: ["#1D1D1B", "#0000FF", "#E4372B", "#FF4FA3", "#F26B1D", "#D9A21B", "#1F5A3A", "#4B2A7B", "#5B3A24", "#1E2A4A", "#0E6E6E", "#F4EAD5"] },
  { name: "Job printer", colours: ["#F3EBD8", "#1D1D1B", "#E4372B"] },
  { name: "Don't overthink", colours: ["#C19A6B", "#1D1D1B", "#F4EAD5"] },
  { name: "Do you hate jazz", colours: ["#C5D3B5", "#1D1D1B", "#1F5A3A"] },
  { name: "Nothing mid", colours: ["#4B2A7B", "#F4EAD5", "#FF4FA3"] },
  { name: "Toxic", colours: ["#F4D35E", "#1D1D1B", "#E4372B"] },
  { name: "Hatch", colours: ["#EFE9DE", "#1E2A4A", "#E4372B"] },
  { name: "Night shift", colours: ["#1C1B19", "#F4EAD5", "#0000FF"] },
  { name: "Blueprint", colours: ["#BFD7EA", "#0000FF", "#1D1D1B"] },
  { name: "Bloom", colours: ["#F2C9C0", "#4B2A7B", "#F26B1D"] },
  { name: "Mustard seed", colours: ["#E6E1D3", "#D9A21B", "#5B3A24"] },
  { name: "Teal room", colours: ["#F3EBD8", "#0E6E6E", "#F26B1D"] },
]

const store = (key, fallback) => ({
  get() { try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback } },
  set(v) { try { localStorage.setItem(key, JSON.stringify(v)) } catch {} },
})
const recent = store("com.recentColours", [])
const brand = store("com.brandPalettes", [])

export function rememberColour(hex) {
  recent.set([hex, ...recent.get().filter((c) => c !== hex)].slice(0, 16))
}

// ---- conversions ----
export const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
export const rgbToHex = (r, g, b) => "#" + [r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("").toUpperCase()
function rgbToHsb(r, g, b) {
  r /= 255; g /= 255; b /= 255
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn
  let h = 0
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [(h * 60 + 360) % 360, mx ? d / mx : 0, mx]
}
function hsbToRgb(h, s, v) {
  const f = (n) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)) }
  return [f(5) * 255, f(3) * 255, f(1) * 255]
}
const rgbToCmyk = (r, g, b) => {
  const k = 1 - Math.max(r, g, b) / 255
  if (k >= 1) return [0, 0, 0, 100]
  return [r, g, b].map((c) => Math.round(((1 - c / 255 - k) / (1 - k)) * 100)).concat(Math.round(k * 100))
}
const cmykToRgb = (c, m, y, k) => [c, m, y].map((v) => 255 * (1 - v / 100) * (1 - k / 100))

export function normHex(s) {
  s = String(s).trim().replace(/^#?/, "#")
  if (/^#[0-9a-f]{3}$/i.test(s)) s = "#" + [...s.slice(1)].map((c) => c + c).join("")
  return /^#[0-9a-f]{6}$/i.test(s) ? s.toUpperCase() : null
}

// ---- palette files ----
export async function readPaletteFile(file) {
  const name = file.name.replace(/\.[^.]+$/, "")
  if (/\.ase$/i.test(file.name)) return parseAse(await file.arrayBuffer(), name)
  const text = await file.text()
  if (/\.gpl$/i.test(file.name)) {
    const colours = text.split("\n").map((l) => l.trim().match(/^(\d+)\s+(\d+)\s+(\d+)/)).filter(Boolean).map((m) => rgbToHex(+m[1], +m[2], +m[3]))
    return [{ name, colours }]
  }
  if (/\.json$/i.test(file.name)) {
    const data = JSON.parse(text)
    const list = Array.isArray(data) && typeof data[0] === "object" ? data : [{ name, colours: data.colours || data.colors || data }]
    return list.map((p) => ({ name: p.name || name, colours: (p.colours || p.colors || []).map(normHex).filter(Boolean) }))
  }
  return [{ name, colours: [...new Set((text.match(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/gi) || []).map(normHex))] }]
}

// Adobe Swatch Exchange: big-endian blocks of groups and colours. RGB, CMYK and grey are read;
// LAB swatches are skipped (they need a colour-managed conversion to come out right).
function parseAse(buf, fallback) {
  const v = new DataView(buf)
  if (v.getUint32(0) !== 0x41534546) throw new Error("Not an .ase file")
  const count = v.getUint32(8)
  const groups = [{ name: fallback, colours: [] }]
  let o = 12, current = groups[0]
  const str = (at) => { const n = v.getUint16(at); let s = ""; for (let i = 0; i < n - 1; i++) s += String.fromCharCode(v.getUint16(at + 2 + i * 2)); return [s, at + 2 + n * 2] }
  for (let b = 0; b < count; b++) {
    const type = v.getUint16(o), len = v.getUint32(o + 2), body = o + 6
    if (type === 0xc001) { current = { name: str(body)[0] || fallback, colours: [] }; groups.push(current) }
    else if (type === 0xc002) current = groups[0]
    else if (type === 0x0001) {
      let [, at] = str(body)
      const model = String.fromCharCode(v.getUint8(at), v.getUint8(at + 1), v.getUint8(at + 2), v.getUint8(at + 3))
      at += 4
      const f = (i) => v.getFloat32(at + i * 4)
      if (model === "RGB ") current.colours.push(rgbToHex(f(0) * 255, f(1) * 255, f(2) * 255))
      else if (model === "CMYK") current.colours.push(rgbToHex(...cmykToRgb(f(0) * 100, f(1) * 100, f(2) * 100, f(3) * 100)))
      else if (model === "Gray") current.colours.push(rgbToHex(f(0) * 255, f(0) * 255, f(0) * 255))
    }
    o = body + len
  }
  return groups.filter((g) => g.colours.length)
}

// Writes an .ase: one named group of RGB swatches, which Illustrator, Photoshop and InDesign read.
export function writeAse(name, colours) {
  const utf16 = (s) => { const out = new Uint8Array(2 + (s.length + 1) * 2), v = new DataView(out.buffer); v.setUint16(0, s.length + 1); [...s].forEach((ch, i) => v.setUint16(2 + i * 2, ch.charCodeAt(0))); return out }
  const block = (type, body) => { const out = new Uint8Array(6 + body.length), v = new DataView(out.buffer); v.setUint16(0, type); v.setUint32(2, body.length); out.set(body, 6); return out }
  const colour = (hex) => {
    const label = utf16(hex), body = new Uint8Array(label.length + 4 + 12 + 2), v = new DataView(body.buffer)
    body.set(label, 0)
    let at = label.length
    for (const ch of "RGB ") v.setUint8(at++, ch.charCodeAt(0))
    for (const c of hexToRgb(hex)) { v.setFloat32(at, c / 255); at += 4 }
    v.setUint16(at, 2) // a normal (not global or spot) swatch
    return block(0x0001, body)
  }
  const blocks = [block(0xc001, utf16(name)), ...colours.map(colour), block(0xc002, new Uint8Array(0))]
  const head = new Uint8Array(12), v = new DataView(head.buffer)
  v.setUint32(0, 0x41534546); v.setUint16(4, 1); v.setUint16(6, 0); v.setUint32(8, blocks.length)
  return new Blob([head, ...blocks], { type: "application/octet-stream" })
}

// ---- the popover ----
let open = null

export function openSwatches({ anchor, value, onPick, inks, onInks }) {
  close()
  let hex = normHex(value) || "#000000"
  let [h, s, b] = rgbToHsb(...hexToRgb(hex))
  const pick = (next, { keepHsb = false } = {}) => {
    hex = next
    if (!keepHsb) [h, s, b] = rgbToHsb(...hexToRgb(hex))
    onPick(hex)
    paint()
  }

  const big = el("span", { className: "sw-big" })
  const hexIn = el("input", { type: "text", className: "sw-hex", spellcheck: false, maxLength: 7, "aria-label": "Hex" })
  hexIn.addEventListener("change", () => { const v = normHex(hexIn.value); if (v) pick(v) })
  const dropper = el("button", { type: "button", className: "sw-tool", title: "Eyedropper: pick a colour from anywhere on screen", innerHTML: `<svg viewBox="0 0 16 16"><path d="M11.3 1.3a2 2 0 0 1 2.8 2.8l-1.6 1.6.7.7-1.4 1.4-.7-.7-5.6 5.6-2.4.6-.7.7-1-1 .7-.7.6-2.4 5.6-5.6-.7-.7 1.4-1.4.7.7z"/></svg>` })
  if (!("EyeDropper" in window)) { dropper.disabled = true; dropper.title = "The eyedropper works in Chrome and Edge" }
  dropper.onclick = async () => { try { const r = await new window.EyeDropper().open(); pick(normHex(r.sRGBHex) || hex) } catch {} }

  const tabs = el("div", { className: "sw-tabs" })
  const panes = el("div", { className: "sw-panes" })
  const tab = (label, pane) => {
    const t = el("button", { type: "button", textContent: label })
    t.onclick = () => { for (const x of tabs.children) x.classList.toggle("on", x === t); panes.replaceChildren(pane) }
    tabs.append(t)
    return t
  }

  // Swatches
  const swPane = el("div", { className: "sw-list" })
  const tile = (c) => {
    const t = el("button", { type: "button", className: "sw-tile", title: c })
    t.style.background = c
    t.onclick = () => { pick(c); rememberColour(c) }
    return t
  }
  const folder = (g, removable) => {
    const head = el("div", { className: "sw-folder" }, el("span", { textContent: g.name }))
    if (onInks) {
      const use = el("button", { type: "button", className: "sw-link", textContent: "Use as inks", title: "Replace the inks with this group" })
      use.onclick = () => onInks(g.colours.slice(0, 12))
      head.append(use)
    }
    if (removable) {
      const x = el("button", { type: "button", className: "sw-link", textContent: "Remove" })
      x.onclick = () => { brand.set(brand.get().filter((p) => p.name !== g.name)); fillSwatches() }
      head.append(x)
    }
    return el("div", { className: "sw-group" }, head, el("div", { className: "sw-tiles" }, ...g.colours.map(tile)))
  }
  const fileIn = el("input", { type: "file", accept: ".ase,.gpl,.json,.css,.txt", hidden: true })
  fileIn.onchange = async () => {
    for (const f of fileIn.files) {
      try {
        const added = await readPaletteFile(f)
        const names = new Set(added.map((p) => p.name))
        brand.set([...brand.get().filter((p) => !names.has(p.name)), ...added])
      } catch {}
    }
    fileIn.value = ""
    fillSwatches()
  }
  function fillSwatches() {
    const r = recent.get()
    const brands = brand.get()
    const load = el("button", { type: "button", className: "sw-link", textContent: "Load palette…", title: ".ase from Illustrator, Photoshop or InDesign; .gpl; .json; or a .css / .txt with hex codes" })
    load.onclick = () => fileIn.click()
    const save = inks ? el("button", { type: "button", className: "sw-link", textContent: "Save inks as palette" }) : null
    if (save) save.onclick = () => {
      const name = prompt("Name this palette", "Brand")
      if (name) { brand.set([...brand.get().filter((p) => p.name !== name), { name, colours: inks.slice() }]); fillSwatches() }
    }
    swPane.replaceChildren(...[
      r.length ? el("div", { className: "sw-group" }, el("div", { className: "sw-folder" }, el("span", { textContent: "Recent" })), el("div", { className: "sw-tiles" }, ...r.map(tile))) : null,
      el("div", { className: "sw-group sw-brand" }, el("div", { className: "sw-folder" }, el("span", { textContent: "Brand palettes" }), load, save)),
      ...brands.map((g) => folder(g, true)),
      ...GROUPS.map((g) => folder(g, false)),
      fileIn,
    ].filter(Boolean))
  }
  fillSwatches()

  // Mixer
  const mixer = el("div", { className: "sw-mixer" })
  const slider = (label, max, get, set) => {
    const r = el("input", { type: "range", min: 0, max, step: max > 100 ? 1 : 0.5 })
    const n = el("input", { type: "number", min: 0, max, className: "readout" })
    r.oninput = () => { set(+r.value); n.value = Math.round(+r.value) }
    const fill = () => r.style.setProperty("--p", `${(+r.value / max) * 100}%`)
    n.onchange = () => set(+n.value)
    mixer.append(el("label", { className: "sw-row" }, el("span", { textContent: label }), r, n))
    return () => { r.value = get(); n.value = Math.round(get()); fill() }
  }
  const fromHsb = () => pick(rgbToHex(...hsbToRgb(h, s, b)), { keepHsb: true })
  const syncers = [
    slider("H", 360, () => h, (v) => { h = v; fromHsb() }),
    slider("S", 100, () => s * 100, (v) => { s = v / 100; fromHsb() }),
    slider("B", 100, () => b * 100, (v) => { b = v / 100; fromHsb() }),
  ]
  const fields = (labels, get, set) => {
    const inputs = labels.map((l) => el("input", { type: "number", className: "readout", "aria-label": l, title: l }))
    inputs.forEach((i) => { i.onchange = () => set(inputs.map((x) => +x.value)) })
    mixer.append(el("div", { className: "sw-row sw-fields" }, el("span", { textContent: labels.join("") }), el("span", { className: "sw-boxes" }, ...inputs)))
    return () => get().forEach((v, i) => { if (document.activeElement !== inputs[i]) inputs[i].value = Math.round(v) })
  }
  syncers.push(fields(["R", "G", "B"], () => hexToRgb(hex), (v) => pick(rgbToHex(...v))))
  syncers.push(fields(["C", "M", "Y", "K"], () => rgbToCmyk(...hexToRgb(hex)), (v) => pick(rgbToHex(...cmykToRgb(...v)))))
  mixer.append(el("p", { className: "sw-note", textContent: "CMYK here is a simple screen conversion, not a print proof." }))

  const first = tab("Swatches", swPane)
  tab("Mixer", mixer)

  function paint() {
    big.style.background = hex
    if (document.activeElement !== hexIn) hexIn.value = hex
    for (const f of syncers) f()
  }

  const pop = el("div", { className: "sw-pop", role: "dialog", "aria-label": "Colour" },
    el("div", { className: "sw-head" }, big, hexIn, dropper), tabs, panes)
  document.body.append(pop)
  first.click()
  paint()

  // Beside the anchor, kept on screen.
  const r = anchor.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight
  let x = r.left - pw - 10, y = r.top - 20
  if (x < 8) x = Math.min(innerWidth - pw - 8, r.left)
  if (x === r.left) y = r.bottom + 6
  pop.style.left = `${Math.max(8, x)}px`
  pop.style.top = `${Math.max(8, Math.min(innerHeight - ph - 8, y))}px`

  const away = (e) => { if (!pop.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) close() }
  const esc = (e) => { if (e.key === "Escape") close() }
  setTimeout(() => { addEventListener("pointerdown", away); addEventListener("keydown", esc) })
  open = { pop, away, esc, commit: () => rememberColour(hex) }
}

export function close() {
  if (!open) return
  open.commit()
  open.pop.remove()
  removeEventListener("pointerdown", open.away)
  removeEventListener("keydown", open.esc)
  open = null
}
