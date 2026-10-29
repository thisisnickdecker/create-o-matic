// The Brand bench: faces by role, the kit's files, colour names and the zip writer. Drawing the
// board needs a browser; see the manual.
import { test } from "node:test"
import assert from "node:assert/strict"
import { manifest, face, displayName } from "../web/instruments/brand/brand.js"
import { tokens, css, brandMd, readable } from "../web/instruments/brand/kit.js"
import { colourName } from "../web/packages/core/colour.js"
import { crc32, zip } from "../web/packages/core/zip.js"
import { sanitize } from "../web/packages/core/patch.js"

const brand = (params = {}) => sanitize(manifest, { params: { inks: ["#E93D4C", "#121211"], background: "#F4F4F1", ...params } })

test("a role without its own face borrows the nearest one", () => {
  const p = brand({ faces: [{ role: "headline", font: "Fraunces", weight: 800 }, { role: "body", font: "Inter", weight: 400 }] }).params
  assert.equal(face(p, "caption").font, "Inter")
  assert.equal(face(p, "subhead").font, "Fraunces")
})

test("Adobe's CSS names read as words; other names are left alone", () => {
  assert.equal(displayName("neue-haas-grotesk-display"), "Neue Haas Grotesk Display")
  assert.equal(displayName("Inter Tight"), "Inter Tight")
})

test("tokens are W3C design tokens: every colour and face, typed", () => {
  const t = JSON.parse(tokens(brand()))
  assert.equal(t.color.paper.$value, "#F4F4F1")
  assert.equal(t.color["ink-1"].$type, "color")
  assert.equal(t.fontFamily.headline.$type, "fontFamily")
  assert.equal(t.typography.body.$value.fontWeight, "{fontWeight.body}")
})

test("the CSS has a property for each ink, and imports open fonts from Fontsource", () => {
  const out = css(brand({ brandName: "Night Shift" }))
  assert.match(out, /--night-shift-ink-2: #121211;/)
  assert.match(out, /@import url\("https:\/\/cdn\.jsdelivr\.net\/npm\/@fontsource\/inter-tight@latest\/700\.css"\);/)
})

test("readable pairs pass AA and are listed once each", () => {
  const pairs = readable(brand().params)
  assert.ok(pairs.every((x) => x.ratio >= 4.5))
  assert.equal(new Set(pairs.map((x) => [x.a, x.b].sort().join())).size, pairs.length)
})

test("BRAND.md names every ink and every face", () => {
  const md = brandMd(brand())
  assert.match(md, /\| Ink 1 \| `#E93D4C` \| red \|/)
  assert.match(md, /\| Headline \| Inter Tight \| 700 \|/)
})

test("colours get plain names", () => {
  assert.equal(colourName("#0000FF"), "blue")
  assert.equal(colourName("#1E2A4A"), "deep blue")
  assert.equal(colourName("#F4F4F1"), "off-white")
  assert.equal(colourName("#FFE800"), "bright yellow")
})

test("the zip writer: the standard CRC, and a valid archive layout", async () => {
  assert.equal(crc32(new TextEncoder().encode("hello")), 0x3610a686)
  const bytes = new Uint8Array(await (await zip([{ name: "a.txt", data: "hi" }])).arrayBuffer())
  const v = new DataView(bytes.buffer)
  assert.equal(v.getUint32(0, true), 0x04034b50)
  assert.equal(v.getUint32(bytes.length - 22, true), 0x06054b50)
  assert.equal(v.getUint16(bytes.length - 12, true), 1) // the end record counts one file
})
