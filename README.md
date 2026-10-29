# Create-o-matic

Instruments for making type, images and motion. Free and open source.

Four instruments so far:

- **Motion**: stretch words, logos and marks through a breathing grid or a golden spiral, keyframe
  anything, run it through liquid, halftone, a photocopier or onto a cube, and export the loop as
  MP4, WebM, GIF, PNG or a live embed for your website.
- **Texture lab**: a darkroom for any image or video. Stack risograph, halftone, photocopy, paper,
  grunge, film, chroma, holographic foil, gradient maps and your own textures, each with its own
  blend mode and opacity, and export at full size.
- **Type tester**: live specimens. Rows of your own text, each in its own font from 2,000+ open
  families, your Adobe Fonts or your files, compared side by side, set moving, and exported.
- **Colour lab**: palettes, studied. Swatch cards with HEX, RGB and OKLCH, Albers' nested squares,
  proportion, tints and shades, WCAG contrast checks and OKLab blends; palettes dealt by harmony,
  and exported as CSS, JSON or an Adobe swatch file.

Everything is a small JSON patch: the same patch makes the same frames, every time.

**[createomatic.xyz](https://createomatic.xyz)** · [Motion](https://createomatic.xyz/make/) · [Texture lab](https://createomatic.xyz/texture/) · [Type tester](https://createomatic.xyz/type/) · [Colour lab](https://createomatic.xyz/colour/) · [Manual](https://createomatic.xyz/manual/)

Made by [Nick Decker](https://nickdecker.net).

## Run it

```sh
git clone https://github.com/thisisnickdecker/create-o-matic
cd create-o-matic
npm run dev        # http://localhost:4173
npm run check      # manifests, presets and tests
```

Node 22 or later. There's nothing to install and nothing to build: the site is the `web/` folder,
plain ES modules served as files.

## How it's put together

```
web/                          the site, exactly as it's published
  index.html, manual/         home and manual
  make/, texture/, type/,     the instruments' pages (each just mounts its app)
  colour/
  assets/                     site styles, the wordmark and colour knob, the home page's loops
  instruments/elastic/        Motion: instrument.json (every control), elastic.js (pure renderer),
                              app.js (its extras on the shell), embed.js (for other sites), presets/
  instruments/texture/        Texture lab: the same shape
  instruments/type/           Type tester: the same shape
  instruments/colour/         Colour lab: the same shape
  packages/core/              shared: shell.js (the machine every instrument runs in), patches,
                              keyframes, effects and the effect stack, fonts, marks, colour picker
                              and colour maths (OKLab, contrast),
                              exporters, the control rack and timeline
docs/instrument-standard.md   the contract an instrument meets
scripts/                      the local server and the registry checker
tests/                        logic tests (node --test)
```

Three ideas hold it together:

- **Parameters are declared once.** Every control lives in `instrument.json` (or in an effect's
  file). The rack, presets, keyframes, links and the scripting API all read that declaration.
- **The engine is a pure function.** `render(ctx, patch, t)` draws time `t` of the loop. No clock,
  no `Math.random`; randomness comes from the patch's seed. The preview, every exporter and every
  embed call the same function, so exports match the preview and loops close exactly.
- **Patches are forgiving.** Unknown keys are dropped and values clamped, so a hand-written or
  machine-written patch always loads.

## Extending it

- **A preset:** run `npm run dev`, set it up in the machine, name it and press *Add to presets*.
- **An instrument:** an engine (`render(ctx, patch, t)`, `size`, `frameCount`, `manifest`) and an
  app that hands it to `createMachine` from `shell.js` with whatever hooks it needs. The shell
  brings the rack, transport, keyframes, patches, presets and every export.
- **An effect:** one file in `web/packages/core/effects/`. See the
  [manual](https://createomatic.xyz/manual/#effects).
- **On your own site:** `mount(element, patch)` from `embed.js`. See the
  [manual](https://createomatic.xyz/manual/#embed).

## Deploying

It's a Cloudflare Pages project called `createomatic`, serving `web/` as static files
(`wrangler.toml`). `npm run deploy` runs the checks and publishes. Any static host works the same way.

## Credits

Fonts in the font library are served by [Fontsource](https://fontsource.org) (mostly OFL).
Video and GIF encoding use [mp4-muxer](https://github.com/Vanilagy/mp4-muxer),
[webm-muxer](https://github.com/Vanilagy/webm-muxer) and [gifenc](https://github.com/mattdesl/gifenc)
(all MIT), vendored in `web/packages/core/vendor/`. The stretch-grid idea owes a debt to the
type tools of [DIA](https://dia.studio); the code and presets here are original.

The Create-o-matic wordmark, and the Studiolo and Nick Decker marks used in some presets, belong to
Nick Decker and aren't covered by the code licence.

## Licence

[MIT](LICENSE) © 2026 Nick Decker
