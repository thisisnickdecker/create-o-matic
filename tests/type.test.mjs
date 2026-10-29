// The Type tester's rows and fonts. Setting type needs a browser; see the manual.
import { test } from "node:test"
import assert from "node:assert/strict"
import { manifest, fontRequests } from "../web/instruments/type/type.js"
import { defaults, sanitize, newListItem } from "../web/packages/core/patch.js"

const rowsDef = manifest.parameters.find((d) => d.key === "rows")

test("rows are sanitised: defaults filled, values clamped, unknown settings dropped", () => {
  const p = sanitize(manifest, { params: { rows: [{ text: "Hi", font: "Fraunces", size: 9999, weight: 2, nonsense: true }, "not a row"] } })
  const [a, b] = p.params.rows
  assert.equal(a.size, 800)
  assert.equal(a.weight, 100)
  assert.equal(a.fontSource, "open")
  assert.equal("nonsense" in a, false)
  assert.equal(b.text, rowsDef.item.find((f) => f.key === "text").default)
  assert.ok(a.id && b.id && a.id !== b.id)
})

test("a new row copies the one it's made from, with its own id", () => {
  const from = sanitize(manifest, defaults(manifest)).params.rows[1]
  const row = newListItem(rowsDef, from)
  assert.equal(row.font, from.font)
  assert.notEqual(row.id, from.id)
})

test("font requests cover the weights a sweep reaches, and the characters used", () => {
  const p = sanitize(manifest, { params: { motion: "weight", motionAmount: 0.5, rows: [{ text: "abc", font: "Inter", weight: 400, case: "upper" }] } })
  const [req] = fontRequests(p)
  assert.deepEqual(req.weights.sort((x, y) => x - y), [200, 400, 600])
  assert.equal(req.sample, "ABC")
})
