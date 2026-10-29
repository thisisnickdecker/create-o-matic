// The local server: serves web/ exactly as Cloudflare Pages will, with no dependencies. Everything
// is plain ES modules, so this is all the "build" there is. Usage: node scripts/serve.mjs [port]
// Local-only extras, never published:
//   POST /api/presets    saves a patch into an instrument's presets folder ("Add to presets")
//   /__dev/cards.html    the social-card maker; POST /api/card?name=… saves its PNGs to web/og/
import { createServer } from "node:http"
import { mkdir, readFile, stat, writeFile } from "node:fs/promises"
import { extname, join, normalize, resolve } from "node:path"

const ROOT = resolve(import.meta.dirname, "../web")
const DEV = resolve(import.meta.dirname, "dev")
const local = (req) => ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress)
const PORT = Number(process.argv[2] || process.env.PORT || 4173)
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".md": "text/markdown; charset=utf-8",
  ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".otf": "font/otf", ".mp4": "video/mp4", ".webm": "video/webm",
}

async function addPreset(req, res) {
  let body = ""
  for await (const chunk of req) body += chunk
  const { instrument, name, patch } = JSON.parse(body)
  if (!/^[a-z0-9-]+$/.test(instrument) || !name || typeof patch !== "object") { res.writeHead(400).end(); return }
  const dir = join(ROOT, "instruments", instrument, "presets")
  const file = `${String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "preset"}.json`
  await writeFile(join(dir, file), JSON.stringify(patch, null, 2) + "\n")
  const index = JSON.parse(await readFile(join(dir, "index.json"), "utf8").catch(() => "[]"))
  if (!index.includes(file)) { index.push(file); await writeFile(join(dir, "index.json"), JSON.stringify(index, null, 2) + "\n") }
  res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ file }))
}

createServer(async (req, res) => {
  if (req.url === "/api/ping") { res.writeHead(200).end("ok"); return }
  if (req.url.startsWith("/api/card") && req.method === "POST") {
    const name = new URL(req.url, "http://x").searchParams.get("name") || ""
    if (!local(req) || !/^[a-z0-9-]{1,40}$/.test(name)) { res.writeHead(403).end(); return }
    const chunks = []
    for await (const c of req) chunks.push(c)
    await mkdir(join(ROOT, "og"), { recursive: true })
    await writeFile(join(ROOT, "og", `${name}.png`), Buffer.concat(chunks))
    res.writeHead(200).end("saved")
    return
  }
  if (req.url === "/api/presets" && req.method === "POST") {
    // Writes come only from this machine.
    if (!local(req)) { res.writeHead(403).end(); return }
    try { await addPreset(req, res) } catch { res.writeHead(500).end() }
    return
  }
  let path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname))
  const dev = path.startsWith("/__dev/")
  if (dev && !local(req)) { res.writeHead(403).end(); return }
  const base = dev ? DEV : ROOT
  let file = join(base, dev ? path.slice(6) : path)
  if (!file.startsWith(base)) { res.writeHead(403).end(); return }
  try {
    if ((await stat(file)).isDirectory()) file = join(file, "index.html")
    const body = await readFile(file)
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream", "Cache-Control": "no-store" })
    res.end(body)
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found")
  }
}).listen(PORT, () => console.log(`Workshop on http://localhost:${PORT}`))
