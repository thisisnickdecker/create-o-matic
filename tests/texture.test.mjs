// The Texture lab's patches and its effect stack. Drawing needs a browser; see the manual.
import { test } from "node:test"
import assert from "node:assert/strict"
import { manifest, size, videoTime } from "../web/instruments/texture/texture.js"
import { defaults, sanitize } from "../web/packages/core/patch.js"
import { EFFECTS, newLayer } from "../web/packages/core/effects/index.js"

test("stack layers are sanitised: unknown effects dropped, values clamped, defaults filled", () => {
  const p = sanitize(manifest, { params: { layers: [
    { id: "a", effect: "riso", opacity: 3, blend: "glow", params: { riso: 9, risoInks: ["#0078BF", "nope"], unknown: 1 } },
    { id: "b", effect: "not-an-effect" },
    { effect: "grain" },
  ] } })
  const [riso, grain] = p.params.layers
  assert.equal(p.params.layers.length, 2)
  assert.equal(riso.opacity, 1)
  assert.equal(riso.blend, "source-over")
  assert.equal(riso.params.riso, 1)
  assert.deepEqual(riso.params.risoInks, ["#0078BF"])
  assert.equal("unknown" in riso.params, false)
  assert.equal(riso.params.risoShift, 6)
  assert.ok(grain.id && grain.on && grain.params.grainBoil === true)
})

test("every effect can start a layer that does something", () => {
  for (const e of EFFECTS) {
    const layer = newLayer(e.id)
    if (e.id === "overlay") assert.equal(e.active(layer.params), false) // needs your file first
    else assert.ok(e.active(layer.params), `${e.id} starts switched off`)
  }
})

test("the frame follows the source, and video time loops", () => {
  const p = defaults(manifest)
  p.params.sourceWidth = 3001; p.params.sourceHeight = 2000
  assert.deepEqual(size(p), { w: 3002, h: 2000 })
  p.params.format = "square"
  const { w, h } = size(p)
  assert.deepEqual({ w, h }, { w: 1080, h: 1080 })
  p.params.duration = 6; p.params.videoSpeed = 1
  assert.equal(videoTime(p, 0.5, 10), 3)
  assert.equal(videoTime(p, 0.5, 2), 1)
})
