// Pin button: the finished frame printed on paper and crimped onto a metal campaign button, sitting
// on a table. Domed shading, a rolled rim, a soft gloss, printed-paper fibre and a little wear. The
// artwork keeps moving; the button holds still, the way a real one would under a camera.
import { hash, hexRgb } from "./util.js"

const scratch = typeof document !== "undefined" ? document.createElement("canvas").getContext("2d", { willReadFrequently: true }) : null
const fibres = new Map() // seed -> canvas: a small tile of paper fibre, made once

function fibreTile(seed) {
  if (!fibres.has(seed)) {
    const N = 160
    const c = document.createElement("canvas").getContext("2d", { willReadFrequently: true })
    c.canvas.width = c.canvas.height = N
    const img = c.createImageData(N, N)
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      // Fine grain plus streaks running one way, like the grain of coated paper.
      const g = hash(seed, x, y, 5) * 0.6 + hash(seed, x >> 3, y, 6) * 0.4
      const v = Math.round(g * 255), i = (y * N + x) * 4
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v
      img.data[i + 3] = 255
    }
    c.putImageData(img, 0, 0)
    fibres.set(seed, c.canvas)
  }
  return fibres.get(seed)
}

export default {
  id: "pin",
  label: "Pin button",
  params: [
    { key: "pin", label: "Pin button", type: "number", min: 0, max: 1.2, step: 0.01, default: 0, help: "The button's size, as a share of the frame's short side. 0 is off." },
    { key: "pinTable", when: { pin: { not: 0 } }, label: "Table", type: "color", default: "#E9E6E0" },
    { key: "pinGloss", when: { pin: { not: 0 } }, label: "Gloss", type: "number", min: 0, max: 1, step: 0.01, default: 0.55 },
    { key: "pinWear", when: { pin: { not: 0 } }, label: "Wear", type: "number", min: 0, max: 1, step: 0.01, default: 0.35, help: "Paper fibre, scuffs and a little fading, like a button from a drawer." },
  ],
  active: (p) => p.pin > 0,
  apply(ctx, p, { scale, seed, background, clear }) {
    const { width: W, height: H } = ctx.canvas
    const art = scratch.canvas
    if (art.width !== W || art.height !== H) { art.width = W; art.height = H }
    scratch.clearRect(0, 0, W, H)
    scratch.drawImage(ctx.canvas, 0, 0)

    const R = (Math.min(W, H) * p.pin) / 2, cx = W / 2, cy = H / 2
    const S = Math.min(W, H) // the square of the artwork that's printed on the button
    const disc = (r) => { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2) }

    // On a see-through frame there's no table, just the button and its shadow, printed on the
    // background so the button stays solid.
    ctx.save()
    if (clear) ctx.clearRect(0, 0, W, H)
    else { ctx.fillStyle = p.pinTable; ctx.fillRect(0, 0, W, H) }
    // Shadow: a soft cast shadow and a tight contact shadow.
    ctx.fillStyle = clear ? background : p.pinTable
    ctx.shadowColor = "rgba(0, 0, 0, .28)"
    ctx.shadowBlur = R * 0.16
    ctx.shadowOffsetY = R * 0.07
    disc(R); ctx.fill()
    ctx.shadowColor = "rgba(0, 0, 0, .35)"
    ctx.shadowBlur = R * 0.025
    ctx.shadowOffsetY = R * 0.012
    disc(R); ctx.fill()
    ctx.restore()

    // The print, wrapped over the dome.
    ctx.save()
    disc(R); ctx.clip()
    ctx.drawImage(art, (W - S) / 2, (H - S) / 2, S, S, cx - R, cy - R, 2 * R, 2 * R)

    // Paper: fibre multiplied in, and faded a touch by wear.
    if (p.pinWear > 0) {
      const pat = ctx.createPattern(fibreTile(seed), "repeat")
      pat.setTransform(new DOMMatrix().scale(Math.max(scale, 0.25) * 1.6))
      ctx.globalCompositeOperation = "multiply"
      ctx.globalAlpha = 0.18 * p.pinWear
      ctx.fillStyle = pat
      ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R)
      ctx.globalCompositeOperation = "screen"
      ctx.globalAlpha = 0.1 * p.pinWear
      ctx.fillStyle = "#F4EFE4"
      ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R)
      ctx.globalAlpha = 1
    }

    // The dome: darker towards the edge where the paper curls under.
    ctx.globalCompositeOperation = "multiply"
    const dome = ctx.createRadialGradient(cx - R * 0.15, cy - R * 0.2, R * 0.3, cx, cy, R)
    dome.addColorStop(0, "rgba(255, 255, 255, 1)")
    dome.addColorStop(0.78, "rgba(236, 234, 230, 1)")
    dome.addColorStop(0.93, "rgba(170, 166, 160, 1)")
    dome.addColorStop(1, "rgba(90, 86, 82, 1)")
    ctx.fillStyle = dome
    ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R)
    ctx.globalCompositeOperation = "source-over"

    // Gloss: a broad soft light from the upper left, and a sharp crescent on the rim.
    if (p.pinGloss > 0) {
      const g = ctx.createRadialGradient(cx - R * 0.42, cy - R * 0.5, 0, cx - R * 0.42, cy - R * 0.5, R * 0.95)
      g.addColorStop(0, `rgba(255, 255, 255, ${0.42 * p.pinGloss})`)
      g.addColorStop(0.5, `rgba(255, 255, 255, ${0.12 * p.pinGloss})`)
      g.addColorStop(1, "rgba(255, 255, 255, 0)")
      ctx.fillStyle = g
      ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R)
      ctx.lineCap = "round"
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.7 * p.pinGloss})`
      ctx.lineWidth = R * 0.035
      ctx.beginPath(); ctx.arc(cx, cy, R * 0.9, Math.PI * 1.08, Math.PI * 1.42); ctx.stroke()
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.25 * p.pinGloss})`
      ctx.lineWidth = R * 0.02
      ctx.beginPath(); ctx.arc(cx, cy, R * 0.9, Math.PI * 0.18, Math.PI * 0.3); ctx.stroke()
    }

    // Wear: a few fine scuffs across the face.
    if (p.pinWear > 0) {
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.22 * p.pinWear})`
      ctx.lineWidth = Math.max(0.5, R * 0.003)
      const n = Math.round(14 * p.pinWear)
      for (let i = 0; i < n; i++) {
        const a = hash(seed, i, 1) * Math.PI * 2, d = hash(seed, i, 2) * R * 0.85
        const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d, len = R * (0.04 + hash(seed, i, 3) * 0.14), b = hash(seed, i, 4) * Math.PI
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(b) * len, y + Math.sin(b) * len); ctx.stroke()
      }
    }
    ctx.restore()

    // The rolled rim: a thin band lit from the upper left.
    const rim = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R)
    rim.addColorStop(0, "rgba(255, 255, 255, .75)")
    rim.addColorStop(0.5, "rgba(255, 255, 255, .05)")
    rim.addColorStop(1, "rgba(0, 0, 0, .45)")
    ctx.strokeStyle = rim
    ctx.lineWidth = R * 0.03
    disc(R - R * 0.015); ctx.stroke()
    const [r, g, b] = hexRgb(p.pinTable)
    ctx.strokeStyle = `rgba(${r * 0.4}, ${g * 0.4}, ${b * 0.4}, .5)`
    ctx.lineWidth = Math.max(1, R * 0.004)
    disc(R); ctx.stroke()
  },
}
