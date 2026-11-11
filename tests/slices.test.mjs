// The Slices effect's grid and timing: drawing needs a browser; the layout doesn't.
import { test } from "node:test"
import assert from "node:assert/strict"
import slices, { sliceEdges, sliceLayout, sliceAmount, waveAt } from "../web/packages/core/effects/slices.js"

const defaults = Object.fromEntries(slices.params.map((d) => [d.key, d.default]))
const near = (a, b) => Math.abs(a - b) < 1e-6

test("slice edges cover the frame exactly, and swell widens the middle", () => {
  assert.deepEqual(sliceEdges(10, 1000, 0), [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000])
  const swollen = sliceEdges(9, 1080, 3)
  assert.equal(swollen[0], 0)
  assert.equal(swollen.at(-1), 1080)
  assert.ok(swollen[5] - swollen[4] > 3 * (swollen[1] - swollen[0]))
})

test("at nothing, every slice shows its own piece, in its own place, at its own size", () => {
  const p = { ...defaults, slices: 1, slicePlay: 1, sliceRepeat: 1, sliceTwist: 20, sliceScatter: 1 }
  for (const s of sliceLayout(1100, 900, p, { t: 0, seed: 7 })) {
    assert.equal(s.bar, false)
    assert.ok(near(s.cx, s.x + s.w / 2) && near(s.cy, s.y + s.h / 2) && near(s.dw, s.w) && near(s.dh, s.h))
    assert.ok(Math.abs(s.sx - s.x) < 1 && Math.abs(s.sw - s.w) < 1 && Math.abs(s.sy - s.y) < 1 && Math.abs(s.sh - s.h) < 1)
    assert.equal(s.angle, 0)
  }
})

test("Play takes it apart and back a whole number of times per loop", () => {
  const p = { ...defaults, slices: 0.8, slicePlay: 2 }
  assert.ok(near(sliceAmount(p, 0), 0) && near(sliceAmount(p, 0.5), 0) && near(sliceAmount(p, 1), 0))
  assert.ok(near(sliceAmount(p, 0.25), 0.8))
  assert.equal(sliceAmount({ ...p, slicePlay: 0 }, 0.3), 0.8)
})

test("the zoom wave is gone at both ends of the loop, both ways", () => {
  for (const back of [false, true]) {
    const p = { ...defaults, sliceWaves: 1, sliceWaveBack: back, sliceWaveWidth: 0.4 }
    for (const along of [0, 0.3, 1]) assert.ok(near(waveAt(p, 0, along), 0) && near(waveAt(p, 1, along), 0))
    assert.ok(waveAt(p, back ? 0.25 : 0.5, 0.5) > 0.5)
  }
})

test("with Repeat, every slice shows the whole picture; the centre slices lie on top", () => {
  const p = { ...defaults, slices: 1, slicePlay: 0, sliceRepeat: 1, sliceZoom: 1, sliceWave: 0, sliceCols: 4, sliceRows: 4 }
  const all = sliceLayout(1000, 1000, p, { t: 0.5, seed: 1 })
  for (const s of all) assert.ok(near(s.sw, 1000) && near(s.sh, 1000))
  assert.ok(all.at(-1).scale > all[0].scale)
})

test("the same seed gives the same slices, every piece is read from inside the frame, and the loop closes", () => {
  const p = { ...defaults, slices: 1, sliceScatter: 2, sliceZoom: 0.5, sliceRepeat: 0.5, sliceWave: 3, sliceWaves: 2, sliceBars: 0.3 }
  const a = sliceLayout(1080, 1350, p, { t: 0.2, seed: 11 })
  assert.deepEqual(a, sliceLayout(1080, 1350, p, { t: 0.2, seed: 11 }))
  assert.notDeepEqual(a, sliceLayout(1080, 1350, p, { t: 0.2, seed: 12 }))
  for (const s of a) assert.ok(s.sx >= 0 && s.sy >= 0 && s.sx + s.sw <= 1080 + 1e-9 && s.sy + s.sh <= 1350 + 1e-9)
  assert.deepEqual(sliceLayout(1080, 1350, p, { t: 0, seed: 11 }), sliceLayout(1080, 1350, p, { t: 1, seed: 11 }))
})

test("cut over just the picture, the slices stay inside it", () => {
  const p = { ...defaults, slices: 1, slicePlay: 0, sliceScatter: 2, sliceRepeat: 0.6, sliceWave: 3 }
  const area = { x: 200, y: 150, w: 600, h: 900 }
  for (const s of sliceLayout(1000, 1200, p, { t: 0.3, seed: 5 }, area)) {
    assert.ok(s.sx >= 200 && s.sy >= 150 && s.sx + s.sw <= 800 + 1e-9 && s.sy + s.sh <= 1050 + 1e-9)
    assert.ok(s.x >= 200 && s.x + s.w <= 800 && s.y >= 150 && s.y + s.h <= 1050)
  }
})
