// A QuickTime .mov holding one video track of ProRes 4444 frames (see prores.js): the boxes macOS
// and the editing apps need, and no more. Pure: frames in, a list of byte arrays out (make a Blob
// of them).
//
//   mov(frames, { w, h, fps })  frames: Uint8Array per frame, in order

const enc = new TextEncoder()

// A box: its size, its four-letter type, then its contents (byte arrays or other boxes, flattened).
function box(type, ...parts) {
  const flat = parts.flat(Infinity).filter(Boolean)
  const size = 8 + flat.reduce((s, p) => s + p.length, 0)
  const out = new Uint8Array(size), v = new DataView(out.buffer)
  v.setUint32(0, size); out.set(enc.encode(type), 4)
  let o = 8
  for (const p of flat) { out.set(p, o); o += p.length }
  return out
}
// Big-endian fields, as [bits, value] pairs.
function fields(...list) {
  const size = list.reduce((s, [bits]) => s + bits / 8, 0)
  const out = new Uint8Array(size), v = new DataView(out.buffer)
  let o = 0
  for (const [bits, value] of list) {
    if (bits === 8) v.setUint8(o, value)
    else if (bits === 16) v.setUint16(o, value)
    else v.setUint32(o, value >>> 0)
    o += bits / 8
  }
  return out
}
const bytes = (s) => enc.encode(s)
const MATRIX = fields([32, 0x10000], [32, 0], [32, 0], [32, 0], [32, 0x10000], [32, 0], [32, 0], [32, 0], [32, 0x40000000])

export function mov(frames, { w, h, fps }) {
  // Time in 1/(fps × 100) s, so 30 fps is 100 units a frame; the mdat goes first, so its offsets
  // are known before the index is written.
  const scale = Math.round(fps * 100), each = 100, duration = frames.length * each
  const ftyp = box("ftyp", bytes("qt  "), fields([32, 0x200]), bytes("qt  "))
  const data = frames.reduce((s, f) => s + f.length, 0)
  // Past 4 GB the mdat's size goes in 64 bits after its type.
  const mdatHead = data + 8 > 0xffffffff
    ? fields([32, 1], [8, 0x6d], [8, 0x64], [8, 0x61], [8, 0x74], [32, Math.floor((data + 16) / 2 ** 32)], [32, (data + 16) % 2 ** 32])
    : fields([32, data + 8], [8, 0x6d], [8, 0x64], [8, 0x61], [8, 0x74])
  const offsets = []
  let at = ftyp.length + mdatHead.length
  for (const f of frames) { offsets.push(at); at += f.length }

  // The sample description: ProRes 4444 ("ap4h"), 32 bits deep so apps know there's alpha,
  // progressive, BT.709.
  const name = new Uint8Array(32)
  const label = bytes("Apple ProRes 4444")
  name[0] = label.length; name.set(label, 1)
  const ap4h = box("ap4h",
    fields([32, 0], [16, 0], [16, 1]), // reserved, data reference index
    fields([16, 0], [16, 0], [32, 0], [32, 0], [32, 0]), // version, revision, vendor, quality
    fields([16, w], [16, h], [32, 72 << 16], [32, 72 << 16], [32, 0], [16, 1]),
    name,
    fields([16, 32], [16, 0xffff]), // depth: 32 for alpha; no colour table
    box("colr", bytes("nclc"), fields([16, 1], [16, 1], [16, 1])),
    box("fiel", fields([8, 1], [8, 0])),
  )
  const stsd = box("stsd", fields([32, 0], [32, 1]), ap4h)
  const stts = box("stts", fields([32, 0], [32, 1], [32, frames.length], [32, each]))
  const stsc = box("stsc", fields([32, 0], [32, 1], [32, 1], [32, 1], [32, 1]))
  const stsz = box("stsz", fields([32, 0], [32, 0], [32, frames.length]), frames.map((f) => fields([32, f.length])))
  const stco = offsets.at(-1) > 0xffffffff
    ? box("co64", fields([32, 0], [32, frames.length]), offsets.map((o) => fields([32, Math.floor(o / 2 ** 32)], [32, o % 2 ** 32])))
    : box("stco", fields([32, 0], [32, frames.length]), offsets.map((o) => fields([32, o])))
  const stbl = box("stbl", stsd, stts, stsc, stsz, stco)
  const minf = box("minf",
    box("vmhd", fields([32, 1], [16, 0], [16, 0], [16, 0], [16, 0])),
    box("hdlr", fields([32, 0]), bytes("dhlr"), bytes("alis"), fields([32, 0], [32, 0], [32, 0], [8, 0])),
    box("dinf", box("dref", fields([32, 0], [32, 1]), box("alis", fields([32, 1])))),
    stbl,
  )
  const mdia = box("mdia",
    box("mdhd", fields([32, 0], [32, 0], [32, 0], [32, scale], [32, duration], [16, 0], [16, 0])),
    box("hdlr", fields([32, 0]), bytes("mhlr"), bytes("vide"), fields([32, 0], [32, 0], [32, 0]), fields([8, 0])),
    minf,
  )
  const tkhd = box("tkhd", fields([32, 3], [32, 0], [32, 0], [32, 1], [32, 0], [32, duration], [32, 0], [32, 0], [16, 0], [16, 0], [16, 0], [16, 0]), MATRIX, fields([32, w << 16], [32, h << 16]))
  const mvhd = box("mvhd", fields([32, 0], [32, 0], [32, 0], [32, scale], [32, duration], [32, 0x10000], [16, 0x100], [16, 0], [32, 0], [32, 0]), MATRIX, fields([32, 0], [32, 0], [32, 0], [32, 0], [32, 0], [32, 0], [32, 2]))
  const moov = box("moov", mvhd, box("trak", tkhd, mdia))
  return [ftyp, mdatHead, ...frames, moov]
}
