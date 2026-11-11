// The campaign: one post as a matched set. The same brand, words, look and motion at every size a
// campaign needs, and a carousel that says it in three slides. Each is an ordinary patch, made from
// the post's own, so changing the post changes them all. Pure: a patch in, patches out.
//   campaign(patch) -> [{ id, name, note, group: "sizes" | "carousel", patch }]

export const SIZES = [
  ["portrait", "Feed", "Instagram, LinkedIn, Facebook"],
  ["story", "Story", "Reels, Stories, TikTok, Shorts"],
  ["square", "Square", "Safe everywhere"],
  ["landscape", "Landscape", "YouTube, X, Substack"],
  ["link", "Banner", "Link card, email header, Open Graph"],
]

const blank = (s) => !String(s ?? "").trim()

// The carousel: the post, then the details, then the call to action and where. A slide only
// appears when there's something for it to say.
function slides(p) {
  const out = [{ id: "slide1", name: "Slide 1", note: "The post", words: {} }]
  if (!blank(p.details)) out.push({ id: "slide2", name: `Slide ${out.length + 1}`, note: "The details", words: { headline: p.details, details: "", where: "", cta: "" } })
  if (!blank(p.cta) || !blank(p.where)) {
    const lead = blank(p.cta) ? p.where : p.cta
    out.push({ id: "slide3", name: `Slide ${out.length + 1}`, note: "Where, and what to do", words: { headline: lead, details: blank(p.cta) ? "" : p.where, where: "", cta: "" } })
  }
  return out.length > 1 ? out : []
}

export function campaign(patch) {
  const p = patch.params
  const sized = (format, extra = {}) => ({ ...structuredClone(patch), params: { ...structuredClone(p), format, ...extra } })
  const set = SIZES.map(([format, name, note]) => ({ id: format, name, note, group: "sizes", patch: sized(format) }))
  for (const s of slides(p)) {
    // The later slides say new words, so the post's rewrite and its moves (made for the first
    // slide's words) are left behind.
    const words = s.id === "slide1" ? {} : { ...s.words, take: 0, moves: [] }
    set.push({ id: s.id, name: s.name, note: s.note, group: "carousel", patch: sized("portrait", words) })
  }
  return set
}
