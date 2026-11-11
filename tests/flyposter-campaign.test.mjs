// Flyposter's campaign: one post as every size and a carousel. Each is a patch the instrument
// accepts, made from the post's own, and the set is judged like any post.
import { test } from "node:test"
import assert from "node:assert/strict"
import { manifest, scene } from "../web/instruments/flyposter/flyposter.js"
import { campaign, SIZES } from "../web/instruments/flyposter/campaign.js"
import { judge } from "../web/instruments/flyposter/score.js"
import { sanitize } from "../web/packages/core/patch.js"
import { cleanBrand, roleOf } from "../web/packages/core/brand.js"

const ruler = { font: "", letterSpacing: "0px", measureText(s) { const px = parseFloat(this.font.match(/(\d+(?:\.\d+)?)px/)[1]); return { width: [...s].length * 0.6 * px, actualBoundingBoxAscent: 0.72 * px } } }
const post = (params) => sanitize(manifest, { params: { brandName: "Bar Nove", headline: "Happy hour, 5 to 7", details: "Cocktails £6", where: "Bar Nove, Deptford", cta: "Bring a friend", ...params } })

test("every size and three slides, each a patch the instrument accepts, the look kept", () => {
  const p = post({ layout: "badge", display: "Anton", inks: ["#2340D8"], take: 2, moves: [{ id: "portrait/badge:cta", dx: 0.1 }] })
  const set = campaign(p)
  assert.deepEqual(set.map((x) => x.id), [...SIZES.map(([id]) => id), "slide1", "slide2", "slide3"])
  for (const x of set) {
    assert.deepEqual(sanitize(manifest, x.patch), x.patch, x.id)
    for (const k of ["layout", "display", "inks", "brandName", "motion", "seed"]) assert.deepEqual(x.patch.params[k] ?? x.patch[k], p.params[k] ?? p[k], `${x.id} ${k}`)
  }
  assert.equal(set.find((x) => x.id === "story").patch.params.format, "story")
  const [s1, s2, s3] = set.filter((x) => x.group === "carousel")
  assert.equal(s1.patch.params.take, 2)
  assert.deepEqual(s1.patch.params.moves, p.params.moves)
  assert.equal(s2.patch.params.headline, "Cocktails £6")
  assert.deepEqual([s2.patch.params.take, s2.patch.params.moves], [0, []])
  assert.deepEqual([s3.patch.params.headline, s3.patch.params.details], ["Bring a friend", "Bar Nove, Deptford"])
  assert.equal(p.params.format, "portrait", "the post itself is left alone")
})

test("slides only when there's something to say", () => {
  assert.equal(campaign(post({ details: "", where: "", cta: "" })).filter((x) => x.group === "carousel").length, 0)
  const two = campaign(post({ details: "", cta: "" })).filter((x) => x.group === "carousel")
  assert.deepEqual(two.map((x) => x.patch.params.headline), ["Happy hour, 5 to 7", "Bar Nove, Deptford"])
})

test("the whole set composes and is judged", () => {
  for (const layout of ["stack", "number", "ticker", "grid", "scatter", "poster", "badge"]) {
    for (const x of campaign(post({ layout }))) {
      const j = judge(scene(ruler, x.patch))
      assert.ok(j.score >= 0 && j.score <= 100, `${layout} ${x.id}`)
    }
  }
})

test("a hand-edited brand is cleaned on the way in", () => {
  const b = cleanBrand({ name: "Crumb", inks: ["#2b59c3", "nope", "#F4B942"], logo: { name: "Bad Name!", svg: "<svg/>" }, mark: { name: "dot", svg: "<p>" }, faces: { headline: { family: "Anton", weight: "900" } }, voice: "punk", adobeKit: "x y" })
  assert.deepEqual(b.inks, ["#2B59C3", "#F4B942"])
  assert.equal(b.logo, null)
  assert.deepEqual(b.mark, { name: "dot", svg: null })
  assert.deepEqual(b.faces.headline, { family: "Anton", source: "open", weight: 900 })
  assert.equal(b.faces.body, null)
  assert.equal(b.voice, "punk")
  assert.equal(b.adobeKit, "")
  assert.deepEqual([0, 1, 2, 5].map(roleOf), ["lead", "support", "highlight", "highlight"])
})
