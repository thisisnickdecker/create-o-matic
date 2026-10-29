// Keyframes: resolving values over the loop, and the three ways the timeline maps onto it.
import { test } from "node:test"
import assert from "node:assert/strict"
import { manifest } from "../web/instruments/elastic/elastic.js"
import { defaults, sanitize } from "../web/packages/core/patch.js"
import { resolve, setKey, timelinePos, keyable } from "../web/packages/core/keys.js"

const withKeys = (keyMode, keys) => sanitize(manifest, { ...defaults(manifest), params: { ...defaults(manifest).params, keyMode }, keys })

test("boomerang plays there and back, so the loop always closes", () => {
  const p = withKeys("boomerang", { copier: [{ t: 0, v: 1 }, { t: 1, v: 0 }] })
  assert.equal(resolve(manifest, p, 0).copier, 1)
  assert.equal(resolve(manifest, p, 0.5).copier, 0)
  assert.ok(Math.abs(resolve(manifest, p, 0.999999).copier - 1) < 1e-6)
  assert.ok(Math.abs(resolve(manifest, p, 0.25).copier - 0.5) < 1e-9) // smooth ease, halfway
})

test("wrap eases from the last key back to the first across the loop point", () => {
  const p = withKeys("wrap", { amount: [{ t: 0.25, v: 0.2 }, { t: 0.75, v: 1 }] })
  assert.equal(resolve(manifest, p, 0.25).amount, 0.2)
  assert.equal(resolve(manifest, p, 0.75).amount, 1)
  assert.ok(Math.abs(resolve(manifest, p, 0).amount - 0.6) < 1e-9) // halfway round the seam
})

test("cycle holds the ends; hold and linear eases behave", () => {
  const p = withKeys("cycle", { ease: [{ t: 0.2, v: 1, ease: "hold" }, { t: 0.6, v: 3, ease: "linear" }, { t: 1, v: 5 }] })
  assert.equal(resolve(manifest, p, 0).ease, 1)
  assert.equal(resolve(manifest, p, 0.5).ease, 1)
  assert.ok(Math.abs(resolve(manifest, p, 0.8).ease - 4) < 1e-9)
})

test("colours mix, ints round, and only numbers and colours can be keyed", () => {
  const p = withKeys("cycle", { background: [{ t: 0, v: "#000000", ease: "linear" }, { t: 1, v: "#FFFFFF" }], rows: [{ t: 0, v: 2, ease: "linear" }, { t: 1, v: 5 }] })
  assert.equal(resolve(manifest, p, 0.5).background, "#808080")
  assert.equal(resolve(manifest, p, 0.5).rows, 4)
  const def = (k) => manifest.parameters.find((d) => d.key === k)
  assert.equal(keyable(def("content")), false)
  assert.equal(keyable(def("duration")), false)
  assert.equal(keyable(def("copier")), true)
})

test("sanitize drops keys on unknown or unanimatable settings; setKey replaces a key at the same time", () => {
  const p = withKeys("cycle", { nonsense: [{ t: 0, v: 1 }], content: [{ t: 0, v: "x" }], copier: [{ t: 2, v: 9 }] })
  assert.deepEqual(Object.keys(p.keys), ["copier"])
  assert.deepEqual(p.keys.copier[0], { t: 1, v: 1, ease: "smooth" })
  setKey(p, "copier", 1, 0.5)
  assert.equal(p.keys.copier.length, 1)
  assert.equal(p.keys.copier[0].v, 0.5)
  assert.equal(timelinePos("boomerang", 0.75), 0.5)
})
