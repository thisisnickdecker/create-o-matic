import { sanitizeKeys } from "./keys.js"
import { sanitizeLayer } from "./effects/index.js"

// Patches: the saved state of an instrument, like a patch sheet for a synthesizer.
//   { instrument: "elastic", version: "0.3.0", seed: 123, params: { ... }, keys: { ... }, marks: { ... } }
// keys holds keyframes (see keys.js); a patch without them is a still configuration that loops.
// marks holds SVG marks by name, as SVG text (see marks.js), so a patch carries its own artwork.
// The instrument's manifest (instrument.json) is the only place parameters are defined. These
// helpers fill in defaults, clamp values into range and drop keys the manifest doesn't know,
// so an old or hand-written patch (from a person or an agent) always loads into something valid.

export function defaults(manifest) {
  const params = {}
  for (const d of manifest.parameters) params[d.key] = clone(d.default)
  return { instrument: manifest.id, version: manifest.version, seed: 1, params, keys: {}, marks: {} }
}

export function sanitize(manifest, patch) {
  const out = defaults(manifest)
  if (!patch || typeof patch !== "object") return out
  if (Number.isFinite(patch.seed)) out.seed = patch.seed | 0
  const given = patch.params || {}
  for (const d of manifest.parameters) {
    if (!(d.key in given)) continue
    const v = coerce(d, given[d.key])
    if (v !== undefined) out.params[d.key] = v
  }
  out.keys = sanitizeKeys(manifest, patch.keys, coerce)
  for (const [name, svg] of Object.entries(patch.marks || {}).slice(0, 12)) {
    if (/^[a-z0-9-]{1,32}$/.test(name) && typeof svg === "string" && svg.length <= 300000 && /<svg[\s>]/i.test(svg)) out.marks[name] = svg
  }
  return out
}

// One value against its definition. Returns undefined when the value can't be used.
export function coerce(d, v) {
  switch (d.type) {
    case "number":
    case "int": {
      let n = Number(v)
      if (!Number.isFinite(n)) return undefined
      if (d.type === "int") n = Math.round(n)
      return Math.min(d.max ?? Infinity, Math.max(d.min ?? -Infinity, n))
    }
    case "select": {
      const s = String(v)
      return d.options.some(([id]) => id === s) ? s : undefined
    }
    case "bool": return Boolean(v)
    case "stack": return Array.isArray(v) ? v.map((l) => sanitizeLayer(l, coerce)).filter(Boolean).slice(0, 24) : undefined
    case "list": return Array.isArray(v) ? v.slice(0, d.max ?? 24).map((item, i) => listItem(d, item, i)) : undefined
    case "color": return isColor(v) ? v.toUpperCase() : undefined
    case "palette": {
      if (!Array.isArray(v)) return undefined
      const list = v.filter(isColor).map((c) => c.toUpperCase()).slice(0, 12)
      return list.length ? list : undefined
    }
    default: return typeof v === "string" ? v : undefined
  }
}
// One row of a list: its own fields checked against the list's item definitions, defaults filled.
function listItem(d, item, i) {
  const out = { id: typeof item?.id === "string" && item.id ? item.id.slice(0, 40) : `${d.key}-${i}` }
  for (const f of d.item) {
    const v = item && typeof item === "object" && f.key in item ? coerce(f, item[f.key]) : undefined
    out[f.key] = v !== undefined ? v : clone(f.default)
  }
  return out
}
export function newListItem(d, from) {
  return listItem(d, { ...(from ?? {}), id: `${d.key}-${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}` }, 0)
}

const isColor = (v) => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v)
const clone = (v) => (v && typeof v === "object" ? structuredClone(v) : v)

// URL hash: base64url of the JSON, so a patch can be shared as a link.
export function toHash(patch) {
  const bytes = new TextEncoder().encode(JSON.stringify(patch))
  let s = ""
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}
export function fromHash(hash) {
  try {
    const s = atob(hash.replace(/-/g, "+").replace(/_/g, "/"))
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(s, (c) => c.charCodeAt(0))))
  } catch { return null }
}

// A small per-browser library of saved patches, keyed by instrument.
export function library(instrumentId) {
  const KEY = `workshop.patches.${instrumentId}`
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || [] } catch { return [] } }
  const write = (list) => { try { localStorage.setItem(KEY, JSON.stringify(list)) } catch {} }
  return {
    list: read,
    save(name, patch) {
      const list = read().filter((e) => e.name !== name)
      list.unshift({ name, saved: new Date().toISOString(), patch })
      write(list)
    },
    remove(name) { write(read().filter((e) => e.name !== name)) },
  }
}
