// The font browser: one searchable list of every font the machine can reach, each name set in
// its own face. Sources: the open catalogue (Google + open source, via Fontsource), the Adobe
// kit, fonts installed on this computer, and My fonts (files you added: anything from Open
// Foundry, a type foundry, a client). Picking one sets the family and where it comes from.
//   openFontPicker({ anchor, current, kit, onPick(entry) })
import { openCatalogue, adobeFamilies, installedFamilies, myFamilies, addFontFile, previewFont } from "./fonts.js"

const el = (tag, attrs = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), attrs)
  for (const k of kids) if (k != null) n.append(k)
  return n
}

const FILTERS = [
  ["all", "All"], ["sans-serif", "Sans"], ["serif", "Serif"], ["display", "Display"], ["monospace", "Mono"], ["handwriting", "Script"],
  ["variable", "Variable"], ["file", "My fonts"], ["adobe", "Adobe kit"], ["system", "Installed"],
]
const PAGE = 80
let open = null
let lastFilter = "all"

export function openFontPicker({ anchor, current, kit, onPick }) {
  close()
  let filter = lastFilter, query = "", shown = PAGE, active = -1
  let lists = { open: [], adobe: [], system: null, file: [] }

  const search = el("input", { type: "search", className: "fp-search", placeholder: "Search 2,000+ families · ↑↓ to try them", spellcheck: false, "aria-label": "Search fonts" })
  const chips = el("div", { className: "fp-chips" }, ...FILTERS.map(([id, label]) => {
    const b = el("button", { type: "button", textContent: label })
    b.dataset.id = id
    b.onclick = () => { filter = lastFilter = id; shown = PAGE; active = -1; if (id === "system" && !lists.system) loadInstalled(); draw() }
    return b
  }))
  const list = el("div", { className: "fp-list", role: "listbox" })
  const status = el("p", { className: "fp-status" })
  const fileIn = el("input", { type: "file", accept: ".otf,.ttf,.woff,.woff2", multiple: true, hidden: true })
  const add = el("button", { type: "button", className: "btn", textContent: "Add font files…" })
  add.onclick = () => fileIn.click()
  fileIn.onchange = async () => {
    for (const f of fileIn.files) { try { await addFontFile(f) } catch {} }
    fileIn.value = ""
    lists.file = await myFamilies()
    filter = lastFilter = "file"
    draw()
  }
  const foot = el("div", { className: "fp-foot" }, add, el("span", { className: "fp-hint", textContent: "Fonts from Open Foundry or any foundry: download, then add the files. They stay in this browser." }), fileIn)

  const pop = el("div", { className: "fp-pop", role: "dialog", "aria-label": "Fonts" }, search, chips, list, status, foot)
  document.body.append(pop)
  search.focus()
  search.addEventListener("input", () => { query = search.value.trim().toLowerCase(); shown = PAGE; active = -1; draw() })

  // Arrow keys step through the list, trying each font as they go (the stage follows); Enter or
  // Escape keeps the one you're on. Typing still goes to the search.
  pop.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && active >= 0) { e.preventDefault(); close(); return }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return
    e.preventDefault()
    let rows = [...list.querySelectorAll(".fp-row")]
    if (!rows.length) return
    if (active < 0) active = reveal()
    rows = [...list.querySelectorAll(".fp-row")]
    active = Math.max(0, Math.min(rows.length - 1, active + (e.key === "ArrowDown" ? 1 : -1)))
    if (active >= rows.length - 2 && entries().length > shown) { shown += PAGE; draw(); rows = [...list.querySelectorAll(".fp-row")] }
    const entry = rows[active]._entry
    current = { family: entry.family, source: entry.source }
    rows.forEach((r, i) => r.classList.toggle("on", i === active))
    rows[active].scrollIntoView({ block: "nearest" })
    onPick(entry)
  })

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue
      io.unobserve(e.target)
      if (e.target.classList.contains("fp-more")) { shown += PAGE; draw(); continue }
      previewFont(e.target._entry).then((face) => { if (face) e.target.querySelector(".fp-name").style.fontFamily = `"${face}", sans-serif` })
    }
  }, { root: list })

  async function loadInstalled() {
    status.textContent = "Asking to see installed fonts…"
    lists.system = await installedFamilies()
    if (lists.system === null) status.textContent = "This browser can't list installed fonts (Chrome and Edge can). Type the name in the Family field instead."
    draw()
  }

  function entries() {
    let all
    if (filter === "file") all = lists.file
    else if (filter === "adobe") all = lists.adobe
    else if (filter === "system") all = lists.system || []
    else {
      all = [...lists.file, ...lists.adobe, ...lists.open]
      if (filter === "variable") all = all.filter((e) => e.variable)
      else if (filter !== "all") all = all.filter((e) => e.category === filter)
    }
    return query ? all.filter((e) => e.family.toLowerCase().includes(query)) : all
  }

  function draw() {
    for (const c of chips.children) c.classList.toggle("on", c.dataset.id === filter)
    const all = entries()
    io.disconnect()
    list.replaceChildren(...all.slice(0, shown).map((e) => {
      const row = el("button", { type: "button", className: "fp-row", role: "option" },
        el("span", { className: "fp-name", textContent: e.family }),
        el("span", { className: "fp-meta", textContent: [e.variable ? "variable" : null, e.source === "open" ? (e.google ? "Google" : "open source") : { adobe: "Adobe kit", system: "installed", file: "my font" }[e.source]].filter(Boolean).join(" · ") }))
      row._entry = e
      if (e.family === current?.family && e.source === current?.source) row.classList.add("on")
      row.onclick = () => { onPick(e); close() }
      io.observe(row)
      return row
    }))
    if (all.length > shown) { const more = el("div", { className: "fp-more", textContent: "More…" }); list.append(more); io.observe(more) }
    if (!(filter === "system" && lists.system === null)) status.textContent = all.length ? `${all.length.toLocaleString()} families` : lists.open.length ? "Nothing matches." : "Loading the catalogue…"
  }

  // The current font's place in the list, drawing far enough down to include it. -1 if it isn't there.
  function reveal() {
    const at = entries().findIndex((e) => e.family === current?.family && e.source === current?.source)
    if (at >= shown) { shown = at + PAGE; draw() }
    return at
  }

  const r = anchor.getBoundingClientRect(), pw = pop.offsetWidth
  pop.style.left = `${Math.max(8, Math.min(innerWidth - pw - 8, r.left - pw - 10 > 8 ? r.left - pw - 10 : r.left))}px`
  pop.style.top = `${Math.max(8, Math.min(innerHeight - pop.offsetHeight - 8, r.top - 40))}px`

  const away = (e) => { if (!pop.contains(e.target) && !anchor.contains(e.target)) close() }
  const esc = (e) => { if (e.key === "Escape") close() }
  setTimeout(() => { addEventListener("pointerdown", away); addEventListener("keydown", esc) })
  open = { pop, away, esc, io }

  draw()
  Promise.all([openCatalogue(), adobeFamilies(kit), myFamilies()]).then(([o, a, f]) => {
    if (!open || open.pop !== pop) return
    lists = { ...lists, open: o, adobe: a, file: f }
    draw()
    // Open at the font in use, so the arrows carry on from it.
    if (reveal() >= 0) list.querySelector(".fp-row.on")?.scrollIntoView({ block: "center" })
  })
}

export function close() {
  if (!open) return
  open.io.disconnect()
  open.pop.remove()
  removeEventListener("pointerdown", open.away)
  removeEventListener("keydown", open.esc)
  open = null
}
