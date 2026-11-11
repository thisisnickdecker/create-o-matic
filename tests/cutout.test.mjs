// Cutouts: the arithmetic round the model (core/cutout.js). The model itself runs in a browser;
// see Flyposter's README for how that was checked.
import { test } from "node:test"
import assert from "node:assert/strict"
import { toInput, toAlpha, bounds } from "../web/packages/core/cutout.js"
import { readFile, stat } from "node:fs/promises"
import { createHash } from "node:crypto"

test("pixels go in as three planes, scaled and centred as the model was trained", () => {
  const n = 320 * 320, rgba = new Uint8ClampedArray(n * 4).fill(0)
  rgba[0] = 255; rgba[1] = 128; rgba[2] = 0
  const t = toInput(rgba)
  assert.equal(t.length, 3 * n)
  assert.ok(Math.abs(t[0] - (1 - 0.485) / 0.229) < 1e-5)
  assert.ok(Math.abs(t[n] - (128 / 255 - 0.456) / 0.224) < 1e-5)
  assert.ok(Math.abs(t[2 * n] - (0 - 0.406) / 0.225) < 1e-5)
})

test("the model's answer becomes a firm alpha: sure is solid, unsure is clear", () => {
  const a = toAlpha(Float32Array.from([-3, -2.9, 0, 2.9, 3]))
  assert.deepEqual([a[0], a[1], a[3], a[4]], [0, 0, 255, 255])
  assert.ok(a[2] > 100 && a[2] < 155)
  assert.deepEqual([...toAlpha(Float32Array.from([1, 1]))], [0, 0], "no answer, nothing kept")
})

test("a cutout is trimmed to what's left, with a little room", () => {
  const w = 100, h = 50, rgba = new Uint8ClampedArray(w * h * 4)
  for (let y = 10; y < 20; y++) for (let x = 30; x < 60; x++) rgba[(y * w + x) * 4 + 3] = 255
  assert.deepEqual(bounds(rgba, w, h), { x: 28, y: 8, w: 34, h: 14 })
  assert.deepEqual(bounds(new Uint8ClampedArray(w * h * 4), w, h), { x: 0, y: 0, w, h })
})

test("the vendored model is the one rembg publishes", async () => {
  const model = new URL("../web/packages/core/vendor/u2netp/u2netp.onnx", import.meta.url)
  assert.equal(createHash("md5").update(await readFile(model)).digest("hex"), "8e83ca70e441ab06c318d82300c84806")
  for (const f of ["onnxruntime-web/LICENSE.txt", "u2netp/LICENSE.txt", "onnxruntime-web/ort-wasm-simd-threaded.wasm"]) assert.ok((await stat(new URL(`../web/packages/core/vendor/${f}`, import.meta.url))).size > 1000, f)
})
