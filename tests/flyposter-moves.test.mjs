// Flyposter: things moved by hand on the stage. Every part has a role that stays put when the post
// is composed again; a move (by layout and role) shifts, scales, turns or hides it, and nothing
// else moves with it. Drawing needs a browser; see the instrument's README.
import { test } from "node:test"
import assert from "node:assert/strict"
import { manifest, parts, scene } from "../web/instruments/flyposter/flyposter.js"
import { judge } from "../web/instruments/flyposter/score.js"
import { sanitize } from "../web/packages/core/patch.js"

const ruler = { font: "", letterSpacing: "0px", measureText(s) { const px = parseFloat(this.font.match(/(\d+(?:\.\d+)?)px/)[1]); return { width: [...s].length * 0.6 * px, actualBoundingBoxAscent: 0.72 * px } } }
const post = (params) => sanitize(manifest, { params: { brandName: "Bar Nove", headline: "Happy hour, 5 to 7", details: "Cocktails £6", where: "Bar Nove", cta: "Bring a friend", ...params } })
const find = (list, role) => list.find((x) => x.role === role)
const LAYOUTS = ["stack", "number", "ticker", "grid", "scatter", "poster", "badge"]

test("every layout's parts have roles, each once, and the same every time", () => {
  for (const layout of LAYOUTS) {
    const a = parts(ruler, post({ layout })).map((x) => x.role), b = parts(ruler, post({ layout, fps: "24" })).map((x) => x.role)
    assert.deepEqual(a, b, layout)
    assert.equal(new Set(a).size, a.length, `${layout}: ${a}`)
    assert.ok(a.includes("logo") && (layout === "grid" || a.includes("cta")), `${layout}: ${a}`) // the grid sets it among its facts
  }
})

test("a move shifts, scales and turns just that part; the stuff stays where it fell", () => {
  const before = parts(ruler, post({ layout: "stack" }))
  const after = parts(ruler, post({ layout: "stack", moves: [{ id: "stack:cta", dx: 0.1, dy: -0.05, s: 1.5, r: 0.3 }] }))
  const a = find(before, "cta"), b = find(after, "cta")
  assert.ok(Math.abs(b.x - a.x - 108) < 0.01 && Math.abs(b.y - a.y + 67.5) < 0.01, "moved by a tenth across and a twentieth up")
  assert.ok(Math.abs(b.w / a.w - 1.5) < 1e-9 && Math.abs(b.rot - a.rot - 0.3) < 1e-9)
  for (const x of before) if (x.role !== "cta") assert.deepEqual(find(after, x.role), x, x.role)
})

test("a move only counts in its own layout, and a hidden part is left out", () => {
  const moves = [{ id: "badge:cta", dx: 0.3 }, { id: "stack:line0", hide: true }, { id: "stack:logo", hide: true }, { id: "stack:picture", hide: true }]
  const stack = parts(ruler, post({ layout: "stack", moves })).map((x) => x.role)
  assert.ok(!stack.includes("line0") && !stack.includes("logo") && !stack.includes("picture"))
  assert.deepEqual(find(parts(ruler, post({ layout: "stack", moves })), "cta"), find(parts(ruler, post({ layout: "stack" })), "cta"))
  assert.notDeepEqual(find(parts(ruler, post({ layout: "badge", moves })), "cta"), find(parts(ruler, post({ layout: "badge" })), "cta"))
})

test("an underline goes with its words", () => {
  const p = (moves) => scene(ruler, post({ layout: "stack", ctaShape: "underline", moves }))
  const rule = (s) => s.items.find((it) => it.follows)
  const a = rule(p([])), b = rule(p([{ id: "stack:cta", dx: 0.1 }]))
  assert.ok(Math.abs(b.x - a.x - 108) < 0.01)
})

test("moves are checked like any setting, and the judge sees them", () => {
  const p = post({ moves: [{ id: "stack:cta", dx: 9, s: 0, r: 1, extra: true }, "nonsense"] })
  assert.equal(p.params.moves[0].dx, 2)
  assert.equal(p.params.moves[0].s, 0.2)
  assert.ok(!("extra" in p.params.moves[0]))
  const clean = judge(scene(ruler, post({ layout: "stack" }))).score
  const off = judge(scene(ruler, post({ layout: "stack", moves: [{ id: "stack:line0", dx: 0.9 }] })))
  assert.ok(off.score < clean && off.faults.some((f) => f.id === "off-frame"))
})
