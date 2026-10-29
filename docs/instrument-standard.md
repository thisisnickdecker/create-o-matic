# The instrument standard

An instrument is a reusable creative capability: something that takes a few inputs and a set of
settings and makes a thing, and makes the same thing again when given the same settings. Think of a
synthesizer and its patch sheet. The instrument is the synth; the patch is the sheet you can
hand to someone else.

This is the smallest contract that lets a person, an agent and the registry all understand an
instrument without asking whoever built it. It will grow when a second or third instrument needs
something it doesn't cover, not before.

## A folder

```
instruments/<id>/
  instrument.json   the manifest: identity, parameters, outputs (required)
  README.md         what it does, how to drive it, what it can't do, how it was checked (required)
  <engine>.js       the pure renderer: patch + time in, pixels out
  index.html        the playground (the human interface)
  embed.js          optional: mount it on any web page
  presets/          index.json plus one .json patch per preset
  examples/         small pages or scripts that use it
```

Instruments in other languages (Python, Blender, an Adobe script) follow the same folder and manifest;
`runtime` says what runs it.

## The manifest

| field | meaning |
|---|---|
| `id` | folder name, lower-case |
| `name`, `version`, `description`, `author`, `license` | identity; version is semver |
| `status` | `sketch`, `experimental`, `stable` or `retired` |
| `category` | free tags: typography, motion, image, print… |
| `runtime` | language, environment, renderer, build step |
| `entry` | files for engine, app and embed; the registry checks they exist |
| `interfaces` | `gui`, `api`, `cli`, `embed`: how it can be operated |
| `outputs` | each format it makes, as `verified`, `untested` or `planned` |
| `reproducibility` | one honest sentence on what "same patch, same result" covers |
| `references` | where the idea came from, with what was and wasn't borrowed |
| `groups`, `parameters` | the controls; see below |
| `effects` | ids from `packages/core/effects/`; their parameters join the instrument's |

**An output is `verified` only after it has actually been made and checked.** Untested formats are
marked `untested`, or `planned` if not yet built. The registry shows the difference.

## Parameters

Each parameter is declared once, in the manifest. The panel, presets, URL sharing, sanitising and the
agent API all read the same declaration.

```json
{ "key": "rows", "group": "grid", "label": "Rows", "type": "int", "min": 1, "max": 64, "step": 1, "default": 12,
  "help": "Shown as a tooltip.", "when": { "direction": "vertical" } }
```

Types: `number`, `int`, `select` (with `options: [[value, label]]`), `bool`, `color` (#RRGGBB),
`palette` (a list of colours), `text` (multi-line), `string`, `font` (a family name, with the font
browser), `media` (the name of a backdrop file kept in the browser), `mark` (a menu of the marks
available).
`when` shows a control only while another parameter has a given value, or, as `{ "not": value }`,
while it has any other. Groups take an optional `hint`: a plain description shown beside a fun name.
Numbers and colours can be keyframed; `"animate": false` opts one out (sizes, loop length).

## Patches

```json
{ "name": "optional", "instrument": "elastic", "version": "0.2.0", "seed": 1984,
  "params": { "...": "..." },
  "keys": { "copier": [{ "t": 0, "v": 1, "ease": "smooth" }, { "t": 1, "v": 0 }] },
  "marks": { "studiolo": "<svg …>" } }
```

`marks` is optional: SVG artwork by name (`"studiolo": "<svg …>"`), referenced in content as
`@studiolo`. See `packages/core/marks.js`.

`keys` is optional: keyframes per setting, `t` from 0 to 1 along the timeline, `ease` one of
`smooth`, `linear`, `hold`. The engine resolves them with `resolve()` from `packages/core/keys.js`
before drawing each frame.

A patch is loaded through `sanitize()`: missing keys take defaults, numbers are clamped, unknown keys
and bad values are dropped. So a hand-written or agent-written patch, or one from an older version,
always loads into something valid.

## Determinism

The engine is a pure function: `render(ctx, patch, t)`, with `t` from 0 to 1 around the loop.

- No `Math.random()`, no clock, no DOM inside the engine. Randomness comes from the patch's seed
  (`packages/core/rng.js`).
- Loops close: anything periodic completes a whole number of cycles per loop. Keyframes close when
  played as Boomerang or Wrap.
- Exports render frame by frame, offline, through the same function as the preview.
- What can still differ: browsers and font versions rasterise glyphs slightly differently. When a
  result must be exact, keep the font file and the browser version with the patch.

## The shell

An instrument's app hands its engine to `createMachine(host, engine, hooks)` from
`web/packages/core/shell.js`, which builds the stage, rack, keyframe timeline, Patch bay and Print
shop, and owns the patch, playback, presets, drops and exports. The hooks are how an instrument adds
what only it needs (loading fonts or media, syncing a video, handling a dropped file); they're
listed at the top of `shell.js`. A page is a masthead and `<main class="bench" data-machine>`.

## Effect stacks

A parameter of type `stack` holds an ordered list of layers, `{ id, effect, on, opacity, blend,
params }`. The rack shows it as layer cards; `applyStack` from `effects/index.js` runs it. Patches
are sanitised layer by layer against each effect's own parameters.

## The agent interface

Every playground exposes `window.instrument` with at least `manifest`, `getPatch()`, `setPatch(p)`,
`set(key, value)`, `key(key, position, value)`, `seek(t)`, `render(kind)` (returns a Blob) and
`export(kind)` (downloads).
A person and an agent can operate the instrument in the same ways.

## Before calling it done

1. `npm run check` passes: the manifest, presets and pure-logic tests.
2. Each output marked `verified` has been made and inspected, and the README says how.
3. The README lists what it can't do yet.
