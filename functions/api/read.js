// GET /api/read?url=…  Reads a public website: what the page declares (title, description, share
// image, icon, headlines), its colours and typefaces from its CSS, what it's built with and hosted
// on, its DNS and email providers, analytics and tools, whether it's open to AI agents, and its
// own social accounts. A Cloudflare Pages Function: the one part of Create-o-matic that runs on a
// server, because a browser can't read another site's pages.
//
// The reading is dig this's (digthis.website), brought over in this site's own style.

const UA = "Mozilla/5.0 (compatible; Create-o-matic/1.0; +https://createomatic.xyz)"
const SOCIAL = { "instagram.com": "Instagram", "x.com": "X", "twitter.com": "X", "linkedin.com": "LinkedIn", "youtube.com": "YouTube", "github.com": "GitHub", "facebook.com": "Facebook", "tiktok.com": "TikTok", "vimeo.com": "Vimeo", "threads.net": "Threads", "bsky.app": "Bluesky", "dribbble.com": "Dribbble", "behance.net": "Behance", "substack.com": "Substack", "spotify.com": "Spotify", "pinterest.com": "Pinterest" }
const GENERIC = new Set(["inherit", "initial", "unset", "sans-serif", "serif", "monospace", "system-ui", "-apple-system", "blinkmacsystemfont", "segoe ui", "roboto", "helvetica", "helvetica neue", "arial", "ui-sans-serif", "ui-serif", "ui-monospace", "apple color emoji", "segoe ui emoji", "segoe ui symbol", "noto color emoji", "cursive", "var", "times new roman", "georgia", "menlo", "monaco", "consolas", "courier new", "courier", "times"])
const JUNK_HEAD = /^(your cart|cart|menu|search|close|sign in|log in|login|cookie|subscribe|newsletter|skip to|share|loading|0)\b|cart is (currently )?empty/i
// A bot check, a holding page or a consent gate instead of the site: what we read is the wall.
const WALL = /hang tight|routing to checkout|confirm you are (a )?human|verify(ing)? (that )?you are (a )?human|are you a robot|just a moment|checking (if the site connection is secure|your browser)|attention required|access denied|request blocked|enable javascript and cookies|please wait while we|one more step|security check|pardon our interruption|cf-chl|challenge-platform|_incapsula_|px-captcha|captcha-delivery|datadome|perimeterx/i
const isWall = (title, body) => WALL.test(title || "") || (String(body || "").length < 4000 && WALL.test(body || ""))

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": status === 200 ? "public, max-age=3600" : "no-store" } })

// ---- fetching safely: public web addresses only, every redirect hop checked ----
const BLOCKED_V4 = [[0x00000000, 8], [0x0a000000, 8], [0x64400000, 10], [0x7f000000, 8], [0xa9fe0000, 16], [0xac100000, 12], [0xc0000000, 24], [0xc0000200, 24], [0xc0a80000, 16], [0xc6120000, 15], [0xc6336400, 24], [0xcb007100, 24], [0xe0000000, 4], [0xf0000000, 4]]
function v4(h) {
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!m) return null
  const p = m.slice(1).map(Number)
  return p.some((x) => x > 255) ? null : ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3]
}
export function unsafeUrl(raw) {
  let u
  try { u = new URL(raw) } catch { return "Not an address." }
  if (!/^https?:$/.test(u.protocol)) return "Only web addresses."
  if (u.username || u.password) return "No passwords in addresses."
  if (u.port && !["80", "443"].includes(u.port)) return "Only the usual ports."
  const h = u.hostname.toLowerCase().replace(/\.$/, "")
  if (!h.includes(".") || h === "localhost" || /\.(localhost|local|internal|lan|home|arpa|test|invalid)$/.test(h)) return "Not a public address."
  if (h.startsWith("[")) return "Not a public address."
  const n = v4(h)
  if (n !== null && BLOCKED_V4.some(([base, bits]) => (n >>> (32 - bits)) === (base >>> (32 - bits)))) return "Not a public address."
  if (/^\d+$/.test(h) || /^0x[0-9a-f]+$/i.test(h)) return "Not a public address."
  return null
}
async function safeFetch(url, init = {}, hops = 5) {
  let at = new URL(url)
  for (let i = 0; i <= hops; i++) {
    const bad = unsafeUrl(at)
    if (bad) throw new Error(bad)
    const res = await fetch(at.href, { ...init, redirect: "manual" })
    const to = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null
    if (!to) { try { Object.defineProperty(res, "url", { value: at.href }) } catch {} return res }
    res.body?.cancel().catch(() => {})
    at = new URL(to, at)
  }
  throw new Error("Too many redirects.")
}
// Up to limit characters of a page or file, in eight seconds at most.
async function grab(url, limit, accept) {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 8000)
  try {
    const r = await safeFetch(url, { headers: { "user-agent": UA, accept }, signal: ctl.signal, cf: { cacheTtl: 3600, cacheEverything: true } })
    if (!r.ok) return { status: r.status, url: r.url, text: "", headers: r.headers }
    const reader = r.body.getReader(), dec = new TextDecoder()
    let text = ""
    while (text.length < limit) { const { done, value } = await reader.read(); if (done) break; text += dec.decode(value, { stream: true }) }
    reader.cancel().catch(() => {})
    return { status: r.status, url: r.url, text, type: r.headers.get("content-type") || "", headers: r.headers }
  } finally { clearTimeout(timer) }
}

function target(raw) {
  let u
  try { u = new URL(/^https?:\/\//i.test(raw) ? raw : "https://" + raw) } catch { return null }
  return unsafeUrl(u) ? null : u
}

// ---- reading HTML ----
const decode = (s) => s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&rsquo;/g, "’").replace(/&lsquo;/g, "‘").replace(/&ldquo;/g, "“").replace(/&rdquo;/g, "”").replace(/&mdash;/g, "—").replace(/&ndash;/g, "–").replace(/&hellip;/g, "…").replace(/&amp;/g, "&")
const clean = (s) => decode(s.replace(/<!--[\s\S]*?-->/g, "").replace(/<\/?(span|em|strong|b|i|a|sup|sub|small)\b[^>]*>/gi, "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").replace(/\s+([,.!?;:’'])/g, "$1").trim()
const meta = (html, key) => { const tag = (html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${key}["'][^>]*>`, "i")) || [])[0]; return tag ? decode((tag.match(/content=["']([^"']*)["']/i) || [])[1] || "") : "" }
const abs = (href, base) => { try { return new URL(decode(href), base).href } catch { return "" } }

// ---- colours: the commonest in the CSS, two neutrals then up to five colours, none too alike ----
function hexes(css, counts) {
  for (const m of css.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)) {
    let h = m[1].toUpperCase()
    if (h.length === 3) h = h.split("").map((c) => c + c).join("")
    counts[h] = (counts[h] || 0) + 1
  }
  for (const m of css.matchAll(/rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/gi)) {
    const h = [m[1], m[2], m[3]].map((v) => Math.min(255, +v).toString(16).padStart(2, "0")).join("").toUpperCase()
    counts[h] = (counts[h] || 0) + 1
  }
}
function palette(counts) {
  const rgb = (h) => [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
  const sat = ([r, g, b]) => (Math.max(r, g, b) - Math.min(r, g, b)) / 255
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([h]) => h)
  const out = []
  const add = (h) => { const c = rgb(h); if (out.every((o) => { const d = rgb(o); return Math.hypot(c[0] - d[0], c[1] - d[1], c[2] - d[2]) > 40 })) out.push(h) }
  sorted.filter((h) => sat(rgb(h)) < 0.12).slice(0, 4).forEach(add)
  const neutrals = out.length
  sorted.filter((h) => sat(rgb(h)) >= 0.12).forEach((h) => { if (out.length < neutrals + 5) add(h) })
  return out.slice(0, 2).concat(out.slice(neutrals)).slice(0, 7).map((h) => "#" + h)
}

// ---- type: families from @font-face and font-family rules, named as people say them ----
const family = (f) => f.replace(/[\s_-]+(hk|ar|jp|sc|tc|kr|th|he|cyrillic|latin|ext|subset|webfont|web|variable|var|vf|text|display|regular|medium|bold|light|book|italic|w0\d|lt|std)$/i, "").replace(/\s+(Pro|Std)\s+(HK|AR|JP|SC|TC|KR|TH|HE)$/i, " $1").trim()
function fonts(css, counts) {
  const vars = {}
  for (const m of css.matchAll(/(--[\w-]+)\s*:\s*(["'][^;}]+)/g)) vars[m[1]] = m[2]
  css = css.replace(/font-family:\s*var\((--[\w-]+)[^)]*\)/g, (all, v) => (vars[v] ? "font-family:" + vars[v] : all)).replace(/font:\s*[^;}]*var\((--[\w-]+)\)/g, (all, v) => (vars[v] ? "font-family:" + vars[v] : all))
  for (const m of css.matchAll(/@font-face\s*{[^}]*?font-family:\s*["']?([^;"'}]+)/gi)) { const f = m[1].trim(); counts[f] = (counts[f] || 0) + 5 }
  for (const m of css.matchAll(/font-family:\s*([^;}]+)/gi)) {
    const first = m[1].split(",")[0].replace(/["']/g, "").trim()
    if (first && !GENERIC.has(first.toLowerCase()) && !first.startsWith("var(")) counts[first] = (counts[first] || 0) + 1
  }
}
const KNOWN = {
  abcfavorit: "ABC Favorit", figmasans: "Figma Sans", commitmono: "Commit Mono", intervariable: "Inter", orpheuspro: "Orpheus Pro", arcadiadisplay: "Arcadia Display", nudicaultralight: "Nudica",
  dinneuzeitgroteskltw01: "DIN Neuzeit Grotesk", sfpro: "SF Pro", brandongrot: "Brandon Grotesque", chroniclecondcursi: "Chronicle Condensed", universltstd: "Univers", universltstdboldex: "Univers Extended",
  tradegothic: "Trade Gothic", ivypresto: "IvyPresto", te: "TE", saesgrotesk: "Saes Grotesk", neuehaas: "Neue Haas Grotesk", sourcecodepro: "Source Code Pro", sohne: "Söhne", searchsystem: "Search System",
}
const UPPER = new Set(["abc", "pp", "gt", "itc", "ibm", "din", "hwt", "fb", "urw", "pt", "te", "jnl", "sf", "nb", "ks", "ft", "tt", "ny", "dm"])
const DROP = /^(w0\d|lt|web|webfont|variable|var|vf|subset|regular|roman|book|light|extralight|ultralight|thin|medium|semibold|bold|heavy|black|italic|oblique|normal|ex|v\d+|\d+|ltw\d+|lt\d+|std|(?=[a-z]*\d)[a-z0-9]{6})$/
const cap = (w) => (UPPER.has(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1))
// "avenir-lt-w01_35-light1475496" is Avenir; a face with no real name ("wfont_e13bf9…") is null.
export function familyName(raw) {
  let s = (raw ?? "").trim().replace(/^["']|["']$/g, "")
  if (/[!{}()]|^(inherit|initial|unset|x*small|x*large|medium)$|chevron|icon|glyph|symbols?$/i.test(s)) return null
  if (!s || /^(wfont|font|custom)[-_]?[\da-f_]*$/i.test(s.replace(/[-_][\da-f]{6,}.*/i, "")) || /^(wfont|font-\d|custom_\d)/i.test(s)) return null
  s = s.replace(/^_+/, "").replace(/[-_]?[\da-f]{6,}$/i, "").replace(/\d{5,}/g, "")
  const words = s.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2").split(/[\s_-]+/).filter(Boolean)
  const looksRaw = !/\s/.test(s) && (s === s.toLowerCase() || /[_-]/.test(s) || /^[a-z]+[A-Z]|[a-z][A-Z]{2}|[a-z][A-Z][a-z]|^[A-Z]{2,}[a-z]/.test(s))
  if (!looksRaw) return s.replace(/\s+(Pro|Std)\s+(HK|AR|JP|SC|TC|KR|TH|HE)$/i, " $1").replace(/[-\s]+(Variable|subset|LT|LT Std|W0\d)$/i, "").trim()
  const keep = []
  for (const w of words) { const l = w.toLowerCase(); if (keep.length && (DROP.test(l) || /^\d\d$/.test(l))) continue; keep.push(l) }
  const joined = keep.join("")
  if (KNOWN[joined]) return KNOWN[joined]
  if (KNOWN[keep[0]] && keep.length === 1) return KNOWN[keep[0]]
  for (let n = keep.length; n > 0; n--) { const k = keep.slice(0, n).join(""); if (KNOWN[k]) return [KNOWN[k], ...keep.slice(n).map(cap)].join(" ") }
  const out = keep.map(cap).join(" ").trim()
  return out.length > 1 ? out : null
}
function fontSources(all) {
  const s = []
  if (/use\.typekit\.net|p\.typekit\.net/.test(all)) s.push("Adobe Fonts")
  if (/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(all)) s.push("Google Fonts")
  if (/fonts\.bunny\.net/.test(all)) s.push("Bunny Fonts")
  if (/cloud\.typography\.com/.test(all)) s.push("Hoefler&Co. Cloud.typography")
  if (/fast\.fonts\.net/.test(all)) s.push("Monotype Fonts.com")
  if (/url\([^)]*\/[^)]*\.woff2?/.test(all) || (/\.woff2?["')?]/.test(all) && !s.length)) s.push("Self-hosted files")
  return [...new Set(s)]
}

// ---- the rest: its own social accounts, hosting, DNS, email, tools, AI readiness ----
function socialsOf(html) {
  const regions = [...html.matchAll(/<(header|nav|footer)\b[\s\S]*?<\/\1>/gi)].map((m) => m[0]).join("\n") + "\n" + [...html.matchAll(/<a[^>]+rel=["'][^"']*\bme\b[^"']*["'][^>]*>/gi)].map((m) => m[0]).join("\n")
  const out = [], seen = new Set()
  for (const m of regions.matchAll(/href=["'](https?:\/\/[^"']+)["']/gi)) {
    let u
    try { u = new URL(decode(m[1])) } catch { continue }
    const h = u.hostname.replace(/^www\./, ""), key = Object.keys(SOCIAL).find((k) => h === k || h.endsWith("." + k))
    if (!key || seen.has(SOCIAL[key]) || /\/(share|intent|sharer|status|p|posts|watch|reel)\b/.test(u.pathname)) continue
    seen.add(SOCIAL[key])
    out.push({ label: SOCIAL[key], url: u.origin + u.pathname })
  }
  return out
}
async function dns(name, type) {
  try {
    const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`, { headers: { accept: "application/dns-json" }, cf: { cacheTtl: 3600 } })
    return ((await r.json()).Answer || []).map((a) => a.data.toLowerCase())
  } catch { return [] }
}
const has = (list, re) => list.some((x) => re.test(x))
function hosting(h, html) {
  const g = (k) => (h.get(k) || "").toLowerCase(), server = g("server"), out = []
  if (h.get("x-vercel-id") || server === "vercel") out.push("Vercel")
  if (h.get("x-nf-request-id") || server === "netlify") out.push("Netlify")
  if (server.startsWith("framer")) out.push("Framer")
  if (h.get("x-shopid") || h.get("x-shopify-stage")) out.push("Shopify")
  if (h.get("x-wix-request-id")) out.push("Wix")
  if (/squarespace/.test(server)) out.push("Squarespace")
  if (server === "github.com") out.push("GitHub Pages")
  if (h.get("fly-request-id")) out.push("Fly.io")
  if (h.get("x-render-origin-server") || /render/.test(server)) out.push("Render")
  if (h.get("x-railway-request-id")) out.push("Railway")
  if (h.get("x-amz-cf-id") || /cloudfront|amazons3/.test(server)) out.push("Amazon Web Services")
  if (h.get("x-goog-generation") || /google frontend|gws|gse/.test(server)) out.push("Google Cloud")
  if (/data-wf-site|webflow/.test(html) && !out.length) out.push("Webflow")
  if (server === "cloudflare" || h.get("cf-ray")) out.push(out.length ? "behind Cloudflare" : "Cloudflare")
  if (h.get("x-served-by") && /cache-/.test(g("x-served-by")) && !out.includes("Fastly")) out.push("Fastly")
  return out
}
const dnsName = (ns) => has(ns, /cloudflare\.com/) ? "Cloudflare" : has(ns, /awsdns/) ? "Amazon Route 53" : has(ns, /googledomains|ns-cloud|google\.com/) ? "Google" : has(ns, /registrar-servers/) ? "Namecheap" : has(ns, /domaincontrol/) ? "GoDaddy" : has(ns, /squarespacedns|squarespace/) ? "Squarespace" : has(ns, /vercel-dns/) ? "Vercel" : has(ns, /nsone/) ? "NS1" : has(ns, /dnsimple/) ? "DNSimple" : has(ns, /wixdns/) ? "Wix" : ns[0] ? ns[0].replace(/\.$/, "").split(".").slice(-2).join(".") : ""
const mailName = (mx) => has(mx, /google\.com|googlemail/) ? "Google Workspace" : has(mx, /outlook\.com|protection\.outlook/) ? "Microsoft 365" : has(mx, /messagingengine/) ? "Fastmail" : has(mx, /protonmail|proton\.me/) ? "Proton Mail" : has(mx, /zoho/) ? "Zoho Mail" : has(mx, /mx\.cloudflare\.net/) ? "Cloudflare Email Routing" : has(mx, /registrar-servers/) ? "Namecheap forwarding" : has(mx, /icloud/) ? "iCloud Mail" : mx[0] ? mx[0].split(" ").pop().replace(/\.$/, "") : ""
const TOOLS = [[/googletagmanager\.com\/gtag|google-analytics\.com|gtag\(/, "Google Analytics"], [/googletagmanager\.com\/gtm/, "Google Tag Manager"], [/plausible\.io/, "Plausible"], [/usefathom\.com/, "Fathom"],
  [/cloudflareinsights\.com/, "Cloudflare Web Analytics"], [/\/_vercel\/insights|va\.vercel-scripts/, "Vercel Analytics"], [/posthog/, "PostHog"], [/segment\.(com|io)\/analytics/, "Segment"], [/hotjar/, "Hotjar"],
  [/connect\.facebook\.net|fbq\(/, "Meta Pixel"], [/js\.stripe\.com/, "Stripe"], [/intercom/, "Intercom"], [/hs-scripts|hubspot/, "HubSpot"], [/klaviyo/, "Klaviyo"], [/mailchimp|list-manage\.com/, "Mailchimp"],
  [/convertkit|kit\.com\/forms/, "Kit"], [/beehiiv/, "beehiiv"], [/substack\.com\/embed/, "Substack embed"], [/cdn\.sanity\.io/, "Sanity"], [/ctfassets\.net/, "Contentful"], [/prismic/, "Prismic"], [/storyblok/, "Storyblok"],
  [/datocms/, "DatoCMS"], [/lottie/, "Lottie"], [/rive\.app|@rive-app/, "Rive"], [/unicorn\.studio/, "Unicorn Studio"], [/spline\.design/, "Spline"], [/vimeo\.com|player\.vimeo/, "Vimeo"], [/mux\.com/, "Mux"], [/youtube\.com\/embed/, "YouTube embeds"], [/clerk\.(com|dev)/, "Clerk"], [/supabase/, "Supabase"]]
const tools = (all) => TOOLS.filter(([re]) => re.test(all)).map(([, n]) => n)
async function agents(origin) {
  const [llms, robots] = await Promise.all([grab(origin + "/llms.txt", 4000, "text/plain").catch(() => ({})), grab(origin + "/robots.txt", 60000, "text/plain").catch(() => ({}))])
  const r = robots.text || "", blocks = (n) => new RegExp(`user-agent:\\s*${n}[\\s\\S]*?disallow:\\s*/\\s*$`, "im").test(r)
  return { llmsTxt: !!(llms.text && llms.status === 200 && !/<html/i.test(llms.text)), blocksAI: ["GPTBot", "ClaudeBot", "CCBot", "Google-Extended", "PerplexityBot"].filter(blocks), contentSignal: (r.match(/content-signal:\s*([^\n]+)/i) || [])[1] || "" }
}
function stackOf(html) {
  const stack = new Set(), gen = meta(html, "generator")
  if (gen) stack.add(gen.split(/\s/)[0])
  const T = [[/\/_next\/|__NEXT_DATA__/, "Next.js"], [/data-wf-site|webflow\.com/, "Webflow"], [/framerusercontent\.com|data-framer/, "Framer"], [/cdn\.shopify\.com|Shopify\.theme/, "Shopify"], [/squarespace(-cdn)?\.com/, "Squarespace"],
    [/wp-content\/|wp-includes\//, "WordPress"], [/__NUXT__|\/_nuxt\//, "Nuxt"], [/astro-island|\/_astro\//, "Astro"], [/__sveltekit|\/_app\/immutable\//, "SvelteKit"], [/data-reactroot|react-dom/, "React"], [/gsap|ScrollTrigger/, "GSAP"],
    [/three(\.module)?(\.min)?\.js|THREE\./, "three.js"], [/lenis/, "Lenis smooth scroll"]]
  for (const [re, n] of T) if (re.test(html)) stack.add(n)
  if (/tailwind/.test(html) || /\b(?:px|py|mt|mb)-\d+\s[^"']*\b(?:text|bg)-[a-z]+-\d{3}\b/.test(html)) stack.add("Tailwind CSS")
  if (!stack.size && !/<script[^>]+src=/i.test(html)) stack.add("Hand-written HTML")
  return [...stack]
}

export async function read(raw) {
  const u = target(String(raw || "").trim())
  if (!u) return json({ error: "That doesn't look like a public website address." }, 400)
  let page
  try { page = await grab(u.href, 1_500_000, "text/html,application/xhtml+xml") } catch { return json({ error: `Couldn't reach ${u.hostname}. It may be down, or it took too long.` }, 502) }
  if (page.status === 429 || page.status === 403) return json({ error: `${u.hostname} turned the reader away (${page.status}). Big sites often block automated visits.`, status: page.status }, 502)
  if (!page.text || !/html/i.test(page.type || "html")) return json({ error: `${u.hostname} answered with ${page.status || "nothing readable"}.`, status: page.status }, 502)
  const html = page.text, base = page.url || u.href, final = new URL(base), host = final.hostname.replace(/^www\./, "")

  const title = clean((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "")
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "")
  const blocked = isWall(title, clean(text).slice(0, 6000)) || /cf-chl|challenge-platform|captcha-delivery|px-captcha/i.test(html.slice(0, 20000))
  const icon = abs((html.match(/<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]*href=["']([^"']+)/i) || html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*icon/i) || [])[1] || "/favicon.ico", base)
  const heads = (tag) => [...text.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi"))].map((m) => clean(m[1])).filter((t) => t && t.length < 140 && !JUNK_HEAD.test(t))

  const colourCounts = {}, fontCounts = {}
  const inline = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join("\n")
  hexes(inline, colourCounts); fonts(inline, fontCounts)
  const sheets = [...html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]*>/gi)].map((m) => (m[0].match(/href=["']([^"']+)/i) || [])[1]).filter(Boolean).map((h) => abs(h, base)).filter((h) => h && !/typekit|googleapis/.test(h)).slice(0, 5)
  const css = await Promise.all(sheets.map(async (s) => { try { return (await grab(s, 800_000, "text/css")).text } catch { return "" } }))
  css.forEach((t) => { hexes(t, colourCounts); fonts(t, fontCounts) })
  for (const m of html.matchAll(/fonts\.googleapis\.com\/css2?\?family=([^"'&]+)/gi)) decodeURIComponent(m[1]).split("|").forEach((f) => { const n = f.split(":")[0].replace(/\+/g, " "); fontCounts[n] = (fontCounts[n] || 0) + 10 })
  const themeColour = meta(html, "theme-color")
  if (/^#[0-9a-f]{6}$/i.test(themeColour)) colourCounts[themeColour.slice(1).toUpperCase()] = 999
  const all = html + "\n" + css.join("\n")

  const apex = host.split(".").slice(-2).join(".")
  const [ns, mx, ag] = await Promise.all([dns(apex, "NS"), dns(apex, "MX"), agents(final.origin)])
  const type = [...new Set(Object.entries(fontCounts).sort((a, b) => b[1] - a[1]).map(([f]) => (/^[a-z0-9-]+$/.test(f) && f.includes("-") ? f.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ") : f))
    .filter((f) => !/icon|awesome|glyph|emoji|fallback/i.test(f)).map((f) => familyName(family(family(f)))).filter(Boolean))].slice(0, 4)

  return json({
    url: final.href, host, status: page.status, blocked,
    title, description: meta(html, "description") || meta(html, "og:description"),
    siteName: meta(html, "og:site_name"), image: abs(meta(html, "og:image") || meta(html, "twitter:image"), base) || "", icon,
    themeColour, lang: (html.match(/<html[^>]+lang=["']([^"']+)/i) || [])[1] || "",
    h1: [...new Set(heads("h1"))].slice(0, 2), h2: [...new Set(heads("h2"))].slice(0, 6),
    colours: palette(colourCounts), type, fontSources: fontSources(all),
    stack: stackOf(html), hosting: hosting(page.headers, html), dns: dnsName(ns), email: mailName(mx),
    tools: tools(all), agents: ag, socials: socialsOf(text).slice(0, 8), newsletter: /type=["']email["']/i.test(html),
    read: new Date().toISOString(),
  })
}

export const onRequestGet = ({ request }) => read(new URL(request.url).searchParams.get("url"))
