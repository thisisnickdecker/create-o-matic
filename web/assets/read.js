// The Site reader: asks /api/read about a website and lays out what came back as a board (share
// image, colours, type, headlines, how it's built), then turns it into patches for the instruments,
// so the colours and type open ready to make with.
import { toHash } from "/packages/core/patch.js"
import { openCatalogue, ensureFont } from "/packages/core/fonts.js"

const form = document.querySelector("[data-form]"), input = form.url
const note = document.querySelector("[data-note]"), out = document.querySelector("[data-result]")
const el = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); n.append(...kids.filter((k) => k != null && k !== false)); return n }

// Colours, lightest and darkest first, for paper and ink.
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const light = (h) => { const [r, g, b] = rgb(h); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
const sat = (h) => { const c = rgb(h); return (Math.max(...c) - Math.min(...c)) / 255 }
const inkOn = (h) => (light(h) > 140 ? "#121211" : "#FFFFFF")

// A face from the reading, as an instrument names it: from the open library when it's there;
// otherwise as an installed font, which shows on machines that have it.
let catalogue = []
openCatalogue().then((list) => { catalogue = list })
const face = (family) => {
  const hit = catalogue.find((e) => e.family.toLowerCase() === family.toLowerCase())
  return hit ? { family: hit.family, source: "open" } : { family, source: "system" }
}

function patches(d) {
  const cols = d.colours.length ? d.colours : ["#FFFFFF", "#121211"]
  const byLight = [...cols].sort((a, b) => light(b) - light(a))
  const paper = byLight[0], ink = byLight.at(-1), accent = cols.find((c) => sat(c) > 0.25) ?? cols[2] ?? ink
  const [head, body] = [face(d.type[0] ?? "Inter Tight"), face(d.type[1] ?? d.type[0] ?? "Inter Tight")]
  const name = d.siteName || d.title.split(/\s[|·—–-]\s/)[0] || d.host
  const tagline = (d.description || "").split(/(?<=\.)\s/)[0].slice(0, 90)
  return {
    brand: { instrument: "brand", params: { brandName: name, tagline, inks: cols, background: paper, faces: [{ role: "headline", font: head.family, fontSource: head.source }, { role: "body", font: body.family, fontSource: body.source }] } },
    carousel: { instrument: "carousel", params: { system: "editorial", ground: paper, ink, accent, display: head.family, displaySource: head.source, body: body.family, bodySource: body.source, kicker: name, footer: d.host, text: [d.h1[0] || d.title, ...d.h2.slice(0, 4), "-> " + d.host].filter(Boolean).join("\n\n") } },
    colour: { instrument: "colour", params: { inks: cols.slice(0, 12) } },
    type: { instrument: "type", params: { rows: d.type.slice(0, 4).map((f) => { const x = face(f); return { text: d.h1[0] || d.title || f, font: x.family, fontSource: x.source } }) } },
  }
}

function board(d) {
  const facts = [
    ["Built with", d.stack.join(", ")], ["Hosting", d.hosting.join(", ")], ["DNS", d.dns], ["Email", d.email],
    ["Tools", d.tools.join(", ")], ["Type from", d.fontSources.join(", ")],
    ["Open to AI", d.agents.llmsTxt ? "Has llms.txt" + (d.agents.blocksAI.length ? `, but blocks ${d.agents.blocksAI.join(", ")}` : ", lets AI crawlers in") : d.agents.blocksAI.length ? `Blocks ${d.agents.blocksAI.join(", ")}` : "No llms.txt; crawlers allowed"],
  ].filter(([, v]) => v)
  const copyNote = el("p", { className: "reader-copied" })
  const swatches = el("div", { className: "reader-swatches" }, ...d.colours.map((c) => {
    const b = el("button", { type: "button", className: "reader-swatch", title: `Copy ${c}` }, el("span", { className: "chip" }), el("span", { textContent: c }))
    b.querySelector(".chip").style.background = c
    b.onclick = async () => { try { await navigator.clipboard.writeText(c); copyNote.textContent = `Copied ${c}.` } catch {} }
    return b
  }))
  const typeList = el("div", { className: "reader-type" }, ...(d.type.length ? d.type : ["No webfonts named"]).map((f) => {
    const x = face(f), spec = el("span", { className: "spec", textContent: "Aa" }), row = el("div", {}, spec, el("span", { className: "name", textContent: f }), el("span", { className: "src", textContent: x.source === "open" ? "In the font library" : d.fontSources.includes("Adobe Fonts") ? "Adobe Fonts: add it to your project" : "Not in the open library" }))
    if (x.source === "open") ensureFont({ source: "open", family: x.family, weights: [400], sample: "Aa" }).then(() => { spec.style.fontFamily = `"${x.family}"` })
    return row
  }))
  const p = patches(d)
  const make = el("div", { className: "reader-make" },
    ...[["/brand/", p.brand, "Brand kit", "Logo, palette and faces, on the Brand bench"], ["/carousel/", p.carousel, "Carousel", "Its colours and type, its headlines as slides"], ["/colour/", p.colour, "Palette", "Every colour, studied in the Colour lab"], ["/type/", p.type, "Type specimen", "Its faces side by side in the Type tester"]]
      .map(([path, patch, label, hint]) => el("a", { className: "reader-door", href: `${path}#${toHash(patch)}` }, el("b", { textContent: label }), el("span", { textContent: hint }))))
  const image = d.image ? el("img", { src: d.image, alt: `${d.host}'s share image`, loading: "lazy", referrerPolicy: "no-referrer" }) : el("div", { className: "reader-noimage", textContent: "No share image" })
  if (d.image) image.onerror = () => image.replaceWith(el("div", { className: "reader-noimage", textContent: "The share image didn't load" }))
  return el("div", { className: "reader-board" },
    el("div", { className: "reader-card" },
      el("div", { className: "reader-image" }, image),
      el("div", { className: "reader-about" },
        el("p", { className: "reader-host" }, d.icon ? el("img", { src: d.icon, alt: "", width: 20, height: 20, referrerPolicy: "no-referrer", onerror() { this.remove() } }) : null, el("a", { href: d.url, textContent: d.host, target: "_blank", rel: "noopener" })),
        el("h2", { className: "h2", textContent: d.siteName || d.title || d.host }),
        d.description ? el("p", { className: "lead", textContent: d.description }) : null,
        d.blocked ? el("p", { className: "reader-warn", textContent: "This site showed a bot check or a gate, so this reads the gate, not the site." }) : null)),
    el("div", { className: "reader-cols" },
      el("div", {}, el("h3", { textContent: "Colours" }), swatches, copyNote),
      el("div", {}, el("h3", { textContent: "Type" }), typeList)),
    d.h1.length || d.h2.length ? el("div", { className: "reader-heads" }, el("h3", { textContent: "Headlines" }), ...[...d.h1, ...d.h2].slice(0, 6).map((h) => el("p", { textContent: h }))) : null,
    el("dl", { className: "reader-facts" }, ...facts.flatMap(([k, v]) => [el("dt", { textContent: k }), el("dd", { textContent: v })]),
      ...(d.socials.length ? [el("dt", { textContent: "Elsewhere" }), el("dd", {}, ...d.socials.flatMap((s, i) => [i ? ", " : "", el("a", { href: s.url, textContent: s.label, target: "_blank", rel: "noopener" })]))] : [])),
    el("div", { className: "reader-makewith" }, el("h3", { textContent: "Make with it" }), make),
  )
}

async function run(url) {
  url = url.trim()
  if (!url) return
  note.textContent = `Reading ${url.replace(/^https?:\/\//, "")}…`
  note.classList.remove("warn")
  out.hidden = true
  history.replaceState(null, "", `?url=${encodeURIComponent(url)}`)
  try {
    const res = await fetch(`/api/read?url=${encodeURIComponent(url)}`), d = await res.json()
    if (!res.ok || d.error) throw new Error(d.error || `The reader answered ${res.status}.`)
    out.replaceChildren(board(d))
    out.hidden = false
    note.textContent = ""
    out.scrollIntoView({ behavior: "smooth", block: "start" })
  } catch (e) {
    note.textContent = /Failed to fetch|Unexpected token/.test(e.message) ? "The reader isn't reachable from here. It runs on createomatic.xyz." : e.message
    note.classList.add("warn")
  }
}

form.addEventListener("submit", (e) => { e.preventDefault(); run(input.value) })
for (const b of document.querySelectorAll("[data-try]")) b.onclick = () => { input.value = b.textContent; run(b.textContent) }
const start = new URLSearchParams(location.search).get("url")
if (start) { input.value = start; run(start) }
