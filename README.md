# Create-o-matic

Instruments for making type, images and motion. Free and open source.

Five instruments so far:

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
- **Brand bench**: a brand on one board. Drop in a logo (backgrounds taken out), take its colours,
  set faces by role, animate the logo, and download a kit: W3C design tokens, CSS, the logo and a
  BRAND.md that agents can design from.

Everything is a small JSON patch: the same patch makes the same frames, every time.

**[createomatic.xyz](https://createomatic.xyz)** · [Motion](https://createomatic.xyz/make/) · [Texture lab](https://createomatic.xyz/texture/) · [Type tester](https://createomatic.xyz/type/) · [Colour lab](https://createomatic.xyz/colour/) · [Brand bench](https://createomatic.xyz/brand/) · [Manual](https://createomatic.xyz/manual/)

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
  make/ texture/ type/        the instruments' pages (each just mounts its app)
  colour/ brand/
  assets/                     site styles, the wordmark and colour knob, the home page's loops
  instruments/elastic/        Motion: instrument.json (every control), elastic.js (pure renderer),
                              app.js (its extras on the shell), embed.js (for other sites), presets/
  instruments/texture/        Texture lab: the same shape
  instruments/type/           Type tester: the same shape
  instruments/colour/         Colour lab: the same shape
  instruments/brand/          Brand bench: the same shape, plus kit.js (tokens, CSS, BRAND.md)
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

## How exports are checked

Each instrument's MP4, WebM and GIF were exported through its own exporter
(`window.instrument.render(kind)` in Chrome) and decoded with ffprobe and ffmpeg: frame size, frame
rate, frame count and duration must be exact; sampled frames must match the engine's own PNG of the
same moment; and the step from the last frame back to the first must be no bigger than an ordinary
frame step, so the loop closes. GIFs share one palette across the loop, keep the commonest colours
exact, and alternate delays (3, 3, 4 hundredths at 30 fps) so their length is exact.

See-through exports (Motion's **See-through**) were checked the same way on a see-through loop. The
PNG and every frame of the PNG-frames zip match the engine's frames exactly, alpha included. The
GIF's see-through pixels match wherever the engine's cover is past half; GIFs have no soft edges.
The WebM carries its alpha as a second VP9 stream (`alpha_mode=1`). Decoded with libvpx, the
colour matched to under 1/255 on average and the alpha to about 2/255, with differences only at
antialiased edges. Chrome plays it see-through. The MP4 is laid on the background colour.

MOV is ProRes 4444 with alpha, from an encoder written for this (`web/packages/core/prores.js`,
with `mov.js` writing the QuickTime file), since no browser makes it. Exports from Motion, the
Type tester and the home playground were decoded with Apple's AVFoundation, which Final Cut,
Keynote and Photos use: every frame read, with the right share see-through. Quick Look showed it
see-through. Decoded with FFmpeg, colour matched the engine's frames to 0.04 to 0.3 of a level on
average (out of 255), and alpha to within one level. Frame rate and duration were exact.

## Deploying

It's a Cloudflare Pages project called `createomatic`, serving `web/` as static files
(`wrangler.toml`). `npm run deploy` runs the checks and publishes. Any static host works the same way.

## Credits

Fonts in the font library are served by [Fontsource](https://fontsource.org) (mostly OFL).
Video and GIF encoding use [mp4-muxer](https://github.com/Vanilagy/mp4-muxer),
[webm-muxer](https://github.com/Vanilagy/webm-muxer) and [gifenc](https://github.com/mattdesl/gifenc)
(all MIT), vendored in `web/packages/core/vendor/`. The stretch-grid idea owes a debt to the
type tools of [DIA](https://dia.studio); the code and presets here are original.

The Create-o-matic wordmark, used as a mark in some presets, belongs to
Nick Decker and isn't covered by the code licence.

## Licence

[MIT](LICENSE) © 2026 Nick Decker
