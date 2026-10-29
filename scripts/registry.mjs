// The registry: finds every instruments/*/instrument.json, checks it against the instrument
// standard (docs/instrument-standard.md), checks each preset against its manifest, and writes
// registry/instruments.json for the workshop index and for agents to read.
//   node scripts/registry.mjs           check and write
//   node scripts/registry.mjs --check   check only; exits 1 on any problem (for CI)
import { readdir, readFile, writeFile, access } from "node:fs/promises"
import { join, resolve } from "node:path"
import { EFFECTS, withEffects } from "../web/packages/core/effects/index.js"
import { keyable } from "../web/packages/core/keys.js"

const ROOT = resolve(import.meta.dirname, "../web")
const DIR = join(ROOT, "instruments")
const REQUIRED = ["id", "name", "version", "status", "category", "description", "license", "runtime", "entry", "interfaces", "outputs", "groups", "parameters"]
const STATUS = ["sketch", "experimental", "stable", "retired"]
const TYPES = ["number", "int", "select", "bool", "color", "palette", "text", "string", "font", "media", "mark", "stack"]
const OUTPUT_STATES = ["verified", "untested", "planned"]
const problems = []
const fail = (where, msg) => problems.push(`${where}: ${msg}`)
const exists = (p) => access(p).then(() => true, () => false)

const entries = []
for (const name of (await readdir(DIR, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name).sort()) {
  const where = `instruments/${name}`
  const file = join(DIR, name, "instrument.json")
  if (!(await exists(file))) { fail(where, "no instrument.json"); continue }
  let m
  try { m = JSON.parse(await readFile(file, "utf8")) } catch (e) { fail(where, `instrument.json doesn't parse: ${e.message}`); continue }

  for (const k of REQUIRED) if (m[k] === undefined) fail(where, `missing "${k}"`)
  if (m.id !== name) fail(where, `id "${m.id}" should match the folder name`)
  if (!/^\d+\.\d+\.\d+$/.test(m.version || "")) fail(where, `version "${m.version}" isn't semver`)
  if (!STATUS.includes(m.status)) fail(where, `status "${m.status}" isn't one of ${STATUS.join(", ")}`)
  for (const [k, f] of Object.entries(m.entry || {})) if (!(await exists(join(DIR, name, f)))) fail(where, `entry.${k} "${f}" doesn't exist`)
  for (const [k, v] of Object.entries(m.outputs || {})) if (!OUTPUT_STATES.includes(v)) fail(where, `output ${k} is "${v}"; use ${OUTPUT_STATES.join(", ")}`)
  for (const id of m.effects || []) if (!EFFECTS.some((e) => e.id === id)) fail(where, `unknown effect "${id}"`)
  m = withEffects(m) // effects' parameters count as the instrument's own from here on

  const groups = new Set((m.groups || []).map((g) => g.id))
  const keys = new Set()
  for (const d of m.parameters || []) {
    const at = `${where} · ${d.key}`
    if (keys.has(d.key)) fail(at, "duplicate key")
    keys.add(d.key)
    if (!TYPES.includes(d.type)) fail(at, `unknown type "${d.type}"`)
    if (!groups.has(d.group)) fail(at, `unknown group "${d.group}"`)
    if (!("default" in d)) fail(at, "no default")
    if ((d.type === "number" || d.type === "int") && !(d.default >= d.min && d.default <= d.max)) fail(at, `default ${d.default} outside ${d.min}–${d.max}`)
    if (d.type === "select" && !d.options?.some(([v]) => v === d.default)) fail(at, `default "${d.default}" isn't an option`)
    for (const k of Object.keys(d.when || {})) if (!m.parameters.some((p) => p.key === k)) fail(at, `"when" refers to unknown "${k}"`)
  }

  // Presets: every key must be a real parameter with an acceptable value.
  const presetDir = join(DIR, name, "presets")
  const presets = []
  if (await exists(join(presetDir, "index.json"))) {
    for (const f of JSON.parse(await readFile(join(presetDir, "index.json"), "utf8"))) {
      const p = JSON.parse(await readFile(join(presetDir, f), "utf8"))
      presets.push({ file: f, name: p.name })
      for (const [k, v] of Object.entries(p.params || {})) {
        const d = m.parameters.find((x) => x.key === k)
        if (!d) { fail(`${where}/presets/${f}`, `unknown parameter "${k}"`); continue }
        if ((d.type === "number" || d.type === "int") && !(v >= d.min && v <= d.max)) fail(`${where}/presets/${f}`, `${k} = ${v} outside ${d.min}–${d.max}`)
        if (d.type === "select" && !d.options.some(([o]) => o === v)) fail(`${where}/presets/${f}`, `${k} = "${v}" isn't an option`)
        if (d.type === "stack") {
          for (const layer of v) {
            const e = EFFECTS.find((x) => x.id === layer.effect)
            if (!e) { fail(`${where}/presets/${f}`, `layer "${layer.id}" uses unknown effect "${layer.effect}"`); continue }
            for (const key of Object.keys(layer.params || {})) if (!e.params.some((x) => x.key === key)) fail(`${where}/presets/${f}`, `layer "${layer.id}" (${e.id}) has unknown setting "${key}"`)
          }
        }
      }
      for (const [k, list] of Object.entries(p.keys || {})) {
        const d = m.parameters.find((x) => x.key === k)
        if (!d || !keyable(d)) fail(`${where}/presets/${f}`, `keyframes on "${k}", which can't be animated`)
        else if (!Array.isArray(list) || list.some((key) => !(key.t >= 0 && key.t <= 1))) fail(`${where}/presets/${f}`, `keyframes on "${k}" need t from 0 to 1`)
      }
    }
  }

  entries.push({
    id: m.id, name: m.name, version: m.version, status: m.status, category: m.category, description: m.description,
    path: m.page || `instruments/${name}/`, runtime: m.runtime, interfaces: m.interfaces, outputs: m.outputs, effects: m.effects || [],
    parameters: (m.parameters || []).map((d) => d.key), presets,
  })
}

const pad = (s, n) => String(s).padEnd(n)
console.log(`\n${pad("instrument", 14)}${pad("version", 10)}${pad("status", 14)}${pad("params", 8)}outputs`)
for (const e of entries) {
  const out = Object.entries(e.outputs).map(([k, v]) => (v === "verified" ? k : `${k}(${v})`)).join(" ")
  console.log(`${pad(e.id, 14)}${pad(e.version, 10)}${pad(e.status, 14)}${pad(e.parameters.length, 8)}${out}`)
}
if (problems.length) {
  console.log(`\n${problems.length} problem${problems.length > 1 ? "s" : ""}:`)
  for (const p of problems) console.log(`  · ${p}`)
  process.exitCode = 1
} else console.log("\nAll manifests and presets check out.")

if (!process.argv.includes("--check")) {
  await writeFile(join(ROOT, "registry", "instruments.json"), JSON.stringify({ instruments: entries }, null, 2) + "\n")
  console.log("Wrote registry/instruments.json")
}
