// Cube: the frame folded onto the three visible faces of an isometric cube, or tiled into tumbling
// blocks. Isometric faces are parallelograms, so each face is a single affine draw: exact and sharp.
// Spin slides the artwork around the faces a whole number of times per loop.
const tex = typeof document !== "undefined" ? document.createElement("canvas").getContext("2d", { willReadFrequently: true }) : null
const COS30 = Math.cos(Math.PI / 6)

export default {
  id: "cube",
  label: "Cube",
  params: [
    { key: "cube", label: "Cube", type: "number", min: 0, max: 1, step: 0.01, default: 0, help: "The cube's size, as a share of the frame. 0 is off." },
    { key: "cubeTile", when: { cube: { not: 0 } }, label: "Tumbling blocks", type: "bool", default: false, help: "Repeat the cube across the frame, like a parquet floor." },
    { key: "cubeShade", when: { cube: { not: 0 } }, label: "Shading", type: "number", min: 0, max: 1, step: 0.01, default: 0.35 },
    { key: "cubeSpin", when: { cube: { not: 0 } }, label: "Cube spin", type: "int", min: -4, max: 4, step: 1, default: 0, help: "How many times the artwork slides round the faces per loop." },
  ],
  active: (p) => p.cube > 0,
  apply(ctx, p, { t, background }) {
    const { width: W, height: H } = ctx.canvas
    // The texture: the frame's central square, slid sideways by the spin, wrapping round.
    const S = Math.min(W, H)
    if (tex.canvas.width !== S) { tex.canvas.width = S; tex.canvas.height = S }
    const off = ((p.cubeSpin * t) % 1 + 1) % 1 * S
    const sx = (W - S) / 2, sy = (H - S) / 2
    tex.drawImage(ctx.canvas, sx, sy, S, S, -off, 0, S, S)
    tex.drawImage(ctx.canvas, sx, sy, S, S, S - off, 0, S, S)

    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = background
    ctx.fillRect(0, 0, W, H)
    // Edge length: at 1 the cube's hexagon just fits the frame (it's 2·cos30·s wide and 2s tall).
    const s = p.cube * Math.min(W / (2 * COS30), H / 2)
    const a = [COS30 * s, -0.5 * s], b = [-COS30 * s, -0.5 * s], d = [0, s]

    const face = (ox, oy, u, v, shade) => {
      ctx.setTransform(u[0] / S, u[1] / S, v[0] / S, v[1] / S, ox, oy)
      ctx.drawImage(tex.canvas, 0, 0)
      if (shade > 0) { ctx.fillStyle = `rgba(0, 0, 0, ${shade})`; ctx.fillRect(0, 0, S, S) }
    }
    const cube = (vx, vy) => {
      face(vx + b[0], vy + b[1], a, [-b[0], -b[1]], 0) // top
      face(vx + b[0], vy + b[1], [-b[0], -b[1]], d, p.cubeShade * 0.45) // left
      face(vx, vy, a, d, p.cubeShade) // right
    }
    if (p.cubeTile) {
      // Hexagons tile in offset rows: across 2·cos30·s, down 1.5·s.
      const dx = 2 * COS30 * s, dy = 1.5 * s
      for (let j = -1; j * dy < H + 2 * s; j++) {
        for (let i = -1; i * dx < W + dx; i++) cube(i * dx + (j % 2 ? dx / 2 : 0), j * dy)
      }
    } else cube(W / 2, H / 2)
    ctx.restore()
  },
}
