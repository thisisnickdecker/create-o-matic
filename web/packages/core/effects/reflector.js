// Reflector: the frame mirrored. Halves, quarters, or a glossy floor with the reflection fading
// into it, like type standing on black glass.
import { hexRgb } from "./util.js"

const copy = typeof document !== "undefined" ? document.createElement("canvas").getContext("2d", { willReadFrequently: true }) : null

export default {
  id: "reflector",
  label: "Reflector",
  params: [
    { key: "mirror", label: "Reflector", type: "select", default: "off",
      options: [["off", "Off"], ["left", "Left onto right"], ["top", "Top onto bottom"], ["quad", "Four ways"], ["floor", "Glossy floor"]] },
    { key: "mirrorHorizon", label: "Horizon", type: "number", min: 0.3, max: 0.9, step: 0.01, default: 0.64, when: { mirror: "floor" }, help: "Where the floor starts, from the top." },
    { key: "mirrorFade", label: "Reflection", type: "number", min: 0, max: 1, step: 0.01, default: 0.45, when: { mirror: "floor" } },
  ],
  active: (p) => p.mirror !== "off",
  apply(ctx, p, { background }) {
    const { width: W, height: H } = ctx.canvas
    const src = copy.canvas
    if (src.width !== W || src.height !== H) { src.width = W; src.height = H }
    copy.drawImage(ctx.canvas, 0, 0)
    const flip = (sx, sy, sw, sh, fx, fy) => {
      ctx.save()
      ctx.translate(fx ? W : 0, fy ? H : 0)
      ctx.scale(fx ? -1 : 1, fy ? -1 : 1)
      ctx.drawImage(src, sx, sy, sw, sh, sx, sy, sw, sh)
      ctx.restore()
    }
    if (p.mirror === "left") flip(0, 0, W / 2, H, true, false)
    else if (p.mirror === "top") flip(0, 0, W, H / 2, false, true)
    else if (p.mirror === "quad") {
      flip(0, 0, W / 2, H / 2, true, false)
      flip(0, 0, W / 2, H / 2, false, true)
      flip(0, 0, W / 2, H / 2, true, true)
    } else {
      // The whole frame stands above the horizon; below, it's reflected and fades into the floor.
      const hz = Math.round(H * p.mirrorHorizon)
      ctx.fillStyle = background
      ctx.fillRect(0, 0, W, H)
      ctx.drawImage(src, 0, 0, W, H, 0, 0, W, hz)
      ctx.save()
      ctx.translate(0, 2 * hz)
      ctx.scale(1, -1)
      ctx.globalAlpha = p.mirrorFade
      ctx.drawImage(src, 0, 0, W, H, 0, 0, W, hz)
      ctx.restore()
      const fade = ctx.createLinearGradient(0, hz, 0, H)
      fade.addColorStop(0, `rgba(${hexRgb(background).join(", ")}, 0)`)
      fade.addColorStop(1, background)
      ctx.fillStyle = fade
      ctx.fillRect(0, hz, W, H - hz)
    }
  },
}
