// ASCII: the frame re-set in type. The picture is cut into a grid of character cells; how far each
// cell stands out from the ground picks a character from a set running sparse to dense, drawn in
// the cell's own colour, one ink, or a sweep of inks, over a dim tile of that colour.
//
// It can move on its own, as a motion graphic: the characters fly apart and reassemble, swirl in a
// vortex, ripple out from the middle, fall as rain that writes the picture, or slip in glitching
// bands. Flicker swaps a few characters for others every step, so stills seem to compute; a scan
// line sweeps the frame once a loop, lifting and scrambling the cells it passes.
//
// Characters are drawn once to an atlas, tinted once per colour, and stamped from there, so it
// stays quick at small sizes.
import { hash, hexRgb, TAU, GROUNDS, groundOf, standout } from "./util.js"

const SETS = {
  classic: " .:-=+*#%@",
  dense: " .'`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$",
  blocks: " ░▒▓█",
  binary: " .01",
  slashes: " .,-~/\\|+xX#",
  kana: " ･ｰｦｧｨｩｪｫｬｭｮｯｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ",
}
const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace'
const CHAR_ASPECT = 0.6 // width over height of a monospace cell

const canvas = (w, h) => Object.assign(document.createElement("canvas"), { width: w, height: h })
const smooth = (x) => x * x * (3 - 2 * x)

// The characters drawn white on clear, one per slot in a row, at the cell's size, and a tinted copy
// for each colour in use. Kept between frames while the set and size stay the same.
let atlas = null
function glyphs(chars, cw, ch, weight) {
  const key = `${chars.join("")}|${cw}|${ch}|${weight}`
  if (atlas?.key === key) return atlas
  const c = canvas(Math.max(1, cw * chars.length), Math.max(1, ch))
  const g = c.getContext("2d")
  g.fillStyle = "#FFFFFF"
  g.textAlign = "center"
  g.textBaseline = "middle"
  g.font = `${weight} ${ch * 0.86}px ${MONO}`
  // A character wider than its cell (kana, some symbols) is narrowed to fit rather than cut off.
  chars.forEach((char, i) => {
    const w = g.measureText(char).width
    g.save()
    g.translate(i * cw + cw / 2, ch / 2)
    if (w > cw * 0.96) g.scale((cw * 0.96) / w, 1)
    g.fillText(char, 0, 0)
    g.restore()
  })
  atlas = { key, canvas: c, tints: new Map() }
  return atlas
}
function tint(a, colour) {
  let t = a.tints.get(colour)
  if (t) return t
  if (a.tints.size > 600) a.tints.clear()
  t = canvas(a.canvas.width, a.canvas.height)
  const g = t.getContext("2d")
  g.drawImage(a.canvas, 0, 0)
  g.globalCompositeOperation = "source-in"
  g.fillStyle = colour
  g.fillRect(0, 0, t.width, t.height)
  a.tints.set(colour, t)
  return t
}
// Colours rounded to 32 levels a channel, so neighbouring shades share a tint.
const q8 = (v) => Math.min(255, (v + 4) & ~7)
const rgb = (r, g, b) => `rgb(${q8(r | 0)},${q8(g | 0)},${q8(b | 0)})`

// Where along a list of inks u (0 to 1, wrapping) falls, as [r, g, b].
function along(inks, u) {
  const n = inks.length, x = (((u % 1) + 1) % 1) * n, i = Math.floor(x), f = smooth(x - i)
  const a = inks[i % n], b = inks[(i + 1) % n]
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]
}

// Reused layer: the cell colours, one pixel per cell, for the tiles.
const cellsLayer = typeof document !== "undefined" ? canvas(1, 1) : null

export default {
  id: "ascii",
  label: "ASCII",
  group: "Code",
  params: [
    { key: "ascii", label: "ASCII", type: "number", min: 0, max: 80, step: 0.5, default: 0, unit: "px", help: "Height of a character cell. 0 is off." },
    { key: "asciiSet", label: "Characters", type: "select", default: "classic", when: { ascii: { not: 0 } }, options: [["classic", "Classic  .:-=+*#%@"], ["dense", "Dense (70 steps)"], ["blocks", "Blocks ░▒▓█"], ["binary", "Binary 01"], ["slashes", "Slashes /\\|x"], ["kana", "Half-width kana"], ["custom", "My own"]] },
    { key: "asciiChars", label: "My characters", type: "string", default: " .oO@", when: { asciiSet: "custom" }, help: "From sparse to dense. Start with a space so the darkest parts stay empty." },
    { key: "asciiMotion", label: "Motion", type: "select", default: "still", when: { ascii: { not: 0 } }, options: [["still", "Still: follows the picture"], ["assemble", "Assemble: flies apart and back"], ["swirl", "Swirl: a vortex that untwists"], ["ripple", "Ripple: rings from the middle"], ["rain", "Rain: falling code writes it"], ["glitch", "Glitch: bands slip sideways"]], help: "The characters move on their own, on top of whatever the picture does. Every motion closes the loop." },
    { key: "asciiMotionAmount", label: "How far", type: "number", min: 0, max: 1, step: 0.01, default: 0.6, when: { asciiMotion: { not: "still" } } },
    { key: "asciiInk", label: "Character colour", type: "select", default: "source", when: { ascii: { not: 0 } }, options: [["source", "From the picture"], ["ink", "One ink"], ["sweep", "A sweep of inks"]] },
    { key: "asciiColour", label: "Ink", type: "color", default: "#39FF7A", when: { asciiInk: "ink" } },
    { key: "asciiInks", label: "Inks", type: "palette", default: ["#FF2E88", "#FFE800", "#00B3FF"], when: { asciiInk: "sweep" }, help: "They travel across the characters once a loop." },
    { key: "asciiBack", label: "Ground", type: "select", default: "frame", when: { ascii: { not: 0 } }, options: GROUNDS, help: "What the characters sit on. Anything that stands out from it becomes type." },
    { key: "asciiGround", label: "Ground colour", type: "color", default: "#0B0B0A", when: { asciiBack: "own" }, help: "On a dark ground, bright parts of the picture get the densest characters; on a light one, dark parts do." },
    { key: "asciiTiles", label: "Tiles", type: "number", min: 0, max: 1, step: 0.01, default: 0.25, when: { ascii: { not: 0 } }, help: "Each cell's colour behind its character, as a block of pixels. 0 is characters alone." },
    { key: "asciiCurve", label: "Contrast curve", type: "number", min: 0.3, max: 3, step: 0.01, default: 1, when: { ascii: { not: 0 } }, help: "Above 1, more cells drop to empty; below 1, more fill in." },
    { key: "asciiWeight", label: "Weight", type: "select", default: "400", when: { ascii: { not: 0 } }, options: [["300", "Light"], ["400", "Regular"], ["700", "Bold"]] },
    { key: "asciiFlicker", label: "Flicker", type: "number", min: 0, max: 1, step: 0.01, default: 0.06, when: { ascii: { not: 0 } }, help: "Share of characters that swap for another each step. Empty cells stay empty." },
    { key: "asciiSteps", label: "Flicker steps", type: "int", min: 1, max: 120, step: 1, default: 30, animate: false, when: { ascii: { not: 0 } }, help: "How many times per loop the characters change (and the glitch jumps)." },
    { key: "asciiScan", label: "Scan line", type: "number", min: 0, max: 1, step: 0.01, default: 0, when: { ascii: { not: 0 } }, help: "A band that sweeps down the frame once a loop, lighting and scrambling what it passes." },
  ],
  layerDefaults: { ascii: 14 },
  active: (p) => p.ascii >= 2,
  apply(ctx, p, env) {
    const { t, scale, seed } = env
    const { width: W, height: H } = ctx.canvas
    const chars = [...(p.asciiSet === "custom" ? p.asciiChars || " " : SETS[p.asciiSet] ?? SETS.classic)]
    const n = chars.length
    const ch = Math.max(2, Math.round(p.ascii * scale)), cw = Math.max(1, Math.round(ch * CHAR_ASPECT))
    const cols = Math.ceil(W / cw), rows = Math.ceil(H / ch)
    const motion = p.asciiMotion ?? "still", amt = p.asciiMotionAmount ?? 0.6
    const stands = standout(p.asciiBack, p.asciiGround, env)

    // The scan line: for each row, how close it is to the band, which wraps round the loop.
    const scans = Array.from({ length: rows }, (_, r) => {
      const d = Math.abs((((r + 0.5) / rows - t + 1.5) % 1) - 0.5)
      return p.asciiScan * Math.max(0, 1 - d / 0.1) ** 2
    })

    // Each cell's colour and cover: the mean of five points across it, lifted towards white under
    // the scan.
    const src = ctx.getImageData(0, 0, W, H).data
    const cells = new ImageData(cols, rows), c = cells.data
    for (let r = 0; r < rows; r++) {
      const lift = scans[r] * 0.9
      for (let k = 0; k < cols; k++) {
        let R = 0, G = 0, B = 0, A = 0
        for (const [fx, fy] of [[0.5, 0.5], [0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
          const x = Math.min(W - 1, (k * cw + fx * cw) | 0), y = Math.min(H - 1, (r * ch + fy * ch) | 0), q = (y * W + x) * 4
          // Weighted by cover, so a half-covered cell keeps its ink's colour, not black.
          const a = src[q + 3]
          R += src[q] * a; G += src[q + 1] * a; B += src[q + 2] * a; A += a
        }
        const o = (r * cols + k) * 4
        if (A > 0) { R /= A; G /= A; B /= A }
        c[o] = R + (255 - R) * lift; c[o + 1] = G + (255 - G) * lift; c[o + 2] = B + (255 - B) * lift; c[o + 3] = A / 5
      }
    }

    // The ground, then the tiles: cell colours scaled up as hard-edged blocks.
    const ground = groundOf(p.asciiBack, p.asciiGround, env)
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalCompositeOperation = "source-over"
    ctx.globalAlpha = 1
    if (ground) { ctx.fillStyle = ground; ctx.fillRect(0, 0, W, H) } else ctx.clearRect(0, 0, W, H)
    ctx.imageSmoothingEnabled = false
    if (p.asciiTiles > 0) {
      cellsLayer.width = cols; cellsLayer.height = rows
      cellsLayer.getContext("2d").putImageData(cells, 0, 0)
      ctx.globalAlpha = p.asciiTiles
      ctx.drawImage(cellsLayer, 0, 0, cols * cw, rows * ch)
      ctx.globalAlpha = 1
    }

    const a = glyphs(chars, cw, ch, p.asciiWeight)
    const step = Math.floor(t * p.asciiSteps)
    const cx = W / 2, cy = H / 2, reach = Math.hypot(cx, cy), diag = Math.hypot(W, H)
    const sweep = p.asciiInk === "sweep" ? (p.asciiInks?.length ? p.asciiInks : ["#FFFFFF"]).map(hexRgb) : null
    const one = p.asciiInk === "ink" ? tint(a, p.asciiColour) : null

    // Glitch: bands of rows, cut afresh each step; some slip sideways by whole cells.
    let slip = null
    if (motion === "glitch" && amt > 0) {
      slip = new Float32Array(rows)
      for (let r = 0, band = 0; r < rows; band++) {
        const tall = 1 + Math.floor(hash(seed, band, step, 81) * Math.max(2, rows / 6))
        const moves = hash(seed, band, step, 82) < 0.15 + 0.5 * amt
        const by = moves ? Math.round((hash(seed, band, step, 83) - 0.5) * 2 * amt * cols * 0.4) * cw : 0
        for (let j = 0; j < tall && r < rows; j++, r++) slip[r] = by
      }
    }

    for (let r = 0; r < rows; r++) {
      const scan = scans[r]
      for (let k = 0; k < cols; k++) {
        const o = (r * cols + k) * 4, cell = r * cols + k
        let amount = Math.min(1, stands(c[o], c[o + 1], c[o + 2], c[o + 3]) ** p.asciiCurve + scan * 0.8)
        if (amount <= 0.5 / (n - 1)) continue
        let x = k * cw, y = r * ch, size = 1, scramble = p.asciiFlicker + scan, light = 0, fade = 1

        if (motion !== "still" && amt > 0) {
          const hx = x + cw / 2 - cx, hy = y + ch / 2 - cy, rn = Math.hypot(hx, hy) / reach
          if (motion === "assemble") {
            // Home, then out (a wave from the middle), a hang, and home again before the loop ends.
            const u = (((t - hash(seed, cell, 61) * 0.06 - rn * 0.06) % 1) + 1) % 1
            const f = u < 0.3 ? 0 : u < 0.5 ? smooth((u - 0.3) / 0.2) : u < 0.6 ? 1 : u < 0.86 ? 1 - smooth((u - 0.6) / 0.26) : 0
            if (f > 0) {
              // A burst: outwards from the middle, give or take, the outer ones furthest.
              const ang = Math.atan2(hy, hx) + (hash(seed, cell, 62) - 0.5) * 0.5, d = amt * diag * (0.04 + rn * (0.6 + 0.8 * hash(seed, cell, 63) ** 2)) * f
              x += Math.cos(ang) * d; y += Math.sin(ang) * d
              size = 1 + f * amt * 3 * hash(seed, cell, 64) ** 3
              scramble += f
            }
          } else if (motion === "swirl") {
            const ang = amt * 4 * (1 - rn) ** 2 * (0.5 - 0.5 * Math.cos(TAU * t))
            const s = Math.sin(ang), co = Math.cos(ang)
            x = cx + hx * co - hy * s - cw / 2; y = cy + hx * s + hy * co - ch / 2
            scramble += Math.min(1, ang) * 0.4
          } else if (motion === "ripple") {
            const wave = Math.sin(TAU * (rn * 3 - t))
            const push = amt * ch * 2.2 * wave, len = Math.hypot(hx, hy) || 1
            x += (hx / len) * push; y += (hy / len) * push
            const crest = Math.max(0, wave) ** 4
            amount = Math.min(1, amount + crest * amt * 0.5)
            light = crest * amt * 0.5
          } else if (motion === "rain") {
            // Each column has its own drops (a whole number a loop), each trailing a fading tail;
            // the picture shows where they've just been.
            const drops = 1 + Math.floor(hash(seed, k, 71) * 3), tail = 0.55
            const head = (((hash(seed, k, 72) + t * drops) % 1) + 1) % 1 * (1 + tail)
            const behind = head - (r + 0.5) / rows
            const glow = behind >= 0 && behind < tail ? 1 - behind / tail : 0
            // Out of the rain, only a few characters stay, fewer the further it goes.
            if (glow === 0 && hash(seed, cell, step, 73) < amt) continue
            fade = 1 - amt + amt * (0.25 + 0.75 * glow)
            if (behind >= 0 && behind < 1.5 / rows) { light = 0.85; scramble = 1; fade = 1 }
            else scramble += glow * 0.25
          } else if (slip) {
            if (slip[r]) { x = (((x + slip[r]) % W) + W) % W; scramble = 1 }
          }
        }

        let i = Math.max(1, Math.round(amount * (n - 1)))
        if (scramble > 0 && hash(seed, cell, step, 11) < scramble) i = 1 + Math.floor(hash(seed, cell, step, 12) * (n - 1))

        let sheet = one && !light ? one : null
        if (!sheet) {
          const [R, G, B] = one ? hexRgb(p.asciiColour) : sweep ? along(sweep, (k / cols + r / rows) * 0.5 - t) : [c[o], c[o + 1], c[o + 2]]
          sheet = tint(a, rgb(R + (255 - R) * light, G + (255 - G) * light, B + (255 - B) * light))
        }
        ctx.globalAlpha = fade
        if (size === 1) ctx.drawImage(sheet, i * cw, 0, cw, ch, Math.round(x), Math.round(y), cw, ch)
        else ctx.drawImage(sheet, i * cw, 0, cw, ch, x - (cw * (size - 1)) / 2, y - (ch * (size - 1)) / 2, cw * size, ch * size)
      }
    }
    ctx.globalAlpha = 1
    ctx.restore()
  },
}
