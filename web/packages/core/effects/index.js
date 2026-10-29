// The effects: post-processing laid over a finished frame. Two ways to use them:
//
// A fixed chain. An instrument lists effects in its manifest's "effects"; their parameters join the
// instrument's own (so they get controls, presets and keyframes for free) and applyEffects runs
// the active ones in the order of EFFECTS below: distortion, colour, print, texture, then mounting.
//
// A stack. An instrument with a "stack" parameter holds an ordered list of layers, each one an
// effect with its own settings, switched on or off, at an opacity, in a blend mode. applyStack
// runs them in the person's order. Any effect can be a layer, any number of times.
//
// Adding an effect: write a file here that exports { id, label, group, params, active(p),
// apply(ctx, p, env) }, plus layerDefaults (what a new layer starts at, so it does something) and
// fresh: true if it paints a new layer (a texture, a gradient) rather than changing the frame.
// Import it below and put it in EFFECTS where it belongs in the chain.
//
// env: { t, frame, scale, seed, background, assets }. t is 0 to 1 around the loop; anything that
// moves must complete whole cycles so the loop closes. scale maps output pixels to canvas pixels:
// measure sizes in output pixels and multiply, so the preview matches the export. assets holds
// files the instrument has loaded (overlay textures).
import kaleidoscope from "./kaleidoscope.js"
import liquid from "./liquid.js"
import melt from "./melt.js"
import halftone from "./halftone.js"
import photocopy from "./photocopy.js"
import grain from "./grain.js"
import reflector from "./reflector.js"
import cube from "./cube.js"
import pin from "./pin.js"
import gradient from "./gradient.js"
import overlay from "./overlay.js"
import { adjust, invert, posterize, gradmap, acid, holographic } from "./pixels.js"
import { riso, chroma, film } from "./print.js"
import { paper, grunge } from "./surface.js"

export const EFFECTS = [
  kaleidoscope, liquid, melt,
  adjust, gradmap, acid, holographic, invert, posterize,
  halftone, riso, photocopy, paper,
  chroma, film, grunge, grain,
  gradient, overlay,
  reflector, cube, pin,
]

// For the effects written before stacks: their menu group and what a new layer starts at.
const LEGACY = {
  kaleidoscope: ["Distort", { kaleido: 6 }], liquid: ["Distort", { liquid: 0.5 }], melt: ["Distort", { melt: 0.3 }],
  reflector: ["Distort", { mirror: "left" }], halftone: ["Print", { halftone: 8 }], photocopy: ["Print", { copier: 0.5 }],
  grain: ["Texture", { grain: 0.3 }], cube: ["Mount", { cube: 0.8 }], pin: ["Mount", { pin: 0.86 }],
}
for (const e of EFFECTS) {
  if (!LEGACY[e.id]) continue
  e.group ??= LEGACY[e.id][0]
  e.layerDefaults ??= LEGACY[e.id][1]
}
export const GROUPS = ["Colour", "Print", "Texture", "Paint", "Distort", "Mount"]
export const effectById = (id) => EFFECTS.find((e) => e.id === id)

export const BLENDS = [
  ["source-over", "Normal"], ["multiply", "Multiply"], ["screen", "Screen"], ["overlay", "Overlay"],
  ["soft-light", "Soft light"], ["hard-light", "Hard light"], ["color-dodge", "Colour dodge"], ["color-burn", "Colour burn"],
  ["darken", "Darken"], ["lighten", "Lighten"], ["difference", "Difference"], ["exclusion", "Exclusion"],
  ["hue", "Hue"], ["saturation", "Saturation"], ["color", "Colour"], ["luminosity", "Luminosity"],
]

// ---- the fixed chain ----

// An instrument manifest with its effects' parameters added, in an "effects" group.
export function withEffects(manifest) {
  const chosen = EFFECTS.filter((e) => manifest.effects?.includes(e.id))
  if (!chosen.length) return manifest
  return {
    ...manifest,
    groups: [...manifest.groups, { id: "effects", label: "Darkroom", hint: "effects" }],
    parameters: [...manifest.parameters, ...chosen.flatMap((e) => e.params.map((d) => ({ group: "effects", effect: e.id, ...d })))],
  }
}

export function applyEffects(ctx, p, env, ids) {
  for (const e of EFFECTS) {
    if (ids.includes(e.id) && e.active(p)) {
      ctx.save()
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      e.apply(ctx, p, env)
      ctx.restore()
    }
  }
}

// ---- the stack ----

let layerCount = 0
export function newLayer(effectId) {
  const e = effectById(effectId)
  const params = Object.fromEntries(e.params.map((d) => [d.key, Array.isArray(d.default) ? d.default.slice() : d.default]))
  return { id: `${effectId}-${Date.now().toString(36)}${(layerCount++).toString(36)}`, effect: effectId, on: true, opacity: 1, blend: "source-over", params: { ...params, ...e.layerDefaults } }
}

// One layer's settings, defaults filled in, values checked by coerce (from patch.js).
export function sanitizeLayer(layer, coerce) {
  const e = effectById(layer?.effect)
  if (!e) return null
  const params = {}
  for (const d of e.params) {
    const v = layer.params && d.key in layer.params ? coerce(d, layer.params[d.key]) : undefined
    params[d.key] = v !== undefined ? v : Array.isArray(d.default) ? d.default.slice() : d.default
  }
  const opacity = Number(layer.opacity)
  return {
    id: typeof layer.id === "string" && layer.id ? layer.id.slice(0, 40) : `${e.id}-${layerCount++}`,
    effect: e.id,
    on: layer.on !== false,
    opacity: Number.isFinite(opacity) ? Math.min(1, Math.max(0, opacity)) : 1,
    blend: BLENDS.some(([b]) => b === layer.blend) ? layer.blend : "source-over",
    params,
  }
}

// Layers that need their own surface: anything blended, faded, or painting fresh.
const surface = typeof document !== "undefined" ? document.createElement("canvas").getContext("2d", { willReadFrequently: true }) : null

export function applyStack(ctx, layers, env) {
  const { width: W, height: H } = ctx.canvas
  for (const layer of layers) {
    const e = effectById(layer.effect)
    if (!layer.on || !e || !e.active(layer.params) || layer.opacity <= 0) continue
    const direct = !e.fresh && layer.opacity >= 1 && layer.blend === "source-over"
    if (direct) {
      ctx.save()
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      e.apply(ctx, layer.params, env)
      ctx.restore()
      continue
    }
    const s = surface
    if (s.canvas.width !== W || s.canvas.height !== H) { s.canvas.width = W; s.canvas.height = H }
    s.save()
    s.setTransform(1, 0, 0, 1, 0, 0)
    s.globalAlpha = 1
    s.globalCompositeOperation = "source-over"
    s.clearRect(0, 0, W, H)
    if (!e.fresh) s.drawImage(ctx.canvas, 0, 0)
    e.apply(s, layer.params, env)
    s.restore()
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = layer.opacity
    ctx.globalCompositeOperation = layer.blend
    ctx.drawImage(s.canvas, 0, 0)
    ctx.restore()
  }
}
