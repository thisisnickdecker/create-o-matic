// The parts every page shares: the wordmark, the colour knob, highlighted words, copyable code and
// the small-screen menu.
//   <a class="home" data-wordmark></a>     the wordmark, a solid colour per letter
//   <div class="knob" data-knob></div>     turns through the palettes; remembered per browser
//   <span data-colourful>type</span>       letters coloured from the current palette
// The current palette's first colour is the accent (--accent) everywhere.
import { WORDMARK, WORDMARK_BOX, PALETTES } from "./brand.js"

const KEY = "createomatic.palette"
const DETENT = 360 / PALETTES.length
const root = document.documentElement
const store = {
  get() { try { return Number(localStorage.getItem(KEY)) || 0 } catch { return 0 } },
  set(v) { try { localStorage.setItem(KEY, String(v)) } catch {} },
}

function wordmark(host) {
  host.insertAdjacentHTML("beforeend",
    `<svg class="wordmark" viewBox="0 0 ${WORDMARK_BOX.join(" ")}" role="img" aria-label="create-o-matic">
      ${WORDMARK.map((d) => `<path d="${d}"/>`).join("")}
    </svg>`)
}

function colourful(el) {
  const text = el.textContent
  el.setAttribute("aria-label", text)
  el.replaceChildren(...[...text].map((ch) => {
    const s = document.createElement("span")
    s.textContent = ch
    s.setAttribute("aria-hidden", "true")
    return s
  }))
}

// On a dark panel, a colour too dark to read gives way to white.
const luminance = (hex) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
const onDark = (el, c) => (el.closest(".panel") && luminance(c) < 0.3 ? "#FFFFFF" : c)

// Paint everything in palette i.
function paint(i) {
  const { name, colours } = PALETTES[i]
  root.style.setProperty("--accent", colours[0])
  root.style.setProperty("--h", i * DETENT)
  for (const svg of document.querySelectorAll(".wordmark")) {
    svg.querySelectorAll("path").forEach((p, n) => { p.style.fill = colours[n % colours.length] })
  }
  for (const el of document.querySelectorAll("[data-colourful]")) {
    let n = 0
    for (const s of el.children) if (s.textContent.trim()) s.style.color = onDark(el, colours[n++ % colours.length])
  }
  for (const d of document.querySelectorAll(".knob-dial")) { d.setAttribute("aria-valuenow", i); d.setAttribute("aria-valuetext", name) }
  for (const o of document.querySelectorAll(".knob-read output")) o.textContent = name
}

let current = 0
function select(i) {
  current = ((Math.round(i) % PALETTES.length) + PALETTES.length) % PALETTES.length
  store.set(current)
  paint(current)
}

function knob(host) {
  host.innerHTML = `<button class="knob-dial" type="button" role="slider" aria-label="Colour palette" aria-valuemin="0" aria-valuemax="${PALETTES.length - 1}"><span class="pointer"></span></button>
    <span class="knob-read">Colour<output></output></span>`
  const dial = host.querySelector(".knob-dial")
  // Turn it by dragging around its centre, like a real dial; it clicks between palettes.
  dial.addEventListener("pointerdown", (e) => {
    dial.setPointerCapture(e.pointerId)
    const r = dial.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2
    const angle = (ev) => (Math.atan2(ev.clientX - cx, cy - ev.clientY) * 180) / Math.PI
    let last = angle(e), deg = current * DETENT, moved = false
    const move = (ev) => {
      let d = angle(ev) - last
      if (d > 180) d -= 360
      if (d < -180) d += 360
      last += d; deg += d
      if (Math.abs(d) > 0.5) moved = true
      const i = Math.round(deg / DETENT)
      if (i !== current) select(i)
    }
    const up = () => {
      dial.removeEventListener("pointermove", move)
      dial.removeEventListener("pointerup", up)
      if (!moved) select(current + 1) // a click turns it one detent
    }
    dial.addEventListener("pointermove", move)
    dial.addEventListener("pointerup", up)
  })
  dial.addEventListener("keydown", (e) => {
    const d = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[e.key]
    if (d === undefined) return
    e.preventDefault()
    select(current + d)
  })
}

// Code blocks get a copy button.
function copyable(pre) {
  const btn = Object.assign(document.createElement("button"), { type: "button", className: "copy", textContent: "Copy" })
  btn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(pre.innerText.replace(/\n$/, ""))
      btn.textContent = "Copied"
    } catch { btn.textContent = "Select and copy" }
    setTimeout(() => { btn.textContent = "Copy" }, 1600)
  })
  const wrap = Object.assign(document.createElement("div"), { className: "code" })
  pre.replaceWith(wrap)
  wrap.append(pre, btn)
}

for (const el of document.querySelectorAll("[data-wordmark]")) wordmark(el)
for (const el of document.querySelectorAll("[data-colourful]")) colourful(el)
for (const el of document.querySelectorAll("[data-knob]")) knob(el)
for (const el of document.querySelectorAll("pre")) copyable(el)
select(store.get())

const masthead = document.querySelector(".masthead")
masthead?.querySelector(".menu-toggle")?.addEventListener("click", (e) => {
  const open = masthead.classList.toggle("open")
  e.currentTarget.setAttribute("aria-expanded", String(open))
  e.currentTarget.textContent = open ? "Close" : "Menu"
})
