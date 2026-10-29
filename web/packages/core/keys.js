// Keyframes: any number or colour can change over the loop, like After Effects.
//   patch.keys = { copier: [{ t: 0, v: 1, ease: "smooth" }, { t: 1, v: 0 }], background: [...] }
// t runs 0 to 1 across the timeline. ease belongs to the stretch leaving a key:
//   smooth (ease in and out), linear, or hold (jump at the next key).
// How the timeline maps onto the loop is the patch's keyMode:
//   boomerang  plays the timeline forward over the first half of the loop and back over the second,
//              so it always returns to where it started: seamless.
//   wrap       plays forward, and from the last key eases back to the first across the loop point.
//   cycle      plays forward and jumps back to the start, like a film reel.

export const EASES = ["smooth", "linear", "hold"]
const KEYABLE = new Set(["number", "int", "color"])
export const keyable = (def) => KEYABLE.has(def.type) && def.animate !== false

// Where on the timeline time t falls.
export function timelinePos(mode, t) {
  if (mode === "boomerang") return t < 0.5 ? t * 2 : 2 - t * 2
  return t
}

const curve = (ease, f) => (ease === "hold" ? 0 : ease === "linear" ? f : f * f * (3 - 2 * f))

function valueAt(def, keys, u, wrap) {
  if (keys.length === 1) return keys[0].v
  const first = keys[0], last = keys[keys.length - 1]
  let a, b, span, f
  if (u <= first.t || u >= last.t) {
    if (!wrap || u === first.t || u === last.t) return u <= first.t ? first.v : last.v
    // Across the loop point, from the last key round to the first.
    span = 1 - last.t + first.t
    f = span > 0 ? (u >= last.t ? u - last.t : u + 1 - last.t) / span : 0
    a = last; b = first
  } else {
    let i = 0
    while (keys[i + 1].t < u) i++
    a = keys[i]; b = keys[i + 1]
    span = b.t - a.t
    f = span > 0 ? (u - a.t) / span : 1
  }
  return mix(def, a.v, b.v, curve(a.ease, f))
}

function mix(def, x, y, f) {
  if (def.type === "color") {
    const p = rgb(x), q = rgb(y)
    return "#" + p.map((c, i) => Math.round(c + (q[i] - c) * f).toString(16).padStart(2, "0")).join("").toUpperCase()
  }
  const v = x + (y - x) * f
  return def.type === "int" ? Math.round(v) : v
}
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))

// The patch's parameters as they are at time t.
export function resolve(manifest, patch, t) {
  const keys = patch.keys
  if (!keys || !Object.keys(keys).length) return patch.params
  const p = { ...patch.params }
  const u = timelinePos(patch.params.keyMode, t)
  for (const [key, list] of Object.entries(keys)) {
    const def = manifest.parameters.find((d) => d.key === key)
    if (def && list.length) p[key] = valueAt(def, list, u, patch.params.keyMode === "wrap")
  }
  return p
}

// Put a key at u (replacing one within half a frame of it).
export function setKey(patch, key, u, v, near = 0.002) {
  const list = (patch.keys[key] ??= [])
  const hit = list.find((k) => Math.abs(k.t - u) <= near)
  if (hit) hit.v = v
  else list.push({ t: u, v, ease: "smooth" })
  list.sort((a, b) => a.t - b.t)
}

export function sanitizeKeys(manifest, keys, coerce) {
  const out = {}
  if (!keys || typeof keys !== "object") return out
  for (const [key, list] of Object.entries(keys)) {
    const def = manifest.parameters.find((d) => d.key === key)
    if (!def || !keyable(def) || !Array.isArray(list)) continue
    const clean = list
      .map((k) => ({ t: Math.min(1, Math.max(0, Number(k?.t))), v: coerce(def, k?.v), ease: EASES.includes(k?.ease) ? k.ease : "smooth" }))
      .filter((k) => Number.isFinite(k.t) && k.v !== undefined)
      .sort((a, b) => a.t - b.t)
      .slice(0, 64)
    if (clean.length) out[key] = clean
  }
  return out
}
