// Flyposter: the copy lenses, Vary and its locks, the moods against the manifest, the colour
// casting and the giant number. Drawing needs a browser; see the instrument's README.
import { test } from "node:test"
import assert from "node:assert/strict"
import { manifest, palette, words, bigThing } from "../web/instruments/flyposter/flyposter.js"
import { MOODS, LOCKS, vary } from "../web/instruments/flyposter/moods.js"
import { LENSES, rewrite, rewrites, parts } from "../web/instruments/flyposter/copy.js"
import { mulberry32 } from "../web/packages/core/rng.js"
import { contrast } from "../web/packages/core/colour.js"
import { sanitize } from "../web/packages/core/patch.js"
import { emojiOf } from "../web/packages/core/emoji.js"

const post = (params = {}) => sanitize(manifest, { params })
const msg = { headline: "Happy hour, 5 to 7, Thursdays", details: "Cocktails £6", where: "Bar Nove", cta: "Bring a friend" }

test("take 0 is your line as written; every other take is a rewrite, the same every time", () => {
  assert.equal(rewrite(msg, "any", 0), msg.headline)
  const a = rewrites(msg, "any"), b = rewrites(msg, "any")
  assert.deepEqual(a, b)
  assert.ok(a.length > 30)
  assert.equal(rewrite(msg, "any", a.length + 1), a[0], "takes wrap round")
})

test("every lens has something to say about a one-word line", () => {
  for (const [id] of LENSES) assert.ok(rewrites({ headline: "Croissants" }, id).length >= 4, id)
})

test("a headline is taken apart at its commas and dots", () => {
  const p = parts({ headline: "Happy hour · 5 to 7, Thursdays." })
  assert.equal(p.lead, "Happy hour")
  assert.deepEqual(p.rest, ["5 to 7", "Thursdays"])
})

test("Vary with the same numbers deals the same post", () => {
  const a = vary({ ...post({ mood: "zine" }).params }, mulberry32(42))
  const b = vary({ ...post({ mood: "zine" }).params }, mulberry32(42))
  assert.deepEqual(a, b)
})

test("a locked facet stays; the others change; words and brand never do", () => {
  const start = post({ mood: "club", lockType: true, lockLayout: true }).params
  const next = vary(structuredClone(start), mulberry32(7))
  for (const k of [...LOCKS.type, ...LOCKS.layout, "headline", "details", "where", "cta", "inks", "logo", "emoji", "image", "format"]) assert.deepEqual(next[k], start[k], k)
  assert.ok(LOCKS.colour.some((k) => next[k] !== start[k]) || LOCKS.motion.some((k) => next[k] !== start[k]))
})

test("every mood deals only values the manifest accepts", () => {
  const def = (k) => manifest.parameters.find((d) => d.key === k)
  for (const mood of Object.keys(MOODS)) {
    assert.ok(def("mood").options.some(([v]) => v === mood), mood)
    for (let i = 0; i < 40; i++) {
      const p = vary({ ...post({ mood }).params }, mulberry32(i * 31 + 1))
      for (const k of Object.values(LOCKS).flat()) {
        const d = def(k)
        if (d.type === "select") assert.ok(d.options.some(([v]) => v === p[k]), `${mood} ${k}=${p[k]}`)
        if (d.type === "number" || d.type === "int") assert.ok(p[k] >= d.min && p[k] <= d.max, `${mood} ${k}=${p[k]}`)
        if (d.type === "font") assert.ok(typeof p[k] === "string" && p[k].length > 2, `${mood} ${k}=${p[k]}`)
      }
      assert.deepEqual(sanitize(manifest, { params: p }).params.layers.length, p.layers.length, `${mood}: every texture layer survives sanitising`)
    }
  }
})

test("type on the ground always reads, whatever the colourway", () => {
  for (const colourUse of ["flood", "paper", "night", "duo", "riot"]) {
    for (let colourway = 0; colourway < 30; colourway++) {
      const c = palette(post({ colourUse, colourway, inks: ["#F2542D", "#2340D8", "#F6D743"] }).params)
      assert.ok(contrast(c.type, c.ground) >= 3, `${colourUse} ${colourway}: ${c.type} on ${c.ground}`)
    }
  }
})

test("the giant number finds prices, percentages and times", () => {
  const w = (headline, details = "") => words(post({ headline, details, take: 0 }).params)
  assert.equal(bigThing(w("Everything £5")), "£5")
  assert.equal(bigThing(w("Summer sale", "30% off everything")), "30%")
  assert.equal(bigThing(w("Happy hour", "5 to 7")), "5")
  assert.equal(bigThing(w("Croissants")), "C")
})

test("emoji are read from text, with or without variation selectors", () => {
  assert.deepEqual(emojiOf("🍔 ❤️ ✨ x").map((e) => e.name), ["burger", "heart", "sparkles"])
})
