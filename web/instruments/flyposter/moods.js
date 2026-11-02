// The moods: each is a small art director with ranges for layout, type, colour, motion, stuff and
// texture. Vary deals a new post from the mood's ranges, leaving alone whatever is locked; your
// words, brand and pictures always stay. Pure: vary(params, rng) only uses the rng it's given.

// Type pairs: [display face, its weight, text face, its weight]. All from the open catalogue.
const PAIRS = {
  loud: [["Anton", 400, "Inter Tight", 600], ["Archivo Black", 400, "Archivo", 500], ["Bowlby One", 400, "Space Grotesk", 500], ["Rubik Mono One", 400, "Rubik", 500],
    ["Dela Gothic One", 400, "Geist", 500], ["Bagel Fat One", 400, "Geist", 600], ["Climate Crisis", 400, "Geist Mono", 500], ["Gasoek One", 400, "Inter", 600], ["Bebas Neue", 400, "Geist Mono", 500]],
  deadpan: [["Geist", 500, "Geist Mono", 400], ["Inter Tight", 500, "IBM Plex Mono", 400], ["Instrument Sans", 500, "Instrument Serif", 400], ["Courier Prime", 400, "Courier Prime", 400],
    ["Geist Mono", 400, "Geist", 400], ["Hanken Grotesk", 400, "Geist Mono", 400], ["Geist Serif", 400, "Geist Mono", 400]],
  swiss: [["Inter Tight", 700, "Inter", 500], ["Geist", 700, "Geist", 500], ["Schibsted Grotesk", 800, "Schibsted Grotesk", 500], ["Familjen Grotesk", 700, "Geist Mono", 400],
    ["Host Grotesk", 700, "Host Grotesk", 400], ["Archivo", 800, "Archivo", 500], ["Hubot Sans", 800, "Geist Mono", 400]],
  zine: [["Permanent Marker", 400, "Special Elite", 400], ["Rock Salt", 400, "Courier Prime", 700], ["Rubik Dirt", 400, "Space Mono", 400], ["Abril Fatface", 400, "Special Elite", 400],
    ["Gloock", 400, "Courier Prime", 400], ["Rubik Wet Paint", 400, "IBM Plex Mono", 500], ["Shrikhand", 400, "Special Elite", 400], ["Geist Pixel Line", 400, "Courier Prime", 400]],
  club: [["Geist Pixel Square", 400, "Geist Mono", 500], ["Geist Pixel Circle", 400, "Geist Mono", 500], ["Geist Pixel Grid", 400, "Space Mono", 400], ["Geist Pixel Triangle", 400, "Martian Mono", 400],
    ["Monoton", 400, "Geist Mono", 500], ["Unbounded", 900, "Unbounded", 400], ["Syne", 800, "Geist Mono", 400], ["Big Shoulders Display", 900, "Geist Mono", 500], ["Sixtyfour", 400, "Martian Mono", 400], ["Rubik Glitch", 400, "Geist Mono", 500]],
  gallery: [["Instrument Serif", 400, "Geist", 400], ["Geist Serif", 400, "Geist", 400], ["Fraunces", 300, "Inter", 400], ["Cormorant Garamond", 500, "Geist Mono", 400],
    ["EB Garamond", 400, "Geist", 400], ["Young Serif", 400, "Instrument Sans", 400], ["Newsreader", 300, "Inter Tight", 400], ["DM Serif Display", 400, "Geist Mono", 400], ["Gloock", 400, "Geist", 400]],
  shop: [["Shrikhand", 400, "Rubik", 500], ["Titan One", 400, "Rubik", 500], ["Alfa Slab One", 400, "Courier Prime", 700], ["Ultra", 400, "Libre Caslon Text", 400],
    ["Bungee", 400, "Rubik", 500], ["Young Serif", 400, "Caveat", 600], ["Rammetto One", 400, "Geist", 500], ["Erica One", 400, "Space Grotesk", 500]],
}

// Texture recipes, by name: layers for the Darkroom stack. Riso prints in your own inks.
function texture(name, p, k) {
  const L = (effect, params, extra = {}) => ({ id: `${effect}-${k}`, effect, on: true, opacity: 1, blend: "source-over", params, ...extra })
  switch (name) {
    case "grain": return [L("grain", { grain: 0.22, grainBoil: true })]
    case "paper": return [L("paper", { paper: 0.55, paperKind: "paper" }), L("grain", { grain: 0.12, grainBoil: false })]
    case "kraft": return [L("paper", { paper: 0.7, paperKind: "kraft" })]
    case "newsprint": return [L("paper", { paper: 0.6, paperKind: "newsprint" }), L("halftone", { halftone: 5, halftoneAngle: 45, halftoneShape: "round", halftoneGain: 1.1 }, { opacity: 0.35, blend: "multiply" })]
    case "copier": return [L("photocopy", { copier: 0.5, boil: true })]
    case "riso": return [L("riso", { riso: 1, risoInks: p.inks.slice(0, 3), risoPaper: p.paper, risoGrain: 0.6, risoShift: 5 })]
    case "halftone": return [L("halftone", { halftone: 7, halftoneAngle: 15, halftoneShape: "round", halftoneGain: 1.15 }, { opacity: 0.5, blend: "multiply" })]
    case "film": return [L("film", { filmHalation: 0.45, filmFade: 0.18, filmVignette: 0.3 }), L("grain", { grain: 0.18, grainBoil: true })]
    case "chroma": return [L("chroma", { chroma: 6, chromaAngle: 0 }), L("grain", { grain: 0.2, grainBoil: true })]
    case "grunge": return [L("grunge", { grunge: 0.45, grungeDust: 0.6, grungeScratches: 0.4, grungeStains: 0.3, grungeBoil: false })]
    default: return []
  }
}

// Weighted choices are [value, weight] lists; plain lists are equal odds.
export const MOODS = {
  loud: {
    label: "Loud", blurb: "Big, bright and in your face.",
    layout: [["stack", 3], ["number", 2], ["scatter", 2], ["ticker", 2], ["poster", 1], ["badge", 1]],
    case: [["upper", 4], ["as", 1]], align: ["left", "center"], tilt: [-7, 7], scale: [0.95, 1.1], leading: [0.82, 0.92], tracking: [-0.02, 0.02],
    colour: [["flood", 3], ["riot", 2], ["duo", 1]], cta: ["burst", "circle", "pill", "burst"], logo: ["corner", "sticker", "top"],
    motion: [["pop", 3], ["stamp", 2], ["wobble", 2], ["slide", 1], ["flash", 1]], stuffMotion: ["float", "spin", "orbit", "drift", "rain"], energy: [0.6, 1], beats: [2, 4],
    stuffCount: [8, 18], stuffSize: [0.1, 0.18], stuffDepth: ["mixed", "behind"], stuffTreat: ["sticker", "sticker", "shadow", "plain"], stickers: ["burst star", "star sparkle", "bolt burst", "heart star", "burst"],
    texture: ["none", "grain", "halftone", "none"],
  },
  deadpan: {
    label: "Deadpan", blurb: "Plain words, a straight face, one odd thing.",
    layout: [["grid", 2], ["stack", 2], ["number", 1], ["poster", 1]],
    case: [["as", 3], ["lower", 1]], align: ["left"], tilt: [0, 0], scale: [0.6, 0.85], leading: [1, 1.15], tracking: [-0.02, 0],
    colour: [["paper", 3], ["duo", 2], ["night", 1]], cta: ["plain", "underline", "box"], logo: ["corner", "bottom"],
    motion: [["type", 3], ["still", 1], ["slide", 1], ["jitter", 1]], stuffMotion: ["still", "float", "drift"], energy: [0.2, 0.5], beats: [1, 2],
    stuffCount: [1, 3], stuffSize: [0.12, 0.3], stuffDepth: ["behind", "mixed"], stuffTreat: ["plain", "shadow"], stickers: ["", "eye", "circle", ""],
    texture: ["none", "grain", "film"],
  },
  swiss: {
    label: "Swiss", blurb: "A grid, the facts, one big shape.",
    layout: [["grid", 4], ["stack", 2], ["number", 2], ["ticker", 1]],
    case: [["lower", 2], ["as", 2], ["upper", 1]], align: ["left"], tilt: [0, 0], scale: [0.85, 1], leading: [0.88, 0.98], tracking: [-0.04, -0.01],
    colour: [["paper", 2], ["flood", 2], ["duo", 1]], cta: ["box", "circle", "plain", "underline"], logo: ["corner", "bottom"],
    motion: [["slide", 3], ["pop", 1], ["type", 1], ["still", 1]], stuffMotion: ["still", "spin", "orbit"], energy: [0.3, 0.7], beats: [1, 2],
    stuffCount: [0, 3], stuffSize: [0.15, 0.35], stuffDepth: ["behind"], stuffTreat: ["plain"], stickers: ["circle", "arrow", "", "asterisk"],
    texture: ["none", "none", "grain", "paper"],
  },
  zine: {
    label: "Zine", blurb: "Cut, stuck, photocopied, loved.",
    layout: [["scatter", 3], ["poster", 2], ["stack", 1], ["badge", 1], ["number", 1]],
    case: [["upper", 2], ["as", 2], ["lower", 1]], align: ["left", "center"], tilt: [-12, 12], scale: [0.85, 1.05], leading: [0.85, 1], tracking: [-0.01, 0.05],
    colour: [["paper", 3], ["duo", 2], ["riot", 1]], cta: ["tag", "box", "burst", "underline"], logo: ["sticker", "corner", "bottom"],
    motion: [["jitter", 4], ["stamp", 2], ["wobble", 1]], stuffMotion: ["jitter", "jitter", "float", "still"], energy: [0.4, 0.9], beats: [2, 4],
    stuffCount: [5, 14], stuffSize: [0.1, 0.2], stuffDepth: ["mixed"], stuffTreat: ["sticker", "sticker", "shadow"], stickers: ["squiggle asterisk", "smile star", "eye squiggle", "heart arrow", "flower"],
    texture: ["copier", "paper", "riso", "newsprint", "grunge", "kraft"],
  },
  club: {
    label: "Club flyer", blurb: "Lights down, pixels up, on the beat.",
    layout: [["ticker", 3], ["badge", 2], ["stack", 2], ["number", 1], ["poster", 1]],
    case: [["upper", 4], ["as", 1]], align: ["center", "left"], tilt: [-5, 5], scale: [0.9, 1.05], leading: [0.85, 0.95], tracking: [0, 0.08],
    colour: [["night", 4], ["riot", 2], ["flood", 1]], cta: ["pill", "box", "circle"], logo: ["top", "corner", "bottom"],
    motion: [["flash", 3], ["stamp", 2], ["pop", 1], ["wobble", 1]], stuffMotion: ["orbit", "spin", "rain", "float"], energy: [0.6, 1], beats: [4, 8],
    stuffCount: [6, 16], stuffSize: [0.07, 0.14], stuffDepth: ["mixed", "behind"], stuffTreat: ["plain", "plain", "sticker"], stickers: ["sparkle", "star sparkle", "bolt", "eye", "sparkle circle"],
    texture: ["chroma", "film", "grain", "halftone"],
  },
  gallery: {
    label: "Gallery", blurb: "Quiet, spaced, expensive-looking.",
    layout: [["grid", 2], ["stack", 2], ["poster", 1], ["badge", 1]],
    case: [["as", 4], ["lower", 1]], align: ["left", "center"], tilt: [0, 0], scale: [0.55, 0.8], leading: [0.95, 1.1], tracking: [-0.02, 0.01],
    colour: [["paper", 3], ["night", 1], ["duo", 1]], cta: ["plain", "underline", "pill"], logo: ["bottom", "corner", "top"],
    motion: [["slide", 2], ["type", 2], ["pop", 1], ["still", 1]], stuffMotion: ["float", "still", "orbit"], energy: [0.15, 0.4], beats: [1, 1],
    stuffCount: [0, 2], stuffSize: [0.2, 0.4], stuffDepth: ["behind"], stuffTreat: ["plain", "shadow"], stickers: ["", "circle", ""],
    texture: ["paper", "none", "grain", "film"],
  },
  shop: {
    label: "Corner shop", blurb: "Hand-painted, friendly, a bit much.",
    layout: [["badge", 2], ["poster", 2], ["scatter", 2], ["stack", 1], ["number", 1]],
    case: [["as", 2], ["upper", 2], ["title", 1]], align: ["center"], tilt: [-6, 6], scale: [0.9, 1.05], leading: [0.88, 1], tracking: [0, 0.03],
    colour: [["flood", 3], ["paper", 2], ["riot", 1]], cta: ["burst", "tag", "circle", "pill"], logo: ["sticker", "top", "corner"],
    motion: [["wobble", 3], ["pop", 2], ["stamp", 1]], stuffMotion: ["float", "orbit", "spin"], energy: [0.4, 0.8], beats: [1, 2],
    stuffCount: [4, 10], stuffSize: [0.1, 0.18], stuffDepth: ["behind", "mixed"], stuffTreat: ["sticker", "shadow", "plain"], stickers: ["burst", "heart", "star flower", "smile", "burst heart"],
    texture: ["paper", "riso", "kraft", "none"],
  },
}

// What each lock keeps. Words, brand, pictures and size are never shuffled.
export const LOCKS = {
  layout: ["layout", "layoutSeed", "align", "scale", "tilt", "leading", "ctaShape", "logoPlace"],
  type: ["display", "displaySource", "displayWeight", "text", "textSource", "textWeight", "case", "tracking"],
  colour: ["colourUse", "colourway"],
  motion: ["motion", "stuffMotion", "energy", "beats"],
  stuff: ["stuffCount", "stuffSize", "stuffDepth", "stuffTreat", "stuffSeed", "stickers"],
  texture: ["layers"],
}

const pick = (list, r) => {
  if (!Array.isArray(list[0])) return list[Math.floor(r() * list.length)]
  let total = 0
  for (const [, w] of list) total += w
  let x = r() * total
  for (const [v, w] of list) { if ((x -= w) < 0) return v }
  return list.at(-1)[0]
}
const range = ([a, b], r, step = 0.01) => Math.round((a + (b - a) * r()) / step) * step

// A new post from the mood's ranges. params is changed in place; locked facets stay as they are.
export function vary(params, r) {
  const M = MOODS[params.mood] ?? MOODS.loud
  const locked = (k) => params[`lock${k[0].toUpperCase()}${k.slice(1)}`]
  // Every facet is dealt (so each draws the same numbers whatever is locked), then kept or not.
  const dealt = {
    layout: () => ({ layout: pick(M.layout, r), layoutSeed: Math.floor(r() * 10000), align: pick(M.align, r), scale: +range(M.scale, r).toFixed(2), tilt: Math.round(range(M.tilt, r, 1)),
      leading: +range(M.leading, r).toFixed(2), ctaShape: pick(M.cta, r), logoPlace: pick(M.logo, r) }),
    type: () => {
      const pairs = PAIRS[params.mood] ?? PAIRS.loud
      const [display, displayWeight, text, textWeight] = pairs[Math.floor(r() * pairs.length)]
      return { display, displaySource: "open", displayWeight, text, textSource: "open", textWeight, case: pick(M.case, r), tracking: +range(M.tracking, r).toFixed(2) }
    },
    colour: () => ({ colourUse: pick(M.colour, r), colourway: Math.floor(r() * 100) }),
    motion: () => ({ motion: pick(M.motion, r), stuffMotion: pick(M.stuffMotion, r), energy: +range(M.energy, r).toFixed(2), beats: Math.round(range(M.beats, r, 1)) }),
    stuff: () => ({ stuffCount: Math.round(range(M.stuffCount, r, 1)), stuffSize: +range(M.stuffSize, r).toFixed(2), stuffDepth: pick(M.stuffDepth, r), stuffTreat: pick(M.stuffTreat, r),
      stuffSeed: Math.floor(r() * 10000), stickers: pick(M.stickers, r) }),
    texture: () => ({ layers: texture(pick(M.texture, r), params, Math.floor(r() * 1e6).toString(36)) }),
  }
  for (const [facet, deal] of Object.entries(dealt)) {
    const next = deal()
    if (!locked(facet)) Object.assign(params, next)
  }
  return params
}

export const moodTexture = texture
