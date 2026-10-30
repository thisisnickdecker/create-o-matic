// ProRes 4444 with alpha, written from scratch: the one see-through video format that macOS, iOS,
// Keynote, Final Cut, Premiere and After Effects all read (browsers can't encode it). Pure: RGBA in,
// bytes out, no DOM.
//
//   proresFrame(rgba, w, h, { quant })  one frame (Uint8Array), from straight (unpremultiplied) RGBA
//
// Every frame is a picture on its own (ProRes has no motion prediction). Each 16-pixel-tall row is
// cut into slices of up to 8 macroblocks; each slice holds Y, Cb and Cr at full resolution as 8×8
// DCT blocks, quantised and entropy-coded, then the alpha, run-length coded and lossless. The
// bitstream follows SMPTE RDD 36; FFmpeg's decoder was the reference for the details, and Apple's
// decoder (AVFoundation) is the check.

// The order coefficients are sent in, across all the blocks of a slice at once.
const SCAN = [
  0, 1, 8, 9, 2, 3, 10, 11, 16, 17, 24, 25, 18, 19, 26, 27,
  4, 5, 12, 20, 13, 6, 7, 14, 21, 28, 29, 22, 15, 23, 30, 31,
  32, 33, 40, 48, 41, 34, 35, 42, 49, 56, 57, 50, 43, 36, 37, 44,
  51, 58, 59, 52, 45, 38, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63,
]
// Codebooks: a codeword's Rice order, exp-Golomb order and switch point, packed in a byte. The
// one used next depends on the last value sent.
const FIRST_DC = 0xb8
const DC_CB = [0x04, 0x28, 0x28, 0x4d, 0x4d, 0x70, 0x70]
const RUN_CB = [0x06, 0x06, 0x05, 0x05, 0x04, 0x29, 0x29, 0x29, 0x29, 0x28, 0x28, 0x28, 0x28, 0x28, 0x28, 0x4c]
const LEVEL_CB = [0x04, 0x0a, 0x05, 0x06, 0x04, 0x28, 0x28, 0x28, 0x28, 0x4c]
const MBS_PER_SLICE = 8

// Bits, most significant first, into a buffer that grows.
class Bits {
  constructor(size = 1 << 16) { this.buf = new Uint8Array(size); this.pos = 0; this.acc = 0; this.n = 0 }
  put(count, value) {
    while (count > 0) {
      const take = Math.min(count, 8)
      count -= take
      this.acc = (this.acc << take) | ((value / 2 ** count) & ((1 << take) - 1))
      this.n += take
      while (this.n >= 8) { this.n -= 8; this.byte((this.acc >> this.n) & 255) }
      this.acc &= (1 << this.n) - 1
    }
  }
  byte(b) {
    if (this.pos === this.buf.length) { const next = new Uint8Array(this.buf.length * 2); next.set(this.buf); this.buf = next }
    this.buf[this.pos++] = b
  }
  // Pad to a whole byte, as each plane of a slice must end on one.
  flush() { if (this.n) this.put(8 - this.n, 0) }
}

// One codeword: Rice below the switch point, exp-Golomb above it.
function codeword(bits, codebook, val) {
  const switchBits = (codebook & 3) + 1, rice = codebook >> 5, exp = (codebook >> 2) & 7
  const switchVal = switchBits << rice
  if (val >= switchVal) {
    val -= switchVal - (1 << exp)
    const e = 31 - Math.clz32(val)
    bits.put(e - exp + switchBits, 0)
    bits.put(e + 1, val)
  } else {
    const e = val >> rice
    if (e) bits.put(e, 0)
    bits.put(1, 1)
    if (rice) bits.put(rice, val & ((1 << rice) - 1))
  }
}
const signOf = (x) => (x < 0 ? -1 : 0)
const code = (x) => (x * 2) ^ (x >> 31)

// The 8×8 DCT, four times orthonormal (the scale ProRes expects), as two passes over a cosine table.
const COS = new Float64Array(64)
for (let u = 0; u < 8; u++) for (let x = 0; x < 8; x++) COS[u * 8 + x] = (u ? 1 : Math.SQRT1_2) * Math.cos(((2 * x + 1) * u * Math.PI) / 16) / 2
const tmp = new Float64Array(64)
function dct(src, out, o) {
  // A flat block, as most of a typographic frame is, has only its DC.
  let flat = true
  for (let i = 1; i < 64 && flat; i++) flat = src[i] === src[0]
  if (flat) { out.fill(0, o, o + 64); out[o] = 32 * src[0]; return }
  for (let y = 0; y < 8; y++) for (let u = 0; u < 8; u++) {
    let s = 0
    for (let x = 0; x < 8; x++) s += COS[u * 8 + x] * src[y * 8 + x]
    tmp[y * 8 + u] = s
  }
  for (let v = 0; v < 8; v++) for (let u = 0; u < 8; u++) {
    let s = 0
    for (let y = 0; y < 8; y++) s += COS[v * 8 + y] * tmp[y * 8 + u]
    out[o + v * 8 + u] = Math.round(4 * s)
  }
}

function encodeDCs(bits, blocks, count, q) {
  let prev = Math.trunc((blocks[0] - 0x4000) / q), sign = 0, cb = 5
  codeword(bits, FIRST_DC, code(prev))
  for (let i = 1; i < count; i++) {
    const dc = Math.trunc((blocks[i * 64] - 0x4000) / q)
    let delta = dc - prev
    const next = signOf(delta)
    delta = (delta ^ sign) - sign
    const c = code(delta)
    codeword(bits, DC_CB[cb], c)
    cb = Math.min(c, 6)
    sign = next
    prev = dc
  }
}

function encodeACs(bits, blocks, count, q) {
  let prevRun = 4, prevLevel = 2, run = 0
  for (let i = 1; i < 64; i++) {
    const at = SCAN[i]
    for (let b = 0; b < count; b++) {
      const level = Math.trunc(blocks[b * 64 + at] / q)
      if (!level) { run++; continue }
      const abs = Math.abs(level)
      codeword(bits, RUN_CB[prevRun], run)
      codeword(bits, LEVEL_CB[prevLevel], abs - 1)
      bits.put(1, level < 0 ? 1 : 0)
      prevRun = Math.min(run, 15)
      prevLevel = Math.min(abs, 9)
      run = 0
    }
  }
}

// Alpha, 8 bits: each change as a small or full difference, each repeat as a run.
function encodeAlpha(bits, alpha) {
  const diff = (cur, prev) => {
    let d = (cur - prev) & 255
    if (d >= 256 - 8) d -= 256
    if (d < -8 || d > 8 || !d) { bits.put(1, 1); bits.put(8, d & 255) }
    else { bits.put(1, 0); bits.put(3, Math.abs(d) - 1); bits.put(1, d < 0 ? 1 : 0) }
  }
  const runOf = (run) => {
    if (!run) { bits.put(1, 1); return }
    bits.put(1, 0)
    bits.put(run < 16 ? 4 : 15, run)
  }
  let prev = 255, run = 0
  diff(alpha[0], prev)
  prev = alpha[0]
  for (let i = 1; i < alpha.length; i++) {
    const cur = alpha[i]
    if (cur !== prev) { runOf(run); diff(cur, prev); prev = cur; run = 0 }
    else if (++run === 2047) { runOf(run); diff(cur, prev); run = 0 }
  }
  runOf(run)
}

// Straight RGBA (8 bits) to 10-bit Y′CbCr, BT.709, video range, plus 8-bit alpha. Clear pixels take
// the colour of their opaque neighbours along the row, so edges don't fringe dark.
function planes(rgba, w, h) {
  const n = w * h, Y = new Uint16Array(n), U = new Uint16Array(n), V = new Uint16Array(n), A = new Uint8Array(n)
  for (let y = 0; y < h; y++) {
    let lr = 0, lg = 0, lb = 0, seen = false
    for (let x = 0; x < w; x++) {
      const i = y * w + x, q = i * 4, a = rgba[q + 3]
      let r = rgba[q], g = rgba[q + 1], b = rgba[q + 2]
      if (a) { lr = r; lg = g; lb = b; seen = true } else if (seen) { r = lr; g = lg; b = lb }
      A[i] = a
      const yy = 0.2126 * r + 0.7152 * g + 0.0722 * b
      Y[i] = Math.round(64 + (876 * yy) / 255)
      U[i] = Math.round(512 + (896 * (b - yy)) / (255 * 1.8556))
      V[i] = Math.round(512 + (896 * (r - yy)) / (255 * 1.5748))
    }
  }
  return { Y, U, V, A }
}

export function proresFrame(rgba, w, h, { quant = 4 } = {}) {
  const { Y, U, V, A } = planes(rgba, w, h)
  const mbW = (w + 15) >> 4, mbH = (h + 15) >> 4
  const slices = []
  for (let my = 0; my < mbH; my++) {
    let per = MBS_PER_SLICE
    for (let mx = 0; mx < mbW; mx += per) {
      while (mbW - mx < per) per >>= 1
      slices.push(slice(Y, U, V, A, w, h, mx, my, per, quant))
    }
  }

  // Frame header: 20 bytes. Version 1 (4:4:4 with alpha), 4:4:4, progressive, BT.709, 8-bit
  // alpha, default (flat) quantisation matrices.
  const header = new Uint8Array(20), hv = new DataView(header.buffer)
  hv.setUint16(0, 20); hv.setUint16(2, 1)
  header.set([99, 109, 116, 99], 4) // vendor "cmtc"
  hv.setUint16(8, w); hv.setUint16(10, h)
  header[12] = 3 << 6; header[14] = 1; header[15] = 1; header[16] = 1; header[17] = 1

  // Picture header: 8 bytes, then each slice's size, then the slices.
  const picHead = 8 + slices.length * 2, picSize = picHead + slices.reduce((s, x) => s + x.length, 0)
  const total = 8 + header.length + picSize
  const out = new Uint8Array(total), ov = new DataView(out.buffer)
  ov.setUint32(0, total); out.set([105, 99, 112, 102], 4) // "icpf"
  out.set(header, 8)
  let p = 8 + header.length
  out[p] = 8 << 3; ov.setUint32(p + 1, picSize); ov.setUint16(p + 5, slices.length); out[p + 7] = Math.log2(MBS_PER_SLICE) << 4
  slices.forEach((s, i) => ov.setUint16(p + 8 + i * 2, s.length))
  p += picHead
  for (const s of slices) { out.set(s, p); p += s.length }
  return out
}

const block = new Float64Array(64)
function slice(Y, U, V, A, w, h, mx, my, mbs, quant) {
  const q = 4 * quant // the flat matrix (4) times the slice's quantiser
  const count = mbs * 4, coeffs = new Float64Array(count * 64)
  const x0 = mx * 16, y0 = my * 16
  // A plane's blocks, edges repeated past the picture. Luma goes left to right then down within a
  // macroblock; chroma goes down then right.
  const fill = (plane, chroma) => {
    let k = 0
    for (let m = 0; m < mbs; m++) {
      const order = chroma ? [[0, 0], [0, 8], [8, 0], [8, 8]] : [[0, 0], [8, 0], [0, 8], [8, 8]]
      for (const [bx, by] of order) {
        for (let y = 0; y < 8; y++) {
          const sy = Math.min(h - 1, y0 + by + y)
          for (let x = 0; x < 8; x++) block[y * 8 + x] = plane[sy * w + Math.min(w - 1, x0 + m * 16 + bx + x)]
        }
        dct(block, coeffs, k++ * 64)
      }
    }
  }
  const sizes = []
  const bits = new Bits()
  for (const [plane, chroma] of [[Y, false], [U, true], [V, true]]) {
    const start = bits.pos
    fill(plane, chroma)
    encodeDCs(bits, coeffs, count, q)
    encodeACs(bits, coeffs, count, q)
    bits.flush()
    sizes.push(bits.pos - start)
  }
  // Alpha, as 16 rows across the slice.
  const sw = mbs * 16, alpha = new Uint8Array(16 * sw)
  for (let y = 0; y < 16; y++) {
    const sy = Math.min(h - 1, y0 + y)
    for (let x = 0; x < sw; x++) alpha[y * sw + x] = A[sy * w + Math.min(w - 1, x0 + x)]
  }
  encodeAlpha(bits, alpha)
  bits.flush()

  // Slice header: 8 bytes: its size, the quantiser, and the sizes of Y, Cb and Cr.
  const body = bits.buf.subarray(0, bits.pos), out = new Uint8Array(8 + body.length), v = new DataView(out.buffer)
  out[0] = 8 << 3; out[1] = quant
  v.setUint16(2, sizes[0]); v.setUint16(4, sizes[1]); v.setUint16(6, sizes[2])
  out.set(body, 8)
  return out
}
