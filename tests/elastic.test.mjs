// The parts of Elastic that need no browser: patches and layout. Run: npm run check
// Pixel checks (export matches preview, first frame equals the loop's end) need a real canvas
// and are described in instruments/elastic/README.md under "How it was checked".
import { test } from "node:test"
import assert from "node:assert/strict"
import { manifest, layout, size, frameCount, slots } from "../web/instruments/elastic/elastic.js"
import { defaults, sanitize, toHash } from "../web/packages/core/patch.js"
import { readFile } from "node:fs/promises"

const presetFiles = JSON.parse(await readFile(new URL("../web/instruments/elastic/presets/index.json", import.meta.url)))
const presets = await Promise.all(presetFiles.map(async (f) => JSON.parse(await readFile(new URL(`../web/instruments/elastic/presets/${f}`, import.meta.url)))))

test("sanitize fills defaults, clamps ranges and drops unknown keys", () => {
  const p = sanitize(manifest, { seed: 7, params: { rows: 999, wave: "triangle", nonsense: 1, palette: ["#abc123", "red"] } })
  assert.equal(p.seed, 7)
  assert.equal(p.params.rows, 64)
  assert.equal(p.params.wave, defaults(manifest).params.wave)
  assert.equal("nonsense" in p.params, false)
  assert.deepEqual(p.params.palette, ["#ABC123"])
})

test("every preset survives sanitize unchanged", () => {
  for (const preset of presets) {
    const p = sanitize(manifest, preset)
    for (const [k, v] of Object.entries(preset.params)) assert.deepEqual(p.params[k], typeof v === "string" && v.startsWith("#") ? v.toUpperCase() : v, `${preset.name}: ${k}`)
  }
})

for (const preset of presets) {
  const patch = sanitize(manifest, preset)
  const p = patch.params
  const { w: W, h: H } = size(patch)

  test(`${preset.name}: cells tile the frame exactly`, () => {
    for (const t of [0, 0.13, 0.5, 0.87]) {
      const cells = layout(p, patch.seed, t, W, H)
      if (p.layout === "grid") assert.equal(cells.length, p.rows * p.columns)
      const area = cells.reduce((a, c) => a + c.w * c.h, 0)
      const inner = (W - 2 * p.margin) * (H - 2 * p.margin)
      // Gaps take their share; with no gap the cells cover the inner frame to the pixel.
      if (p.gap === 0) assert.ok(Math.abs(area - inner) / inner < 1e-9, `area ${area} vs ${inner}`)
      for (const c of cells) assert.ok(c.w >= 0 && c.h >= 0 && c.x >= p.margin - 1e-6 && c.y >= p.margin - 1e-6)
    }
  })

  test(`${preset.name}: the loop closes`, () => {
    const a = layout(p, patch.seed, 0, W, H), b = layout(p, patch.seed, 1 - 1e-12, W, H)
    a.forEach((c, i) => assert.ok(Math.abs(c.h - b[i].h) < 1e-3 && Math.abs(c.w - b[i].w) < 1e-3))
  })
}

test("frame count, letters mode and URL hash", () => {
  const patch = defaults(manifest)
  assert.equal(frameCount(patch), 180)
  assert.deepEqual(slots({ ...patch.params, mode: "letters", content: "Hi there", case: "upper" }), ["H", "I", "T", "H", "E", "R", "E"])
  assert.match(toHash(patch), /^[A-Za-z0-9_-]+$/)
})

test("golden section: cuts tile the frame, and the first cut is 1/φ of the long side", () => {
  const p = { ...defaults(manifest).params, layout: "golden", goldenDepth: 9, goldenSwing: 0, gap: 0, margin: 0 }
  const W = 1000 * (1 + Math.sqrt(5)) / 2 // a golden rectangle
  const cells = layout(p, 1, 0.3, W, 1000)
  const area = cells.reduce((a, c) => a + c.w * c.h, 0)
  assert.ok(Math.abs(area - W * 1000) < 1e-6)
  assert.ok(Math.abs(cells[0].w / W - 0.618034) < 1e-5)
  assert.equal(cells[0].h, 1000)
  // From a golden rectangle, every cut is a square and every remainder stays golden.
  for (const c of cells.slice(0, -1)) assert.ok(Math.abs(c.w - c.h) < 1e-6, `${c.w} × ${c.h}`)
})

test("scramble: decoded once the beat passes its share, the same every time, and closed at the loop", async () => {
  const { scrambled } = await import("../web/instruments/elastic/elastic.js")
  const p = { scramble: 0.5, scrambleSet: "letters", scrambleSpread: 0, scrambleBeats: 1, scrambleRate: 24 }
  const c = { s: 1, k: 2, i: 3 }
  assert.equal(scrambled("DECODE", p, 7, c, 0.75), "DECODE")
  assert.notEqual(scrambled("DECODE", p, 7, c, 0.01), "DECODE")
  assert.equal(scrambled("DECODE", p, 7, c, 0.01), scrambled("DECODE", p, 7, c, 0.01))
  assert.equal(scrambled("DE CODE", p, 7, c, 0.01)[2], " ")
})

test("GIF delays add up to the loop's exact length, however the frame rate divides", async () => {
  const { gifDelays } = await import("../web/packages/core/export.js")
  for (const [frames, fps] of [[240, 30], [180, 24], [150, 25], [360, 60]]) {
    const d = gifDelays(frames, fps)
    assert.equal(d.reduce((a, b) => a + b, 0), Math.round((frames * 100) / fps))
    assert.ok(Math.max(...d) - Math.min(...d) <= 1)
  }
})
