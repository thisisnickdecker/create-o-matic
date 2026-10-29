// Kaleidoscope: the frame folded into mirrored wedges around the centre, turning with the loop.
import { remap, TAU } from "./util.js"

export default {
  id: "kaleidoscope",
  label: "Kaleidoscope",
  params: [
    { key: "kaleido", label: "Kaleidoscope", type: "int", min: 0, max: 24, step: 1, default: 0, help: "Number of mirrored wedges. 0 is off." },
    { key: "kaleidoSpin", when: { kaleido: { not: 0 } }, label: "Kaleido turns", type: "int", min: -4, max: 4, step: 1, default: 0, help: "Whole turns per loop." },
    { key: "kaleidoZoom", when: { kaleido: { not: 0 } }, label: "Kaleido zoom", type: "number", min: 0.25, max: 4, step: 0.01, default: 1 },
  ],
  active: (p) => p.kaleido >= 2,
  apply(ctx, p, { t }) {
    const { width: W, height: H } = ctx.canvas
    const cx = W / 2, cy = H / 2
    const wedge = TAU / p.kaleido
    const spin = TAU * p.kaleidoSpin * t
    const zoom = 1 / p.kaleidoZoom
    remap(ctx, (x, y, out) => {
      const dx = x - cx, dy = y - cy
      const r = Math.sqrt(dx * dx + dy * dy) * zoom
      let a = Math.atan2(dy, dx) - spin
      a = ((a % wedge) + wedge) % wedge
      if (a > wedge / 2) a = wedge - a
      // Read from the wedge that points straight up, so the top of the frame is the motif.
      const b = a - Math.PI / 2 - wedge / 2
      out[0] = cx + r * Math.cos(b)
      out[1] = cy + r * Math.sin(b)
    })
  },
}
