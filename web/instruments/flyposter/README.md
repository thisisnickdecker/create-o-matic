# Flyposter

Social posts for small businesses that aren't dull. Put in your logo and colours, say what you're
promoting, pick a mood and press **Vary** until it's fun and a bit weird: type, colour, layouts,
emoji, stickers, cutouts and texture, moving. Export at story, feed, square or landscape size.

Open it at `/flyposter/`.

## Why "Flyposter"

Fly-posting is pasting posters up on walls without asking: gigs, club nights, sales, the café
round the corner. It's the street version of what this makes, mixed media and a bit cheeky, and
it sits with the other instruments' names (Spirotype, Showroom) rather than repeating the site's
"-o-matic". If you'd rather keep Post-o-matic, renaming is the folder, the page and a few links.

## How it works

1. **Brand pocket.** Name, logo (SVG keeps its colours; a PNG or JPEG loses its background),
   brand colours, and two neutrals: Paper and Black. Remembered in this browser for next time;
   **Forget** clears it. The Brand bench's **Make a post** fills it with the bench's logo, colours
   and faces (and keeps the type when you Vary).
2. **Message.** Headline, details, where, call to action. **Rewrite** steps the headline through
   hand-written copy lenses (`copy.js`): the copywriter, the punk, the Swiss designer, the
   deadpan, the shopkeeper and the MC. They're archetypes, never real people, and there's no AI.
   `take` 0 is your own line; **Keep this** makes a rewrite your headline.
3. **Mood board.** Loud, Deadpan, Swiss, Zine, Club flyer, Gallery, Corner shop. Each mood
   (`moods.js`) has ranges for layout, type pair, case, colour use, motion, stuff and texture.
   Choosing a mood deals a post from it; **Vary** deals another. The **Keep** chips lock layout,
   type, colour, motion, stuff or texture. Words, brand, pictures, emoji and size never change.
4. **Paste-up.** Seven layouts: Stacked (each line fills the width), Giant number (finds the
   price, percentage or time in your words), Ticker (bands that run), Grid (Swiss facts round one
   big shape), Sticker scatter (each word a sticker), Poster (a gig poster), Badge (the headline
   round a turning circle). **Variant** makes the small choices inside a layout.
5. **Ink well.** Colour use casts your colours into parts: Flood (a brand colour fills it), Paper,
   Night, Duotone, Riot. **Colourway** steps through which colour plays which part. Type always
   reads on the ground (contrast 3:1 or more; there's a test).
6. **Junk drawer.** **Add a picture**: a cutout PNG makes a die-cut sticker, the star of the post;
   or it's the whole background, or thrown in with the stuff. Emoji are Google's Noto Emoji, 131
   of them, vendored in `packages/core/vendor/noto-emoji` (Apache 2.0) so every browser and every
   export shows the same. With no picture, the first emoji is the star. Stickers are drawn in code
   (`stickers.js`). **Throw** reshuffles where everything lands; stuff in front keeps off the words.
7. **Clockwork.** Pop, Slide, Stamp and Typewriter build in, hold and clear before the loop
   restarts. Wobble, Boil and Flash move all the time; Flash swaps the colours on the beat. Stuff
   floats, orbits the picture, drifts, rains, spins or boils. Every cycle is a whole number per
   loop, so loops close. The Freeze frame defaults to the middle, when everything is in.
8. **Darkroom.** The shared effect stack. Each mood deals its own (grain, paper, kraft,
   newsprint, photocopy, riso in your own colours, halftone, film, chroma, grunge).

## Driving it from a description (agents)

Open `/flyposter/` and use `window.instrument`:

```js
await instrument.ready()                       // fonts, picture, emoji and logo loaded
instrument.setPatch({ params: {
  brandName: "Crumb", inks: ["#2B59C3", "#F4B942"], paper: "#FBF6EC", black: "#1A1A1A",
  headline: "Fresh croissants every morning", details: "From 7am · £2.50",
  where: "Crumb, 4 High St", cta: "Come early", emoji: "🥐 ☕ ✨", mood: "shop", format: "story",
} })
instrument.vary()                              // a new post from the mood, locks as in the rack
instrument.vary({ type: true, colour: true })  // keep type and colour, shuffle the rest
instrument.set("take", 3)                      // the third rewrite of the headline
instrument.rewrites()                          // every rewrite through the current lens
const png = await instrument.render("png")     // a Blob, nothing downloaded
const mp4 = await instrument.render("mp4")
```

Also `moods()`, `lenses()`, `emoji()` (the set, by name and group) and `stickers()`. Every setting
is in `instrument.json`; a patch only needs the keys that matter, unknown keys are dropped and
values clamped. Pictures and image logos live in the browser, so a patch names them; SVG logos
travel inside the patch (`marks`).

## Exports

The Print shop's PNG, MP4, WebM, GIF, MOV and GIF for Figma, at full, half, quarter or double size.
**No ground** (Ink well) leaves the background out for a see-through MOV or a sticker PNG.

## How it was checked

- `npm run check`: the manifest, presets, and `tests/flyposter.test.mjs` (copy, Vary and locks,
  every mood's values against the manifest, type contrast across colourways, the giant number).
- PNG: every layout, every preset, and Vary results across all seven moods at feed, story,
  square and landscape size, rendered with `instrument.render("png")` and looked at. That caught
  and fixed: the star picture hidden under background shapes, the giant number running into a
  headline of the same colour (now an outline), Typewriter unfinished at the freeze frame, a
  bottom logo on the type, stuff in front landing on words, and a type pair dealt as one letter.
- MP4: four loops rendered with `instrument.render("mp4")` and decoded with ffprobe and ffmpeg
  (H.264, 180 frames, 6 s at 1080×1350, 1080×1920 and 1080×1080), frames pulled out and looked at:
  Pop building in and clearing to an empty ground before the loop restarts, Ticker with Flash,
  Badge turning with stuff orbiting, Zine boiling.
- A cutout PNG dropped as the picture (die-cut sticker, backdrop) and an SVG dropped as the logo;
  the logo was remembered for the next visit.
- In the page on desktop (1440 wide) and at phone width: Vary, the Keep chips and Rewrite tried.

## What it can't do yet

- Sound: a seeded synth and beat with motion on the beat, and audio in the MP4.
- Background removal for photos (a PNG that's already cut out works).
- Drag things on the stage; placement is by Variant, Throw and the picture's sliders.
- Emoji outside the built-in set are skipped.
- WebM, GIF and MOV come from the shared exporter and weren't checked here.
- A front door and domain of its own.
