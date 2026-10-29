// A .zip of files, stored without compression: the kits it makes are small text and images, and
// storing keeps this short. Names are UTF-8.
//   zip([{ name, data }]) → Blob, where data is a string, Uint8Array or Blob.

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
export function crc32(bytes) {
  let c = 0xffffffff
  for (const b of bytes) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const enc = new TextEncoder()
const bytesOf = async (data) => (typeof data === "string" ? enc.encode(data) : data instanceof Uint8Array ? data : new Uint8Array(await data.arrayBuffer()))

export async function zip(files) {
  const parts = [], central = []
  let offset = 0
  // DOS time for 1 January 2026, so the same files always make the same archive.
  const time = 0, date = ((2026 - 1980) << 9) | (1 << 5) | 1
  for (const f of files) {
    const name = enc.encode(f.name), data = await bytesOf(f.data), crc = crc32(data)
    const head = new DataView(new ArrayBuffer(30))
    head.setUint32(0, 0x04034b50, true); head.setUint16(4, 20, true); head.setUint16(6, 0x0800, true)
    head.setUint16(10, time, true); head.setUint16(12, date, true); head.setUint32(14, crc, true)
    head.setUint32(18, data.length, true); head.setUint32(22, data.length, true); head.setUint16(26, name.length, true)
    const entry = new DataView(new ArrayBuffer(46))
    entry.setUint32(0, 0x02014b50, true); entry.setUint16(4, 20, true); entry.setUint16(6, 20, true); entry.setUint16(8, 0x0800, true)
    entry.setUint16(12, time, true); entry.setUint16(14, date, true); entry.setUint32(16, crc, true)
    entry.setUint32(20, data.length, true); entry.setUint32(24, data.length, true); entry.setUint16(28, name.length, true)
    entry.setUint32(42, offset, true)
    parts.push(head, name, data)
    central.push(entry, name)
    offset += 30 + name.length + data.length
  }
  const size = central.reduce((a, c) => a + c.byteLength, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true)
  end.setUint32(12, size, true); end.setUint32(16, offset, true)
  return new Blob([...parts, ...central, end], { type: "application/zip" })
}
