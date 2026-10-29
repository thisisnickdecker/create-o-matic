# Elastic: the engine inside Create-o-matic

The rack's groups go by workshop names (Patch bay, Paper, Type case, Loom, Stencil, Clockwork, Ink
well, Stage, Darkroom, Print shop); the sections below follow the plain ones.

Stretch type. Words fill the cells of a grid; the cells breathe in waves that travel down the rows
and across the columns, so letterforms swell, squash and swap as they grow. Any number or colour can
be keyframed across the loop, and an effects rack (kaleidoscope, liquid, melt, halftone, photocopy,
grain) sits on top. Original code, built on the principle shown in screenshots of DIA's type tool.
No DIA code or assets are used.

```
npm run dev            # from the repo root, then open http://localhost:4173/instruments/elastic/
```

## The controls

**Format.** Social sizes (9:16, 16:9, 1:1, 4:5, 3:4, link card), 2.39:1 scope for title cards,
A4 and A3 at 300 dpi, or custom. Loop length, frame rate, margin.

**Type.** Content is one slot per line. Modes: *By size* (first line in the smallest cells, last
in the largest), *In sequence*, *Letters* (spelled one letter per cell), *Random*. *Browse* opens
the font browser:

- **Font library**: every Google family plus about 120 more open-source faces (2,100+ in all),
  served by Fontsource. Free to use, embed and ship.
- **Adobe kit**: the families in your Adobe Fonts web project. Enter its ID; they load on the
  domains the project allows.
- **Installed**: fonts on this computer (Chrome and Edge, after a permission prompt).
- **My fonts**: font files you add, from Open Foundry or anywhere else. Kept in this browser between
  sessions. Add them with *Add font files…* or drop them on the page.

With a variable font, *Weight, small* and *Weight, large* make the weight follow the cell.

**Marks: logos and graphics that move like type.** Drop an SVG anywhere on the page (or use
*Add mark…* in the Marks row under Content). It becomes a line like `@thestudiolo` in Content, and
from then on it's a slot like any word: it stretches, swaps by size, takes the inks, blends and goes
through the effects. Click a thumbnail to add another line for it; × removes it.

- **SVG** is parsed into vector paths, so it stays sharp at any export size and can be filled with
  any ink. The SVG travels inside the patch, so links, presets and embeds carry it. Filled shapes
  only: outline strokes and live text in Illustrator first (*Object › Expand*, *Type › Create Outlines*).
- **PNG, JPEG, WebP**: drop them on the Marks row, or use *Add mark…* (dropped anywhere else, an
  image becomes the backdrop). A transparent image uses its alpha as the shape; an opaque one uses
  its darkness. These stay in this browser rather than in the patch.
- *Marks fit*: **Stretch like type**, or **Keep proportions** when a logo mustn't distort.
- *Marks colour*: **Take the inks**, or **Original colours**.

**Shape fill.** Type that forms a picture: pick any mark as the *Shape*, and the type fills its
silhouette.

- *Fill*: **Inside, cut to the edge** (crisp outline, letters sliced at the edge), **Inside, whole
  cells only** (a mosaic of complete words), **Around, cut to the edge** (the shape is negative space
  in a field of type), **Around, whole cells only**.
- *Shape size*, *Shape across* and *Shape down* place it: -1 to 1 moves it a half frame each way.
  All three can be keyframed, so a logo can grow, pulse or sweep through the type.
- *Silhouette* shows the shape faintly behind the type, in the first ink.
- Use plenty of small cells (30+ columns) for thin shapes like a signature.

The edge is drawn from the vector each frame at full export resolution, so SVG shapes stay sharp.
Presets: *Signature fill*, *Studiolo sweep · around*, *Campaign button · Hire Nick*.

**Grid.** Direction, columns, rows, the two offsets (how far behind its neighbour each runs, as a
fraction of a wave), *Lungs* (the strips breathe too), gap. *Layout: Golden section* cuts the frame
into a spiral of golden rectangles instead (see the manual).

**Motion.** Waveform, beats per loop, *Stretch*, *Swell*, *Keyframes play* (see below) and
*Freeze frame*, which is where a PNG is taken. Pausing or scrubbing sets it.

**Colour.** Every swatch opens the picker:

- **Swatches**: recent colours, then folders. *Basics* has RGB and CMY primaries, white and
  black. *Process* has CMYK on-screen stand-ins, then come *Greys*, *Nick* (the site's paper, inks
  and gradient stops), *Papers* and *Inks* from the Type & Colour page, and the named palettes (Job
  printer, Toxic, Night shift…). *Use as inks* drops a whole folder into the inks.
- **Brand palettes**: *Load palette…* takes an Adobe `.ase` file (Illustrator, Photoshop or
  InDesign swatch exchange), a GIMP `.gpl`, a `.json`, or any `.css` or `.txt` with hex codes in it.
  *Save inks as palette* keeps the current inks. All are kept in this browser.
- **Mixer**: hue, saturation and brightness faders, with RGB and CMYK fields you can type into. The
  CMYK is a simple screen conversion, not a print proof.
- **Eyedropper**: picks any colour on screen (Chrome and Edge).
- Or type a hex.

*Ink by* slot, column or row, cell, first ink, or *Blocks*, where inks fill the cells and the type is
cut out. *Type blend* sets how type sits over what's behind it (multiply, screen, difference…).

**Stage: gradient.** *Gradient* paints a moving mesh, linear or radial gradient from its own inks
behind everything, drifting a whole number of times per loop. Empty Content makes it a gradient
maker on its own.

**Backdrop.** Drop an image or a video on the page, or choose one. *Fill* or *fit*, opacity, video
speed. The video restarts with each loop. In exports every frame waits for the video to reach its
exact time, so the export is frame-accurate even though the preview just plays. The file is kept
in this browser; the patch stores only its name.

**Effects**, applied in this order:

| | what it does | loops by |
|---|---|---|
| Kaleidoscope | folds the frame into mirrored wedges | whole turns per loop |
| Liquid | domain-warped ripples, like looking through water | whole flow cycles |
| Melt | columns drip from a held top edge | whole drip cycles |
| Halftone | dots, squares or lines, any screen angle, with dot gain; vector-crisp | n/a |
| Photocopy | generation loss: softening, uneven toner, drum streaks, speckle | n/a |
| Grain | film grain; *Boil* animates it | n/a |
| Reflector | left onto right, top onto bottom, four ways, or a glossy floor | n/a |
| Cube | the frame on an isometric cube, or tumbling blocks | whole spins per loop |
| Pin button | the frame pressed into a campaign button on a table | n/a |

Presets *Studiolo × ND · stack*, *Signature · halftone*, *Signature fill* and *Studiolo sweep* use your own marks, embedded in their
`.json`. They're your brand assets: leave those two out of anything you publish or sell.

## Keyframes

Like After Effects. Every number and colour has a small diamond, the stopwatch, beside its name.

- Click it to start animating that setting: it sets a key at the playhead with the current value.
  The name turns red.
- Move the playhead (scrub, arrow keys, or click a lane), then change the setting: a key is set
  there.
- On a key, the diamond is filled; click it to remove that key.
- In the timeline under the transport: drag keys to move them, double-click a key to change its
  easing (smooth ● → linear ◆ → hold ■), click one and press Delete to remove it, or × to stop
  animating that setting.

*Keyframes play*:
- **Boomerang**: the timeline plays forwards over the first half of the loop and back over the
  second. It always returns to where it started, so the loop is seamless.
- **Loop, easing back**: forwards, then eases from the last key round to the first.
- **Loop, jumping back**: forwards, then cuts to the start like a film reel.

The *Coming clear* preset shows this: maximum photocopy that clears and returns.

## Patches and presets

*Save* keeps a patch in this browser. *Download .json* keeps it anywhere. *Open .json* or dropping
a .json on the page loads one, and *Copy link* puts the whole patch in the URL. *New seed* rerolls
only the randomness; *Vary* deals a new grid and motion and leaves type, colour and format alone.

**Making presets.** With `npm run dev` running, name the patch and press *Add to presets*: it's
written to `presets/` and listed in `presets/index.json`, ready to commit. By hand: put a patch
`.json` in `presets/`, add its file name to `index.json`, and run `npm run check`.

`examples/contact-sheet.html` shows every preset side by side as stills, for comparing them at a
glance (`?t=0.3` picks the moment, `?only=melt,liquid` filters).

## Exports

All rendered offline, frame by frame, through the same function as the preview.

| | how | notes |
|---|---|---|
| PNG | canvas | the *Still frame*; up to 2× for print |
| MP4 | H.264, WebCodecs + mp4-muxer | Chrome, Edge, Safari. Fast (hardware) |
| WebM | VP9, WebCodecs + webm-muxer | Chrome, Edge, Firefox. Slower (software) |
| GIF | gifenc, 256 colours per frame | use half or quarter size; grain makes GIFs large |
| Embed | `embed.js` | the live engine on any page; reduced motion gets the still |

```html
<div id="poster" style="aspect-ratio:1080/1440"></div>
<script type="module">
  import { mount } from "https://your-host/instruments/elastic/embed.js"
  mount(document.getElementById("poster"), "https://your-host/patches/hire-nick.json",
    { backdrop: "https://your-host/clip.mp4" })   // optional
</script>
```

## For agents

```js
instrument.setPatch({ seed: 7, params: { content: "HIRE\nNICK", mode: "sequence", format: "square", halftone: 8 } })
instrument.set("ease", 3.2)
instrument.key("copier", 0, 1); instrument.key("copier", 1, 0)   // keyframe: timeline position, value
instrument.seek(0.25)
const png = await instrument.render("png")    // Blob, no download
await instrument.export("mp4")                // downloads
```

## How it was checked (29 Oct 2026, Chromium in the Claude desktop app)

- All nine presets render identical pixels twice over, and frame 0 equals the loop's end exactly,
  with effects and keyframes.
- MP4 (v0.1): decoded frames matched fresh renders to within 2/255, codec noise only. MP4 (v0.2,
  *Coming clear*, quarter size): 5–10/255; that preset has grain and photocopy noise at every pixel,
  which H.264 smooths.
- WebM with a video backdrop: encoded; the backdrop changes 60% of pixels in a test frame.
- Fonts: open catalogue (Space Grotesk, Archivo, Fraunces…), Google, and the Adobe kit, which loads
  on localhost. The swatch picker, `.ase`/`.css` import, CMYK mixer and recent colours were driven
  by script. *Add to presets* wrote a file and updated the index.
- `npm run check`: manifests, presets, layout tiling, loop closure, keyframe maths.
- Not checked by eye: the eyedropper and installed-font listing (both need a person to grant
  permission), and playback smoothness of heavy effects on a large screen.

## Can't do yet

- Shape fill cuts or selects cells from the grid; it doesn't flow lines of text around a shape's
  contours. That's the Interactive Typographic Flow instrument.
- Marks ignore SVG strokes, gradients, masks and live text; image marks don't travel in patches.
- Melt and liquid move pixels, not letter outlines. True per-glyph distortion, and SVG or PDF
  export, want a renderer built on font outlines (opentype.js).
- Audio, and syncing motion to it.
- Effects are a fixed chain; you can't reorder or stack two of the same.
- Liquid, melt and photocopy run on the CPU, about 0.1–0.5 s a frame at full size. Fine for exports;
  the preview drops resolution while playing them. A WebGL pass would make them real-time.
- Added fonts, palettes and backdrops live in one browser. Moving them between machines means
  adding the files again.
