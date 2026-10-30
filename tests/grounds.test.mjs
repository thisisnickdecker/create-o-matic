// The ground under ASCII and Dot matrix: what gets painted, and what counts as standing out.
import { test } from "node:test"
import assert from "node:assert/strict"
import { groundOf, standout } from "../web/packages/core/effects/util.js"

test("the frame's own ground follows the background, and is nothing on a see-through frame", () => {
  assert.equal(groundOf("frame", "#000000", { background: "#1530FF" }), "#1530FF")
  assert.equal(groundOf("frame", "#000000", { background: "#1530FF", clear: true }), null)
  assert.equal(groundOf("own", "#0B0B0A", { background: "#1530FF" }), "#0B0B0A")
  assert.equal(groundOf("clear", "#0B0B0A", { background: "#1530FF" }), null)
})

test("on the frame's ground, any ink stands out from any background; the background itself doesn't", () => {
  const on = standout("frame", "#000000", { background: "#1530FF" })
  assert.equal(on(21, 48, 255, 255), 0)
  assert.ok(on(18, 18, 17, 255) > 0.7) // black type on blue, which brightness alone would lose
  assert.ok(on(255, 255, 255, 255) > 0.9)
  assert.equal(on(255, 255, 255, 0), 0) // nothing there
})

test("on a see-through frame, standing out is simply being there", () => {
  const on = standout("frame", "#000000", { background: "#F4F4F1", clear: true })
  assert.equal(on(244, 244, 241, 255), 1)
  assert.equal(on(0, 0, 0, 0), 0)
})
