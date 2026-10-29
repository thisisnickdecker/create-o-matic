// Backdrop images and videos. Added files are kept in this browser (store.js); a patch names one.
//   const name = await addMedia(file)      const m = await loadMedia(name)  -> { kind, el, duration }
// For exports a video is seeked to each frame's exact time before drawing (seekVideo), so the
// export is frame-accurate even though the preview just plays.
import { files } from "./store.js"

const cache = new Map()

export async function addMedia(file) {
  if (!/^(image|video)\//.test(file.type)) throw new Error(`${file.name} isn't an image or a video.`)
  await files.put("media", file.name, file)
  cache.delete(file.name)
  return file.name
}

export const listMedia = () => files.list("media")

export function loadMedia(name) {
  if (!name) return Promise.resolve(null)
  if (!cache.has(name)) cache.set(name, (async () => {
    const rec = await files.get("media", name)
    if (!rec) return null
    const url = URL.createObjectURL(rec.blob)
    if (rec.type.startsWith("video/")) {
      const v = Object.assign(document.createElement("video"), { src: url, muted: true, playsInline: true, loop: true, preload: "auto" })
      await new Promise((resolve, reject) => { v.onloadeddata = resolve; v.onerror = reject })
      return { kind: "video", el: v, duration: v.duration }
    }
    const img = new Image()
    img.src = url
    await img.decode()
    return { kind: "image", el: img, duration: 0 }
  })().catch(() => null))
  return cache.get(name)
}

export function seekVideo(v, time) {
  if (Math.abs(v.currentTime - time) < 0.0005 && v.readyState >= 2) return Promise.resolve()
  return new Promise((resolve) => {
    const done = () => { v.removeEventListener("seeked", done); resolve() }
    v.addEventListener("seeked", done)
    v.currentTime = time
    setTimeout(done, 2000)
  })
}
