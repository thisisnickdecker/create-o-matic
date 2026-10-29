// Overlay: your own texture (a scanned paper, a photocopy, dust, a leak of light) laid over the
// image. It paints a fresh layer, which the stack then blends with its blend mode and opacity:
// Multiply for paper and dirt, Screen for light leaks and dust on black.
// The file itself is kept in the browser; the instrument passes it in as env.assets.

export default {
  id: "overlay",
  label: "Texture overlay",
  group: "Paint",
  fresh: true,
  params: [
    { key: "overlayImage", label: "Texture", type: "media", default: "", help: "An image or video of your own: a scan, a photograph of paper, a light leak." },
    { key: "overlayFit", label: "Fit", type: "select", default: "cover", options: [["cover", "Fill the frame"], ["contain", "Fit inside"], ["tile", "Tile"]] },
    { key: "overlayScale", label: "Scale", type: "number", min: 0.1, max: 4, step: 0.01, default: 1 },
    { key: "overlayTurn", label: "Turn", type: "select", default: "0", options: [["0", "0°"], ["90", "90°"], ["180", "180°"], ["270", "270°"]] },
  ],
  active: (p) => !!p.overlayImage,
  apply(ctx, p, { assets }) {
    const img = assets?.get(p.overlayImage)
    if (!img) return
    const { width: W, height: H } = ctx.canvas
    const iw = img.videoWidth || img.naturalWidth || img.width, ih = img.videoHeight || img.naturalHeight || img.height
    if (!iw || !ih) return
    const turn = Number(p.overlayTurn), sideways = turn % 180 !== 0
    const fw = sideways ? H : W, fh = sideways ? W : H // the frame, as the turned texture sees it
    ctx.save()
    ctx.translate(W / 2, H / 2)
    ctx.rotate((turn * Math.PI) / 180)
    if (p.overlayFit === "tile") {
      const tw = iw * p.overlayScale * (W / 1080), th = ih * p.overlayScale * (W / 1080)
      for (let y = -fh / 2; y < fh / 2; y += th) for (let x = -fw / 2; x < fw / 2; x += tw) ctx.drawImage(img, x, y, tw, th)
    } else {
      const k = (p.overlayFit === "contain" ? Math.min : Math.max)(fw / iw, fh / ih) * p.overlayScale
      ctx.drawImage(img, (-iw * k) / 2, (-ih * k) / 2, iw * k, ih * k)
    }
    ctx.restore()
  },
}
