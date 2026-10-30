# Spirotype

A spirograph whose ring is your letters. Type a word, or drop in an SVG logo, and a wheel rolls
along every outline: outside the letters, inside their strokes and counters, or both. Pens fixed
to the wheel trace waves, loops and rosettes. Each outline gets a whole number of wheel turns, so
every pattern closes. Draw it on and off, spin the pen, let it breathe or crawl along the
letters. Export video, stills, or SVG for a plotter or a vector editor.

Open it at `/spiro/`.

## Driving it

- **Track.** The word (new lines start new lines), its font (the font browser: 2,000+ open
  fonts, your Adobe Fonts project, installed fonts or a dropped font file), weight and tracking.
  Round corners smooths the track, so the wheel takes corners in a curve. Show letters puts the
  letters underneath, faintly or solid. Drop an SVG or image logo on the page to roll round that
  instead; it becomes the line `@name` in Word.
- **Wheel.** Rolls outside, inside or both. Wheel size is a share of a line's height. Pen is the
  pen's distance from the wheel's centre in wheel radii: under 1 makes waves, over 1 makes loops.
  Laps is how many times round each outline. Drift is extra turns spread over the laps, so each
  lap lands a little further on and the lines fan out. Lobes makes the wheel swing in and out,
  like a gear that isn't round.
- **Pens.** Up to six, each with the next ink. Spread sets them apart. Line, Opacity and Glow.
- **Clockwork.** Draw on, then off; Spin the pen; Breathe; Crawl; Still. Every number can also
  be keyframed.
- **SVG** in the Print shop saves the lines at the playhead, one path per ink.
- **Vary** deals a new wheel, pen and motion, keeping your word, font and inks.

From code: `window.instrument`, plus `instrument.svg(t)` for the SVG text.

## How it works

`spiro.js` draws the word (or logo) into a mask about 1,600 pixels across, and traces where it
crosses half coverage with marching squares into closed loops. Any font works this way, including
Adobe Fonts and installed fonts, whose outlines a browser won't hand over. Each loop is resampled
evenly, smoothed with a circular blur, resampled again, and turned so the ink is on its left;
that gives every point an outward normal. The track is kept until the word, font, size or
smoothing changes.

The wheel's centre sits one radius out along the normal (or in, for Inside). Its angle is the
track's direction plus the distance rolled over the radius, so it turns as a real wheel would,
corners included. The radius is adjusted per outline so the turns are a whole number per lap,
plus Drift, which closes every line exactly.

## How it was checked

- Each preset was rendered and looked at, at two moments. The first round showed one letter
  retracing its line while the others fanned out: turns were rounded over all laps at once, so
  Drift could vanish. They're now whole per lap plus Drift, and every letter fans out the same.
- Every preset's last frame matches its first within two levels out of 255, and each moves.
- The SVG at a fixed moment, drawn by Chrome, matched the PNG at that moment: mean difference
  0.35 of a level, with 0.07% of pixels differing more (antialiasing). It's about 1 MB for a
  full pattern.
- MP4 (1 MB), WebM (1.5 MB) and GIF (33 MB) of the default 8-second loop were made from the page
  in Chrome.
- Desktop and phone layouts were looked at.
- MOV hasn't been made and checked yet.

## What it can't do yet

- Wheels that aren't circles, other than Lobes.
- Separate settings per letter.
- Track from a font file's own vector outlines. It traces a 1,600-pixel mask, so very fine
  hairlines can come out a little rounded.
