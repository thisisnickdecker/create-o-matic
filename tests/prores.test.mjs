// ProRes 4444 and the .mov around it: the structure Apple's decoder expects. Decoding is checked
// with AVFoundation and FFmpeg; see the README.
import { test } from "node:test"
import assert from "node:assert/strict"
import { proresFrame } from "../web/packages/core/prores.js"
import { mov } from "../web/packages/core/mov.js"

// A 40×20 frame: the left half solid red, the right half clear.
const w = 40, h = 20
const rgba = new Uint8Array(w * h * 4)
for (let y = 0; y < h; y++) for (let x = 0; x < w / 2; x++) rgba.set([228, 55, 43, 255], (y * w + x) * 4)
const frame = proresFrame(rgba, w, h)
const view = new DataView(frame.buffer)

test("a frame is an icpf atom with a version-1, 4:4:4, 8-bit-alpha header", () => {
  assert.equal(view.getUint32(0), frame.length)
  assert.equal(new TextDecoder().decode(frame.subarray(4, 8)), "icpf")
  assert.equal(view.getUint16(8), 20) // header size
  assert.equal(view.getUint16(10), 1) // version
  assert.equal(view.getUint16(16), w)
  assert.equal(view.getUint16(18), h)
  assert.equal(frame[20] >> 6, 3) // 4:4:4
  assert.equal(frame[25] & 15, 1) // 8-bit alpha
})

test("the picture lists one slice per run of up to 8 macroblocks, and their sizes add up", () => {
  const p = 28, size = view.getUint32(p + 1), slices = view.getUint16(p + 5)
  assert.equal(slices, 2 * 2) // 2 macroblock rows of 3 macroblocks, each a slice of 2, then 1
  let sum = 8 + slices * 2
  for (let i = 0; i < slices; i++) sum += view.getUint16(p + 8 + i * 2)
  assert.equal(sum, size)
  assert.equal(p + size, frame.length)
})

test("the same picture always makes the same bytes", () => {
  assert.deepEqual(proresFrame(rgba, w, h), frame)
})

test("the .mov is ftyp, mdat, then moov, with a 32-bit-deep ap4h sample entry", () => {
  const parts = mov([frame, frame], { w, h, fps: 30 })
  const all = new Uint8Array(parts.reduce((s, p) => s + p.length, 0))
  let o = 0
  for (const p of parts) { all.set(p, o); o += p.length }
  const types = [], v = new DataView(all.buffer)
  for (let at = 0; at < all.length; at += v.getUint32(at)) types.push(new TextDecoder().decode(all.subarray(at + 4, at + 8)))
  assert.deepEqual(types, ["ftyp", "mdat", "moov"])
  const text = new TextDecoder("latin1").decode(all)
  const entry = text.indexOf("ap4h")
  assert.ok(entry > 0)
  assert.equal(v.getUint16(entry + 4 + 74), 32) // depth
})
