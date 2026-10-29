// Print effects: Risograph, Chroma split and Film. Each imitates something a machine does to ink
// or light, not a filter for its own sake.
import { hash, hexRgb } from "./util.js"

const scratch = typeof document !== "undefined" ? document.createElement("canvas").getContext("2d", { willReadFrequently: true }) : null

// Risograph: the image separated into two or three inks, each printed as stochastic dots from its
// own drum, slightly out of register, overprinting on the paper (inks multiply where they meet).
export const riso = {
  id: "riso",
  label: "Risograph",
  group: "Print",
  params: [
    { key: "riso", label: "Risograph", type: "number", min: 0, max: 1, step: 0.01, default: 0, help: "Strength of the riso print over the original." },
    { key: "risoInks", label: "Drums", type: "palette", default: ["#0078BF", "#FF48B0", "#FFE800"], when: { riso: { not: 0 } }, help: "One ink per drum, in printing order. Real riso inks: blue #0078BF, fluoro pink #FF48B0, yellow #FFE800, black #000000." },
    { key: "risoPaper", label: "Paper", type: "color", default: "#F4F0E6", when: { riso: { not: 0 } } },
    { key: "risoGrain", label: "Dot grain", type: "number", min: 0, max: 1, step: 0.01, default: 0.7, when: { riso: { not: 0 } }, help: "0 prints flat posterised areas; 1 is fine stochastic dots." },
    { key: "risoShift", label: "Misregister", type: "number", min: 0, max: 40, step: 0.5, default: 6, unit: "px", when: { riso: { not: 0 } } },
  ],
  layerDefaults: { riso: 1 },
  active: (p) => p.riso > 0,
  apply(ctx, p, { scale, seed }) {
    const { width: W, height: H } = ctx.canvas
    const src = ctx.getImageData(0, 0, W, H).data
    const inks = p.risoInks.slice(0, 4).map(hexRgb), paper = hexRgb(p.risoPaper)
    const out = ctx.createImageData(W, H), o = out.data
    // Separation: each ink's density is how far the pixel sits from the paper towards that ink.
    const axis = inks.map((c) => { const v = [paper[0] - c[0], paper[1] - c[1], paper[2] - c[2]]; return [v, v[0] * v[0] + v[1] * v[1] + v[2] * v[2] || 1] })
    const offs = inks.map((_, k) => { const a = hash(seed, k, 71) * Math.PI * 2; return [Math.round(Math.cos(a) * p.risoShift * scale * (k ? 1 : 0)), Math.round(Math.sin(a) * p.risoShift * scale * (k ? 1 : 0))] })
    const g = p.risoGrain
    for (let y = 0; y < H; y++) {
      const oy = (y / scale) | 0
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4, ox = (x / scale) | 0
        let r = paper[0], gg = paper[1], b = paper[2]
        for (let k = 0; k < inks.length; k++) {
          const sx = Math.min(W - 1, Math.max(0, x + offs[k][0])), sy = Math.min(H - 1, Math.max(0, y + offs[k][1]))
          const j = (sy * W + sx) * 4
          const [v, len] = axis[k]
          let dens = ((paper[0] - src[j]) * v[0] + (paper[1] - src[j + 1]) * v[1] + (paper[2] - src[j + 2]) * v[2]) / len
          dens = Math.min(1, Math.max(0, dens))
          const n = 0.5 + (hash(seed + k * 13, ox, oy) - 0.5) * g
          if (dens > n) { r *= inks[k][0] / 255; gg *= inks[k][1] / 255; b *= inks[k][2] / 255 }
        }
        // Ink never covers perfectly: a whisper of paper shows through.
        o[i] = r + (paper[0] - r) * 0.06; o[i + 1] = gg + (paper[1] - gg) * 0.06; o[i + 2] = b + (paper[2] - b) * 0.06; o[i + 3] = 255
      }
    }
    if (p.riso >= 1) { ctx.putImageData(out, 0, 0); return }
    scratch.canvas.width = W; scratch.canvas.height = H
    scratch.putImageData(out, 0, 0)
    ctx.globalAlpha = p.riso
    ctx.drawImage(scratch.canvas, 0, 0)
    ctx.globalAlpha = 1
  },
}

// Chroma: red and blue pulled apart along an angle, as a cheap lens or a bad VHS deck would.
export const chroma = {
  id: "chroma",
  label: "Chroma split",
  group: "Texture",
  params: [
    { key: "chroma", label: "Chroma split", type: "number", min: 0, max: 60, step: 0.5, default: 0, unit: "px" },
    { key: "chromaAngle", label: "Split angle", type: "number", min: 0, max: 360, step: 1, default: 0, unit: "°", when: { chroma: { not: 0 } } },
  ],
  layerDefaults: { chroma: 8 },
  active: (p) => p.chroma > 0,
  apply(ctx, p, { scale }) {
    const { width: W, height: H } = ctx.canvas
    const img = ctx.getImageData(0, 0, W, H), s = img.data.slice(), d = img.data
    const a = (p.chromaAngle * Math.PI) / 180, dx = Math.round(Math.cos(a) * p.chroma * scale), dy = Math.round(Math.sin(a) * p.chroma * scale)
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4
      const rx = Math.min(W - 1, Math.max(0, x - dx)), ry = Math.min(H - 1, Math.max(0, y - dy))
      const bx = Math.min(W - 1, Math.max(0, x + dx)), by = Math.min(H - 1, Math.max(0, y + dy))
      d[i] = s[(ry * W + rx) * 4]
      d[i + 2] = s[(by * W + bx) * 4 + 2]
    }
    ctx.putImageData(img, 0, 0)
  },
}

// Film: halation (bright areas bleed a warm red glow, as light scatters back through the film),
// a lifted, faded black, and a vignette.
export const film = {
  id: "film",
  label: "Film",
  group: "Texture",
  params: [
    { key: "filmHalation", label: "Halation", type: "number", min: 0, max: 1, step: 0.01, default: 0 },
    { key: "filmFade", label: "Fade", type: "number", min: 0, max: 1, step: 0.01, default: 0, help: "Lifts the blacks, like old print stock." },
    { key: "filmVignette", label: "Vignette", type: "number", min: 0, max: 1, step: 0.01, default: 0 },
  ],
  layerDefaults: { filmHalation: 0.6, filmFade: 0.25, filmVignette: 0.4 },
  active: (p) => p.filmHalation > 0 || p.filmFade > 0 || p.filmVignette > 0,
  apply(ctx, p) {
    const { width: W, height: H } = ctx.canvas
    if (p.filmHalation > 0) {
      // The glow: the brightest parts, shrunk and regrown (a cheap wide blur), tinted, screened on.
      const k = 1 / 24, sw = Math.max(1, Math.round(W * k)), sh = Math.max(1, Math.round(H * k))
      scratch.canvas.width = sw; scratch.canvas.height = sh
      scratch.imageSmoothingQuality = "high"
      scratch.drawImage(ctx.canvas, 0, 0, sw, sh)
      const g = scratch.getImageData(0, 0, sw, sh), d = g.data
      for (let i = 0; i < d.length; i += 4) {
        const L = Math.max(0, (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2] - 170) / 85)
        d[i] = 255 * L; d[i + 1] = 70 * L; d[i + 2] = 40 * L
      }
      scratch.putImageData(g, 0, 0)
      ctx.save()
      ctx.globalCompositeOperation = "screen"
      ctx.globalAlpha = p.filmHalation
      ctx.imageSmoothingQuality = "high"
      ctx.drawImage(scratch.canvas, 0, 0, W, H)
      ctx.restore()
    }
    if (p.filmFade > 0) {
      ctx.save()
      ctx.globalCompositeOperation = "lighten"
      ctx.fillStyle = `rgb(${Math.round(50 * p.filmFade)}, ${Math.round(44 * p.filmFade)}, ${Math.round(40 * p.filmFade)})`
      ctx.fillRect(0, 0, W, H)
      ctx.restore()
    }
    if (p.filmVignette > 0) {
      const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.hypot(W, H) / 2)
      v.addColorStop(0, "rgba(0, 0, 0, 0)")
      v.addColorStop(1, `rgba(0, 0, 0, ${0.75 * p.filmVignette})`)
      ctx.fillStyle = v
      ctx.fillRect(0, 0, W, H)
    }
  },
}
