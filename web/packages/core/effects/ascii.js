// ASCII: the frame re-set in type. The picture is cut into a grid of character cells; each cell's
// brightness picks a character from a set running sparse to dense, drawn in the cell's own colour
// (or one ink) over a dim tile of that colour. Flicker swaps a few characters for others from the
// set every step, so stills seem to compute; a scan line sweeps the frame once a loop, lifting and
// scrambling the cells it passes. Characters are drawn once to an atlas and stamped from it, and
// the whole layer is coloured in one pass, so it stays quick at small sizes.
import { hash, hexRgb } from "./util.js"

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
const lum = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255

const canvas = (w, h) => Object.assign(document.createElement("canvas"), { width: w, height: h })

// The characters drawn white on clear, one per slot in a row, at the cell's size. Kept between
// frames while the set and size stay the same.
let atlas = null
function glyphs(chars, cw, ch, weight) {
  const key = `${chars}|${cw}|${ch}|${weight}`
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
  atlas = { key, canvas: c }
  return atlas
}

// Reused layers: the cell colours (one pixel per cell) and the characters, coloured.
const layers = typeof document !== "undefined" ? { cells: canvas(1, 1), type: canvas(1, 1) } : null

export default {
  id: "ascii",
  label: "ASCII",
  group: "Code",
  params: [
    { key: "ascii", label: "ASCII", type: "number", min: 0, max: 80, step: 0.5, default: 0, unit: "px", help: "Height of a character cell. 0 is off." },
    { key: "asciiSet", label: "Characters", type: "select", default: "classic", when: { ascii: { not: 0 } }, options: [["classic", "Classic  .:-=+*#%@"], ["dense", "Dense (70 steps)"], ["blocks", "Blocks ░▒▓█"], ["binary", "Binary 01"], ["slashes", "Slashes /\\|x"], ["kana", "Half-width kana"], ["custom", "My own"]] },
    { key: "asciiChars", label: "My characters", type: "string", default: " .oO@", when: { asciiSet: "custom" }, help: "From sparse to dense. Start with a space so the darkest parts stay empty." },
    { key: "asciiInk", label: "Character colour", type: "select", default: "source", when: { ascii: { not: 0 } }, options: [["source", "From the picture"], ["ink", "One ink"]] },
    { key: "asciiColour", label: "Ink", type: "color", default: "#39FF7A", when: { asciiInk: "ink" } },
    { key: "asciiGround", label: "Ground", type: "color", default: "#0B0B0A", when: { ascii: { not: 0 } }, help: "What the characters sit on. On a light ground, dark parts of the picture get the densest characters." },
    { key: "asciiTiles", label: "Tiles", type: "number", min: 0, max: 1, step: 0.01, default: 0.25, when: { ascii: { not: 0 } }, help: "Each cell's colour behind its character, as a block of pixels. 0 is characters alone." },
    { key: "asciiCurve", label: "Contrast curve", type: "number", min: 0.3, max: 3, step: 0.01, default: 1, when: { ascii: { not: 0 } }, help: "Above 1, more cells drop to empty; below 1, more fill in." },
    { key: "asciiWeight", label: "Weight", type: "select", default: "400", when: { ascii: { not: 0 } }, options: [["300", "Light"], ["400", "Regular"], ["700", "Bold"]] },
    { key: "asciiFlicker", label: "Flicker", type: "number", min: 0, max: 1, step: 0.01, default: 0.06, when: { ascii: { not: 0 } }, help: "Share of characters that swap for another each step. Empty cells stay empty." },
    { key: "asciiSteps", label: "Flicker steps", type: "int", min: 1, max: 120, step: 1, default: 30, animate: false, when: { asciiFlicker: { not: 0 } }, help: "How many times per loop the characters change." },
    { key: "asciiScan", label: "Scan line", type: "number", min: 0, max: 1, step: 0.01, default: 0, when: { ascii: { not: 0 } }, help: "A band that sweeps down the frame once a loop, lighting and scrambling what it passes." },
  ],
  layerDefaults: { ascii: 14 },
  active: (p) => p.ascii >= 2,
  apply(ctx, p, { t, scale, seed }) {
    const { width: W, height: H } = ctx.canvas
    const chars = [...(p.asciiSet === "custom" ? p.asciiChars || " " : SETS[p.asciiSet] ?? SETS.classic)]
    const n = chars.length
    const ch = Math.max(2, Math.round(p.ascii * scale)), cw = Math.max(1, Math.round(ch * CHAR_ASPECT))
    const cols = Math.ceil(W / cw), rows = Math.ceil(H / ch)

    // The scan line: for each row, how close it is to the band, which wraps round the loop.
    const scans = Array.from({ length: rows }, (_, r) => {
      const d = Math.abs((((r + 0.5) / rows - t + 1.5) % 1) - 0.5)
      return p.asciiScan * Math.max(0, 1 - d / 0.1) ** 2
    })

    // Each cell's colour: the mean of five points across it, lifted towards white under the scan.
    const src = ctx.getImageData(0, 0, W, H).data
    const cells = new ImageData(cols, rows), c = cells.data
    for (let r = 0; r < rows; r++) {
      const lift = scans[r] * 0.9
      for (let k = 0; k < cols; k++) {
        let R = 0, G = 0, B = 0
        for (const [fx, fy] of [[0.5, 0.5], [0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
          const x = Math.min(W - 1, (k * cw + fx * cw) | 0), y = Math.min(H - 1, (r * ch + fy * ch) | 0), q = (y * W + x) * 4
          R += src[q]; G += src[q + 1]; B += src[q + 2]
        }
        const o = (r * cols + k) * 4
        R /= 5; G /= 5; B /= 5
        c[o] = R + (255 - R) * lift; c[o + 1] = G + (255 - G) * lift; c[o + 2] = B + (255 - B) * lift; c[o + 3] = 255
      }
    }

    // The ground, then the tiles: cell colours scaled up as hard-edged blocks.
    const L = layers
    L.cells.width = cols; L.cells.height = rows
    L.cells.getContext("2d").putImageData(cells, 0, 0)
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalCompositeOperation = "source-over"
    ctx.fillStyle = p.asciiGround
    ctx.fillRect(0, 0, W, H)
    ctx.imageSmoothingEnabled = false
    if (p.asciiTiles > 0) {
      ctx.globalAlpha = p.asciiTiles
      ctx.drawImage(L.cells, 0, 0, cols * cw, rows * ch)
      ctx.globalAlpha = 1
    }

    // The characters, white, stamped from the atlas. Density is contrast with the ground: on a
    // dark ground bright cells are dense, on a light one dark cells are.
    const sheet = glyphs(chars, cw, ch, p.asciiWeight).canvas
    L.type.width = W; L.type.height = H
    const tg = L.type.getContext("2d")
    const dark = lum(...hexRgb(p.asciiGround)) < 0.5
    const step = Math.floor(t * p.asciiSteps)
    for (let r = 0; r < rows; r++) {
      const scan = scans[r]
      for (let k = 0; k < cols; k++) {
        const o = (r * cols + k) * 4, l = lum(c[o], c[o + 1], c[o + 2])
        const amount = Math.min(1, (dark ? l : 1 - l) ** p.asciiCurve + scan * 0.8)
        let i = Math.round(amount * (n - 1))
        if (i > 0) {
          const cell = r * cols + k
          if (hash(seed, cell, step, 11) < p.asciiFlicker + scan) i = 1 + Math.floor(hash(seed, cell, step, 12) * (n - 1))
          tg.drawImage(sheet, i * cw, 0, cw, ch, k * cw, r * ch, cw, ch)
        }
      }
    }

    // Colour the characters in one pass: the cell colours (or the ink) kept only where there's type.
    tg.globalCompositeOperation = "source-in"
    tg.imageSmoothingEnabled = false
    if (p.asciiInk === "ink") { tg.fillStyle = p.asciiColour; tg.fillRect(0, 0, W, H) }
    else tg.drawImage(L.cells, 0, 0, cols * cw, rows * ch)
    tg.globalCompositeOperation = "source-over"
    ctx.drawImage(L.type, 0, 0)
    ctx.restore()
  },
}
