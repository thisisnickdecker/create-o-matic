// My brand: one brand kept in this browser for every instrument to start from. The Brand bench
// writes it (Use everywhere, Make a post); Flyposter reads and writes it as its Brand pocket.
//   {
//     name, tagline,
//     inks: ["#…"]        brand colours, in order of use: the first leads, the second supports,
//                         the rest are highlights (roleOf)
//     paper, black        the two neutrals
//     logo: { name, svg } the full lockup; svg only when it's an SVG (images stay in this
//                         browser's media store under their name)
//     mark: { name, svg } the mark alone, for small and round places; optional
//     logoColour          "original", "auto" or "ink"
//     faces: { headline: { family, source, weight }, body: { … } }, adobeKit
//     voice               the house copy voice: a Flyposter lens id ("any", "punk", …)
//   }
// Nothing here draws; it's plain data, checked on the way in so a hand-edited one still loads.
const KEY = "createomatic.brand"
const isHex = (v) => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v)
const str = (v, n = 200) => (typeof v === "string" ? v.slice(0, n) : "")
const logo = (v) => (v && typeof v === "object" && /^[a-z0-9-]{1,32}$/.test(v.name) ? { name: v.name, svg: typeof v.svg === "string" && /<svg[\s>]/i.test(v.svg) && v.svg.length <= 300000 ? v.svg : null } : null)
const face = (v) => (v && typeof v === "object" && str(v.family) ? { family: str(v.family, 80), source: ["open", "google", "adobe", "system", "file"].includes(v.source) ? v.source : "open", weight: Math.min(1000, Math.max(1, Math.round(+v.weight) || 400)) } : null)

export const ROLES = ["lead", "support", "highlight"]
export const roleOf = (i) => ROLES[Math.min(i, 2)]

export function cleanBrand(b) {
  if (!b || typeof b !== "object") return null
  const inks = (Array.isArray(b.inks) ? b.inks : []).filter(isHex).map((c) => c.toUpperCase()).slice(0, 8)
  return {
    name: str(b.name, 80), tagline: str(b.tagline),
    inks, paper: isHex(b.paper) ? b.paper.toUpperCase() : "#F5F0E6", black: isHex(b.black) ? b.black.toUpperCase() : "#151412",
    logo: logo(b.logo), mark: logo(b.mark),
    logoColour: ["original", "auto", "ink"].includes(b.logoColour) ? b.logoColour : "original",
    faces: { headline: face(b.faces?.headline), body: face(b.faces?.body) },
    adobeKit: /^[a-z0-9]{0,20}$/i.test(b.adobeKit ?? "") ? b.adobeKit ?? "" : "",
    voice: /^[a-z]{1,20}$/.test(b.voice ?? "") ? b.voice : "any",
    saved: Number.isFinite(b.saved) ? b.saved : 0,
  }
}

export function myBrand() {
  try {
    const got = JSON.parse(localStorage.getItem(KEY))
    if (got) return cleanBrand(got)
    // Flyposter kept its own pocket before there was one brand for everything: carry it over.
    const old = JSON.parse(localStorage.getItem("flyposter.brand"))
    return old ? cleanBrand({ name: old.brandName, inks: old.inks, paper: old.paper, black: old.black, logoColour: old.logoColour, logo: old.logo ? { name: old.logo, svg: old.mark } : null }) : null
  } catch { return null }
}

// Merges into what's kept: pass only what you know.
export function keepBrand(part) {
  const next = cleanBrand({ ...(myBrand() ?? {}), ...part, faces: { ...(myBrand()?.faces ?? {}), ...(part.faces ?? {}) }, saved: Date.now() })
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch {}
  return next
}

export function forgetBrand() {
  try { localStorage.removeItem(KEY); localStorage.removeItem("flyposter.brand") } catch {}
}
