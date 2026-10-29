// Files that outlive a page load, kept in this browser (IndexedDB): font files, backdrop
// images or videos, and image marks. Patches only name them, so a patch stays small enough for a link.
//   await files.put("fonts", name, blob)   await files.get("fonts", name)   await files.list("fonts")
const DB = "create-o-matic"
const STORES = ["fonts", "media", "marks"]

let opening
function db() {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 2)
    req.onupgradeneeded = () => { for (const s of STORES) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s) }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return opening
}

async function tx(store, mode, fn) {
  const d = await db()
  return new Promise((resolve, reject) => {
    const t = d.transaction(store, mode)
    const req = fn(t.objectStore(store))
    t.oncomplete = () => resolve(req?.result)
    t.onerror = () => reject(t.error)
  })
}

export const files = {
  put: (store, name, blob) => tx(store, "readwrite", (s) => s.put({ name, blob, type: blob.type, added: Date.now() }, name)),
  get: (store, name) => tx(store, "readonly", (s) => s.get(name)).catch(() => null),
  remove: (store, name) => tx(store, "readwrite", (s) => s.delete(name)),
  list: (store) => tx(store, "readonly", (s) => s.getAll()).catch(() => []),
}
