# Flyposter

Social posts for small businesses that aren't dull. Put in your logo and colours, say what you're
promoting, pick a mood and press **Vary**: nine posts to choose from, the best of many, each one
checked before you see it. Type, colour, layouts, emoji, stickers, cutouts and texture, moving.
Export at story, feed, square or landscape size.

Open it at `/flyposter/`.

## Why "Flyposter"

Fly-posting is pasting posters up on walls without asking: gigs, club nights, sales, the café
round the corner. It's the street version of what this makes, mixed media and a bit cheeky, and
it sits with the other instruments' names (Spirotype, Showroom) rather than repeating the site's
"-o-matic". If you'd rather keep Post-o-matic, renaming is the folder, the page and a few links.

## How it works

1. **Brand pocket.** Name, logo (SVG keeps its colours; a PNG or JPEG loses its background), the
   mark alone (optional: round stickers and the huge watermark use it), brand colours, and two
   neutrals: Paper and Black. It's your brand, kept in this browser for every instrument
   (`packages/core/brand.js`); **Forget** clears it. The Brand bench's **Use everywhere** and
   **Make a post** write it with the bench's logos, colours, faces and tone of voice: Flyposter
   then opens with them, keeps the type when you Vary, and Rewrite starts in the brand's voice.
2. **Message.** Headline, details, where, call to action. **Rewrite** steps the headline through
   hand-written copy lenses (`copy.js`): the copywriter, the punk, the Swiss designer, the
   deadpan, the shopkeeper and the MC. They're archetypes, never real people, and there's no AI.
   `take` 0 is your own line; **Keep this** makes a rewrite your headline.
3. **Mood board.** Loud, Deadpan, Swiss, Zine, Club flyer, Gallery, Corner shop. Each mood
   (`moods.js`) has ranges for layout, type pair, case, colour use, motion, stuff and texture.
   The **Keep** chips lock layout, type, colour, motion, stuff or texture. Words, brand, pictures,
   emoji and size never change. Vary (and choosing a mood) opens the deck: see below.
4. **Paste-up.** Seven layouts: Stacked (each line fills the width), Giant number (finds the
   price, percentage or time in your words), Ticker (bands that run), Grid (Swiss facts round one
   big shape), Sticker scatter (each word a sticker), Poster (a gig poster), Badge (the headline
   round a turning circle). **Variant** makes the small choices inside a layout.
5. **Ink well.** Colour use casts your colours into parts: Flood (a brand colour fills it), Paper,
   Night, Duotone, Riot. **Colourway** steps through which colour plays which part. Type always
   reads on the ground (contrast 3:1 or more; there's a test).
6. **Junk drawer.** **Add a picture**, then **Cut out the background** if it's a photo: the main
   thing in it (a burger, a cup, a dog, you) is kept and the rest goes, in this browser, in two or
   three seconds (`packages/core/cutout.js`: U²-Net's small model, run by onnxruntime-web, both
   vendored, about 16 MB fetched the first time). The cutout is kept beside the photo, and Undo goes
   back. A cutout makes a die-cut sticker, the star of the post;
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

## Vary: the deck of nine, and the judge

**Vary** deals 27 posts from the mood, has the judge score each one, and shows the best nine over
the stage, kept different from each other (a repeat layout, face or colour use counts against a
pick). Click one to use it; **More like this** under any of them deals 18 near relations (one or
two facets dealt again, the rest kept) and shows the best nine of those. Keys 1 to 9 pick, Esc
closes. Each card's tooltip says how it was judged.

The judge (`score.js`) reads the composed scene, not pixels, so it's pure and runs in Node. A
clean post scores 100; each fault costs points and is named: words off the frame or hard against
it, words over words, the logo on the words, the picture or stuff over the words (in front, or
behind and swallowing them), type too small for a phone, a headline too small for its frame, type
that doesn't stand out from what's behind it, a line of the headline far smaller than the rest, a
lonely last word, and too much or too little of the frame in words. One check needs pixels: a
64-pixel render with and without the texture, compared at a coarse grain, catches a texture that
drowns the post (it's the photocopier, mostly). Posts under 70 don't reach the deck if it can be
helped.

The typesetting is part of it:
- **Line breaks** are chosen, not greedy: as few lines as fit, then evened out, never ending a line
  on a little word (a, the, and, of, to, every…), and no single short word left on the last line.
- **Stacked headlines** take the number of lines that keeps them even, so a long word isn't
  shrunk to a sliver while its neighbours stay huge.
- **Round stickers** take two or three lines, whichever sets the words clearly bigger.
- **Quotes hang**: an opening quote sits outside the left edge so the letters line up, and
  closing stops outside the right.
- **Chinese, Japanese and Korean** set without spaces break between characters, never before
  closing punctuation.
- **The call to action** takes the clearest spot: where the layout put it, the other side, under
  the logo, or a corner or edge of the frame.

## The whole set

**The whole set** (beside Vary, and **Export the whole set** in the Print shop) shows the post at
every size a campaign needs, live: Feed 1080×1350, Story 1080×1920, Square 1080×1080, Landscape
1920×1080 and Banner 1200×630 (link cards, email headers). Below them, a carousel in the same look
says it in up to three slides: the post, then the details, then the call to action with where (a
slide only when there's something for it to say). Each tile says how it was judged; click a size to
work on it on the stage. Change anything in the rack and the set redraws.

**Export PNGs** makes one .zip of every size and slide; **PNGs and MP4s** adds each one moving
(the shell's own video exporter, a post at a time: about 25 seconds for eight, here). Each is an ordinary
patch made from the post (`campaign.js`), so the set is the post, not a copy of it.

## Working on the stage

Click anything on the post (a line of the headline, the call to action, a sticker, the picture,
the logo) to pick it up, and drag it. Pull the corner knob to scale it, the knob above it to turn it
(Shift for 15° steps). Guides snap it to the middle, the margins and the other parts' edges and
middles; hold Alt to place it freely. Double-click (or double-tap) words to retype them in place:
the headline, details, where or call to action, whichever the words come from. Typing over a
Rewrite makes it your own line.

With something picked: arrows nudge a pixel (Shift for ten), `[` and `]` turn 5° (Shift for 15°),
`-` and `=` scale, Delete hides it, R puts it back where the layout had it, Esc lets go. The bar
under it does Retype, Hide and Put back too. Cmd-Z and Shift-Cmd-Z undo and redo anything, from
the stage or the rack (a slider dragged or a word typed is one step). The Paste-up group says how
many parts are moved and has **Put everything back**.

What you move is a setting like any other: `moves` in the patch, a list of
`{ id: "size/layout:part", dx, dy, s, r, hide }` ("story/stack:cta"), with dx and dy as fractions
of the frame, travelling in links and saved patches. Moves belong to a size, since each size is
composed afresh: moving the call to action in the feed leaves the story alone. A move with no size
("stack:cta") counts at every size, and a size's own move wins over it. Moves belong to a layout, and
the first one turns on **Keep layout**, so Vary changes the type, colour and the rest around what
you placed. Unlock it and Vary deals new layouts; come back to the layout and your moves are
still there. Stickers are thrown before anything is moved, so moving one part doesn't throw
everything again, and the judge scores the post as moved.

## Driving it from a description (agents)

Open `/flyposter/` and use `window.instrument`:

```js
await instrument.ready()                       // fonts, picture, emoji and logo loaded
instrument.setPatch({ params: {
  brandName: "Crumb", inks: ["#2B59C3", "#F4B942"], paper: "#FBF6EC", black: "#1A1A1A",
  headline: "Fresh croissants every morning", details: "From 7am · £2.50",
  where: "Crumb, 4 High St", cta: "Come early", emoji: "🥐 ☕ ✨", mood: "shop", format: "story",
} })
await instrument.vary()                        // the best of a dozen from the mood, put on the stage;
                                               // returns { patch, score, faults }
await instrument.vary({ type: true, colour: true }) // keep type and colour, shuffle the rest
await instrument.deal()                        // nine judged posts, best first, nothing changed:
                                               // [{ patch, score, faults }], each patch for setPatch()
await instrument.deal({ from: "like", seed: 7 }) // nine near relations of the post on the stage
await instrument.judge()                       // { score, faults } for the post on the stage
instrument.open()                              // show the deck, as Vary does
instrument.parts()                             // what's on the stage: [{ role, name, field, x, y, w, h, rot }]
instrument.move("cta", { dx: -0.1, s: 1.3, r: 0.2 }) // move a part by hand; move("cta", null) puts it back
instrument.move("line1", { hide: true })       // leave a part out
instrument.move("logo", { dx: 0.02 }, { everySize: true }) // a move for every size
await instrument.campaign()                    // every size and slide, judged: [{ id, name, group, patch, score, faults }]
await instrument.exportSet({ video: false, save: false }) // the .zip as a Blob; save: true downloads it
instrument.openSet()                           // show the whole set over the stage
instrument.undo(); instrument.redo()
await instrument.cutout()                      // take the background out of the picture
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
- `tests/flyposter-stress.test.mjs`: every layout in every format with both logo places, with
  awkward words (one word, a 42-letter German word, emoji only, a 22-word sentence, German,
  Japanese), composed and judged in Node with rough letter widths. Nothing may be off the frame
  and the worst case must score 45 or more. It found, and these were fixed: the call to action
  pushed off the top of a stacked post, the giant number eating the headline's first letter when
  there's no number ("E HAVE"), landscape details running off the bottom, the picture landing on
  the headline's side, a long word shrunk to a sliver, the call to action on the logo, and a
  front picture covering whole lines. Also tested: line breaks, Japanese breaking, hanging quotes,
  the judge seeing words off the frame and over each other, nine chosen with a spread of layouts,
  and More like this changing one or two facets.
- The deck in the page: Loud, Zine, Gallery, Swiss and Club dealt, and More like this, each saved
  as a sheet of the nine and looked at. That caught what the layout judge couldn't see (and
  these were fixed): a photocopy texture drowning a poster (now the pixel check), yellow words
  swallowed by a lemon behind them, an underline left behind when its words moved, three tickers
  in one nine, and a 48 shown because variety outweighed the score (now the floor). Dealing takes
  about 3 s the first time (the mood's fonts arrive), then under a second; on phone it's two
  columns, full screen, scrolling.
- Working on the stage, in the page at 1440 wide and at phone width, with real pointer drags and
  key presses: picking up the call to action, dragging it (the layout locked itself and said so),
  the scale and turn knobs, Shift-arrow nudges, `]`, Delete, Cmd-Z and Shift-Cmd-Z (each its own
  step), double-clicking the headline and typing a new one, and a drag with a little sideways
  wobble snapping back to the middle. That caught and fixed: moving one part re-threw every
  sticker, the bar sitting on the scale knob, and quick stage edits merging into one undo step.
  `tests/flyposter-moves.test.mjs`: roles in every layout, a move touching only its part, moves
  belonging to their layout, hiding, an underline following its words, moves checked like any
  setting, and the judge seeing a moved part off the frame.
- The whole set and the brand: in the page at 1440 wide and at phone width. The set opened with
  all eight tiles judged; the PNG .zip made with `exportSet({ save: false })`, unpacked, and every
  file opened at its size (1080×1350, 1080×1920, 1080×1080, 1920×1080, 1200×630 and three slides)
  and looked at together. That showed the story setting a one-line headline small at the top of a
  tall frame (now Stacked takes more lines in tall frames). The video .zip, made the same way in
  23 s, held 16 files; every MP4 decoded with ffprobe at its own size, 180 frames over 6 s, and the
  post was back at its own size afterwards. The brand: on the Brand bench, a name, two colours, a paper, a mark alone
  and the shopkeeper's voice, then **Use everywhere**; Flyposter opened with no link carried all of
  it, the faces from the Adobe kit, Keep type on and the shopkeeper lens, and a story rendered
  with the mark alone on the round sticker. `tests/flyposter-campaign.test.mjs`: the set's
  patches (accepted by the manifest, look kept, post untouched), slides only when there's
  something to say, every layout's set composed and judged, and a hand-edited brand cleaned.
- Cutouts: three photos from Wikimedia Commons (a cheeseburger on white, a cup and saucer on a
  dark table, a labrador on grass), cut out in the page with `cutout()` in 2 to 3 s each and
  looked at on blue, whole and with the edges cropped at full size: all three subjects kept whole
  (the spoon too, the tail too), backgrounds gone, edges soft. Then end to end: a photo added,
  **Cut out the background** pressed, the post rendered with the burger as a die-cut sticker, and
  Undo back to the photo. No console errors once the dev server served wasm as wasm.
  `tests/cutout.test.mjs`: the model's input and output arithmetic, trimming, and the vendored
  model checked against the md5 rembg publishes.
- After the judge's changes: a PNG and an MP4 rendered again and decoded (1080×1350, 180 frames,
  6 s). The only console errors were 404s from the shared font loader asking again and again for a
  weight-variable file of Climate Crisis, which varies by year instead; it now asks once.
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

- The judge reads layout, plus one pixel check for texture. It doesn't judge taste: whether a
  face suits the words, or a colour the brand. Weights and thresholds are first guesses, set by
  looking at decks; they'll want tuning against posts Nick likes and doesn't.
- Measuring in the tests is faked (no canvas in Node), so the stress test proves the layouts hold
  together, not how they look.
- Optical sizing isn't used: canvas can't set a font's optical-size axis.
- A round sticker can still set "BRING / A / FRIEND" with the "A" alone, when three lines set the
  words a fifth bigger than two.

- Sound: a seeded synth and beat with motion on the beat, and audio in the MP4.
- Cutouts come from the small model, so their edges are soft (a faint halo on fur, smoothed
  lettuce), and a busy picture with no one clear subject can lose bits or keep some background.
  Larger models cut sharper but run to 170 MB or more; the one open-licensed browser library that
  does it (imgly) is AGPL, so it's not used.
- The brand's colours have roles by order (the first leads), but Vary doesn't hold to them yet: a
  highlight colour can still flood the ground. The brand has no type scale.
- Other instruments don't read my brand yet; the Brand bench writes it and Flyposter reads it.
- Pick up several things at once, or group them.
- Retype in the post's own face: the box is set in the site's type, over the post.
- Moves are kept by part, so a headline that changes its number of lines keeps moves on line0,
  line1… by position, not by the words on them.
- The grid's facts (When, Where, Next) move as separate lines, not as columns.
- Emoji outside the built-in set are skipped.
- WebM, GIF and MOV come from the shared exporter and weren't checked here.
- A front door and domain of its own.
