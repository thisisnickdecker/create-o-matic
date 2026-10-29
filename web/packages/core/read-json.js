// Reads a JSON file, such as an instrument's manifest beside its engine. Fetched in the browser;
// read from disk in Node, for the tests. (Not `import … with { type: "json" }`: older Safari and
// Firefox can't parse that, and a page that can't parse its engine silently does nothing.)
export async function readJson(url) {
  if (typeof window === "undefined") {
    const { readFile } = await import("node:fs/promises")
    return JSON.parse(await readFile(url, "utf8"))
  }
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Couldn't load ${url} (${res.status}).`)
  return res.json()
}
