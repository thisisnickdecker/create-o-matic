// Marks in patches and content. Drawing them needs a browser; see the instrument README.
import { test } from "node:test"
import assert from "node:assert/strict"
import { manifest, slots } from "../web/instruments/elastic/elastic.js"
import { defaults, sanitize } from "../web/packages/core/patch.js"
import { referenced, markName } from "../web/packages/core/marks.js"

const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h10v10z"/></svg>'

test("SVG marks travel in the patch; bad names and non-SVG are dropped", () => {
  const p = sanitize(manifest, { ...defaults(manifest), marks: { studiolo: svg, "Bad Name": svg, fake: "<div>nope</div>" } })
  assert.deepEqual(Object.keys(p.marks), ["studiolo"])
})

test("mark lines stay whole, in every mode and case", () => {
  const p = { ...defaults(manifest).params, content: "hire\n@studiolo\n nick ", case: "upper" }
  assert.deepEqual(slots({ ...p, mode: "sequence" }), ["HIRE", "@studiolo", "NICK"])
  assert.deepEqual(slots({ ...p, mode: "letters" }), ["H", "I", "R", "E", "@studiolo", "N", "I", "C", "K"])
  assert.deepEqual(referenced("a\n@studiolo\n@nd\n@studiolo\n@ not"), ["studiolo", "nd"])
  assert.equal(markName("nd sig svg.svg"), "nd-sig-svg")
})

test("shape position: centred at 0, a half frame per unit, scaled about the centre", async () => {
  const { shapeRect } = await import("../web/packages/core/marks.js")
  assert.deepEqual(shapeRect({ shapeScale: 1, shapeX: 0, shapeY: 0 }, 100, 50), { x: 0, y: 0, w: 100, h: 50 })
  assert.deepEqual(shapeRect({ shapeScale: 0.5, shapeX: 1, shapeY: -1 }, 100, 50), { x: 75, y: -12.5, w: 50, h: 25 })
  // The sweep preset starts and ends fully off the frame, so its loop point is invisible.
  const off = shapeRect({ shapeScale: 0.8, shapeX: -1.9 }, 1920, 1080)
  assert.ok(off.x + off.w <= 0)
})
