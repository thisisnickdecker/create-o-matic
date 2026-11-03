// Flyposter under stress: every layout, in every format, with awkward words (one word, a very long
// one, emoji only, a long sentence, German, Japanese), composed and judged. Measuring is faked with
// rough letter widths (no canvas in Node), so this proves the layouts hold together, not how
// they look; the instrument's README says how the look was checked.
import { test } from "node:test"
import assert from "node:assert/strict"
import { manifest, scene } from "../web/instruments/flyposter/flyposter.js"
import { judge, choose } from "../web/instruments/flyposter/score.js"
import { vary, nudge, LOCKS } from "../web/instruments/flyposter/moods.js"
import { sanitize } from "../web/packages/core/patch.js"
import { mulberry32 } from "../web/packages/core/rng.js"

// A stand-in for a canvas: widths from the letters, a cap height of 0.72 of the size.
const ruler = {
  font: "", letterSpacing: "0px",
  measureText(s) {
    const px = parseFloat(this.font.match(/(\d+(?:\.\d+)?)px/)[1])
    let w = 0
    for (const ch of s) w += /[぀-鿿＀-￯]|\p{Extended_Pictographic}/u.test(ch) ? 1 : /\s/.test(ch) ? 0.28 : /[A-Z0-9£$%]/.test(ch) ? 0.66 : 0.54
    return { width: w * px + [...s].length * (parseFloat(this.letterSpacing) || 0), actualBoundingBoxAscent: 0.72 * px }
  },
}
const post = (params) => sanitize(manifest, { params: { brandName: "Bar Nove", ...params } })

const WORDS = {
  plain: { headline: "Happy hour, 5 to 7, Thursdays", details: "Cocktails £6 · Wine £5", where: "Bar Nove, Deptford", cta: "Bring a friend" },
  one: { headline: "Open", details: "", where: "", cta: "" },
  long: { headline: "Donaudampfschifffahrtsgesellschaftskapitän", details: "Ab Freitag", where: "Hafen", cta: "Los" },
  emoji: { headline: "🍔🍟🥤", details: "Friday", where: "", cta: "Hungry?" },
  essay: { headline: "We have finally fixed the coffee machine and to celebrate everything on the menu is half price until the beans run out", details: "Monday to Friday, eight till four", where: "The Kiosk, Peckham Rye station", cta: "Come and see us" },
  german: { headline: "Großer Sommerschlussverkauf: alles muss raus", details: "Bis zu 70% Rabatt", where: "Kaufhaus Müller", cta: "Jetzt zugreifen" },
  japanese: { headline: "今夜はビールが半額です", details: "18時から21時まで", where: "居酒屋たぬき", cta: "ぜひどうぞ" },
}
const LAYOUTS = ["stack", "number", "ticker", "grid", "scatter", "poster", "badge"]
const FORMATS = manifest.parameters.find((d) => d.key === "format").options.map(([v]) => v)

test("every layout holds together in every format, whatever the words", () => {
  let worst = { score: 101 }
  for (const [name, w] of Object.entries(WORDS)) {
    for (const layout of LAYOUTS) {
      for (const format of FORMATS) {
        for (const logoPlace of ["corner", "bottom"]) {
          const s = scene(ruler, post({ ...w, layout, format, logoPlace, layoutSeed: 3 }))
          const where = `${name} ${layout} ${format} ${logoPlace}`
          for (const it of s.items) for (const k of ["x", "y", "w", "h", "px"]) if (k in it) assert.ok(Number.isFinite(it[k]), `${where}: ${it.kind} ${k}=${it[k]}`)
          const j = judge(s)
          assert.ok(!j.faults.some((f) => f.id === "off-frame" && f.cost >= 30), `${where}: words off the frame ${JSON.stringify(j.faults)}`)
          if (j.score < worst.score) worst = { ...j, where }
        }
      }
    }
  }
  assert.ok(worst.score >= 45, `the worst case still reads: ${worst.where} scored ${worst.score} ${JSON.stringify(worst.faults)}`)
})

test("headlines break into even lines, not on a little word, with no lonely last word", () => {
  const s = scene(ruler, post({ ...WORDS.plain, headline: "Fresh bread and pastries every morning from seven", layout: "stack", format: "feed" }))
  const lines = s.items.filter((it) => it.kind === "text" && it.line != null && it.k === "d").map((it) => it.text)
  assert.ok(lines.length >= 3, lines.join(" / "))
  for (const l of lines.slice(0, -1)) assert.ok(!/\b(and|from|every|the|a|of|to)$/i.test(l), `ends on a little word: ${lines.join(" / ")}`)
  assert.ok(lines.at(-1).includes(" "), `lonely last word: ${lines.join(" / ")}`)
})

test("Japanese without spaces still breaks into lines", () => {
  const s = scene(ruler, post({ ...WORDS.japanese, layout: "stack", format: "story" }))
  assert.ok(s.items.filter((it) => it.kind === "text" && it.line != null).length >= 2)
})

test("an opening quote hangs outside the left edge", () => {
  const s = scene(ruler, post({ ...WORDS.plain, headline: "“Best chips in town”\nsays everyone", layout: "stack", align: "left", format: "feed" }))
  const [first, second] = s.items.filter((it) => it.kind === "text" && it.line != null)
  assert.ok(first.x - first.w / 2 < second.x - second.w / 2 - 1)
})

test("the judge sees words off the edge and words over words", () => {
  const s = scene(ruler, post({ ...WORDS.plain, layout: "stack", format: "feed" }))
  const clean = judge(s).score
  const broken = { ...s, items: s.items.map((it, i) => (i === 0 ? { ...it, x: it.x + s.f.W * 0.9 } : it)) }
  assert.ok(judge(broken).faults.some((f) => f.id === "off-frame"))
  const piled = { ...s, items: s.items.map((it) => (it.kind === "text" ? { ...it, x: s.f.W / 2, y: s.f.H / 2 } : it)) }
  assert.ok(judge(piled).faults.some((f) => f.id === "crash"))
  assert.ok(judge(piled).score < clean)
})

test("dealing many and choosing nine gives nine different, well-judged posts", () => {
  const base = post({ ...WORDS.plain, mood: "loud" })
  const cands = Array.from({ length: 27 }, (_, i) => {
    const params = vary(structuredClone(base.params), mulberry32(i + 1))
    const patch = { ...base, params }
    return { patch, ...judge(scene(ruler, patch)) }
  })
  const nine = choose(cands, 9)
  assert.equal(nine.length, 9)
  assert.ok(new Set(nine.map((x) => x.patch.params.layout)).size >= 4, "a spread of layouts")
  const mean = (l) => l.reduce((a, x) => a + x.score, 0) / l.length
  assert.ok(mean(nine) >= mean(cands), "the nine are no worse than the deal")
})

test("More like this changes one or two facets and keeps the rest", () => {
  const start = vary(post({ ...WORDS.plain, mood: "zine" }).params, mulberry32(5))
  for (let i = 0; i < 20; i++) {
    const next = nudge(structuredClone(start), mulberry32(i + 100))
    const changed = Object.entries(LOCKS).filter(([, keys]) => keys.some((k) => JSON.stringify(next[k]) !== JSON.stringify(start[k]))).length
    assert.ok(changed <= 2, `${changed} facets changed`)
    for (const facet of Object.keys(LOCKS)) assert.equal(next[`lock${facet[0].toUpperCase()}${facet.slice(1)}`], start[`lock${facet[0].toUpperCase()}${facet.slice(1)}`])
  }
})
