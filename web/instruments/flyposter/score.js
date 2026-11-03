// The judge: looks at a composed post (flyposter.js scene()) before anyone sees it, so Vary only
// deals good ones. Pure: it reads the scene and nothing else. A clean post scores 100; each fault
// costs points and is named, so you (or an agent) can see why one lost.
//   off-frame     words running off the edge
//   tight         words hard against the edge, inside the margin
//   crash         words over words
//   logo          the logo over words
//   covered       the picture, or stuff in front, over words
//   tiny          type too small to read on a phone
//   small-headline the headline too small for its frame
//   faint         type that doesn't stand out from what's behind it
//   lumpy         a line of the headline far smaller than the others
//   widow         one short word alone on the headline's last line
//   crowded/empty too much or too little of the frame covered by words
//   washed-out    (from pixels, washout()) the texture drowns the post
import { contrast } from "../../packages/core/colour.js"
import { ink } from "./flyposter.js"

const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v))

// An item's box once turned by its own tilt and the group's, as left, top, right, bottom.
function box(x, y, w, h, rot, tilt, W, H, shrink = 1) {
  w *= shrink; h *= shrink
  const pts = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([a, b]) => {
    const px = x + a * Math.cos(rot) - b * Math.sin(rot), py = y + a * Math.sin(rot) + b * Math.cos(rot)
    const dx = px - W / 2, dy = py - H / 2
    return [W / 2 + dx * Math.cos(tilt) - dy * Math.sin(tilt), H / 2 + dx * Math.sin(tilt) + dy * Math.cos(tilt)]
  })
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1])
  return { l: Math.min(...xs), t: Math.min(...ys), r: Math.max(...xs), b: Math.max(...ys) }
}
const area = (b) => Math.max(0, b.r - b.l) * Math.max(0, b.b - b.t)
const overlap = (a, b) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t))
// How much of the smaller box the other covers.
const share = (a, b) => overlap(a, b) / Math.max(1, Math.min(area(a), area(b)))

// Everything in the scene that carries words, with its box and how it should be judged.
function wordBoxes(s) {
  const { W, H } = s.f, tilt = s.groupTilt, out = []
  for (const it of s.items) {
    if (it.kind === "text") {
      // A text box is its cap height; descenders and accents are allowed into the gap. on: the
      // fill it sits on, when not the ground.
      out.push({ it, b: box(it.x, it.y, it.w, it.h, it.rot, tilt, W, H), px: it.px, ink: it.ink, on: it.on, big: !!it.big, headline: it.k === "d" && it.line != null })
    } else if (it.kind === "shape" && it.label) {
      const round = ["circle", "burst", "flower", "star"].includes(it.id)
      out.push({ it, b: box(it.x, it.y, it.w, it.h, it.rot, tilt, W, H, round ? 0.82 : 1), px: it.labelPx, ink: it.labelInk, on: it.fill, sticker: !!it.outline })
    } else if (it.kind === "arc") {
      out.push({ it, b: box(it.x, it.y, it.r * 2 + it.px, it.r * 2 + it.px, 0, tilt, W, H), px: it.px, ink: it.ink, on: "accent", ring: true })
    }
  }
  return out
}

export function judge(s) {
  const faults = []
  const fault = (id, cost, note) => { if (cost > 0.05) faults.push({ id, cost: +cost.toFixed(1), note }) }
  const { W, H, m, u } = s.f, c = s.c, min = Math.min(W, H)
  const bad = s.items.some((it) => ![it.x, it.y, it.w, it.h].every(Number.isFinite))
  if (bad) return { score: 0, faults: [{ id: "broken", cost: 100, note: "Something has no position." }] }
  const words = wordBoxes(s)
  const frame = { l: 0, t: 0, r: W, b: H }

  // Off the frame, or hard against it. The giant number bleeds on purpose.
  let off = 0, tight = 0
  for (const w of words) {
    if (w.big) continue
    const a = area(w.b), inside = overlap(w.b, frame)
    if (a > 0 && inside < a * 0.985) off += 10 + 40 * (1 - inside / a)
    else if (Math.min(w.b.l, w.b.t, W - w.b.r, H - w.b.b) < m * 0.35) tight += 3
  }
  fault("off-frame", off, "Words run off the edge.")
  fault("tight", Math.min(12, tight), "Words sit hard against the edge.")

  // Words over words. Stickers in a scatter jostle on purpose, and a coloured giant number runs
  // behind the headline; only more than that counts.
  let crash = 0
  for (let i = 0; i < words.length; i++) {
    for (let j = i + 1; j < words.length; j++) {
      const a = words[i], b = words[j]
      if ((a.big && !a.it.stroke) || (b.big && !b.it.stroke)) continue
      // The ring of words repeats all the way round: covering a little of it loses nothing.
      if (a.ring || b.ring) {
        const [ring, o] = a.ring ? [a.it, b.b] : [b.it, a.b]
        // How much of the way round the box covers, from points along the ring.
        let n = 0
        for (let q = 0; q < 72; q++) {
          const x = ring.x + Math.cos((q / 72) * Math.PI * 2) * ring.r, y = ring.y + Math.sin((q / 72) * Math.PI * 2) * ring.r
          if (x > o.l - ring.px / 3 && x < o.r + ring.px / 3 && y > o.t - ring.px / 3 && y < o.b + ring.px / 3) n++
        }
        if (n / 72 > 0.2) crash += 12 + 50 * (n / 72 - 0.2)
        continue
      }
      const allow = a.sticker && b.sticker ? 0.3 : 0.08
      const k = share(a.b, b.b)
      if (k > allow) crash += 12 + 50 * (k - allow)
    }
  }
  fault("crash", crash, "Words run into each other.")

  // The logo over words.
  if (s.logo && !s.logo.huge) {
    const lb = { l: s.logo.x - s.logo.s / 2, t: s.logo.y - s.logo.s * 0.4, r: s.logo.x + s.logo.s / 2, b: s.logo.y + s.logo.s * 0.4 }
    let hit = 0
    for (const w of words) { const k = share(lb, w.b); if (k > 0.04) hit += 8 + 40 * k }
    fault("logo", hit, "The logo sits on the words.")
  }

  // The picture in front of the words, or behind them so much they're lost in it; stuff in front.
  let covered = 0
  if (s.star) {
    const sb = { l: s.star.x - s.star.w / 2, t: s.star.y - s.star.h / 2, r: s.star.x + s.star.w / 2, b: s.star.y + s.star.h / 2 }
    for (const w of words) {
      const k = overlap(sb, w.b) / Math.max(1, area(w.b))
      if (s.star.front && k > 0.2) covered += 10 + 30 * k
      else if (!s.star.front && k > 0.3 && !w.on && !w.big) covered += 6 + 20 * k
    }
  }
  // Stuff in front hides words; stuff behind them can swallow them too, though less often.
  for (const o of s.stuff) {
    const ob = { l: o.x - o.s / 2, t: o.y - o.s / 2, r: o.x + o.s / 2, b: o.y + o.s / 2 }
    for (const w of words) {
      const k = overlap(ob, w.b) / Math.max(1, area(w.b))
      if (o.front && k > 0.15) covered += 4 + 20 * k
      else if (!o.front && !w.on && k > 0.25) covered += 2 + 8 * k
    }
  }
  fault("covered", Math.min(50, covered), "Something in front hides the words.")

  // Big enough to read on a phone: about 22px on a post 1080 wide, seen at a third of that.
  const small = words.filter((w) => !w.big && w.px / u < 22).length
  fault("tiny", Math.min(18, small * 6), "Some type is too small to read on a phone.")
  const head = words.filter((w) => w.headline)
  const biggest = Math.max(0, ...head.map((w) => w.it.h))
  if (head.length) fault("small-headline", clamp((0.045 - biggest / min) / 0.045) * 20, "The headline is small for its frame.")

  // Type that stands out from what's behind it.
  let faint = 0
  const pale = []
  for (const w of words) {
    if (w.big) continue
    const fg = ink(c, w.ink), bg = w.on ? ink(c, w.on) : c.ground
    const k = contrast(fg, bg)
    if (k < 3) { faint += k < 1.8 ? 14 : 6; pale.push(`${w.it.text ?? w.it.label?.join(" ")} (${fg} on ${bg})`) }
  }
  fault("faint", Math.min(30, faint), `Some type doesn't stand out from what's behind it: ${pale.join(", ")}.`)

  // Lines of one headline at wildly different sizes: a long word shrunk to a sliver.
  const sizes = head.filter((w) => !w.big).map((w) => w.px)
  if (sizes.length > 1) fault("lumpy", Math.min(20, (Math.max(...sizes) / Math.min(...sizes) - 2.6) * 6), "One line of the headline is far smaller than the rest.")

  // One short word alone on the last line of a headline that's set in lines.
  const lines = head.filter((w) => w.it.align !== "center" || head.length > 1)
  if (lines.length > 2) {
    const last = lines.at(-1).it, longest = Math.max(...lines.map((w) => w.it.w))
    if (!/\s/.test(last.text.trim()) && last.w < longest * 0.3 && last.px <= lines[0].it.px * 1.05) fault("widow", 5, "One short word alone on the last line.")
  }

  // How much of the frame the words cover. A ticker's bands fill it on purpose: they count
  // against looking empty, not against looking crowded.
  const bands = s.items.filter((it) => it.kind === "ticker").reduce((a, it) => a + overlap(box(it.x, it.y, it.w, it.h, it.rot, s.groupTilt, W, H), frame), 0)
  const cover = words.reduce((a, w) => a + overlap(w.b, frame), 0) / (W * H)
  fault("crowded", (cover - 0.62) * 80, "Too much of the frame is words.")
  fault("empty", (0.05 - cover - bands / (W * H)) * 300, "The words are lost in the frame.")

  const score = Math.max(0, Math.round(100 - faults.reduce((a, f) => a + f.cost, 0)))
  return { score, faults: faults.sort((a, b) => b.cost - a.cost) }
}

// The best n of many judged posts, kept different from each other: none under the floor if it
// can be helped, and each pick counts against others with the same layout (most), display face or
// use of colour.
export function choose(list, n = 9, floor = 70) {
  // Only good ones, if there are enough of them; otherwise the best there are.
  const good = list.filter((x) => x.score >= floor)
  const left = good.length >= n ? good : [...list].sort((a, b) => b.score - a.score).slice(0, n), out = []
  while (out.length < n && left.length) {
    let bi = 0, bv = -Infinity
    left.forEach((x, i) => {
      const p = x.patch.params
      const v = x.score - out.reduce((a, o) => {
        const q = o.patch.params
        return a + (q.layout === p.layout ? 25 : 0) + (q.display === p.display ? 8 : 0) + (q.colourUse === p.colourUse ? 4 : 0)
      }, 0)
      if (v > bv) { bv = v; bi = i }
    })
    out.push(left.splice(bi, 1)[0])
  }
  return out
}

// Texture that drowns the post, from two small renders of it, without its Darkroom layers and
// with them (RGBA pixel arrays of the same size). They're compared at a coarse grain, so grain and
// halftone dots don't count, only whether the shapes of the post survive. Returns the cost.
export function washout(plain, textured, width) {
  const lum = (d) => {
    const h = d.length / 4 / width, out = []
    for (let y = 0; y + 1 < h; y += 2) for (let x = 0; x + 1 < width; x += 2) {
      let v = 0
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const i = ((y + dy) * width + x + dx) * 4; v += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2] }
      out.push(v / 4)
    }
    return out
  }
  const a = lum(plain), b = lum(textured), n = a.length
  const ma = a.reduce((s, v) => s + v, 0) / n, mb = b.reduce((s, v) => s + v, 0) / n
  let ab = 0, aa = 0, bb = 0
  for (let i = 0; i < n; i++) { ab += (a[i] - ma) * (b[i] - mb); aa += (a[i] - ma) ** 2; bb += (b[i] - mb) ** 2 }
  const r = aa && bb ? ab / Math.sqrt(aa * bb) : 1
  return r < 0.8 ? Math.min(40, (0.8 - r) * 120) : 0
}
