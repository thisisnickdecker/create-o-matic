// Copy help, with no AI: your line, rewritten by hand-written recipes. Each lens is an archetype, a
// way of talking (the copywriter, the punk, the Swiss designer, the deadpan, the shopkeeper, the
// MC), never a real person. A recipe takes your words apart (the lead before the first comma, the
// rest after it, your details, where and call to action) and puts them in its own voice. Pure: the
// same message, lens and take always give the same line.
//   rewrites(msg, lens)     every rewrite of msg's headline through a lens ("any" for all of them)
//   rewrite(msg, lens, take)  take 0 is your line as written; 1, 2, 3… step through the rewrites
//   msg: { headline, details, where, cta }

export const LENSES = [
  ["copywriter", "The copywriter", "Short sentences. A wink. Then the point."],
  ["punk", "The punk", "Capitals, no apologies."],
  ["swiss", "The Swiss designer", "lower case, the facts, in order"],
  ["deadpan", "The deadpan", "Underplayed until it's funny."],
  ["shopkeeper", "The shopkeeper", "A sign in the window, painted by hand."],
  ["mc", "The MC", "Every night is the night."],
]

const trimEnd = (s) => s.replace(/[\s.,;:!?]+$/, "")
// Lower-case the first letter, unless the first word looks like a name or an acronym.
const soft = (s) => (/^[A-Z][a-z]/.test(s) && !/^(I|I'm|I've)\b/.test(s) ? s[0].toLowerCase() + s.slice(1) : s)
const up = (s) => s.toUpperCase()
const low = (s) => s.toLowerCase()
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)

// The parts a recipe can use. Empty parts make the recipes that need them step aside.
export function parts({ headline = "", details = "", where = "", cta = "" } = {}) {
  const line = String(headline).replace(/\s*\n\s*/g, ", ").trim()
  const bits = line.split(/\s*(?:,|·|•|\||—|–| - )\s*/).map(trimEnd).filter(Boolean)
  const lead = bits[0] || trimEnd(line)
  const rest = bits.slice(1)
  return { line: trimEnd(line), lead, rest, details: trimEnd(String(details).trim()), where: trimEnd(String(where).trim()), cta: trimEnd(String(cta).trim()) }
}

// Each recipe is (parts) => a line, or null when it doesn't have what it needs.
const RECIPES = {
  copywriter: [
    (p) => `${p.lead}. You know you want to.`,
    (p) => `Introducing: ${soft(p.lead)}.`,
    (p) => `${p.lead}? ${p.lead}.`,
    (p) => `Your new favourite thing: ${soft(p.lead)}.`,
    (p) => `Clear your diary.\n${p.lead}.`,
    (p) => p.rest.length ? `${p.lead}.\n${p.rest.map(cap).join(".\n")}.\nDon't be late.` : null,
    (p) => `Small print: ${soft(p.lead)}.\nBig deal.`,
    (p) => `${p.lead}. Tell a friend. Or don't, more for you.`,
    (p) => `It's not a phase, it's ${soft(p.lead)}.`,
    (p) => p.cta ? `${p.lead}.\n${cap(p.cta)}. Simple.` : null,
  ],
  punk: [
    (p) => `${up(p.lead)}!!!`,
    (p) => `NO EXCUSES.\n${up(p.lead)}.`,
    (p) => `${up(p.lead)}.\nDEAL WITH IT.`,
    (p) => `OI!\n${up(p.line)}`,
    (p) => `${up(p.lead)}\nOR BUST`,
    (p) => `DOWN WITH BORING.\nUP WITH ${up(p.lead)}.`,
    (p) => p.rest.length ? `${up(p.lead)}\n${up(p.rest.join(" / "))}\nBE THERE` : null,
    (p) => `WE SAID ${up(p.lead)}.\nWE MEANT IT.`,
    (p) => p.where ? `${up(p.lead)} @ ${up(p.where)}` : null,
  ],
  swiss: [
    (p) => p.rest.length ? [low(p.lead), ...p.rest.map(low)].map((s, i) => `${i + 1} ${s}`).join("\n") : null,
    (p) => `${low(p.lead)}.`,
    (p) => [low(p.lead), p.details && `— ${low(p.details)}`, p.where && `— ${low(p.where)}`].filter(Boolean).join("\n"),
    (p) => `information:\n${low(p.line)}`,
    (p) => p.rest.length ? `${low(p.lead)} / ${p.rest.map(low).join(" / ")}` : null,
    (p) => `${low(p.lead)}\n(see below)`,
    (p) => `the facts:\n${low(p.line)}.`,
  ],
  deadpan: [
    (p) => `${p.lead}. It's fine.`,
    (p) => `There is ${soft(p.lead)}. You could come.`,
    (p) => `${p.lead}.\nAs previously announced.`,
    (p) => `We have ${soft(p.lead)}.\nThat's the post.`,
    (p) => `${p.lead}.\nNothing else is happening.`,
    (p) => `Mildly exciting news: ${soft(p.lead)}.`,
    (p) => `${p.lead}.\nOur mum says it's good.`,
    (p) => `${p.lead}.\nPlease clap.`,
    (p) => p.rest.length ? `${p.lead}. ${cap(p.rest.join(", "))}. Same as last time.` : null,
  ],
  shopkeeper: [
    (p) => `Now serving:\n${p.lead}`,
    (p) => `Hear ye!\n${cap(p.line)}`,
    (p) => `By popular demand,\n${soft(p.lead)}`,
    (p) => `Fresh today:\n${soft(p.lead)}`,
    (p) => `Ask inside about\n${soft(p.lead)}`,
    (p) => `Proudly presenting\n${soft(p.lead)}`,
    (p) => p.where ? `${p.lead}\nat ${p.where}` : null,
    (p) => `${p.lead}\n— while it lasts —`,
  ],
  mc: [
    (p) => p.rest.length ? `${up(p.lead)} ✦ ${up(p.rest.join(" ✦ "))}` : `${up(p.lead)} ✦ ${up(p.lead)}`,
    (p) => `It's going down:\n${soft(p.lead)}`,
    (p) => `${p.lead}.\nBigger energy.`,
    (p) => `${p.lead} (the remix)`,
    (p) => `Lights down,\n${soft(p.lead)} up.`,
    (p) => `Pull up:\n${soft(p.lead)}`,
    (p) => `${p.lead}.\nAll killer, no filler.`,
    (p) => `Save the date:\n${soft(p.line)}`,
  ],
}

export function rewrites(msg, lens = "any") {
  const p = parts(msg)
  if (!p.lead) return []
  const run = (id) => RECIPES[id].map((r) => r(p)).filter((s) => s && s.trim())
  if (lens !== "any" && RECIPES[lens]) return unique(run(lens))
  // Every lens in turn, one recipe from each, so stepping through hears every voice early.
  const all = LENSES.map(([id]) => run(id)), out = []
  for (let i = 0; all.some((l) => i < l.length); i++) for (const l of all) if (i < l.length) out.push(l[i])
  return unique(out)
}
const unique = (list) => [...new Set(list)]

export function rewrite(msg, lens = "any", take = 0) {
  const line = String(msg?.headline ?? "")
  if (!take) return line
  const list = rewrites(msg, lens)
  return list.length ? list[(take - 1) % list.length] : line
}

// Which lens a take came from, for the label under the Rewrite button.
export function lensOf(msg, lens, take) {
  if (!take) return null
  if (lens !== "any") return LENSES.find(([id]) => id === lens) ?? null
  const p = parts(msg), line = rewrite(msg, lens, take)
  return LENSES.find(([id]) => RECIPES[id].some((r) => r(p) === line)) ?? null
}
