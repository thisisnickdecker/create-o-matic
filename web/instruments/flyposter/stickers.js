// Stickers and shapes, drawn in code: bursts, stars, hearts, arrows and the rest, for scattering
// and for holding a call to action. Each is a path in a box from -1 to 1, centred on 0, so it can be
// placed, scaled and turned like an emoji. A few are lines rather than fills (line: true).
const TAU = Math.PI * 2

export const STICKERS = [
  ["burst", "Burst"], ["star", "Star"], ["heart", "Heart"], ["flower", "Flower"], ["asterisk", "Asterisk"],
  ["arrow", "Arrow"], ["bolt", "Bolt"], ["smile", "Smile"], ["blob", "Blob"], ["circle", "Dot"],
  ["squiggle", "Squiggle"], ["sparkle", "Sparkle"], ["eye", "Eye"], ["pill", "Pill"],
]
export const STICKER_IDS = new Set(STICKERS.map(([id]) => id))
export const stickersOf = (text) => String(text || "").toLowerCase().split(/[\s,]+/).filter((s) => STICKER_IDS.has(s))

function radial(n, inner, round = 0) {
  const p = new Path2D()
  for (let i = 0; i <= n * 2; i++) {
    const a = (i / (n * 2)) * TAU - Math.PI / 2, r = i % 2 ? inner : 1
    const x = Math.cos(a) * r, y = Math.sin(a) * r
    if (!i) p.moveTo(x, y)
    else if (round && i % 2) p.quadraticCurveTo(Math.cos(a) * inner * (1 - round), Math.sin(a) * inner * (1 - round), x, y)
    else p.lineTo(x, y)
  }
  p.closePath()
  return p
}

const cache = new Map()
// The sticker's path. seed varies the ones with a hand-made wobble (blob).
export function stickerPath(id, seed = 0) {
  const key = `${id}|${id === "blob" ? seed % 8 : 0}`
  if (cache.has(key)) return cache.get(key)
  let p = new Path2D(), line = false
  switch (id) {
    case "burst": p = radial(16, 0.78); break
    case "star": p = radial(5, 0.45); break
    case "sparkle": {
      p.moveTo(0, -1)
      for (const [x, y] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) p.quadraticCurveTo(0, 0, x, y)
      p.closePath()
      break
    }
    case "heart": {
      p.moveTo(0, 1)
      p.bezierCurveTo(-0.6, 0.55, -1, 0.15, -1, -0.3)
      p.bezierCurveTo(-1, -0.8, -0.35, -1.05, 0, -0.55)
      p.bezierCurveTo(0.35, -1.05, 1, -0.8, 1, -0.3)
      p.bezierCurveTo(1, 0.15, 0.6, 0.55, 0, 1)
      p.closePath()
      break
    }
    case "flower": {
      for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; p.ellipse(Math.cos(a) * 0.55, Math.sin(a) * 0.55, 0.45, 0.45, 0, 0, TAU) }
      break
    }
    case "asterisk": {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU, c = Math.cos(a), s = Math.sin(a), w = 0.16
        p.moveTo(-s * w, c * w); p.lineTo(c - s * w, s + c * w); p.lineTo(c + s * w, s - c * w); p.lineTo(s * w, -c * w); p.closePath()
      }
      p.arc(0, 0, 0.26, 0, TAU)
      break
    }
    case "arrow": {
      p.moveTo(-1, -0.28); p.lineTo(0.2, -0.28); p.lineTo(0.2, -0.75); p.lineTo(1, 0); p.lineTo(0.2, 0.75); p.lineTo(0.2, 0.28); p.lineTo(-1, 0.28); p.closePath()
      break
    }
    case "bolt": {
      p.moveTo(0.25, -1); p.lineTo(-0.6, 0.12); p.lineTo(-0.02, 0.12); p.lineTo(-0.3, 1); p.lineTo(0.62, -0.18); p.lineTo(0.04, -0.18); p.lineTo(0.38, -1); p.closePath()
      break
    }
    case "smile": {
      p.arc(0, 0, 1, 0, TAU)
      p.moveTo(-0.28, -0.3); p.ellipse(-0.33, -0.3, 0.1, 0.17, 0, 0, TAU)
      p.moveTo(0.43, -0.3); p.ellipse(0.33, -0.3, 0.1, 0.17, 0, 0, TAU)
      p.moveTo(-0.55, 0.15); p.quadraticCurveTo(0, 0.85, 0.55, 0.15); p.quadraticCurveTo(0, 0.55, -0.55, 0.15)
      break
    }
    case "blob": {
      const k = seed % 8, n = 7, pts = []
      for (let i = 0; i < n; i++) { const a = (i / n) * TAU, r = 0.72 + 0.28 * Math.sin(i * 2.3 + k * 1.7) ; pts.push([Math.cos(a) * r, Math.sin(a) * r]) }
      const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
      p.moveTo(...mid(pts[n - 1], pts[0]))
      for (let i = 0; i < n; i++) p.quadraticCurveTo(...pts[i], ...mid(pts[i], pts[(i + 1) % n]))
      p.closePath()
      break
    }
    case "circle": p.arc(0, 0, 1, 0, TAU); break
    case "pill": p.roundRect(-1, -0.45, 2, 0.9, 0.45); break
    case "eye": {
      p.moveTo(-1, 0); p.quadraticCurveTo(0, -1, 1, 0); p.quadraticCurveTo(0, 1, -1, 0); p.closePath()
      p.moveTo(0.36, 0); p.arc(0, 0, 0.36, 0, TAU, true)
      p.moveTo(0.16, 0); p.arc(0, 0, 0.16, 0, TAU)
      break
    }
    case "squiggle": {
      line = true
      p.moveTo(-1, 0)
      for (let i = 0; i < 4; i++) p.quadraticCurveTo(-0.75 + i * 0.5, i % 2 ? 0.55 : -0.55, -0.5 + i * 0.5, 0)
      break
    }
  }
  const out = { path: p, line, rule: id === "eye" || id === "smile" || id === "asterisk" ? "evenodd" : "nonzero" }
  if (id === "asterisk" || id === "flower") out.rule = "nonzero"
  cache.set(key, out)
  return out
}
