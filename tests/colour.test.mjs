// The Colour lab: colour maths, palettes, and loops that close. Drawing needs a browser; see the manual.
import { test } from "node:test"
import assert from "node:assert/strict"
import { hexToOklch, oklchToHex, mix, mixHue, contrast, grade, inkOn } from "../web/packages/core/colour.js"
import { manifest, inksAt, scale, deal } from "../web/instruments/colour/colour.js"
import { writeAse, readPaletteFile } from "../web/packages/core/swatches.js"
import { sanitize } from "../web/packages/core/patch.js"
import { mulberry32 } from "../web/packages/core/rng.js"

const SAMPLES = ["#000000", "#FFFFFF", "#E4372B", "#0000FF", "#1E2A4A", "#F4D35E", "#7A746C"]

test("hex survives the trip through OKLCH and back", () => {
  for (const hex of SAMPLES) assert.equal(oklchToHex(hexToOklch(hex)), hex)
})

test("colours outside the screen's gamut come back in it, keeping lightness and hue", () => {
  const hex = oklchToHex([0.6, 0.4, 145]) // far more chroma than sRGB has at this green
  assert.match(hex, /^#[0-9A-F]{6}$/)
  const [L, , h] = hexToOklch(hex)
  assert.ok(Math.abs(L - 0.6) < 0.01 && Math.abs(h - 145) < 2)
})

test("contrast is WCAG's: black on white is 21:1, and grades follow its thresholds", () => {
  assert.equal(Math.round(contrast("#000000", "#FFFFFF")), 21)
  assert.equal(contrast("#E4372B", "#E4372B"), 1)
  assert.equal(grade(7), "AAA")
  assert.equal(grade(4.5), "AA")
  assert.equal(grade(3), "AA large")
  assert.equal(grade(2.9), "Fails")
  assert.equal(inkOn("#FFE800"), "#121211")
  assert.equal(inkOn("#1E2A4A"), "#FFFFFF")
})

test("mixes start and end on their colours; the hue mix stays vivid on the way", () => {
  assert.equal(mix("#E4372B", "#0000FF", 0), "#E4372B")
  assert.equal(mix("#E4372B", "#0000FF", 1), "#0000FF")
  const lab = hexToOklch(mix("#FF48B0", "#FFE800", 0.5))[1], lch = hexToOklch(mixHue("#FF48B0", "#FFE800", 0.5))[1]
  assert.ok(lch > lab, `chroma ${lch} should beat ${lab}`)
})

test("every motion gives the same inks at the end of the loop as at the start", () => {
  for (const motion of ["none", "swing", "lights", "carousel"]) {
    const p = sanitize(manifest, { params: { motion, beats: 2, stagger: 0.3 } }).params
    assert.deepEqual(inksAt(p, 1), inksAt(p, 0), motion)
  }
})

test("tints and shades run light to dark, with the ink itself on its nearest step", () => {
  const { own, colours } = scale("#E4372B", 9)
  assert.equal(colours.length, 9)
  assert.equal(colours[own], "#E4372B")
  const L = colours.map((c) => hexToOklch(c)[0])
  for (let i = 1; i < L.length; i++) assert.ok(L[i] < L[i - 1])
})

test("Vary's palettes are the same for the same seed, and the right size", () => {
  for (const harmony of manifest.parameters.find((d) => d.key === "harmony").options.map(([v]) => v)) {
    const a = deal(harmony, 5, mulberry32(42)), b = deal(harmony, 5, mulberry32(42))
    assert.deepEqual(a, b, harmony)
    assert.equal(a.length, 5)
    for (const c of a) assert.match(c, /^#[0-9A-F]{6}$/)
  }
  assert.equal(new Set(deal("print", 8, mulberry32(1))).size, 8)
})

test("an .ase written here reads back as the same swatches", async () => {
  const inks = ["#1E2A4A", "#E4372B", "#F4D35E"]
  const file = new File([await writeAse("Test", inks).arrayBuffer()], "test.ase")
  const [group] = await readPaletteFile(file)
  assert.equal(group.name, "Test")
  assert.deepEqual(group.colours, inks)
})
