// The brand kit: the patch written out as files other tools read. Pure: a patch in, text out.
//   tokens(patch)  W3C design tokens (DTCG format), for Tokens Studio, Style Dictionary and the like
//   css(patch)     CSS custom properties, with the font imports
//   brandMd(patch) BRAND.md: the brand in plain words and tables, for people and for agents
import { contrast, grade, inkOn, rgbText, oklchText, colourName } from "../../packages/core/colour.js"
import { face, displayName } from "./brand.js"

const ROLES = ["headline", "subhead", "body", "caption", "accent"]
const roles = (p) => ROLES.filter((r) => p.faces.some((f) => f.role === r))
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "brand"
const MOTION = { still: "still", breathe: "breathes", float: "floats", flip: "flips like a coin", inks: "runs through the inks" }

// Where a face's web font comes from, as a stylesheet to import.
function fontImport(f, kit) {
  if (f.fontSource === "adobe" && kit) return `https://use.typekit.net/${kit}.css`
  if (f.fontSource === "open" || f.fontSource === "google") return `https://cdn.jsdelivr.net/npm/@fontsource/${slug(f.font)}@latest/${f.weight}.css`
  return null
}

export function tokens(patch) {
  const p = patch.params, out = { $description: `${p.brandName}: ${p.tagline}`.trim() }
  out.color = { paper: { $type: "color", $value: p.background, $description: colourName(p.background) } }
  p.inks.forEach((hex, i) => { out.color[`ink-${i + 1}`] = { $type: "color", $value: hex, $description: colourName(hex) } })
  out.fontFamily = {}, out.fontWeight = {}, out.typography = {}
  for (const r of roles(p)) {
    const f = face(p, r)
    out.fontFamily[r] = { $type: "fontFamily", $value: [f.font, "sans-serif"] }
    out.fontWeight[r] = { $type: "fontWeight", $value: f.weight }
    out.typography[r] = { $type: "typography", $value: { fontFamily: `{fontFamily.${r}}`, fontWeight: `{fontWeight.${r}}`, letterSpacing: `${f.tracking}em` } }
  }
  out.radius = { corner: { $type: "dimension", $value: `${p.corner}px` } }
  return JSON.stringify(out, null, 2) + "\n"
}

export function css(patch) {
  const p = patch.params, name = slug(p.brandName)
  const imports = [...new Set(p.faces.map((f) => fontImport(f, p.adobeKit)).filter(Boolean))]
  const lines = [
    ...imports.map((u) => `@import url("${u}");`),
    imports.length ? "" : null,
    `/* ${p.brandName}${p.tagline ? `: ${p.tagline}` : ""} */`,
    ":root {",
    `  --${name}-paper: ${p.background}; /* ${colourName(p.background)} */`,
    ...p.inks.map((hex, i) => `  --${name}-ink-${i + 1}: ${hex}; /* ${colourName(hex)} · oklch(${oklchText(hex)}) */`),
    ...roles(p).flatMap((r) => { const f = face(p, r); return [`  --${name}-font-${r}: "${f.font}", sans-serif;`, `  --${name}-weight-${r}: ${f.weight};`, `  --${name}-tracking-${r}: ${f.tracking}em;`] }),
    `  --${name}-radius: ${p.corner}px;`,
    "}",
  ]
  return lines.filter((l) => l !== null).join("\n") + "\n"
}

// Every pair of the paper and inks that passes WCAG AA for body text, best first. Contrast is
// the same either way round, so each pair is listed once.
export function readable(p) {
  const all = [...new Set([p.background, ...p.inks])], out = []
  all.forEach((a, i) => all.slice(i + 1).forEach((b) => { const ratio = contrast(a, b); if (ratio >= 4.5) out.push({ a, b, ratio }) }))
  return out.sort((x, y) => y.ratio - x.ratio)
}

export function brandMd(patch, { link = "", logoFile = "" } = {}) {
  const p = patch.params, name = p.brandName
  const row = (hex, label) => { const on = inkOn(hex), r = contrast(on, hex); return `| ${label} | \`${hex}\` | ${colourName(hex)} | ${rgbText(hex)} | ${oklchText(hex)} | ${on === "#FFFFFF" ? "white" : "black"} (${r.toFixed(1)}:1, ${grade(r)}) |` }
  const pairs = readable(p)
  const f = (r) => face(p, r)
  const md = [
    `# ${name}`,
    p.tagline ? `\n> ${p.tagline}` : "",
    `\nMade with the Brand bench in Create-o-matic.${link ? ` [Open and edit this brand](${link}).` : " Open `brand.json` in the Brand bench (createomatic.xyz/brand/) to edit it."}`,
    "\n## Logo",
    `\n${logoFile ? `The file is \`${logoFile}\`. ` : ""}Shown ${{ original: "in its own colours", ink: `in ${colourName(p.inks[0])} (\`${p.inks[0]}\`)`, auto: "in black or white, whichever reads on the ground" }[p.logoColour]}. On an ink, reverse it to black or white, as the board shows. Give it clear space of at least half its height on every side, and don't stretch, recolour outside the palette, or add effects to it in running text.`,
    `\nIn motion it ${MOTION[p.motion] ?? "is still"}${p.motion !== "still" ? `, ${p.beats === 1 ? "once" : `${p.beats} times`} every ${p.duration} seconds` : ""}.`,
    "\n## Colour",
    "\n| | Hex | Name | RGB | OKLCH | Text on it |",
    "|---|---|---|---|---|---|",
    row(p.background, "Paper"),
    ...p.inks.map((hex, i) => row(hex, `Ink ${i + 1}`)),
    `\nInk 1 leads; the rest follow in order. ${pairs.length ? "Pairings that pass WCAG AA for body text (4.5:1 or better):" : "No pairing of these colours passes WCAG AA for body text: set text in black or white."}`,
    ...pairs.slice(0, 8).map((x) => `- \`${x.a}\` (${colourName(x.a)}) and \`${x.b}\` (${colourName(x.b)}), either way round: ${x.ratio.toFixed(1)}:1, ${grade(x.ratio)}`),
    "\n## Type",
    "\n| Role | Family | Weight | Tracking | Source |",
    "|---|---|---|---|---|",
    ...roles(p).map((r) => { const x = f(r); return `| ${r[0].toUpperCase() + r.slice(1)} | ${displayName(x.font)}${displayName(x.font) !== x.font ? ` (CSS: \`${x.font}\`)` : ""} | ${x.weight} | ${x.tracking}em | ${{ open: "open source (Fontsource / Google)", google: "Google Fonts", adobe: `Adobe Fonts${p.adobeKit ? `, project ${p.adobeKit}` : ""}`, system: "installed", file: "licensed files" }[x.fontSource] ?? x.fontSource} |` }),
    "\n## For agents and tools",
    "\n- `tokens.json`: these colours, faces and radius as W3C design tokens (DTCG). Tokens Studio for Figma and Style Dictionary read them.",
    "- `brand.css`: the same as CSS custom properties, with the font imports.",
    "- `brand.json`: the Create-o-matic patch: everything, including the logo.",
    `\nWhen designing for ${name}: use only the colours above, ink 1 first; set headlines in ${displayName(f("headline").font)} ${f("headline").weight} and running text in ${displayName(f("body").font)} ${f("body").weight}; keep text to the passing pairings; corners at ${p.corner}px; and treat the logo as described, never as editable text.`,
  ]
  return md.join("\n").replace(/\n{3,}/g, "\n\n") + "\n"
}
